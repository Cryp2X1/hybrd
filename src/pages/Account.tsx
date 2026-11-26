import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { Page, Card, Banner } from '../components/ui';
import { LocalModeNote } from './Auth';
import { getBackendConfig, setDeviceBackend, appUrl } from '../lib/config';
import { useToast } from '../lib/toast';
import { AccountSafetyCards } from './Safety';

function Form({ title, children, onSubmit, cta }: { title: string; children: React.ReactNode; onSubmit: () => Promise<string>; cta: string }) {
  const [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e: FormEvent) => { e.preventDefault(); setErr(''); setOk(''); setBusy(true); try { setOk(await onSubmit()); } catch (x) { setErr((x as Error).message); } setBusy(false); };
  return <Card><h3 style={{ marginBottom: 12 }}>{title}</h3><form onSubmit={go}>{children}{err && <div className="form-err" role="alert">{err}</div>}{ok && <div className="form-ok" role="status">{ok}</div>}<button className="btn y" disabled={busy}>{busy ? 'Please wait…' : cta}</button></form></Card>;
}

export default function Account() {
  const a = useAuth();
  const st = useStore();
  const toast = useToast();
  const cfg = getBackendConfig();
  const [cur, setCur] = useState(''), [np, setNp] = useState(''), [np2, setNp2] = useState(''), [ne, setNe] = useState('');
  const [bu, setBu] = useState(cfg.origin === 'device' ? cfg.url : ''), [bk, setBk] = useState(cfg.origin === 'device' ? cfg.anonKey : '');

  if (!a.configured) return (
    <Page title="Account" kicker="Local mode" back="/settings">
      <LocalModeNote />
      <Card>
        <h3 style={{ marginBottom: 8 }}>What works right now</h3>
        <ul className="cues"><li>Everything: training, GPS, timers, food log, Hybrid Score.</li><li>Data lives in this browser on this device (IndexedDB).</li><li>Back up or move it with <Link className="link" to="/settings/data">Export / Import</Link>.</li></ul>
        <h3 style={{ margin: '14px 0 8px' }}>When the backend is connected</h3>
        <ul className="cues"><li>Sign up with email + password, log in and out.</li><li>Change your password and email, reset a forgotten password by email.</li><li>Your logs sync between phone and laptop, private to you.</li><li>Anything you logged in Local mode can be moved into your account.</li></ul>
      </Card>
      <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Owner: connect Supabase on this device (testing)</summary>
        <p className="muted small" style={{ marginTop: 10 }}>For everyone, put the keys in <span className="kbd">config.js</span> (see SETUP.md). This form only affects this browser.</p>
        <label className="field"><span>Project URL</span><input value={bu} onChange={(e) => setBu(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
        <label className="field"><span>Anon public key</span><input value={bk} onChange={(e) => setBk(e.target.value)} placeholder="eyJ…" /></label>
        <button className="btn y" onClick={() => { setDeviceBackend(bu, bk); location.reload(); }}>Save & reload</button>
      </details>
      <AccountSafetyCards />
    </Page>
  );

  if (!a.ready) return <Page title="Account" back="/settings"><p className="muted">Loading…</p></Page>;

  if (!a.user) return (
    <Page title="Account" kicker="Not signed in" back="/settings">
      <Banner>Sign in to sync your training and food log across devices. You can keep using HYBRD without an account — your data stays on this device.</Banner>
      <div className="row wrap"><Link className="btn y" to="/sign-in">Sign in</Link><Link className="btn" to="/sign-up">Create account</Link><Link className="btn ghost" to="/forgot">Forgot password</Link></div>
      {cfg.origin === 'device' && <p className="muted small" style={{ marginTop: 14 }}>Backend set on this device only. <button className="link" onClick={() => { setDeviceBackend('', ''); location.reload(); }}>Remove</button></p>}
      <AccountSafetyCards />
    </Page>
  );

  return (
    <Page title="Account" kicker={a.user.email || ''} back="/settings">
      <Card>
        <div className="row"><div style={{ flex: 1 }}><b>Sync</b><div className="muted small">{st.syncStatus === 'error' ? `Error: ${st.syncError}` : st.syncStatus === 'syncing' ? 'Syncing…' : st.syncStatus === 'offline' ? 'Offline — will sync when you’re back online' : 'Up to date'}</div></div><button className="btn sm" onClick={() => st.syncNow()}>Sync now</button></div>
      </Card>
      {st.hasLocalData && <Banner tone="yellow">You have workouts or meals from Local mode on this device. <button style={{ textDecoration: 'underline', fontWeight: 700 }} onClick={async () => { const n = await st.importLocalIntoAccount(); toast(`Moved ${n} records into your account`); }}>Move them into this account</button></Banner>}
      {a.user.new_email && <Banner tone="warn">Email change pending: confirm the link sent to {a.user.new_email}{' '}(and to your current address, if asked).</Banner>}
      <Form title="Change email" cta="Change email" onSubmit={async () => { await a.changeEmail(ne); setNe(''); return 'Check your inbox. Supabase sends a confirmation link (often to both the old and new address). The change applies after you click it.'; }}>
        <label className="field"><span>New email</span><input type="email" required value={ne} onChange={(e) => setNe(e.target.value)} autoComplete="email" /></label>
      </Form>
      <Form title="Change password" cta="Change password" onSubmit={async () => { if (np.length < 8) throw new Error('Use at least 8 characters.'); if (np !== np2) throw new Error('New passwords don’t match.'); await a.changePassword(cur, np); setCur(''); setNp(''); setNp2(''); return 'Password changed.'; }}>
        <label className="field"><span>Current password</span><input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label className="field"><span>New password</span><input type="password" required value={np} onChange={(e) => setNp(e.target.value)} autoComplete="new-password" /></label>
        <label className="field"><span>Confirm new password</span><input type="password" required value={np2} onChange={(e) => setNp2(e.target.value)} autoComplete="new-password" /></label>
      </Form>
      <div className="row wrap"><button className="btn" onClick={() => a.signOut()}>Sign out</button><Link className="btn ghost" to="/forgot">Send a reset email</Link></div>
      <p className="muted small" style={{ marginTop: 14 }}>App address used for email links: {appUrl()}</p>
      <AccountSafetyCards />
    </Page>
  );
}
