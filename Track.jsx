import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './Auth.jsx';
import { useLang, errMessage } from './i18n.js';
import { StatusChip, Thread, Timeline, usePoll, fmt, fmtDate } from './ui.jsx';

const CLOSED = ['completed', 'rejected', 'cancelled'];

function Detail({ id, onBack }) {
  const { t } = useLang();
  const { signOut } = useAuth();
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = useCallback((e) => {
    if (e.code === 'unauthorized') signOut(); // session ended (e.g. PIN reset): back to sign-in
    else setError(errMessage(t, e));
  }, [signOut, t]);

  const load = useCallback(async () => {
    try { setApp((await api.get(id)).application); setError(''); } catch (e) { fail(e); }
  }, [id, fail]);

  useEffect(() => { load(); }, [load]);
  usePoll(load, 10000, [load]);

  async function send(ev) {
    ev.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try { setApp((await api.message(id, text.trim())).application); setText(''); setError(''); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function cancel() {
    if (!window.confirm(t('track.cancelConfirm'))) return;
    try { setApp((await api.cancel(id)).application); } catch (e) { fail(e); }
  }

  if (!app) {
    return (
      <section className="card">
        <button className="link" onClick={onBack}>← {t('track.back')}</button>
        {error ? <p className="banner-err" role="alert">{error}</p> : <p className="muted">…</p>}
      </section>
    );
  }

  const closed = CLOSED.includes(app.status);
  const canMessage = !closed || app.status === 'completed';
  const appt = app.appointment || {};

  return (
    <section className="card">
      <button className="link" onClick={onBack}>← {t('track.back')}</button>
      <header className="detail-head">
        <div>
          <p className="muted small">{app.id}</p>
          <h2>{app.schemeName}</h2>
        </div>
        <StatusChip status={app.status} label={t(`status.${app.status}`)} />
      </header>

      {app.statusNote && (
        <div className="notice">
          <strong>{t('track.update')}</strong>
          <p>{app.statusNote}</p>
        </div>
      )}

      {appt.date && (
        <div className="visit">
          <span className="visit-day">{fmtDate(appt.date)}{appt.time ? ` · ${appt.time}` : ''}</span>
          <span>{t('track.visit')}{appt.postOffice ? ` — ${appt.postOffice}` : ''}</span>
        </div>
      )}

      {app.status === 'docs_needed' && app.docsReady?.length > 0 && (
        <p className="muted small">{t('track.bring')}: {app.docsReady.map((d) => t(`doc.${d}`)).join(', ')}</p>
      )}

      <h3>{t('track.messages')}</h3>
      <Thread messages={app.messages} me="user" labels={{ me: t('track.you'), them: t('track.staff') }} empty={t('track.nomsg')} />
      {canMessage ? (
        <form className="composer" onSubmit={send}>
          <textarea rows={2} value={text} maxLength={1000} placeholder={t('track.type')} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" disabled={busy || !text.trim()}>{t('track.send')}</button>
        </form>
      ) : <p className="muted small">{t('track.closed')}</p>}
      {error && <p className="banner-err" role="alert">{error}</p>}

      <h3>{t('track.timeline')}</h3>
      <Timeline history={app.history} label={(s) => t(`status.${s}`)} />

      {!closed && <button className="btn danger" onClick={cancel}>{t('track.cancel')}</button>}
    </section>
  );
}

export default function TrackPage({ initialId = '', onOpen }) {
  const { t } = useLang();
  const { signOut } = useAuth();
  const [items, setItems] = useState(null);
  const [openId, setOpenId] = useState(initialId);
  const [err, setErr] = useState('');

  useEffect(() => { setOpenId(initialId); }, [initialId]);

  const refresh = useCallback(async () => {
    try { setItems((await api.mine()).items); setErr(''); }
    catch (e) {
      if (e.code === 'unauthorized') signOut();
      else { setErr(errMessage(t, e)); setItems((x) => x || []); }
    }
  }, [t, signOut]);

  useEffect(() => { if (!openId) refresh(); }, [openId, refresh]);
  usePoll(() => { if (!openId) refresh(); }, 15000, [openId, refresh]);

  const open = (id) => { setOpenId(id); if (onOpen) onOpen(id); };
  const back = () => { setOpenId(''); if (onOpen) onOpen(''); };

  if (openId) return <Detail id={openId} onBack={back} />;

  return (
    <section className="card">
      <h2>{t('track.mine')}</h2>
      {items === null && <p className="muted">…</p>}
      {items && !items.length && <p className="muted">{t('track.none')}</p>}
      {err && <p className="banner-err" role="alert">{err}</p>}
      <ul className="applist">
        {items?.map((a) => (
          <li key={a.id}>
            <button onClick={() => open(a.id)} className="appitem">
              <span>
                <strong>{a.schemeName}</strong>
                <span className="muted small">{a.id} · {fmt(a.updatedAt)}</span>
              </span>
              <span className="right">
                {a.unread && <span className="dot" aria-label={t('track.new')} />}
                <StatusChip status={a.status} label={t(`status.${a.status}`)} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
