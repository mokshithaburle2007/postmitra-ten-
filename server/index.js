import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SCHEMES, DOCUMENTS, STATUSES, FINAL_STATUSES } from './schemes.js';
import { createStore } from './store.js';
import { createSupabaseStore } from './store-supabase.js';
import {
  safeEqual, signToken, verifyToken, signAdminToken, verifyAdminToken, createLimiter, hashPin, verifyPin, randomPin,
} from './auth.js';
import {
  ValidationError, normalizePhone, validateApplication, validateMessage, validateAdminUpdate, validateRegister, checkPin, cleanText, validateDocumentUpload, validateDocumentReview, MAX_DOCS,
} from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function createApp(opts = {}) {
  const env = { ...process.env, ...opts };
  const PORT = Number(env.PORT || 4000);
  const DATA_FILE = env.DATA_FILE || path.join(ROOT, 'data', 'db.json');
  const CORS_ORIGIN = env.CORS_ORIGIN || '*'; // auth uses bearer tokens (no cookies), so open CORS lets the PostMitra site call this API
  const TRUST_PROXY = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 1;
  const STATIC_DIR = env.STATIC_DIR || path.join(ROOT, 'public');

  const ON_VERCEL = Boolean(env.VERCEL);
  const HAS_SUPABASE = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

  let ADMIN_PASSWORD = env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD && !ON_VERCEL) {
    ADMIN_PASSWORD = 'admin123';
    console.warn('[warn] ADMIN_PASSWORD not set - using insecure default "admin123". Set it before deploying.');
  }
  // On serverless every cold start is a new process, so the signing secret must be stable.
  // If TOKEN_SECRET is not set it is derived from the admin password + database key.
  const TOKEN_SECRET = env.TOKEN_SECRET
    || (ADMIN_PASSWORD
      ? crypto.createHash('sha256').update(`pm-token|${ADMIN_PASSWORD}|${env.SUPABASE_SERVICE_KEY || ''}`).digest('hex')
      : crypto.randomBytes(32).toString('hex'));
  const ADMIN_TTL = 8 * 60 * 60 * 1000;

  // Misconfigured serverless deploys fail loudly instead of silently losing data on an ephemeral disk.
  const configError = ON_VERCEL && (!HAS_SUPABASE || !ADMIN_PASSWORD)
    ? `Missing environment variables: ${[!env.SUPABASE_URL && 'SUPABASE_URL', !env.SUPABASE_SERVICE_KEY && 'SUPABASE_SERVICE_KEY', !ADMIN_PASSWORD && 'ADMIN_PASSWORD'].filter(Boolean).join(', ')}`
    : '';
  if (configError) console.error(`[config] ${configError}`);
  const store = configError ? null
    : HAS_SUPABASE ? createSupabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_KEY })
      : createStore(DATA_FILE);
  const limit = createLimiter();

  // ---------- helpers ----------
  const ip = (req) => (TRUST_PROXY && req.headers['x-forwarded-for']
    ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
    : req.socket.remoteAddress || 'unknown');

  class HttpError extends Error {
    constructor(status, code) { super(code); this.status = status; this.code = code; }
  }

  function send(res, status, body, headers = {}) {
    const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(data);
  }

  function readJson(req, max = 100_000) {
    if (req.body !== undefined && req.body !== null) { // already parsed by the platform
      if (Buffer.isBuffer(req.body)) { try { return Promise.resolve(JSON.parse(req.body.toString('utf8'))); } catch { return Promise.reject(new HttpError(400, 'invalid_json')); } }
      if (typeof req.body === 'string') { try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); } catch { return Promise.reject(new HttpError(400, 'invalid_json')); } }
      return Promise.resolve(req.body);
    }
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > max) { reject(new HttpError(413, 'payload_too_large')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new HttpError(400, 'invalid_json')); }
      });
      req.on('error', reject);
    });
  }

  const bearer = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : '';
  };

  function requireAdmin(req) {
    if (!verifyAdminToken(TOKEN_SECRET, bearer(req))) throw new HttpError(401, 'unauthorized');
  }

  // ---- applicant accounts: mobile number + 4-digit PIN, signed 30-day session ----
  const USER_TTL = 30 * 24 * 60 * 60 * 1000;
  const LOCK_AFTER = 5;
  const LOCK_MS = 15 * 60 * 1000;

  const userView = (u) => ({ name: u.name, phone: u.phone, mustChangePin: Boolean(u.mustChangePin) });
  const userSession = (u) => signToken(TOKEN_SECRET, { role: 'user', sub: u.phone, v: u.tokenVersion || 0 }, USER_TTL).token;

  async function requireUser(req) {
    const claims = verifyToken(TOKEN_SECRET, bearer(req));
    if (!claims || claims.role !== 'user') throw new HttpError(401, 'unauthorized');
    const user = await store.getUser(claims.sub);
    // tokenVersion changes on PIN change/reset, which signs out every older session
    if (!user || (user.tokenVersion || 0) !== claims.v) throw new HttpError(401, 'unauthorized');
    return user;
  }

  // Applicants can only ever open their own applications; others look like "not found".
  async function requireOwnedApp(req, id) {
    const user = await requireUser(req);
    const app = await store.get(id);
    if (!app || app.userPhone !== user.phone) throw new HttpError(404, 'not_found');
    return app;
  }

  const publicView = (a) => ({
    id: a.id, scheme: a.scheme, schemeName: SCHEMES.find((s) => s.id === a.scheme)?.name || a.scheme,
    applicantName: a.applicantName, village: a.village, district: a.district, postOffice: a.postOffice,
    preferredDate: a.preferredDate, depositAmount: a.depositAmount, docsReady: a.docsReady,
    status: a.status, statusNote: a.statusNote, appointment: a.appointment,
    messages: a.messages, history: a.history, unread: a.unreadUser, documents: a.documents || [],
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  });

  const adminFull = (a) => ({
    ...publicView(a),
    phone: a.phone, dob: a.dob, nomineeName: a.nomineeName, nomineeRelation: a.nomineeRelation,
    note: a.note, language: a.language, internalNotes: a.internalNotes, unread: a.unreadAdmin,
  });

  const adminSummary = (a) => ({
    id: a.id, scheme: a.scheme, schemeName: SCHEMES.find((s) => s.id === a.scheme)?.name || a.scheme,
    applicantName: a.applicantName, phone: a.phone, village: a.village, status: a.status,
    unread: a.unreadAdmin, messageCount: a.messages.length,
    docsCount: (a.documents || []).length, docsPending: (a.documents || []).filter((d) => d.status === 'pending').length,
    lastMessage: a.messages.length ? a.messages[a.messages.length - 1] : null,
    createdAt: a.createdAt, updatedAt: a.updatedAt, preferredDate: a.preferredDate,
    appointmentDate: a.appointment?.date || '',
  });

  const csvCell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // block spreadsheet formula injection
    return `"${s.replace(/"/g, '""')}"`;
  };

  // ---------- routes ----------
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };

  route('GET', '/api/health', async (req, _p, url) => {
    if (url.searchParams.get('deep') !== '1') return { ok: true };
    try { await store.getUser('0000000000'); return { ok: true, db: 'ok' }; } catch (e) { return { ok: false, db: String(e.message || e).slice(0, 300) }; }
  });
  route('GET', '/api/schemes', async () => ({ schemes: SCHEMES, documents: DOCUMENTS, statuses: STATUSES }));

  // --- public status lookup: application number + mobile number, no sign-in, no personal data returned ---
  route('POST', '/api/track', async (req) => {
    if (!limit(`track:${ip(req)}`, 30, 60 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const body = await readJson(req);
    const id = String(body.id || '').trim().toUpperCase();
    const phone = normalizePhone(body.phone);
    const app = /^PM-\d{4}-\d{4,}$/.test(id) ? await store.get(id) : null;
    if (!app || !phone || normalizePhone(app.phone) !== phone) throw new HttpError(404, 'not_found');
    return { application: {
      id: app.id, schemeName: SCHEMES.find((x) => x.id === app.scheme)?.name || app.scheme,
      status: app.status, statusNote: app.statusNote, appointment: app.appointment,
      history: app.history, createdAt: app.createdAt, updatedAt: app.updatedAt,
    } };
  });

  // --- applicant accounts ---
  route('POST', '/api/auth/register', async (req) => {
    if (!limit(`register:${ip(req)}`, 10, 60 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const { name, phone, pin } = validateRegister(await readJson(req));
    if (await store.getUser(phone)) throw new HttpError(409, 'phone_taken');
    const user = { phone, name, pinHash: hashPin(pin), tokenVersion: 0, failCount: 0, lockedUntil: 0, mustChangePin: false, createdAt: new Date().toISOString() };
    await store.saveUser(user);
    return { status: 201, body: { token: userSession(user), user: userView(user) } };
  });

  route('POST', '/api/auth/login', async (req) => {
    if (!limit(`ulogin:${ip(req)}`, 30, 10 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const b = await readJson(req);
    const phone = String(b.phone ?? '').replace(/\D/g, '').slice(-10);
    const user = await store.getUser(phone);
    if (user && user.lockedUntil > Date.now()) throw new HttpError(429, 'locked');
    const ok = verifyPin(String(b.pin ?? ''), user?.pinHash) && Boolean(user); // always hashes, so timing does not reveal if the number exists
    if (!ok) {
      if (user) {
        user.failCount = (user.failCount || 0) + 1;
        if (user.failCount >= LOCK_AFTER) { user.lockedUntil = Date.now() + LOCK_MS; user.failCount = 0; }
        await store.saveUser(user);
      }
      throw new HttpError(401, 'invalid_credentials');
    }
    if (user.failCount || user.lockedUntil) { user.failCount = 0; user.lockedUntil = 0; await store.saveUser(user); }
    return { token: userSession(user), user: userView(user) };
  });

  route('GET', '/api/auth/me', async (req) => ({ user: userView(await requireUser(req)) }));

  route('POST', '/api/auth/change-pin', async (req) => {
    const user = await requireUser(req);
    if (!limit(`chpin:${user.phone}`, 10, 60 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const b = await readJson(req);
    if (!verifyPin(String(b.oldPin ?? ''), user.pinHash)) throw new HttpError(401, 'invalid_credentials');
    const next = checkPin(b.newPin, 'newPin');
    if (verifyPin(next, user.pinHash)) throw new ValidationError({ newPin: 'same_pin' });
    user.pinHash = hashPin(next);
    user.mustChangePin = false;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out other devices
    await store.saveUser(user);
    return { token: userSession(user), user: userView(user) };
  });

  // --- applicant applications (owner only) ---
  route('POST', '/api/applications', async (req) => {
    const user = await requireUser(req);
    if (!limit(`create:${user.phone}`, 10, 60 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const body = await readJson(req);
    const data = validateApplication({ ...body, phone: user.phone }); // contact number always comes from the account
    const app = await store.create(data, user.phone);
    return { status: 201, body: { id: app.id, application: publicView(app) } };
  });

  route('GET', '/api/applications', async (req) => {
    const user = await requireUser(req);
    const mine = (await store.listByUser(user.phone)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      items: mine.map((a) => ({
        id: a.id, schemeName: SCHEMES.find((s) => s.id === a.scheme)?.name || a.scheme,
        status: a.status, unread: a.unreadUser, updatedAt: a.updatedAt,
      })),
    };
  });


  // --- document uploads (applicant uploads, staff verify) ---
  const newDocId = () => crypto.randomBytes(6).toString('hex');
  async function sendFile(app, docId) {
    const doc = (app.documents || []).find((d) => d.id === docId);
    const file = doc && await store.getFile(`${app.id}:${doc.id}`);
    if (!file) throw new HttpError(404, 'not_found');
    return { raw: Buffer.from(file.content, 'base64'), headers: {
      'Content-Type': doc.mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(doc.name)}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    } };
  }

  route('POST', '/api/applications/:id/documents', async (req, p) => {
    const app = await requireOwnedApp(req, p.id);
    if (['cancelled', 'rejected', 'completed'].includes(app.status)) throw new HttpError(409, 'closed');
    if (!limit(`upload:${app.userPhone}`, 40, 60 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const { type, mime, name, buf } = validateDocumentUpload(await readJson(req, 4_200_000));
    app.documents = app.documents || [];
    if (app.documents.length >= MAX_DOCS) throw new HttpError(409, 'too_many_documents');
    const doc = { id: newDocId(), type, name, mime, size: buf.length, status: 'pending', note: '', uploadedAt: new Date().toISOString(), reviewedAt: '' };
    await store.putFile(`${app.id}:${doc.id}`, mime, buf.toString('base64'));
    app.documents.push(doc);
    app.unreadAdmin = true; app.updatedAt = doc.uploadedAt;
    await store.save(app);
    return { status: 201, body: { application: publicView(app) } };
  });

  route('GET', '/api/applications/:id/documents/:docId', async (req, p) => sendFile(await requireOwnedApp(req, p.id), p.docId));

  route('DELETE', '/api/applications/:id/documents/:docId', async (req, p) => {
    const app = await requireOwnedApp(req, p.id);
    const doc = (app.documents || []).find((d) => d.id === p.docId);
    if (!doc) throw new HttpError(404, 'not_found');
    if (doc.status === 'verified') throw new HttpError(409, 'already_verified');
    app.documents = app.documents.filter((d) => d.id !== doc.id);
    await store.deleteFile(`${app.id}:${doc.id}`);
    app.updatedAt = new Date().toISOString(); app.unreadAdmin = true;
    await store.save(app);
    return { application: publicView(app) };
  });

  route('GET', '/api/applications/:id', async (req, p) => {
    const app = await requireOwnedApp(req, p.id);
    const view = publicView(app);
    if (app.unreadUser) { app.unreadUser = false; await store.save(app); }
    return { application: view };
  });

  route('POST', '/api/applications/:id/messages', async (req, p) => {
    const app = await requireOwnedApp(req, p.id);
    if (!limit(`umsg:${app.id}`, 20, 60 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    if (FINAL_STATUSES.includes(app.status) && app.status !== 'completed') throw new HttpError(409, 'closed');
    await store.addMessage(app, 'user', validateMessage(await readJson(req)));
    return { status: 201, body: { application: publicView(app) } };
  });

  route('POST', '/api/applications/:id/cancel', async (req, p) => {
    const app = await requireOwnedApp(req, p.id);
    if (FINAL_STATUSES.includes(app.status)) throw new HttpError(409, 'already_final');
    await store.setStatus(app, 'cancelled', 'user', '');
    return { application: publicView(app) };
  });

  // --- admin ---
  route('POST', '/api/admin/login', async (req) => {
    if (!limit(`login:${ip(req)}`, 5, 10 * 60 * 1000)) throw new HttpError(429, 'too_many_requests');
    const b = await readJson(req);
    if (typeof b.password !== 'string' || !safeEqual(b.password, ADMIN_PASSWORD)) throw new HttpError(401, 'invalid_credentials');
    return signAdminToken(TOKEN_SECRET, ADMIN_TTL);
  });

  route('GET', '/api/admin/applications', async (req, p, url) => {
    requireAdmin(req);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const status = url.searchParams.get('status') || '';
    const scheme = url.searchParams.get('scheme') || '';
    const unread = url.searchParams.get('unread') === '1';
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 25));

    const all = await store.all();
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const a of all) counts[a.status] = (counts[a.status] || 0) + 1;

    let rows = all.filter((a) => (!status || a.status === status)
      && (!scheme || a.scheme === scheme)
      && (!unread || a.unreadAdmin)
      && (!q || [a.id, a.applicantName, a.phone, a.village].some((f) => String(f).toLowerCase().includes(q))));
    rows = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = rows.length;
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize).map(adminSummary),
      total, page, pageSize, counts,
      totalAll: all.length, unreadCount: all.filter((a) => a.unreadAdmin).length,
    };
  });

  route('GET', '/api/admin/export.csv', async (req) => {
    requireAdmin(req);
    const head = ['id', 'createdAt', 'status', 'scheme', 'name', 'phone', 'dob', 'village', 'district',
      'postOffice', 'preferredDate', 'depositAmount', 'nominee', 'appointmentDate', 'appointmentTime', 'docsReady'];
    const lines = [head.join(',')];
    for (const a of await store.all()) {
      lines.push([a.id, a.createdAt, a.status, a.scheme, a.applicantName, a.phone, a.dob, a.village, a.district,
        a.postOffice, a.preferredDate, a.depositAmount, `${a.nomineeName} ${a.nomineeRelation}`.trim(),
        a.appointment?.date, a.appointment?.time, (a.docsReady || []).join(';')].map(csvCell).join(','));
    }
    return { raw: lines.join('\n'), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="postmitra-applications.csv"' } };
  });

  const adminApp = async (req, id) => {
    requireAdmin(req);
    const app = await store.get(id);
    if (!app) throw new HttpError(404, 'not_found');
    return app;
  };

  route('GET', '/api/admin/applications/:id', async (req, p) => {
    const app = await adminApp(req, p.id);
    if (app.unreadAdmin) { app.unreadAdmin = false; await store.save(app); }
    return { application: adminFull({ ...app, unreadAdmin: false }) };
  });

  route('PATCH', '/api/admin/applications/:id', async (req, p) => {
    const app = await adminApp(req, p.id);
    const upd = validateAdminUpdate(await readJson(req), app);
    if (upd.appointment) { app.appointment = upd.appointment; app.unreadUser = true; }
    if (upd.status && (upd.status !== app.status || upd.statusNote !== app.statusNote)) await store.setStatus(app, upd.status, 'admin', upd.statusNote);
    else { app.updatedAt = new Date().toISOString(); await store.save(app); }
    return { application: adminFull(app) };
  });


  route('GET', '/api/admin/applications/:id/documents/:docId', async (req, p) => sendFile(await adminApp(req, p.id), p.docId));

  route('PATCH', '/api/admin/applications/:id/documents/:docId', async (req, p) => {
    const app = await adminApp(req, p.id);
    const doc = (app.documents || []).find((d) => d.id === p.docId);
    if (!doc) throw new HttpError(404, 'not_found');
    const r = validateDocumentReview(await readJson(req));
    doc.status = r.status; doc.note = r.note; doc.reviewedAt = new Date().toISOString();
    app.unreadUser = true; app.updatedAt = doc.reviewedAt;
    await store.save(app);
    return { application: adminFull(app) };
  });

  route('POST', '/api/admin/applications/:id/messages', async (req, p) => {
    const app = await adminApp(req, p.id);
    await store.addMessage(app, 'admin', validateMessage(await readJson(req)));
    return { status: 201, body: { application: adminFull(app) } };
  });

  route('POST', '/api/admin/applications/:id/notes', async (req, p) => {
    const app = await adminApp(req, p.id);
    await store.addNote(app, validateMessage(await readJson(req)));
    return { status: 201, body: { application: adminFull(app) } };
  });

  // Forgotten PIN: staff generate a temporary PIN and tell the applicant in person or by phone.
  // The applicant must choose a new PIN at next sign-in. Also clears any lockout.
  route('POST', '/api/admin/applications/:id/reset-pin', async (req, p) => {
    const app = await adminApp(req, p.id);
    const user = await store.getUser(app.userPhone);
    if (!user) throw new HttpError(404, 'not_found');
    const tempPin = randomPin();
    user.pinHash = hashPin(tempPin);
    user.mustChangePin = true;
    user.failCount = 0;
    user.lockedUntil = 0;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await store.saveUser(user);
    return { tempPin, phone: user.phone, name: user.name };
  });

  // Right-to-erasure (DPDP Act): permanently delete an application.
  route('DELETE', '/api/admin/applications/:id', async (req, p) => {
    await adminApp(req, p.id);
    await store.remove(p.id);
    return { ok: true };
  });

  // ---------- static files ----------
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  };
  function serveStatic(req, res, pathname) {
    let rel = pathname === '/' ? '/index.html' : pathname;
    if (!path.extname(rel)) rel = '/index.html'; // single-page app routes (local mode; Vercel uses rewrites)
    const file = path.resolve(STATIC_DIR, '.' + decodeURIComponent(rel));
    if (!file.startsWith(path.resolve(STATIC_DIR) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return send(res, 404, { error: 'not_found' });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }

  // ---------- server ----------
  const handler = async (req, res) => {
    const secHeaders = {
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    };
    for (const [k, v] of Object.entries(secHeaders)) res.setHeader(k, v);
    if (CORS_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Access-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    try {
      if (configError && url.pathname.startsWith('/api/')) throw new HttpError(500, 'not_configured');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
        return serveStatic(req, res, url.pathname);
      }
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const result = await r.handler(req, params, url);
        if (result && result.raw !== undefined) return send(res, 200, result.raw, result.headers);
        if (result && result.status && result.body) return send(res, result.status, result.body);
        return send(res, 200, result);
      }
      throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method_not_allowed' : 'not_found');
    } catch (err) {
      if (err instanceof ValidationError) return send(res, 400, { error: 'validation_failed', fields: err.fields });
      if (err instanceof HttpError) return send(res, err.status, { error: err.code });
      console.error(err);
      return send(res, 500, { error: 'server_error' });
    }
  };

  const server = http.createServer(handler);
  return { server, handler, store, port: PORT };
}

// Run directly: node server/index.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, port } = createApp();
  server.listen(port, () => console.log(`PostMitra apply server running on http://localhost:${port}`));
}
