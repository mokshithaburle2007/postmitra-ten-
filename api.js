// Point this at your backend. Same-origin by default (server/index.js also serves the UI).
// Override with <script>window.POSTMITRA_API = 'https://your-api.example.com'</script>
const BASE = (typeof window !== 'undefined' && window.POSTMITRA_API) || '';

export class ApiError extends Error {
  constructor(status, code, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields || {};
  }
}

async function request(method, url, { body, admin, user, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const bearer = admin || user || (isUserRoute(url) ? userSession.get()?.token : '');
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let res;
  try {
    res = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (raw && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || 'server_error', data?.fields);
  return data;
}

const isUserRoute = (url) => (url.startsWith('/api/applications') || url.startsWith('/api/auth/me') || url.startsWith('/api/auth/change-pin'));

export const api = {
  schemes: () => request('GET', '/api/schemes'),
  register: (name, phone, pin) => request('POST', '/api/auth/register', { body: { name, phone, pin } }),
  login: (phone, pin) => request('POST', '/api/auth/login', { body: { phone, pin } }),
  me: () => request('GET', '/api/auth/me'),
  changePin: (oldPin, newPin) => request('POST', '/api/auth/change-pin', { body: { oldPin, newPin } }),
  create: (body) => request('POST', '/api/applications', { body }),
  mine: () => request('GET', '/api/applications'),
  get: (id) => request('GET', `/api/applications/${id}`),
  message: (id, text) => request('POST', `/api/applications/${id}/messages`, { body: { text } }),
  cancel: (id) => request('POST', `/api/applications/${id}/cancel`, { body: {} }),

  adminLogin: (password) => request('POST', '/api/admin/login', { body: { password } }),
  adminList: (token, params) => request('GET', `/api/admin/applications?${new URLSearchParams(params)}`, { admin: token }),
  adminGet: (token, id) => request('GET', `/api/admin/applications/${id}`, { admin: token }),
  adminUpdate: (token, id, body) => request('PATCH', `/api/admin/applications/${id}`, { admin: token, body }),
  adminMessage: (token, id, text) => request('POST', `/api/admin/applications/${id}/messages`, { admin: token, body: { text } }),
  adminNote: (token, id, text) => request('POST', `/api/admin/applications/${id}/notes`, { admin: token, body: { text } }),
  adminResetPin: (token, id) => request('POST', `/api/admin/applications/${id}/reset-pin`, { admin: token, body: {} }),
  adminDelete: (token, id) => request('DELETE', `/api/admin/applications/${id}`, { admin: token }),
  adminCsv: async (token) => (await request('GET', '/api/admin/export.csv', { admin: token, raw: true })).blob(),
};

// ---- applicant session (signed token from the server, kept on this phone) ----
const UKEY = 'pm_user';
export const userSession = {
  get() { try { const v = JSON.parse(localStorage.getItem(UKEY) || 'null'); return v && v.token ? v : null; } catch { return null; } },
  set(token, user) { try { localStorage.setItem(UKEY, JSON.stringify({ token, user })); } catch { /* storage may be blocked */ } },
  clear() { try { localStorage.removeItem(UKEY); } catch { /* ignore */ } },
};

const AKEY = 'pm_admin';
export const adminSession = {
  get() { try { return sessionStorage.getItem(AKEY) || ''; } catch { return ''; } },
  set(t) { try { sessionStorage.setItem(AKEY, t); } catch { /* ignore */ } },
  clear() { try { sessionStorage.removeItem(AKEY); } catch { /* ignore */ } },
};
