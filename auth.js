import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha(a), sha(b));
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

// Signed, expiring token: base64url(payload).base64url(hmac)
export function signToken(secret, claims, ttlMs) {
  const exp = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ ...claims, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: exp };
}

export function verifyToken(secret, token) {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

export const signAdminToken = (secret, ttlMs) => signToken(secret, { role: 'admin' }, ttlMs);
export const verifyAdminToken = (secret, token) => verifyToken(secret, token)?.role === 'admin';

// ---- applicant PINs: scrypt with a per-user salt ----
export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pin), salt, 32);
  return `s1$${salt.toString('hex')}$${key.toString('hex')}`;
}

const DUMMY = hashPin('0000-dummy');
export function verifyPin(pin, stored) {
  const [v, saltHex, keyHex] = String(stored || DUMMY).split('$');
  if (v !== 's1' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(keyHex, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want) && stored !== undefined && stored !== null;
}

// Rejects 0000, 1111, 1234, 4321, 2580 ... which are the first things anyone guesses.
export function isWeakPin(pin) {
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  if (Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return true;
  return ['2580', '1379', '2000', '1004', '1122', '1212', '6969'].includes(pin);
}

export function randomPin() {
  for (;;) {
    const p = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    if (!isWeakPin(p)) return p;
  }
}

// Simple in-memory sliding-window rate limiter.
export function createLimiter() {
  const hits = new Map();
  return function limit(key, max, windowMs) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      return false;
    }
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return true;
  };
}
