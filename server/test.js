import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { createApp } from './index.js';

const MODE = process.env.MODE === 'supabase' ? 'supabase' : 'file';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));

// Minimal stand-in for Supabase's PostgREST API so the Supabase store runs without internet.
const apps = new Map(); const users = new Map(); const counters = {};
const mock = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const out = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(v === undefined ? '' : JSON.stringify(v)); };
    if (req.headers.apikey !== 'service-key' || req.headers.authorization) return out(401, { message: 'bad key (new-style secret keys must not be sent as a Bearer token)' });
    const strip = (v) => String(v || '').replace(/^eq\./, '');
    if (u.pathname === '/rest/v1/rpc/next_seq') { const y = JSON.parse(body).y; counters[y] = (counters[y] || 0) + 1; return out(200, counters[y]); }
    if (u.pathname === '/rest/v1/users') {
      if (req.method === 'POST') { const r = JSON.parse(body); users.set(r.phone, r); return out(201); }
      if (req.method === 'GET') { const k = strip(u.searchParams.get('phone')); return out(200, users.has(k) ? [{ data: users.get(k).data }] : []); }
    }
    if (u.pathname !== '/rest/v1/applications') return out(404, {});
    const id = strip(u.searchParams.get('id')); const owner = strip(u.searchParams.get('data->>userPhone'));
    if (req.method === 'POST') { const r = JSON.parse(body); apps.set(r.id, r); return out(201); }
    if (req.method === 'DELETE') { const had = apps.delete(id); return out(200, had ? [{ id }] : []); }
    if (req.method === 'GET') {
      if (id) return out(200, apps.has(id) ? [{ data: apps.get(id).data }] : []);
      let rows = [...apps.values()]; if (owner) rows = rows.filter((r) => r.data.userPhone === owner);
      return out(200, rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((r) => ({ data: r.data })));
    }
    return out(405, {});
  });
});
let supa = {};
if (MODE === 'supabase') {
  await new Promise((r) => mock.listen(0, r));
  supa = { SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`, SUPABASE_SERVICE_KEY: 'service-key' };
}
console.log(`Mode: ${MODE}`);
const { server } = createApp({ DATA_FILE: path.join(dir, 'db.json'), ADMIN_PASSWORD: 'test-pass', TOKEN_SECRET: 'secret', STATIC_DIR: path.resolve('public'), ...supa });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const call = async (method, url, { body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* csv or html */ }
  return { status: res.status, json, text };
};

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const good = {
  scheme: 'ssy', applicantName: 'Lakshmi Devi', dob: '1990-05-14',
  village: 'R. Bheemavaram', district: 'Anakapalli', postOffice: 'R. Bheemavaram SO', nomineeName: 'Ravi',
  nomineeRelation: 'Husband', depositAmount: 5000, preferredDate: tomorrow, docsReady: ['aadhaar', 'photo', 'bogus'],
  language: 'te', note: 'Please call after 5pm', consent: true,
};

console.log('Accounts');
let r = await call('POST', '/api/applications', { body: good });
check('applying without sign-in is refused', r.status === 401);
r = await call('POST', '/api/auth/register', { body: { name: 'Lakshmi Devi', phone: '12345', pin: '4829' } });
check('register rejects bad phone', r.status === 400 && r.json.fields.phone);
for (const weak of ['1234', '1111', '4321', '0000', '2580']) {
  r = await call('POST', '/api/auth/register', { body: { name: 'Lakshmi Devi', phone: '98765 43210', pin: weak } });
  if (r.status !== 400 || r.json.fields.pin !== 'weak_pin') check(`weak pin ${weak} rejected`, false, JSON.stringify(r.json));
}
check('weak PINs (1234/1111/4321/0000/2580) rejected', r.status === 400 && r.json.fields.pin === 'weak_pin');
r = await call('POST', '/api/auth/register', { body: { name: 'Lakshmi Devi', phone: '98765 43210', pin: '48' } });
check('register rejects non-4-digit PIN', r.status === 400 && r.json.fields.pin === 'invalid_pin');
r = await call('POST', '/api/auth/register', { body: { name: 'Lakshmi Devi', phone: '+91 98765 43210', pin: '4829' } });
check('register works', r.status === 201 && r.json.token && r.json.user.phone === '9876543210');
const lakshmi = r.json.token;
r = await call('POST', '/api/auth/register', { body: { name: 'Someone Else', phone: '9876543210', pin: '7391' } });
check('same number cannot register twice', r.status === 409 && r.json.error === 'phone_taken');
r = await call('GET', '/api/auth/me', { token: lakshmi });
check('me returns the account, never the PIN hash', r.status === 200 && r.json.user.name === 'Lakshmi Devi' && !JSON.stringify(r.json).includes('pinHash'));
r = await call('POST', '/api/auth/login', { body: { phone: '9876543210', pin: '0000' } });
check('wrong PIN -> 401 invalid_credentials', r.status === 401 && r.json.error === 'invalid_credentials');
r = await call('POST', '/api/auth/login', { body: { phone: '9000000000', pin: '4829' } });
check('unknown number gives the same error (no account enumeration)', r.status === 401 && r.json.error === 'invalid_credentials');
r = await call('POST', '/api/auth/login', { body: { phone: '98765-43210', pin: '4829' } });
check('login works (number format forgiven)', r.status === 200 && r.json.token);

console.log('Applying (owner only)');
r = await call('POST', '/api/applications', { token: lakshmi, body: { ...good, consent: false } });
check('rejects missing consent', r.status === 400 && r.json.fields.consent);
r = await call('POST', '/api/applications', { token: lakshmi, body: { ...good, scheme: 'nope' } });
check('rejects unknown scheme', r.status === 400 && r.json.fields.scheme);
r = await call('POST', '/api/applications', { token: lakshmi, body: { ...good, phone: '9111111111' } });
check('creates application; contact number forced from account (not the body)', r.status === 201 && /^PM-\d{4}-0001$/.test(r.json.id), JSON.stringify(r.json));
const id = r.json.id;
check('unknown doc filtered out', JSON.stringify(r.json.application.docsReady) === '["aadhaar","photo"]');
check('public view hides phone/internal fields', r.json.application.phone === undefined && r.json.application.internalNotes === undefined && r.json.application.userPhone === undefined);
r = await call('GET', '/api/applications', { token: lakshmi });
check('my applications lists it', r.json.items.length === 1 && r.json.items[0].id === id);

console.log('Isolation between applicants');
r = await call('POST', '/api/auth/register', { body: { name: 'Appala Naidu', phone: '9123456780', pin: '7391' } });
const appala = r.json.token;
r = await call('GET', `/api/applications/${id}`, { token: appala });
check("another applicant cannot open Lakshmi's application", r.status === 404);
r = await call('POST', `/api/applications/${id}/messages`, { token: appala, body: { text: 'hi' } });
check("another applicant cannot message on it", r.status === 404);
r = await call('POST', `/api/applications/${id}/cancel`, { token: appala, body: {} });
check("another applicant cannot cancel it", r.status === 404);
r = await call('GET', '/api/applications', { token: appala });
check("another applicant's list is empty", r.json.items.length === 0);
r = await call('GET', `/api/applications/${id}`);
check('no token -> 401', r.status === 401);
r = await call('GET', `/api/applications/${id}`, { token: lakshmi + 'x' });
check('tampered token -> 401', r.status === 401);

console.log('Admin auth');
r = await call('GET', '/api/admin/applications');
check('admin list needs auth', r.status === 401);
r = await call('POST', '/api/admin/login', { body: { password: 'wrong' } });
check('bad password -> 401', r.status === 401);
r = await call('POST', '/api/admin/login', { body: { password: 'test-pass' } });
check('good password -> token', r.status === 200 && r.json.token);
const adminToken = r.json.token;
r = await call('GET', '/api/admin/applications', { token: lakshmi });
check('applicant token is not an admin token', r.status === 401);
r = await call('GET', '/api/applications', { token: adminToken });
check('admin token is not an applicant token', r.status === 401);

console.log('Admin sees request');
r = await call('GET', '/api/admin/applications', { token: adminToken });
check('list shows 1, unread 1', r.json.total === 1 && r.json.unreadCount === 1 && r.json.counts.submitted === 1);
check('summary includes phone from account', r.json.items[0].phone === '9876543210');
r = await call('GET', '/api/admin/applications?q=lakshmi&status=submitted&scheme=ssy', { token: adminToken });
check('search + filters', r.json.total === 1);
r = await call('GET', `/api/admin/applications/${id}`, { token: adminToken });
check('detail has phone/dob/note', r.json.application.phone === '9876543210' && r.json.application.dob === '1990-05-14' && r.json.application.note);

console.log('Admin responds');
r = await call('PATCH', `/api/admin/applications/${id}`, { token: adminToken, body: { status: 'docs_needed' } });
check('docs_needed requires a note', r.status === 400 && r.json.fields.statusNote);
r = await call('PATCH', `/api/admin/applications/${id}`, { token: adminToken, body: { status: 'docs_needed', statusNote: 'Bring daughter birth certificate' } });
check('docs_needed with note ok', r.status === 200 && r.json.application.status === 'docs_needed');
r = await call('PATCH', `/api/admin/applications/${id}`, { token: adminToken, body: { status: 'appointment_confirmed' } });
check('appointment_confirmed requires date', r.status === 400 && r.json.fields.appointment);
r = await call('PATCH', `/api/admin/applications/${id}`, { token: adminToken, body: { status: 'cancelled' } });
check('admin cannot set cancelled', r.status === 400);
r = await call('POST', `/api/admin/applications/${id}/messages`, { token: adminToken, body: { text: 'Please bring the birth certificate.' } });
check('admin message sent', r.status === 201 && r.json.application.messages.length === 1);
r = await call('POST', `/api/admin/applications/${id}/notes`, { token: adminToken, body: { text: 'Called, no answer' } });
check('internal note saved', r.status === 201 && r.json.application.internalNotes.length === 1);

console.log('Applicant receives and replies');
r = await call('GET', '/api/applications', { token: lakshmi });
check('list shows unread + new status', r.json.items[0].unread === true && r.json.items[0].status === 'docs_needed');
r = await call('GET', `/api/applications/${id}`, { token: lakshmi });
check('applicant sees admin message + status note', r.json.application.messages[0].from === 'admin' && r.json.application.statusNote.includes('birth certificate'));
check('applicant never sees internal notes', r.json.application.internalNotes === undefined && !JSON.stringify(r.json).includes('no answer'));
r = await call('GET', `/api/applications/${id}`, { token: lakshmi });
check('read clears applicant unread', r.json.application.unread === false);
r = await call('POST', `/api/applications/${id}/messages`, { token: lakshmi, body: { text: 'Will bring it tomorrow' } });
check('applicant reply sent', r.status === 201 && r.json.application.messages.length === 2);
r = await call('POST', `/api/applications/${id}/messages`, { token: lakshmi, body: { text: '   ' } });
check('empty message rejected', r.status === 400);
r = await call('GET', '/api/admin/applications?unread=1', { token: adminToken });
check('admin sees reply as unread', r.json.total === 1 && r.json.items[0].lastMessage.from === 'user');

console.log('Appointment');
r = await call('PATCH', `/api/admin/applications/${id}`, { token: adminToken, body: { status: 'appointment_confirmed', appointment: { date: tomorrow, time: '11:30', postOffice: 'R. Bheemavaram SO' } } });
check('appointment confirmed', r.status === 200 && r.json.application.appointment.time === '11:30');
r = await call('PATCH', `/api/admin/applications/${id}`, { token: adminToken, body: { appointment: { date: 'bad', time: '11:30' } } });
check('bad appointment date rejected', r.status === 400);
r = await call('GET', `/api/applications/${id}`, { token: lakshmi });
check('applicant sees appointment and timeline', r.json.application.appointment.date === tomorrow && r.json.application.history.length === 3);

console.log('PIN change, forgotten PIN, lockout');
r = await call('POST', '/api/auth/change-pin', { token: lakshmi, body: { oldPin: '9999', newPin: '5738' } });
check('change PIN needs the right old PIN (and does not sign out)', r.status === 401 && r.json.error === 'invalid_credentials');
r = await call('POST', '/api/auth/change-pin', { token: lakshmi, body: { oldPin: '4829', newPin: '1234' } });
check('change PIN rejects weak PIN', r.status === 400 && r.json.fields.newPin === 'weak_pin');
r = await call('POST', '/api/auth/change-pin', { token: lakshmi, body: { oldPin: '4829', newPin: '4829' } });
check('change PIN rejects same PIN', r.status === 400 && r.json.fields.newPin === 'same_pin');
r = await call('POST', '/api/auth/change-pin', { token: lakshmi, body: { oldPin: '4829', newPin: '5738' } });
check('change PIN works and returns a fresh session', r.status === 200 && r.json.token);
const lakshmi2 = r.json.token;
r = await call('GET', `/api/applications/${id}`, { token: lakshmi });
check('old session signed out after PIN change', r.status === 401);
r = await call('GET', `/api/applications/${id}`, { token: lakshmi2 });
check('new session works', r.status === 200);

for (let i = 0; i < 5; i++) r = await call('POST', '/api/auth/login', { body: { phone: '9876543210', pin: '0001' } });
r = await call('POST', '/api/auth/login', { body: { phone: '9876543210', pin: '5738' } });
check('5 wrong PINs lock the account, even for the right PIN', r.status === 429 && r.json.error === 'locked');

r = await call('POST', `/api/admin/applications/${id}/reset-pin`);
check('reset-pin needs admin', r.status === 401);
r = await call('POST', `/api/admin/applications/${id}/reset-pin`, { token: adminToken });
check('staff reset gives a 4-digit temporary PIN', r.status === 200 && /^\d{4}$/.test(r.json.tempPin), JSON.stringify(r.json));
const temp = r.json.tempPin;
r = await call('GET', `/api/applications/${id}`, { token: lakshmi2 });
check('reset signs out existing sessions', r.status === 401);
r = await call('POST', '/api/auth/login', { body: { phone: '9876543210', pin: '5738' } });
check('old PIN no longer works', r.status === 401);
r = await call('POST', '/api/auth/login', { body: { phone: '9876543210', pin: temp } });
check('reset also clears the lockout; temp PIN logs in and demands a new PIN', r.status === 200 && r.json.user.mustChangePin === true);
const tempSession = r.json.token;
r = await call('POST', '/api/auth/change-pin', { token: tempSession, body: { oldPin: temp, newPin: '6284' } });
check('applicant sets a new PIN', r.status === 200 && r.json.user.mustChangePin === false);
const lakshmi3 = r.json.token;

console.log('Cancel / closing rules');
r = await call('POST', '/api/applications', { token: appala, body: { ...good, applicantName: '=cmd|calc' } });
const second = r.json;
r = await call('POST', `/api/applications/${second.id}/cancel`, { token: appala, body: {} });
check('applicant can cancel', r.status === 200 && r.json.application.status === 'cancelled');
r = await call('POST', `/api/applications/${second.id}/cancel`, { token: appala, body: {} });
check('cannot cancel twice', r.status === 409);
r = await call('POST', `/api/applications/${second.id}/messages`, { token: appala, body: { text: 'hi' } });
check('cannot message a cancelled application', r.status === 409);

console.log('Export, delete, misc');
r = await call('GET', '/api/admin/export.csv', { token: adminToken });
check('csv has header + 2 rows', r.status === 200 && r.text.trim().split('\n').length === 3);
check('csv neutralises formula injection', r.text.includes(`"'=cmd|calc"`));
r = await call('DELETE', `/api/admin/applications/${second.id}`, { token: adminToken });
check('admin can delete', r.status === 200);
r = await call('GET', `/api/admin/applications/${second.id}`, { token: adminToken });
check('deleted -> 404', r.status === 404);
r = await call('GET', '/api/nope');
check('unknown api -> 404 json', r.status === 404 && r.json.error === 'not_found');
r = await fetch(base + '/..%2Fserver%2Findex.js'); await r.text();
check('path traversal blocked', r.status === 404);
r = await call('POST', '/api/applications', { token: lakshmi3, body: undefined });
check('empty body -> 400 not 500', r.status === 400, String(r.status));
r = await call('POST', '/api/auth/register', { body: { name: 'X Y', phone: '9000000001', pin: '7391' } });
check('sign-up is rate limited per IP (11th attempt in an hour)', r.status === 429);
r = await call('GET', `/api/applications/${id}`, { token: lakshmi3 });
check('latest session still valid after all that', r.status === 200);

console.log('Rate limiting');
let limited = false;
for (let i = 0; i < 8; i++) { const x = await call('POST', '/api/admin/login', { body: { password: 'bad' } }); if (x.status === 429) limited = true; }
check('admin login brute force gets 429', limited);

console.log('Storage');
const raw = MODE === 'supabase'
  ? { applications: [...apps.values()].map((x) => x.data), users: Object.fromEntries([...users.entries()].map(([k, v]) => [k, v.data])) }
  : JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
check('data persisted', raw.applications.length === 1 && Object.keys(raw.users).length === 2);
const dump = JSON.stringify(raw);
check('PINs are stored hashed, never in plain text', !dump.includes('4829') && !dump.includes('5738') && !dump.includes('6284') && !dump.includes(temp) && dump.includes('s1$'));
check('session tokens are not stored', !dump.includes(lakshmi) && !dump.includes(lakshmi3));

server.close(); mock.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
