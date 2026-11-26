// Legal UI: Markdown renderer for src/legal/*.md, the clickwrap checkbox, the "updated Terms" re-accept gate,
// just-in-time consent gates (health & mood data, precise location) and the Data consents card in Settings › Privacy.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Card, Page } from './ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { getSupabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { parse, type Block, type Inline } from '../lib/markdown';
import { accept, canProceed, CONSENT_TEXT, hasConsent, LEGAL_CHANGES, LEGAL_VERSIONS, minAge, needsAccept, PLACEHOLDERS, setConsent, type AcceptSource, type ConsentKind, type LegalRecord } from '../lib/legal';

// ---------------------------------------------------------------- Markdown
function Inl({ c }: { c: Inline[] }) {
  return <>{c.map((x, i) => {
    if (x.t === 'text') return <span key={i}>{x.v}</span>;
    if (x.t === 'b') return <b key={i}><Inl c={x.c} /></b>;
    if (x.t === 'i') return <i key={i}><Inl c={x.c} /></i>;
    if (x.t === 'ph') return <mark key={i} className="lg-ph" title="Missing detail" data-testid="legal-placeholder">[{PLACEHOLDERS[x.key] || x.key}]</mark>;
    return x.href.startsWith('/') ? <Link key={i} className="link" to={x.href}><Inl c={x.c} /></Link> : <a key={i} className="link" href={x.href} target="_blank" rel="noopener noreferrer"><Inl c={x.c} /></a>;
  })}</>;
}
function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => {
    if (b.t === 'h') { const H = (b.level === 1 ? 'h2' : b.level === 2 ? 'h3' : 'h4') as 'h2'; return <H key={i} id={b.id} className={`lg-h${b.level}`}><Inl c={b.c} /></H>; }
    if (b.t === 'p') return <p key={i}><Inl c={b.c} /></p>;
    if (b.t === 'table') return <div key={i} className="lg-table-wrap"><table className="lg-table"><thead><tr>{b.head.map((c, k) => <th key={k}><Inl c={c} /></th>)}</tr></thead><tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}><Inl c={c} /></td>)}</tr>)}</tbody></table></div>;
    const L = b.t;
    return <L key={i}>{b.items.map((it, k) => <li key={k}><Inl c={it.c} />{it.blocks.length > 0 && <Blocks blocks={it.blocks} />}</li>)}</L>;
  })}</>;
}
export function Markdown({ md, skipTitle }: { md: string; skipTitle?: boolean }) {
  const blocks = useMemo(() => { const b = parse(md); return skipTitle && b[0]?.t === 'h' && b[0].level === 1 ? b.slice(1) : b; }, [md, skipTitle]);
  return <div className="lg-doc"><Blocks blocks={blocks} /></div>;
}

