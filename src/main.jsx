import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { checked, client, rpc, useResource, useSync } from './api.js';
import { LotEditor } from './editor.jsx';
import { Dashboard, LotPage, Register } from './register.jsx';
import { Reports } from './reports.jsx';
import { Settings } from './settings.jsx';
import { Empty, ErrorNotice, Field } from './ui.jsx';
import './style.css';

const appBase = import.meta.env.BASE_URL;

function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const change = () => setHash(window.location.hash);
    window.addEventListener('hashchange',change);
    return () => window.removeEventListener('hashchange',change);
  }, []);
  const [page, parameter, extra] = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
  try { return [page || 'dashboard', parameter ? decodeURIComponent(parameter) : '', extra]; }
  catch { return ['missing','']; }
}

function AppMark() {
  return <img className="mark" src={`${appBase}icons/book-192.png`} width="44" height="44" alt="" />;
}

function Welcome({ title, children }) {
  return <div className="welcome"><section className="welcome-card"><AppMark /><p className="eyebrow">GARMENT PRODUCTION REGISTER</p>
    <h1>{title}</h1>{children}</section></div>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [recover, setRecover] = useState(false);
  const install = useInstall();
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      if (recover) {
        await checked(client.auth.resetPasswordForEmail(email.trim(),{ redirectTo:new URL(appBase,window.location.origin).href }));
        setMessage('If your account can receive a reset link, check your email.');
      } else await checked(client.auth.signInWithPassword({ email:email.trim(),password }));
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <Welcome title={recover ? 'Reset password' : 'Cutting Book'}>
    {!recover && <p>Sign in to your factory’s shared lot register.</p>}
    <form onSubmit={submit} className="login-form">
      <ErrorNotice error={error} />{message && <p className="notice" role="status">{message}</p>}
      <Field label="Email" type="email" autoComplete="username" required value={email} change={setEmail} />
      {!recover && <Field label="Password" type="password" autoComplete="current-password" required value={password} change={setPassword} />}
      <button className="button primary" disabled={busy}>{busy ? 'Please wait…' : recover ? 'Send reset link' : 'Sign in'}</button>
      <button className="button" type="button" disabled={busy} onClick={() => { setRecover(!recover); setError(null); setMessage(''); }}>
        {recover ? 'Back to sign in' : 'Forgot password?'}</button>
    </form>
    {!recover && !install.installed && <div className="login-form">
      <button className="button" type="button" onClick={install.install}>Install Cutting Book</button>
      {install.showHelp && <p role="status">On iPhone, open this link in Safari and choose Share, then Add to Home Screen. On Android or PC, open your browser menu and choose Install app or Add to Home screen.</p>}
    </div>}
  </Welcome>;
}

function PasswordSetup({ finish }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return <Welcome title="Set your password"><form className="login-form" onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try { await checked(client.auth.updateUser({ password })); finish(); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }}>
    <ErrorNotice error={error} />
    <Field label="New password" type="password" required minLength={12} autoComplete="new-password" value={password} change={setPassword} />
    <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
  </form></Welcome>;
}

function useInstall() {
  const [prompt, setPrompt] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    const ready = event => { event.preventDefault(); setPrompt(event); };
    const added = () => { setInstalled(true); setShowHelp(false); setPrompt(null); };
    window.addEventListener('beforeinstallprompt',ready);
    window.addEventListener('appinstalled',added);
    return () => {
      window.removeEventListener('beforeinstallprompt',ready);
      window.removeEventListener('appinstalled',added);
    };
  }, []);
  async function install() {
    if (!prompt) { setShowHelp(!showHelp); return; }
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setShowHelp(true); }
    finally { setPrompt(null); }
  }
  return { installed, showHelp, install };
}

