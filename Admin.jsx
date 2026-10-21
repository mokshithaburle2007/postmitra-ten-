import { useCallback, useEffect, useState } from 'react';
import { api, adminSession, ApiError } from './api.js';
import { StatusChip, Thread, Timeline, usePoll, fmt, fmtDate, STATUS_EN } from './ui.jsx';

const ADMIN_STATUSES = ['submitted', 'in_review', 'docs_needed', 'appointment_confirmed', 'completed', 'rejected'];
const QUICK = [
  'Please bring your original Aadhaar card and two passport-size photos.',
  'Your documents look fine. We will confirm a visit date shortly.',
  'Please visit the post office with the original documents on the confirmed date.',
  'Could you share a convenient date and time to visit?',
];
const DOC_EN = {
  aadhaar: 'Aadhaar', photo: 'Photo', address_proof: 'Address proof', pan: 'PAN', age_proof: 'Age proof', nominee_details: 'Nominee details',
};
const ERR = {
  invalid_credentials: 'Wrong password.', too_many_requests: 'Too many attempts. Wait a few minutes.',
  network: 'Cannot reach the server.', note_required: 'Add a note for the applicant explaining this status.',
  date_required: 'Pick a visit date to confirm the appointment.', invalid_status: 'That status is not allowed.',
  invalid_date: 'Check the date.', invalid_time: 'Check the time.', not_found: 'Application not found.',
};
const msg = (e) => {
  const f = e?.fields && Object.values(e.fields)[0];
  if (f) return ERR[f] || 'Please check the form.';
  return ERR[e?.code] || 'Something went wrong.';
};

