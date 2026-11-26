// Public share page: /hybrd/a?id=<share id>. Works signed out for activities shared with Everyone; friends-only
// ones open for signed-in friends. Shows the privacy-trimmed route (as stored), key stats and splits.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { getSupabase } from '../lib/supabase';
import { fetchSharedActivity, sharedImageUrl, type SharedRow } from '../lib/activities';
import { isShareId, keyStats } from '../lib/share';
import { distUnit, fmtTime, toDist } from '../lib/calc';
import type { Units } from '../lib/types';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

const guessUnits = (): Units => (/^en-(US|LR)|my-MM/.test(navigator.language) ? 'imperial' : 'metric');

export default function SharedActivity() {
  const [sp] = useSearchParams();
  const id = sp.get('id') || '';
  const { configured, ready: authReady, user } = useAuth();
  const { profile } = useStore();
  const [row, setRow] = useState<SharedRow | null | undefined>(undefined);
  const [img, setImg] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const units: Units = profile.onboarded ? profile.units : guessUnits();
  useEffect(() => {
    if (!configured || !authReady) return;
    if (!isShareId(id)) { setRow(null); return; }
    let alive = true;
    (async () => {
      try {
        const sb = await getSupabase(); if (!sb) { setRow(null); return; }
        const r = await fetchSharedActivity(sb, id);
        if (!alive) return;
        setRow(r);
        if (r?.image_path) sharedImageUrl(sb, r.image_path).then((u) => alive && setImg(u)).catch(() => {});
      } catch (e) { if (alive) { setErr((e as Error).message); setRow(null); } }
    })();
    return () => { alive = false; };
  }, [configured, authReady, id, user?.id]);

  const head = (
    <header className="pub-head">
      <Link to="/" className="brand"><span className="brand-mark">H</span>HYBRD</Link>
      <span className="spacer" />
      {!user && configured && <Link className="btn sm" to="/sign-in">Sign in</Link>}
    </header>
  );
  if (!configured) return (
    <div className="pub-page" data-testid="pub-local">{head}
      <div className="card pub-empty"><Icon name="link" size={30} /><h2>Shared activity</h2>
        <p className="muted">Share links work once HYBRD accounts are switched on. This copy of HYBRD runs in local mode, so activities stay on the device they were recorded on.</p>
        <p className="muted small">If someone sent you this link, ask them to send the image instead (Share › Save image), or try again later.</p>
        <Link className="btn y" to="/">Open HYBRD</Link></div>
    </div>
  );
  if (row === undefined) return <div className="pub-page">{head}<div className="pub-empty muted" style={{ padding: 40 }}>Loading…</div></div>;
  if (!row) return (
    <div className="pub-page" data-testid="pub-missing">{head}
      <div className="card pub-empty"><Icon name="lock" size={30} /><h2>Not available</h2>
        <p className="muted">This activity is private, shared with friends only, or no longer shared.{!user ? ' If you’re their friend on HYBRD, sign in to see it.' : ''}</p>
        {err && <p className="muted small">{err}</p>}
        <Link className="btn y" to={user ? '/' : '/sign-in'}>{user ? 'Open HYBRD' : 'Sign in'}</Link></div>
    </div>
  );
  const a = row.data;
  const ks = keyStats(a, units);
  const when = new Date(a.date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const who = row.author ? row.author.display_name : 'A HYBRD athlete';
  return (
    <div className="pub-page" data-testid="pub-activity">{head}
      <div className="pub-card">
        <div className="pub-who"><span className="pub-av">{who.slice(0, 1).toUpperCase()}</span><div><b>{who}</b>{row.author?.username && <span className="muted small"> @{row.author.username}</span>}<div className="muted small">{a.label} · {when}</div></div></div>
        <h1 className="pub-title">{a.title}</h1>
        {a.description && <p className="pub-desc">{a.description}</p>}
        <div className="pub-stats">{ks.map((k) => <div key={k.label} className="stat"><div className="stat-v">{k.value}{k.unit && <small> {k.unit}</small>}</div><div className="stat-l">{k.label}</div></div>)}</div>
        {a.route && a.route.length > 0 ? <Suspense fallback={<div className="map" style={{ height: 320 }} />}><MapView routes={[{ id: row.id, segments: a.route.map((s) => s.map((p) => ({ ...p, t: 0 }))), highlight: true }]} height={320} /></Suspense>
          : a.mapHidden ? <div className="act-nomap"><Icon name="eyeoff" size={26} /><b>Map hidden</b><span className="muted small">The athlete keeps this route private.</span></div> : null}
        {a.privacyNote && a.route && <p className="muted small"><Icon name="shield" size={13} /> {a.privacyNote}</p>}
        {a.splits && a.splits.length > 1 && <div className="pub-splits"><h3>Splits</h3>{a.splits.slice(0, 50).map((s, i) => <div key={i} className="food-row"><span className="mono muted" style={{ width: 70 }}>{s.distanceM ? `${toDist(s.distanceM, units) < 0.95 ? toDist(s.distanceM, units).toFixed(2) : i + 1} ${distUnit(units)}` : i + 1}</span><span className="fr-main" /><span className="fr-k">{fmtTime(s.sec)}</span></div>)}</div>}
        {a.lifts && a.lifts.length > 0 && <div className="pub-splits"><h3>Exercises</h3>{a.lifts.map((l, i) => <div key={i} className="food-row"><span className="fr-main">{l.name}</span><span className="fr-k">{l.sets} sets</span></div>)}</div>}
        {img && <details className="pub-img"><summary>Share image</summary><img src={img} alt={`${a.title} share image`} /></details>}
        <div className="pub-foot"><span className="muted small">{row.visibility === 'public' ? 'Shared with everyone' : 'Shared with friends'} on HYBRD · Train · Track · Fuel</span><Link className="btn y sm" to="/">{user ? 'Open HYBRD' : 'Try HYBRD'}</Link></div>
      </div>
    </div>
  );
}
