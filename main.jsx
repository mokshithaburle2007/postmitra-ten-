import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LangProvider, useLang, LANGS } from './i18n.js';
import ApplyPage from './Apply.jsx';
import TrackPage from './Track.jsx';
import AdminPage from './Admin.jsx';
import { AuthProvider, RequireAuth, AccountPage, useAuth } from './Auth.jsx';
import './styles.css';

function parseHash() {
  const [, page = 'apply', id = ''] = window.location.hash.split('/');
  return { page: ['apply', 'track', 'account', 'admin'].includes(page) ? page : 'apply', id: decodeURIComponent(id) };
}

function Shell() {
  const { t, lang, setLang } = useLang();
  const { user } = useAuth();
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const go = (page, id = '') => { window.location.hash = id ? `#/${page}/${encodeURIComponent(id)}` : `#/${page}`; };
  const admin = route.page === 'admin';

  return (
    <>
      <header className={`top${admin ? ' top-wide' : ''}`}>
        <div className="top-in">
          <a className="brand" href="#/apply"><span className="brand-mark" aria-hidden="true">✉</span> PostMitra</a>
          {!admin && (
            <div className="langs" role="group" aria-label="Language">
              {LANGS.map((l) => (
                <button key={l.code} className={lang === l.code ? 'on' : ''} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}>{l.label}</button>
              ))}
            </div>
          )}
        </div>
        {!admin && (
          <nav className="tabs top-in" aria-label="Main">
            <a href="#/apply" className={route.page === 'apply' ? 'on' : ''}>{t('nav.apply')}</a>
            <a href="#/track" className={route.page === 'track' ? 'on' : ''}>{t('nav.track')}</a>
            {user && <a href="#/account" className={route.page === 'account' ? 'on' : ''}>{t('nav.account')}</a>}
          </nav>
        )}
      </header>
      <main className={`wrap${admin ? ' wide-wrap' : ''}`}>
        {route.page === 'apply' && <RequireAuth><ApplyPage onTrack={(id) => go('track', id)} /></RequireAuth>}
        {route.page === 'track' && <RequireAuth><TrackPage initialId={route.id} onOpen={(id) => go('track', id)} /></RequireAuth>}
        {route.page === 'account' && <AccountPage />}
        {admin && <AdminPage />}
      </main>
      <footer className="foot">
        {admin ? <a href="#/apply">← PostMitra</a> : <a href="#/admin">{t('nav.staff')}</a>}
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><LangProvider><AuthProvider><Shell /></AuthProvider></LangProvider></StrictMode>,
);
