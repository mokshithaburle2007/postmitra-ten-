import crypto from 'node:crypto';

const now = () => new Date().toISOString();
export const newId = () => crypto.randomBytes(6).toString('hex');

export function buildApplication(id, data, userPhone) {
  const t = now();
  return {
    id,
    userPhone,
    ...data,
    status: 'submitted',
    statusNote: '',
    appointment: { date: '', time: '', postOffice: '' },
    messages: [],
    internalNotes: [],
    history: [{ status: 'submitted', at: t, by: 'user', note: '' }],
    unreadAdmin: true,
    unreadUser: false,
    createdAt: t,
    updatedAt: t,
  };
}

export const formatId = (year, n) => `PM-${year}-${String(n).padStart(4, '0')}`;

export function applyMessage(app, from, text) {
  app.messages.push({ id: newId(), from, text, at: now() });
  app.updatedAt = now();
  if (from === 'user') app.unreadAdmin = true;
  else app.unreadUser = true;
}

export function applyNote(app, text) {
  app.internalNotes.push({ id: newId(), text, at: now() });
}

export function applyStatus(app, status, by, note) {
  app.status = status;
  app.statusNote = note || '';
  app.history.push({ status, at: now(), by, note: note || '' });
  app.updatedAt = now();
  if (by === 'admin') app.unreadUser = true;
  else app.unreadAdmin = true;
}
