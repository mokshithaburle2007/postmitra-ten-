import fs from 'node:fs';
import path from 'node:path';
import { buildApplication, formatId, applyMessage, applyNote, applyStatus } from './store-common.js';

// JSON-file store for local use. Same async interface as store-supabase.js.
// (Serverless hosts such as Vercel have no persistent disk: use the Supabase store there.)
export function createStore(file) {
  let db = { seq: {}, applications: [], users: {} };
  if (fs.existsSync(file)) db = { users: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  else fs.mkdirSync(path.dirname(file), { recursive: true });

  function persist() {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }

  return {
    async create(data, userPhone) {
      const year = new Date().getFullYear();
      db.seq[year] = (db.seq[year] || 0) + 1;
      const app = buildApplication(formatId(year, db.seq[year]), data, userPhone);
      db.applications.push(app);
      persist();
      return app;
    },
    async get(id) { return db.applications.find((a) => a.id === id) || null; },
    async all() { return db.applications; },
    async listByUser(phone) { return db.applications.filter((a) => a.userPhone === phone); },
    async getUser(phone) { return db.users[phone] || null; },
    async saveUser(user) { db.users[user.phone] = user; persist(); },
    async save() { persist(); },
    async addMessage(app, from, text) { applyMessage(app, from, text); persist(); },
    async addNote(app, text) { applyNote(app, text); persist(); },
    async setStatus(app, status, by, note) { applyStatus(app, status, by, note); persist(); },
    async remove(id) {
      const i = db.applications.findIndex((a) => a.id === id);
      if (i === -1) return false;
      db.applications.splice(i, 1);
      persist();
      return true;
    },
  };
}
