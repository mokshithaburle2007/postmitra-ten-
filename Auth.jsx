import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, userSession, ApiError } from './api.js';
import { useLang, errMessage } from './i18n.js';
import { Field } from './ui.jsx';

const AuthCtx = createContext({ user: null, signOut: () => {}, onSession: () => {} });
export const useAuth = () => useContext(AuthCtx);

// Holds the signed-in applicant. Any 401 'unauthorized' from the server signs them out.
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => userSession.get());
  const user = state?.user || null;

  const onSession = useCallback((token, u) => { userSession.set(token, u); setState({ token, user: u }); }, []);
  const signOut = useCallback(() => { userSession.clear(); setState(null); }, []);

  // Confirm a remembered session is still valid (e.g. PIN was reset by staff).
  useEffect(() => {
    if (!userSession.get()) return;
    api.me().then((r) => onSession(userSession.get().token, r.user)).catch((e) => {
      if (e instanceof ApiError && e.code === 'unauthorized') signOut();
    });
  }, [onSession, signOut]);

  const value = useMemo(() => ({ user, signOut, onSession }), [user, signOut, onSession]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// Show `children` only when signed in (and not forced to change a reset PIN first).
export function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <AuthCard />;
  if (user.mustChangePin) return <ChangePinCard forced />;
  return children;
}

const pinInput = { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4, autoComplete: 'off' };

export function AuthCard() {
  const { t } = useLang();
  const { onSession } = useAuth();
  const [mode, setMode] = useState('signin');
  const [f, setF] = useState({ name: '', phone: '', pin: '', pin2: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const reg = mode === 'register';
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: k.startsWith('pin') ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const msg = (code) => (code ? (t(`err.${code}`) === `err.${code}` ? t('err.generic') : t(`err.${code}`)) : '');

  async function submit(ev) {
    ev.preventDefault();
    setFormError('');
    const x = {};
    if (reg && f.name.trim().length < 2) x.name = 'invalid_name';
    if (!/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, '').slice(-10))) x.phone = 'invalid_phone';
    if (!/^\d{4}$/.test(f.pin)) x.pin = 'invalid_pin';
    if (reg && !x.pin && f.pin !== f.pin2) x.pin2 = 'pin_mismatch';
    if (Object.keys(x).length) { setErrors(x); document.getElementById(`a-${Object.keys(x)[0]}`)?.focus(); return; }
    setBusy(true);
    try {
      const r = reg ? await api.register(f.name.trim(), f.phone, f.pin) : await api.login(f.phone, f.pin);
      onSession(r.token, r.user);
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(errMessage(t, err));
    } finally { setBusy(false); }
  }

  return (
    <form className="card narrow" onSubmit={submit} noValidate>
      <h2>{t('auth.title')}</h2>
      <p className="muted">{t('auth.why')}</p>
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={!reg} className={!reg ? 'on' : ''} onClick={() => { setMode('signin'); setErrors({}); setFormError(''); }}>{t('auth.signin')}</button>
        <button type="button" role="tab" aria-selected={reg} className={reg ? 'on' : ''} onClick={() => { setMode('register'); setErrors({}); setFormError(''); }}>{t('auth.register')}</button>
      </div>

      {reg && (
        <Field label={t('auth.name')} error={msg(errors.name)} htmlFor="a-name">
          <input id="a-name" value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} />
        </Field>
      )}
      <Field label={t('auth.phone')} error={msg(errors.phone)} htmlFor="a-phone">
        <input id="a-phone" value={f.phone} onChange={set('phone')} inputMode="numeric" autoComplete="tel" maxLength={14} placeholder="98765 43210" />
      </Field>
      <Field label={t('auth.pin')} error={msg(errors.pin)} htmlFor="a-pin">
        <input id="a-pin" type="password" value={f.pin} onChange={set('pin')} className="pin" {...pinInput} autoComplete={reg ? 'new-password' : 'current-password'} />
      </Field>
      {reg && (
        <Field label={t('auth.pin2')} error={msg(errors.pin2)} htmlFor="a-pin2">
          <input id="a-pin2" type="password" value={f.pin2} onChange={set('pin2')} className="pin" {...pinInput} autoComplete="new-password" />
        </Field>
      )}
      {reg && <p className="muted small">{t('auth.pinHint')}</p>}
      {!reg && <p className="muted small">{t('auth.forgot')}</p>}

      {formError && <p className="banner-err" role="alert">{formError}</p>}
      <button className="btn primary wide" disabled={busy}>{busy ? t('auth.working') : reg ? t('auth.go.register') : t('auth.go.signin')}</button>
    </form>
  );
}

