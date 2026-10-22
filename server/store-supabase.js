import { buildApplication, formatId, applyMessage, applyNote, applyStatus } from './store-common.js';

// Supabase (PostgREST) store using plain fetch - no SDK or npm packages needed.
// Use the SERVICE ROLE key, server-side only. Tables are created by supabase/schema.sql.
export function createSupabaseStore({ url, key }) {
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1`;
  // Legacy service_role keys are JWTs (start with "eyJ") and go in both headers.
  // New-style secret keys (sb_secret_...) are not JWTs and must only be sent in the apikey header.
  const headers = { apikey: key, 'Content-Type': 'application/json', ...(String(key).startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };

  async function rq(method, pathAndQuery, body, extra = {}) {
    const res = await fetch(base + pathAndQuery, {
      method, headers: { ...headers, ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${pathAndQuery.split('?')[0]} failed (${res.status}): ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  const put = (app) => rq('POST', '/applications?on_conflict=id', { id: app.id, data: app, updated_at: app.updatedAt },
    { Prefer: 'resolution=merge-duplicates,return=minimal' });

  return {
    async create(data, userPhone) {
      const year = new Date().getFullYear();
      const n = await rq('POST', '/rpc/next_seq', { y: year });
      const app = buildApplication(formatId(year, Number(n)), data, userPhone);
      await put(app);
      return app;
    },
    async get(id) {
      const rows = await rq('GET', `/applications?id=eq.${encodeURIComponent(id)}&select=data&limit=1`);
      return rows && rows[0] ? rows[0].data : null;
    },
    async all() {
      const rows = await rq('GET', '/applications?select=data&order=updated_at.desc&limit=5000');
      return rows.map((r) => r.data);
    },
    async listByUser(phone) {
      const rows = await rq('GET', `/applications?data->>userPhone=eq.${encodeURIComponent(phone)}&select=data&order=updated_at.desc&limit=200`);
      return rows.map((r) => r.data);
    },
    async getUser(phone) {
      const rows = await rq('GET', `/users?phone=eq.${encodeURIComponent(phone)}&select=data&limit=1`);
      return rows && rows[0] ? rows[0].data : null;
    },
    async saveUser(user) {
      await rq('POST', '/users?on_conflict=phone', { phone: user.phone, data: user }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    },
    async save(app) { await put(app); },
    async addMessage(app, from, text) { applyMessage(app, from, text); await put(app); },
    async addNote(app, text) { applyNote(app, text); await put(app); },
    async setStatus(app, status, by, note) { applyStatus(app, status, by, note); await put(app); },
    async putFile(fileId, mime, content) {
      await rq('POST', '/app_files?on_conflict=id', { id: fileId, app_id: fileId.split(':')[0], mime, content },
        { Prefer: 'resolution=merge-duplicates,return=minimal' });
    },
    async getFile(fileId) {
      const rows = await rq('GET', `/app_files?id=eq.${encodeURIComponent(fileId)}&select=mime,content&limit=1`);
      return rows && rows[0] ? rows[0] : null;
    },
    async deleteFile(fileId) { await rq('DELETE', `/app_files?id=eq.${encodeURIComponent(fileId)}`); },
    async remove(id) {
      await rq('DELETE', `/app_files?app_id=eq.${encodeURIComponent(id)}`);
      const rows = await rq('DELETE', `/applications?id=eq.${encodeURIComponent(id)}`, undefined, { Prefer: 'return=representation' });
      return Array.isArray(rows) ? rows.length > 0 : true;
    },
  };
}