// ---------------------------------------------------------------- clickwrap
/** Unchecked by default; the parent keeps the Continue / Create account button disabled until it is checked. */
export function Clickwrap({ checked, onChange, testid = 'agree-terms' }: { checked: boolean; onChange: (v: boolean) => void; testid?: string }) {
  const age = minAge();
  return (
    <label className={`lg-agree ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      <span>I agree to the <Link className="link" to="/legal/terms">Terms of Service</Link> and <Link className="link" to="/legal/privacy">Privacy Policy</Link>, including the assumption of risk and arbitration, and confirm I’m <b>{age} or older</b>.</span>
    </label>
  );
}

// ---------------------------------------------------------------- recording acceptances
const LOGGED = 'hybrd:legal-logged';
/** Signed in: copy the acceptance to public.legal_acceptances once (proof of assent). Missing table = skip quietly. */
function useLogAcceptance(rec: LegalRecord | undefined) {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || !rec?.acceptedAt || !rec.terms) return;
    const key = `${user.id}:${rec.terms}:${rec.privacy}:${rec.acceptedAt}:${rec.health?.at || ''}:${rec.location?.at || ''}`;
    try { if (localStorage.getItem(LOGGED) === key) return; } catch { /* ignore */ }
    let alive = true;
    (async () => {
      const sb = await getSupabase(); if (!sb || !alive) return;
      const { error } = await sb.rpc('legal_record_acceptance', {
        p_terms: rec.terms, p_privacy: rec.privacy, p_source: rec.source || 'onboarding', p_min_age: rec.ageConfirmed ?? minAge(), p_accepted_at: rec.acceptedAt,
        p_consents: { health: rec.health ?? null, location: rec.location ?? null },
      });
      if (!error) { try { localStorage.setItem(LOGGED, key); } catch { /* ignore */ } }
    })();
    return () => { alive = false; };
  }, [user, rec?.acceptedAt, rec?.terms, rec?.privacy, rec?.health?.at, rec?.location?.at]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useLegal() {
  const { profile, setProfile } = useStore();
  const rec = profile.legal;
  return {
    rec,
    accept: (source: AcceptSource) => setProfile({ legal: accept(profile.legal, source) }),
    setConsent: (k: ConsentKind, granted: boolean) => setProfile({ legal: setConsent(profile.legal, k, granted) }),
    has: (k: ConsentKind) => hasConsent(rec, k),
  };
}

// ---------------------------------------------------------------- re-accept gate
const PREVIEW = 'hybrd:legal-preview';
const FREE = ['/legal', '/a', '/sign-in', '/sign-up', '/forgot', '/reset-password', '/safety/delete', '/safety/guidelines', '/safety/reporting', '/settings/data'];
/** Shown over the app when the Terms or Privacy Policy changed since the person accepted (or they never did). */
export function LegalGate() {
  const { profile } = useStore();
  const lg = useLegal();
  const loc = useLocation();
  const toast = useToast();
  const [agree, setAgree] = useState(false);
  useLogAcceptance(lg.rec);
  let preview = false; try { preview = sessionStorage.getItem(PREVIEW) === '1'; } catch { /* ignore */ }
  if (!profile.onboarded) return null;
  if (!preview && !needsAccept(lg.rec)) return null;
  if (FREE.some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'))) return null;
  const first = !lg.rec?.terms;
  const go = () => {
    if (!canProceed(agree)) return;
    lg.accept('reaccept');
    try { sessionStorage.removeItem(PREVIEW); } catch { /* ignore */ }
    toast('Thanks. Your acceptance is saved.');
  };
  return (
    <div className="sf-gate lg-gate" role="dialog" aria-modal="true" aria-label="Updated Terms" data-testid="legal-gate">
      <div className="sf-gate-card lg-gate-card">
        <div className="sf-gate-ic"><Icon name="flag" size={26} /></div>
        <h2>{first ? 'Please review our Terms' : 'We’ve updated our Terms'}</h2>
        <p>To keep using HYBRD, please read and accept the Terms of Service and Privacy Policy (version {LEGAL_VERSIONS.terms}).</p>
        <ul className="lg-changes">{LEGAL_CHANGES.map((c) => <li key={c}>{c}</li>)}</ul>
        <div className="lg-gate-links">
          <Link className="link" to="/legal/terms">Terms of Service</Link><Link className="link" to="/legal/privacy">Privacy Policy</Link><Link className="link" to="/legal/health-data">Health data policy</Link>
        </div>
        <Clickwrap checked={agree} onChange={setAgree} testid="reaccept-agree" />
        <button className="btn y block" disabled={!canProceed(agree)} onClick={go} data-testid="reaccept-accept">Accept and continue</button>
        <p className="muted small">Don’t agree? You can <Link className="link" to="/settings/data">export your data</Link> or <Link className="link" to="/safety/delete">delete your account</Link>.</p>
      </div>
    </div>
  );
}
export const previewLegalGate = () => { try { sessionStorage.setItem(PREVIEW, '1'); } catch { /* ignore */ } };

// ---------------------------------------------------------------- consents
export function ConsentCard({ kind, onDone, alt }: { kind: ConsentKind; onDone?: (granted: boolean) => void; alt?: ReactNode }) {
  const lg = useLegal();
  const [ok, setOk] = useState(false);
  const t = CONSENT_TEXT[kind];
  return (
    <Card className="lg-consent">
      <div className="lg-consent-h"><span className="sf-gate-ic"><Icon name={kind === 'health' ? 'mind' : 'locate'} size={24} /></span><div><div className="kicker">Your choice</div><h3>{t.title}</h3></div></div>
      <p className="muted small">{t.body} <Link className="link" to={t.doc}>{kind === 'health' ? 'Consumer Health Data Privacy Policy' : 'Privacy Policy'}</Link></p>
      <label className={`lg-agree ${ok ? 'on' : ''}`}><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} data-testid={`consent-${kind}-check`} /><span>{t.allow}.</span></label>
      <div className="lg-consent-acts">
        <button className="btn y" disabled={!ok} onClick={() => { lg.setConsent(kind, true); onDone?.(true); }} data-testid={`consent-${kind}-allow`}>Allow</button>
        <button className="btn ghost" onClick={() => { lg.setConsent(kind, false); onDone?.(false); }} data-testid={`consent-${kind}-decline`}>Not now</button>
      </div>
      {alt}
    </Card>
  );
}
/** Renders children only after the person opted in; otherwise a page with the consent card (or the `declined` note). */
/** `skip`: the screen doesn't need this data (e.g. an indoor bike session uses no GPS). */
export function ConsentGate({ kind, children, declined, title, skip }: { kind: ConsentKind; children: ReactNode; declined?: ReactNode; title: string; skip?: boolean }) {
  const lg = useLegal();
  const [ask, setAsk] = useState(false);
  if (skip || lg.has(kind)) return <>{children}</>;
  const said = lg.rec?.[kind];
  return (
    <Page title={title} kicker="Before you start">
      {said && !said.granted && !ask && declined
        ? <div data-testid={`consent-${kind}-declined`}>{declined}<button className="btn block" style={{ marginTop: 12 }} onClick={() => setAsk(true)} data-testid={`consent-${kind}-review`}>Review this choice</button></div>
        : <div className="lg-consent-page" data-testid={`consent-${kind}`}><ConsentCard kind={kind} onDone={() => setAsk(false)} /></div>}
    </Page>
  );
}

export function DataConsentsCard() {
  const lg = useLegal();
  const toast = useToast();
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const row = (k: ConsentKind) => {
    const r = lg.rec?.[k]; const on = !!r?.granted;
    return (
      <button key={k} className="toggle" style={{ width: '100%', textAlign: 'left' }} aria-pressed={on} data-testid={`consent-toggle-${k}`}
        onClick={() => { lg.setConsent(k, !on); toast(on ? 'Consent withdrawn. Nothing new is collected for this.' : 'Consent given.'); }}>
        <span><b>{CONSENT_TEXT[k].title}</b><div className="muted small">{on ? `Allowed ${fmt(r?.at)}` : r ? `Not allowed${r.at ? ` (since ${fmt(r.at)})` : ''}` : 'Not asked yet'}</div></span>
        <span className={`switch ${on ? 'on' : ''}`} />
      </button>
    );
  };
  return (
    <Card>
      <div className="card-head" id="consents"><h3>Data consents</h3></div>
      <p className="muted small">Separate from the Terms. Withdrawing stops new collection; delete items or your account to erase what was saved.</p>
      <div className="stack">{row('health')}{row('location')}</div>
      <p className="muted small" style={{ marginTop: 10 }}>
        {lg.rec?.acceptedAt ? <>You accepted the Terms and Privacy Policy version {lg.rec.terms} on {fmt(lg.rec.acceptedAt)}. </> : null}
        <Link className="link" to="/legal">Legal & privacy documents</Link>
      </p>
    </Card>
  );
}

/** Small row of links for footers (sidebar, Settings, onboarding). The health-data link must stay separate (MHMDA). */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`lg-links ${className}`} aria-label="Legal" data-testid="legal-links">
      <Link to="/legal/terms">Terms</Link><Link to="/legal/privacy">Privacy</Link><Link to="/legal/health-data">Consumer Health Data</Link><Link to="/legal">Legal</Link>
    </nav>
  );
}

export function useBackOrHome() { const nav = useNavigate(); return () => (window.history.length > 1 ? nav(-1) : nav('/')); }