export function ChangePinCard({ forced = false }) {
  const { t } = useLang();
  const { onSession, user, signOut } = useAuth();
  const [f, setF] = useState({ oldPin: '', newPin: '', newPin2: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '').slice(0, 4) })); setErrors((x) => ({ ...x, [k]: undefined })); setOk(false); };
  const msg = (code) => (code ? (t(`err.${code}`) === `err.${code}` ? t('err.generic') : t(`err.${code}`)) : '');

  async function submit(ev) {
    ev.preventDefault();
    setFormError('');
    const x = {};
    if (!/^\d{4}$/.test(f.oldPin)) x.oldPin = 'invalid_pin';
    if (!/^\d{4}$/.test(f.newPin)) x.newPin = 'invalid_pin';
    else if (f.newPin !== f.newPin2) x.newPin2 = 'pin_mismatch';
    if (Object.keys(x).length) { setErrors(x); return; }
    setBusy(true);
    try {
      const r = await api.changePin(f.oldPin, f.newPin);
      onSession(r.token, r.user);
      setF({ oldPin: '', newPin: '', newPin2: '' });
      setOk(true);
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors({ newPin: err.fields.newPin });
      else if (err.code === 'invalid_credentials') setErrors({ oldPin: 'invalid_credentials' });
      else setFormError(errMessage(t, err));
    } finally { setBusy(false); }
  }

  return (
    <form className={forced ? 'card narrow' : 'card'} onSubmit={submit} noValidate>
      {forced && <div className="notice"><strong>{t('acct.mustChange')}</strong></div>}
      <h3 style={{ marginTop: forced ? '1rem' : 0 }}>{t('acct.changePin')}</h3>
      <Field label={t('acct.oldPin')} error={msg(errors.oldPin)} htmlFor="c-old">
        <input id="c-old" type="password" className="pin" value={f.oldPin} onChange={set('oldPin')} {...pinInput} />
      </Field>
      <Field label={t('acct.newPin')} error={msg(errors.newPin)} htmlFor="c-new">
        <input id="c-new" type="password" className="pin" value={f.newPin} onChange={set('newPin')} {...pinInput} autoComplete="new-password" />
      </Field>
      <Field label={t('acct.newPin2')} error={msg(errors.newPin2)} htmlFor="c-new2">
        <input id="c-new2" type="password" className="pin" value={f.newPin2} onChange={set('newPin2')} {...pinInput} autoComplete="new-password" />
      </Field>
      {formError && <p className="banner-err" role="alert">{formError}</p>}
      {ok && <p className="banner-ok" role="status">{t('acct.saved')}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? t('auth.working') : t('acct.changePin')}</button>
        {forced && <button type="button" className="btn" onClick={signOut}>{t('auth.signout')} ({user?.phone})</button>}
      </div>
    </form>
  );
}

export function AccountPage() {
  const { t } = useLang();
  const { user, signOut } = useAuth();
  return (
    <RequireAuth>
      <section className="card">
        <h2>{t('acct.title')}</h2>
        <p><strong>{user?.name}</strong></p>
        <p className="muted">{user?.phone}</p>
        <button className="btn" onClick={signOut}>{t('auth.signout')}</button>
      </section>
      <ChangePinCard />
    </RequireAuth>
  );
}
