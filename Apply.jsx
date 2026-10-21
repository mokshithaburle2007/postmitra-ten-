import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './Auth.jsx';
import { useLang, errMessage } from './i18n.js';
import { Field } from './ui.jsx';

const EMPTY = {
  scheme: '', applicantName: '', dob: '', village: '', district: '', postOffice: '',
  nomineeName: '', nomineeRelation: '', depositAmount: '', preferredDate: '', docsReady: [], note: '', consent: false,
};

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// `presetScheme` lets your scheme details page open this form with a scheme pre-selected.
export default function ApplyPage({ presetScheme = '', onTrack }) {
  const { t, lang } = useLang();
  const { user, signOut } = useAuth();
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, scheme: presetScheme, applicantName: user?.name || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { api.schemes().then(setMeta).catch((e) => setFormError(errMessage(t, e))); }, []); // eslint-disable-line
  useEffect(() => { if (presetScheme) setForm((f) => ({ ...f, scheme: presetScheme })); }, [presetScheme]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const toggleDoc = (d) => setForm((f) => ({
    ...f, docsReady: f.docsReady.includes(d) ? f.docsReady.filter((x) => x !== d) : [...f.docsReady, d],
  }));

  const e = useMemo(() => Object.fromEntries(Object.entries(errors).filter(([, v]) => v).map(([k, v]) => [k, t(`err.${v}`) === `err.${v}` ? t('err.required') : t(`err.${v}`)])), [errors, t]);

  function localCheck() {
    const x = {};
    if (!form.scheme) x.scheme = 'invalid_scheme';
    if (form.applicantName.trim().length < 2) x.applicantName = 'invalid_name';
    if (!form.dob) x.dob = 'invalid_dob';
    if (form.village.trim().length < 2) x.village = 'required';
    if (form.district.trim().length < 2) x.district = 'required';
    if (!form.consent) x.consent = 'consent_required';
    return x;
  }

  async function submit(ev) {
    ev.preventDefault();
    setFormError('');
    const local = localCheck();
    if (Object.keys(local).length) {
      setErrors(local);
      document.getElementById(`f-${Object.keys(local)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.create({ ...form, language: lang });
      setDone(res.id);
    } catch (err) {
      if (err.code === 'unauthorized') { signOut(); return; }
      if (err.fields && Object.keys(err.fields).length) {
        setErrors(err.fields);
        document.getElementById(`f-${Object.keys(err.fields)[0]}`)?.focus();
      } else setFormError(errMessage(t, err));
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <section className="card success" aria-live="polite">
        <div className="tick" aria-hidden="true">✓</div>
        <h2>{t('done.title')}</h2>
        <p className="muted">{t('done.id')}</p>
        <p className="big-id">{done}</p>
        <p>{t('done.save')}</p>
        <p>{t('done.next')}</p>
        <div className="row">
          <button className="btn primary" onClick={() => onTrack && onTrack(done)}>{t('done.view')}</button>
          <button className="btn" onClick={() => { setDone(null); setForm({ ...EMPTY, applicantName: user?.name || '' }); }}>{t('done.another')}</button>
        </div>
      </section>
    );
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>{t('apply.title')}</h2>
      <p className="muted">{t('apply.sub')}</p>

      <Field label={t('f.scheme')} error={e.scheme} htmlFor="f-scheme">
        <select id="f-scheme" value={form.scheme} onChange={set('scheme')}>
          <option value="">{t('f.scheme.pick')}</option>
          {meta?.schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>

      <div className="grid2">
        <Field label={t('f.name')} error={e.applicantName} htmlFor="f-applicantName">
          <input id="f-applicantName" value={form.applicantName} onChange={set('applicantName')} autoComplete="name" maxLength={80} />
        </Field>
        <Field label={t('apply.phoneFrom')} htmlFor="f-phone">
          <input id="f-phone" value={user?.phone || ''} readOnly className="readonly" />
        </Field>
        <Field label={t('f.dob')} error={e.dob} htmlFor="f-dob">
          <input id="f-dob" type="date" value={form.dob} max={todayISO()} onChange={set('dob')} />
        </Field>
        <Field label={t('f.amount')} error={e.depositAmount} optional optionalLabel={t('f.optional')} htmlFor="f-depositAmount">
          <input id="f-depositAmount" value={form.depositAmount} onChange={set('depositAmount')} inputMode="decimal" />
        </Field>
        <Field label={t('f.village')} error={e.village} htmlFor="f-village">
          <input id="f-village" value={form.village} onChange={set('village')} maxLength={80} />
        </Field>
        <Field label={t('f.district')} error={e.district} htmlFor="f-district">
          <input id="f-district" value={form.district} onChange={set('district')} maxLength={80} />
        </Field>
        <Field label={t('f.postOffice')} error={e.postOffice} optional optionalLabel={t('f.optional')} htmlFor="f-postOffice">
          <input id="f-postOffice" value={form.postOffice} onChange={set('postOffice')} maxLength={100} />
        </Field>
        <Field label={t('f.preferredDate')} error={e.preferredDate} optional optionalLabel={t('f.optional')} htmlFor="f-preferredDate">
          <input id="f-preferredDate" type="date" value={form.preferredDate} min={todayISO()} onChange={set('preferredDate')} />
        </Field>
        <Field label={t('f.nomineeName')} optional optionalLabel={t('f.optional')} htmlFor="f-nomineeName">
          <input id="f-nomineeName" value={form.nomineeName} onChange={set('nomineeName')} maxLength={80} />
        </Field>
        <Field label={t('f.nomineeRelation')} optional optionalLabel={t('f.optional')} htmlFor="f-nomineeRelation">
          <input id="f-nomineeRelation" value={form.nomineeRelation} onChange={set('nomineeRelation')} maxLength={40} />
        </Field>
      </div>

      <fieldset className="docs">
        <legend>{t('f.docs')}</legend>
        {meta?.documents.map((d) => (
          <label key={d} className={`check${form.docsReady.includes(d) ? ' on' : ''}`}>
            <input type="checkbox" checked={form.docsReady.includes(d)} onChange={() => toggleDoc(d)} />
            {t(`doc.${d}`)}
          </label>
        ))}
      </fieldset>

      <Field label={t('f.note')} htmlFor="f-note">
        <textarea id="f-note" rows={3} value={form.note} onChange={set('note')} maxLength={500} />
      </Field>

      <div className={`field${e.consent ? ' has-error' : ''}`}>
        <label className="check consent" htmlFor="f-consent">
          <input id="f-consent" type="checkbox" checked={form.consent}
            onChange={(ev) => { setForm((f) => ({ ...f, consent: ev.target.checked })); setErrors((x) => ({ ...x, consent: undefined })); }} />
          {t('consent')}
        </label>
        {e.consent && <p className="err" role="alert">{e.consent}</p>}
      </div>

      {formError && <p className="banner-err" role="alert">{formError}</p>}
      <button className="btn primary wide" disabled={busy}>{busy ? t('sending') : t('submit')}</button>
    </form>
  );
}
