import { SCHEMES, DOCUMENTS, STATUSES } from './schemes.js';
import { isWeakPin } from './auth.js';

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export class ValidationError extends Error {
  constructor(fields) {
    super('Validation failed');
    this.fields = fields;
  }
}

export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function normalizePhone(v) {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function validateApplication(body) {
  const errors = {};
  const b = body && typeof body === 'object' ? body : {};
  const out = {};

  const scheme = SCHEMES.find((s) => s.id === b.scheme);
  if (!scheme) errors.scheme = 'invalid_scheme';
  else out.scheme = scheme.id;

  out.applicantName = cleanText(b.applicantName, 80);
  if (out.applicantName.length < 2 || CTRL.test(out.applicantName)) errors.applicantName = 'invalid_name';

  out.phone = normalizePhone(b.phone);
  if (!/^[6-9]\d{9}$/.test(out.phone)) errors.phone = 'invalid_phone';

  out.dob = cleanText(b.dob, 10);
  if (!isDate(out.dob) || Date.parse(out.dob) > Date.now() || Date.parse(out.dob) < Date.parse('1900-01-01')) {
    errors.dob = 'invalid_dob';
  }

  out.village = cleanText(b.village, 80);
  if (out.village.length < 2) errors.village = 'required';
  out.district = cleanText(b.district, 80);
  if (out.district.length < 2) errors.district = 'required';
  out.postOffice = cleanText(b.postOffice, 100);

  out.nomineeName = cleanText(b.nomineeName, 80);
  out.nomineeRelation = cleanText(b.nomineeRelation, 40);

  if (b.depositAmount === '' || b.depositAmount == null) out.depositAmount = null;
  else {
    const n = Number(b.depositAmount);
    if (!Number.isFinite(n) || n < 0 || n > 100000000) errors.depositAmount = 'invalid_amount';
    else out.depositAmount = Math.round(n * 100) / 100;
  }

  out.preferredDate = cleanText(b.preferredDate, 10);
  if (out.preferredDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (!isDate(out.preferredDate) || out.preferredDate < today) errors.preferredDate = 'invalid_date';
  }

  const docs = Array.isArray(b.docsReady) ? b.docsReady : [];
  out.docsReady = [...new Set(docs.filter((d) => DOCUMENTS.includes(d)))];

  out.language = ['en', 'hi', 'te'].includes(b.language) ? b.language : 'en';
  out.note = cleanText(b.note, 500);

  if (b.consent !== true) errors.consent = 'consent_required';

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

export function validateMessage(body) {
  const text = cleanText(body?.text, 1000);
  if (!text) throw new ValidationError({ text: 'required' });
  return text;
}

export function validateAdminUpdate(body, current) {
  const errors = {};
  const out = {};
  const b = body && typeof body === 'object' ? body : {};

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status) || b.status === 'cancelled') errors.status = 'invalid_status';
    else out.status = b.status;
  }
  out.statusNote = cleanText(b.statusNote, 500);

  if (b.appointment !== undefined) {
    const a = b.appointment || {};
    const appt = {
      date: cleanText(a.date, 10),
      time: cleanText(a.time, 5),
      postOffice: cleanText(a.postOffice, 100),
    };
    if (appt.date && !isDate(appt.date)) errors.appointment = 'invalid_date';
    if (appt.time && !isTime(appt.time)) errors.appointment = 'invalid_time';
    out.appointment = appt;
  }

  const finalStatus = out.status || current.status;
  const finalAppt = out.appointment || current.appointment || {};
  if (out.status === 'appointment_confirmed' && !finalAppt.date) errors.appointment = 'date_required';
  if (out.status && ['docs_needed', 'rejected'].includes(out.status) && !out.statusNote) {
    errors.statusNote = 'note_required';
  }
  void finalStatus;

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

export function checkPin(pin, field = 'pin') {
  const p = String(pin ?? '');
  if (!/^\d{4}$/.test(p)) throw new ValidationError({ [field]: 'invalid_pin' });
  if (isWeakPin(p)) throw new ValidationError({ [field]: 'weak_pin' });
  return p;
}

export function validateRegister(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  const name = cleanText(b.name, 80);
  if (name.length < 2 || CTRL.test(name)) errors.name = 'invalid_name';
  const phone = normalizePhone(b.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'invalid_phone';
  const pin = String(b.pin ?? '');
  if (!/^\d{4}$/.test(pin)) errors.pin = 'invalid_pin';
  else if (isWeakPin(pin)) errors.pin = 'weak_pin';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { name, phone, pin };
}