function Workspace({ session, signOut }) {
  const [page, parameter, extra] = useRoute();
  const [signal, setSignal] = useState(0);
  const [message, setMessage] = useState('');
  const [signOutError, setSignOutError] = useState(null);
  const install = useInstall();
  const invalidate = useCallback(() => setSignal(value => value + 1), []);
  const status = useSync(session.user.id,invalidate);
  const loadMember = useCallback(() => checked(client.from('members').select('role,active,display_name').eq('user_id',session.user.id).maybeSingle()), [session.user.id]);
  const member = useResource(loadMember,session.user.id,signal);
  const loadBook = useCallback(() => rpc('register_settings'), []);
  const book = useResource(loadBook,'book',signal);
  const role = member.data?.active ? member.data.role : null;
  const canWrite = role === 'staff' || role === 'admin';
  const settings = book.data;
  const logout = async () => {
    try { await signOut(); }
    catch (failure) { setSignOutError(failure); }
  };
  const saved = text => { setMessage(text); invalidate(); };
  useEffect(() => {
    if (!message) return undefined;
    const timeout = setTimeout(() => setMessage(''),4500);
    return () => clearTimeout(timeout);
  }, [message]);
  useEffect(() => { window.scrollTo(0,0); }, [page,parameter]);

  if (!role || !settings) return <Welcome title="Cutting Book">
    <ErrorNotice error={member.error} retry={member.refresh} /><ErrorNotice error={book.error} retry={book.refresh} /><ErrorNotice error={signOutError} />
    {!member.error && !book.error && <p>{member.loading || book.loading ? 'Opening the shared register…' : 'This account needs an active register membership. Ask your administrator to grant access.'}</p>}
    <button className="button" onClick={logout}>Sign out</button>
  </Welcome>;

  const navigation = [['dashboard','Overview'],['lots','Lots'],['reports','Reports'],...(role === 'admin' ? [['settings','Settings']] : [])];
  let content;
  if (page === 'dashboard') content = <Dashboard {...{ signal,canWrite }} />;
  if (page === 'lots' && ['','open'].includes(parameter) && extra !== 'record') content = <Register key={parameter} {...{ signal,canWrite }} isAdmin={role === 'admin'} openOnly={parameter === 'open'} />;
  else if (page === 'lots' && parameter) content = <LotPage key={parameter} lotNo={parameter} {...{ signal,role,settings }} onSaved={saved} />;
  if (page === 'reports') content = <Reports key={parameter} {...{ signal,settings }} lot={parameter} />;
  if (page === 'settings' && role === 'admin') content = <Settings {...{ signal,settings }} userId={session.user.id} onSaved={saved} />;
  if (page === 'new' && canWrite) content = <>
    <div className="page-heading"><div><p className="eyebrow">CUTTING REGISTER</p><h1>Create lot</h1></div></div>
    <LotEditor editor={{ entity:'lot' }} settings={settings} close={() => { window.location.hash = '#/lots'; }} saved={(lot,text) => {
      window.location.hash = `#/lots/${encodeURIComponent(lot)}/record`; saved(text);
    }} />
  </>;

  return <div className="shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.querySelector('main').focus(); }}>Skip to content</a>
    <header className="topbar no-print">
      <div className="topbar-inner"><a className="brand" href="#/dashboard"><AppMark /><div><strong>Cutting Book</strong><span>{settings.business_name}</span></div></a>
        <div className="account"><span className={`connection ${status.toLowerCase()}`} role="status"><span />{status}</span>
          {!install.installed && <button className="top-button" type="button" onClick={install.install}>Install</button>}
          <button type="button" className="top-button" onClick={logout}>Sign out</button></div></div>
      <nav aria-label="Main navigation" className="nav">{navigation.map(([route,label]) =>
        <a key={route} href={`#/${route}`} aria-current={page === route ? 'page' : undefined}>{label}</a>)}</nav>
    </header>
    <main id="main-content" tabIndex="-1">
      {install.showHelp && <p className="notice no-print">On iPhone or iPad, open in Safari and choose Share, then Add to Home Screen. On other devices, look for Install app or Add to Home screen in the browser menu.</p>}
      {status === 'Offline' && <p className="notice error no-print">Reconnect to refresh records or save changes.</p>}
      <ErrorNotice error={signOutError} />
      {content || <Empty>This page is unavailable. <a href="#/dashboard">Return to the overview.</a></Empty>}
      {message && <div className="toast no-print" role="status">{message}</div>}
    </main>
    <footer className="footer no-print"><span>{member.data.display_name}</span><span>{role} · Asia/Kolkata</span></footer>
  </div>;
}

function App() {
  const [session, setSession] = useState(undefined);
  const [error, setError] = useState(null);
  const [passwordSetup, setPasswordSetup] = useState(() => ['invite','recovery'].includes(new URLSearchParams(window.location.hash.slice(1)).get('type')));
  useEffect(() => {
    if (!client) return undefined;
    const { data:{ subscription } } = client.auth.onAuthStateChange((event, value) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordSetup(true);
      setSession(value);
    });
    client.auth.getSession().then(({ error:failure }) => { if (failure) setError(failure); });
    return () => subscription.unsubscribe();
  }, []);
  if (!client) return <Welcome title="Connect Cutting Book"><p>Add your Supabase project URL and publishable key, apply the database migrations, then rebuild the app.</p></Welcome>;
  if (session === undefined) return <Welcome title="Cutting Book"><ErrorNotice error={error} /><p>Connecting to the register…</p></Welcome>;
  if (!session) return <Login />;
  if (passwordSetup) return <PasswordSetup finish={() => { setPasswordSetup(false); window.location.hash = '#/dashboard'; }} />;
  return <Workspace key={session.user.id} session={session} signOut={() => checked(client.auth.signOut({ scope:'local' }))} />;
}

createRoot(document.getElementById('root')).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${appBase}sw.js`).catch(error => console.warn('Install support unavailable',error)));
}
