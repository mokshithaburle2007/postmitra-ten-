import { useEffect, useRef } from 'react';

export const STATUS_EN = {
  submitted: 'Submitted', in_review: 'In review', docs_needed: 'Docs needed',
  appointment_confirmed: 'Visit confirmed', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
};

export function fmt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

export function fmtDate(d) {
  if (!d) return '';
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

export function StatusChip({ status, label }) {
  return <span className={`chip chip-${status}`}>{label}</span>;
}

export function Field({ label, error, optional, optionalLabel, children, htmlFor }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {optional && <span className="opt"> · {optionalLabel}</span>}
      </label>
      {children}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

// `me` is who is looking at the thread: 'user' or 'admin'. Own messages align right.
export function Thread({ messages, me, labels, empty }) {
  const end = useRef(null);
  const count = messages.length;
  useEffect(() => {
    const el = end.current;
    if (el && el.parentElement) el.parentElement.scrollTop = el.parentElement.scrollHeight;
  }, [count]);
  if (!count) return <p className="muted thread-empty">{empty}</p>;
  return (
    <div className="thread" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`bubble ${m.from === me ? 'mine' : 'theirs'}`}>
          <span className="who">{m.from === me ? labels.me : labels.them}</span>
          <p>{m.text}</p>
          <time>{fmt(m.at)}</time>
        </div>
      ))}
      <span ref={end} />
    </div>
  );
}

export function Timeline({ history, label }) {
  return (
    <ol className="timeline">
      {history.map((h, i) => (
        <li key={i} className={i === history.length - 1 ? 'now' : ''}>
          <strong>{label(h.status)}</strong>
          <time>{fmt(h.at)}</time>
          {h.note && <p>{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}

// Re-runs `fn` every `ms` while the tab is visible. Used for near-real-time two-way updates.
export function usePoll(fn, ms, deps) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    const tick = () => { if (!document.hidden) saved.current(); };
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
