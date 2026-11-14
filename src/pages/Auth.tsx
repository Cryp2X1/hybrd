import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Page, Card, Banner } from '../components/ui';

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'reset';
const TITLES: Record<Mode, string> = { 'sign-in': 'Sign in', 'sign-up': 'Create account', forgot: 'Reset password', reset: 'Choose a new password' };

export function LocalModeNote() {
  return (
    <Banner tone="warn"><b>Local mode.</b> This copy of HYBRD isn’t connected to an account server yet, so sign-in is off. Everything you log is saved on this device and works offline. Accounts (sign up, log in, change email or password, sync between phone and laptop) switch on as soon as the owner connects the free Supabase backend — see SETUP.md. Until then, use Me › Your data › Export to back up or move your data.</Banner>
  );
}

export default function Auth({ mode }: { mode: Mode }) {
  const a = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setOk('');
    if ((mode === 'sign-up' || mode === 'reset') && pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    if ((mode === 'sign-up' || mode === 'reset') && pw !== pw2) { setErr('Passwords don’t match.'); return; }
    setBusy(true);
    try {
      if (mode === 'sign-in') { await a.signIn(email, pw); nav('/me/account'); }
      if (mode === 'sign-up') { const r = await a.signUp(email, pw); if (r === 'signed-in') nav('/me/account'); else setOk(`Check ${email} for a confirmation link, then come back and sign in.`); }
      if (mode === 'forgot') { await a.sendReset(email); setOk(`If an account exists for ${email}, a reset link is on its way. Open it on this device and in this browser.`); }
      if (mode === 'reset') { await a.setNewPassword(pw); setOk('Password updated. You’re signed in.'); setTimeout(() => nav('/me/account'), 1200); }
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  };

  return (
    <Page title={TITLES[mode]} kicker="Account" back="/me">
      {!a.configured && <LocalModeNote />}
      {mode === 'reset' && a.configured && !a.session && <Banner tone="warn">This page needs the link from your reset email. If the link opened in a different browser than the one you asked from, request a new one from here.</Banner>}
      <Card>
        <form onSubmit={submit}>
          {mode !== 'reset' && <label className="field"><span>Email</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!a.configured} /></label>}
          {mode !== 'forgot' && <label className="field"><span>{mode === 'reset' ? 'New password' : 'Password'}</span><input type="password" required autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} disabled={!a.configured} /></label>}
          {(mode === 'sign-up' || mode === 'reset') && <label className="field"><span>Confirm password</span><input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={!a.configured} /></label>}
          {err && <div className="form-err" role="alert">{err}</div>}
          {ok && <div className="form-ok" role="status">{ok}</div>}
          <button className="btn y block" disabled={busy || !a.configured}>{busy ? 'Please wait…' : TITLES[mode]}</button>
        </form>
        <div className="row wrap" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          {mode === 'sign-in' && <><Link className="link" to="/sign-up">Create an account</Link><Link className="link" to="/forgot">Forgot password?</Link></>}
          {mode === 'sign-up' && <Link className="link" to="/sign-in">I already have an account</Link>}
          {mode === 'forgot' && <Link className="link" to="/sign-in">Back to sign in</Link>}
        </div>
      </Card>
      <p className="muted small">Passwords are handled by Supabase Auth (hashed with bcrypt on the server) — HYBRD never stores them. Your logs are private to your account: database row-level security means only you can read them.</p>
    </Page>
  );
}