function Login({ onLogin }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api.adminLogin(pw);
      adminSession.set(r.token);
      onLogin(r.token);
    } catch (x) { setErr(msg(x)); } finally { setBusy(false); }
  }
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Staff login</h2>
      <p className="muted">Post office / CSP admin dashboard.</p>
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </div>
      {err && <p className="banner-err" role="alert">{err}</p>}
      <button className="btn primary wide" disabled={busy || !pw}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function DetailPanel({ token, id, schemes, onClose, onChanged, onAuthLost }) {
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [appt, setAppt] = useState({ date: '', time: '', postOffice: '' });
  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tempPin, setTempPin] = useState(null);

  const handle = useCallback((e) => {
    if (e instanceof ApiError && e.status === 401) onAuthLost();
    else setError(msg(e));
  }, [onAuthLost]);

  const load = useCallback(async (initial) => {
    try {
      const r = await api.adminGet(token, id);
      setApp(r.application);
      if (initial) {
        setStatus(r.application.status === 'cancelled' ? '' : r.application.status);
        setStatusNote(r.application.statusNote || '');
        setAppt({ date: '', time: '', postOffice: '', ...r.application.appointment });
        setDirty(false);
      }
    } catch (e) { handle(e); }
  }, [token, id, handle]);

  useEffect(() => { setApp(null); setError(''); setReply(''); setNote(''); setTempPin(null); load(true); }, [id]); // eslint-disable-line
  usePoll(() => load(false), 8000, [load]);

  async function run(name, fn) {
    setBusy(name); setError('');
    try { const r = await fn(); setApp(r.application); onChanged(); return true; }
    catch (e) { handle(e); return false; } finally { setBusy(''); }
  }

  const saveStatus = () => run('status', async () => {
    const body = { statusNote };
    if (status) body.status = status;
    if (status === 'appointment_confirmed' || appt.date) body.appointment = appt;
    const r = await api.adminUpdate(token, id, body);
    setDirty(false);
    return r;
  });

  const sendReply = async () => {
    if (!reply.trim()) return;
    if (await run('reply', () => api.adminMessage(token, id, reply.trim()))) setReply('');
  };
  const addNote = async () => {
    if (!note.trim()) return;
    if (await run('note', () => api.adminNote(token, id, note.trim()))) setNote('');
  };
  async function resetPin() {
    if (!window.confirm(`Reset the PIN for ${app.applicantName} (${app.phone})? They will be signed out everywhere and must choose a new PIN.`)) return;
    try { setTempPin(await api.adminResetPin(token, id)); } catch (e) { handle(e); }
  }
  async function remove() {
    if (!window.confirm(`Permanently delete ${id}? This cannot be undone.`)) return;
    try { await api.adminDelete(token, id); onChanged(); onClose(); } catch (e) { handle(e); }
  }

  if (!app) return <aside className="detail card"><button className="link" onClick={onClose}>← Back</button><p className="muted">{error || 'Loading…'}</p></aside>;

  const closedForUser = app.status === 'cancelled' || app.status === 'rejected';
  const touch = (fn) => (e) => { fn(e); setDirty(true); };

  return (
    <aside className="detail card">
      <button className="link back-only-mobile" onClick={onClose}>← Back to list</button>
      <header className="detail-head">
        <div>
          <p className="muted small">{app.id} · received {fmt(app.createdAt)}</p>
          <h2>{app.applicantName}</h2>
          <p>{app.schemeName}</p>
        </div>
        <StatusChip status={app.status} label={STATUS_EN[app.status]} />
      </header>

      <dl className="facts">
        <div><dt>Phone</dt><dd><a href={`tel:${app.phone}`}>{app.phone}</a></dd></div>
        <div><dt>Date of birth</dt><dd>{fmtDate(app.dob)}</dd></div>
        <div><dt>Village</dt><dd>{app.village}, {app.district}</dd></div>
        <div><dt>Post office</dt><dd>{app.postOffice || '—'}</dd></div>
        <div><dt>Deposit</dt><dd>{app.depositAmount != null ? `₹${Number(app.depositAmount).toLocaleString('en-IN')}` : '—'}</dd></div>
        <div><dt>Preferred visit</dt><dd>{fmtDate(app.preferredDate) || '—'}</dd></div>
        <div><dt>Nominee</dt><dd>{[app.nomineeName, app.nomineeRelation && `(${app.nomineeRelation})`].filter(Boolean).join(' ') || '—'}</dd></div>
        <div><dt>Language</dt><dd>{{ en: 'English', hi: 'Hindi', te: 'Telugu' }[app.language]}</dd></div>
      </dl>
      <p className="docline"><strong>Documents ready:</strong> {app.docsReady.length ? app.docsReady.map((d) => DOC_EN[d]).join(', ') : 'none listed'}</p>
      {app.note && <div className="notice"><strong>Applicant's note</strong><p>{app.note}</p></div>}

      <h3>Update status</h3>
      <div className="grid2">
        <div className="field">
          <label htmlFor="st">Status</label>
          <select id="st" value={status} onChange={touch((e) => setStatus(e.target.value))} disabled={app.status === 'cancelled'}>
            {app.status === 'cancelled' && <option value="">Cancelled by applicant</option>}
            {ADMIN_STATUSES.map((s) => <option key={s} value={s}>{STATUS_EN[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sn">Note shown to applicant</label>
          <input id="sn" value={statusNote} maxLength={500} onChange={touch((e) => setStatusNote(e.target.value))} placeholder="e.g. Bring birth certificate" />
        </div>
      </div>
      {(status === 'appointment_confirmed' || appt.date) && (
        <div className="grid3">
          <div className="field"><label htmlFor="ad">Visit date</label><input id="ad" type="date" value={appt.date} onChange={touch((e) => setAppt({ ...appt, date: e.target.value }))} /></div>
          <div className="field"><label htmlFor="at">Time</label><input id="at" type="time" value={appt.time} onChange={touch((e) => setAppt({ ...appt, time: e.target.value }))} /></div>
          <div className="field"><label htmlFor="ap">Post office</label><input id="ap" value={appt.postOffice} maxLength={100} onChange={touch((e) => setAppt({ ...appt, postOffice: e.target.value }))} /></div>
        </div>
      )}
      <button className="btn primary" onClick={saveStatus} disabled={busy === 'status' || app.status === 'cancelled' || !dirty}>
        {busy === 'status' ? 'Saving…' : 'Save and notify applicant'}
      </button>

      <h3>Conversation</h3>
      <Thread messages={app.messages} me="admin" labels={{ me: 'You', them: 'Applicant' }} empty="No messages yet." />
      {closedForUser ? <p className="muted small">Applicant can no longer reply on a {STATUS_EN[app.status].toLowerCase()} application.</p> : null}
      <div className="quick">
        {QUICK.map((q) => <button key={q} type="button" className="pill" onClick={() => setReply(q)}>{q.length > 38 ? `${q.slice(0, 36)}…` : q}</button>)}
      </div>
      <div className="composer">
        <textarea rows={2} value={reply} maxLength={1000} placeholder="Reply to applicant" onChange={(e) => setReply(e.target.value)} />
        <button className="btn primary" onClick={sendReply} disabled={busy === 'reply' || !reply.trim()}>Send</button>
      </div>

      <h3>Internal notes <span className="muted small">(never shown to the applicant)</span></h3>
      {app.internalNotes.map((n) => <p key={n.id} className="inote"><time>{fmt(n.at)}</time> {n.text}</p>)}
      <div className="composer">
        <input value={note} maxLength={1000} placeholder="Add a private note" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
        <button className="btn" onClick={addNote} disabled={busy === 'note' || !note.trim()}>Add</button>
      </div>

      <h3>Account help</h3>
      <p className="muted small">If the applicant forgot their PIN, reset it here and tell them the temporary PIN in person or by phone. Confirm who they are first.</p>
      {tempPin && (
        <div className="notice" role="status">
          <strong>Temporary PIN for {tempPin.name} ({tempPin.phone})</strong>
          <p className="big-id">{tempPin.tempPin}</p>
          <p className="small">Shown only once. They must sign in with it and choose a new PIN.</p>
        </div>
      )}
      <button className="btn" onClick={resetPin}>Reset applicant's PIN</button>

      <h3>History</h3>
      <Timeline history={app.history} label={(s) => STATUS_EN[s]} />

      {error && <p className="banner-err" role="alert">{error}</p>}
      <button className="btn danger" onClick={remove}>Delete application (erase data)</button>
    </aside>
  );
}

function Dashboard({ token, onLogout }) {
  const [filters, setFilters] = useState({ q: '', status: '', scheme: '', unread: false });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => { const h = setTimeout(() => setDebounced(filters.q), 300); return () => clearTimeout(h); }, [filters.q]);
  useEffect(() => { api.schemes().then((r) => setSchemes(r.schemes)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    try {
      const params = { page, pageSize: 25 };
      if (debounced) params.q = debounced;
      if (filters.status) params.status = filters.status;
      if (filters.scheme) params.scheme = filters.scheme;
      if (filters.unread) params.unread = '1';
      setData(await api.adminList(token, params));
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onLogout(); else setError(msg(e));
    }
  }, [token, page, debounced, filters.status, filters.scheme, filters.unread, onLogout]);

  useEffect(() => { load(); }, [load]);
  usePoll(load, 15000, [load]);
  useEffect(() => { setPage(1); }, [debounced, filters.status, filters.scheme, filters.unread]);

  async function exportCsv() {
    try {
      const blob = await api.adminCsv(token);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'postmitra-applications.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError(msg(e)); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className={`admin${selected ? ' has-selection' : ''}`}>
      <div className="admin-top">
        <h2>Applications</h2>
        <div className="row">
          <button className="btn" onClick={exportCsv}>Export CSV</button>
          <button className="btn" onClick={onLogout}>Sign out</button>
        </div>
      </div>

      {data && (
        <div className="stats">
          <button className={`stat${filters.status === '' && !filters.unread ? ' on' : ''}`} onClick={() => setFilters({ ...filters, status: '', unread: false })}>
            <b>{data.totalAll}</b><span>All</span>
          </button>
          <button className={`stat attn${filters.unread ? ' on' : ''}`} onClick={() => setFilters({ ...filters, unread: !filters.unread, status: '' })}>
            <b>{data.unreadCount}</b><span>Needs attention</span>
          </button>
          {['submitted', 'in_review', 'docs_needed', 'appointment_confirmed', 'completed'].map((s) => (
            <button key={s} className={`stat${filters.status === s ? ' on' : ''}`} onClick={() => setFilters({ ...filters, status: filters.status === s ? '' : s, unread: false })}>
              <b>{data.counts[s] || 0}</b><span>{STATUS_EN[s]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="filters">
        <input type="search" placeholder="Search name, phone, ID, village" value={filters.q} onChange={setF('q')} aria-label="Search" />
        <select value={filters.scheme} onChange={setF('scheme')} aria-label="Scheme">
          <option value="">All schemes</option>
          {schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {error && <p className="banner-err" role="alert">{error}</p>}

      <div className="split">
        <section className="list card">
          {!data && <p className="muted">Loading…</p>}
          {data && !data.items.length && <p className="muted">No applications match.</p>}
          <ul className="applist">
            {data?.items.map((a) => (
              <li key={a.id}>
                <button className={`appitem${selected === a.id ? ' active' : ''}`} onClick={() => setSelected(a.id)}>
                  <span>
                    <strong>{a.unread && <span className="dot" aria-label="Unread" />}{a.applicantName}</strong>
                    <span className="muted small">{a.schemeName} · {a.village}</span>
                    {a.lastMessage && <span className="muted small clip">{a.lastMessage.from === 'user' ? 'Applicant: ' : 'You: '}{a.lastMessage.text}</span>}
                  </span>
                  <span className="right">
                    <StatusChip status={a.status} label={STATUS_EN[a.status]} />
                    <span className="muted small">{fmt(a.updatedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {data && pages > 1 && (
            <div className="pager">
              <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="muted">Page {page} of {pages}</span>
              <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </section>

        {selected
          ? <DetailPanel key={selected} token={token} id={selected} schemes={schemes} onClose={() => setSelected('')} onChanged={load} onAuthLost={onLogout} />
          : <aside className="detail card placeholder"><p className="muted">Select an application to view details, reply and update its status.</p></aside>}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState(adminSession.get());
  const logout = useCallback(() => { adminSession.clear(); setToken(''); }, []);
  return token ? <Dashboard token={token} onLogout={logout} /> : <Login onLogin={setToken} />;
}
