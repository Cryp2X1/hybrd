// Activity privacy UI: who can see it (Only me / Friends / Everyone), map privacy controls (hide start & end, zones,
// hide map) and a preview of what YOU see vs what OTHERS see. The "others" view is drawn from trimRoute() — the same
// function every share target uses.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { Segmented } from './ui';
import { worldPx, fitRoute } from '../lib/shareLayout';
import {
  clampTrim, privacySummary, trimRoute, TRIM_CHOICES_M, TRIM_CHOICES_MI, VISIBILITY,
  type MapPrivacy, type PrivacyZone, type Visibility,
} from '../lib/privacy';
import type { RoutePoint, Units } from '../lib/types';

export function Toggle({ on, onClick, title, sub, disabled, testid }: { on: boolean; onClick: () => void; title: React.ReactNode; sub?: React.ReactNode; disabled?: boolean; testid?: string }) {
  return (
    <button type="button" className={`toggle ${disabled ? 'is-locked' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={disabled ? undefined : onClick} aria-pressed={on} aria-disabled={disabled || undefined} data-testid={testid}>
      <span><b>{title}</b>{sub && <div className="muted small">{sub}</div>}</span><span className={`switch ${on ? 'on' : ''}`} />
    </button>
  );
}

export function VisibilityPicker({ value, onChange, minor, testid = 'vis' }: { value: Visibility; onChange: (v: Visibility) => void; minor: boolean; testid?: string }) {
  return (
    <div className="vis-pick" role="radiogroup" aria-label="Who can see this activity">
      {VISIBILITY.map((o) => {
        const off = minor && o.v === 'public';
        return (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} disabled={off} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)} data-testid={`${testid}-${o.v}`}>
            <Icon name={o.icon} size={20} />
            <span><b>{o.label}</b><span className="muted small">{off ? 'Not available for under-18 accounts.' : o.sub}</span></span>
            <span className="s-radio" />
          </button>
        );
      })}
    </div>
  );
}

export const trimLabel = (m: number, u: Units) => (u === 'imperial' ? `${(m / 1609.344).toFixed(1)} mi` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
export function TrimChips({ value, onChange, units, minor, testid = 'trim' }: { value: number; onChange: (m: number) => void; units: Units; minor: boolean; testid?: string }) {
  const choices = units === 'imperial' ? TRIM_CHOICES_MI.map((mi) => clampTrim(mi * 1609.344, minor)) : TRIM_CHOICES_M.map((m) => clampTrim(m, minor));
  const uniq = [...new Set(choices)];
  const near = uniq.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a), uniq[0]);
  return (
    <div className="chips trim-chips" role="radiogroup" aria-label="Distance hidden at each end">
      {uniq.map((m) => <button key={m} type="button" role="radio" aria-checked={near === m} className={`chip ${near === m ? 'on' : ''}`} onClick={() => onChange(m)} data-testid={`${testid}-${m}`}>{trimLabel(m, units)}</button>)}
    </div>
  );
}

export function MapPrivacyControls({ value, onChange, minor, units, zones }: { value: MapPrivacy; onChange: (m: MapPrivacy) => void; minor: boolean; units: Units; zones: number }) {
  return (
    <div className="map-priv" data-testid="map-privacy">
      <Toggle on={value.hideEnds} disabled={minor} onClick={() => onChange({ ...value, hideEnds: !value.hideEnds })} title="Hide start & end" testid="mp-ends"
        sub={minor ? 'Always on for under-18 accounts.' : 'Others don’t see where you started or finished. A secret random extra distance is added, so the cut point can’t be worked back.'} />
      {value.hideEnds && !value.hideMap && <div style={{ padding: '4px 0 10px' }}><div className="muted small" style={{ marginBottom: 8 }}>Hide at least this much at each end</div><TrimChips value={value.trimM} units={units} minor={minor} onChange={(trimM) => onChange({ ...value, trimM })} /></div>}
      <Toggle on={value.useZones} disabled={minor} onClick={() => onChange({ ...value, useZones: !value.useZones })} title="Use my privacy zones" testid="mp-zones"
        sub={<>{zones ? `${zones} saved zone${zones === 1 ? '' : 's'} (home, work…) are hidden.` : 'No zones yet.'} <Link className="link" to="/settings/privacy#zones">Manage zones</Link></>} />
      <Toggle on={value.hideMap} onClick={() => onChange({ ...value, hideMap: !value.hideMap })} title="Hide the entire map" testid="mp-hidemap" sub="Others see your stats only — no route anywhere." />
    </div>
  );
}

/** SVG sketch of a route: full route for the owner with hidden parts dashed, or only the visible part. */
export function RouteSketch({ segments, visible, zones = [], mode, height = 220 }: { segments: RoutePoint[][]; visible: RoutePoint[][]; zones?: PrivacyZone[]; mode: 'you' | 'others'; height?: number }) {
  const W = 600, H = 360;
  const fit = useMemo(() => fitRoute(segments, W, H, 26), [segments, H]);
  const pt = (p: { lat: number; lng: number }) => { const [x, y] = worldPx(p.lat, p.lng, 0); return [x * fit.scale + fit.ox, y * fit.scale + fit.oy]; };
  const d = (segs: { lat: number; lng: number }[][]) => segs.map((s) => s.map((p, i) => { const [x, y] = pt(p); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('')).join('');
  const first = segments.find((s) => s.length)?.[0], lastS = [...segments].reverse().find((s) => s.length), last = lastS?.[lastS.length - 1];
  const vFirst = visible.find((s) => s.length)?.[0], vLastS = [...visible].reverse().find((s) => s.length), vLast = vLastS?.[vLastS.length - 1];
  const mPerPx = fit.bounds ? 156543.03 * Math.cos(((fit.bounds.minLat + fit.bounds.maxLat) / 2) * Math.PI / 180) / fit.scale / 256 : 1;
  return (
    <svg className={`route-sketch ${mode}`} viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img" aria-label={mode === 'you' ? 'Your full route, hidden parts dashed' : 'What others see'} data-testid={`sketch-${mode}`}>
      <defs><pattern id="rs-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="var(--line)" /></pattern></defs>
      <rect width={W} height={H} fill="url(#rs-grid)" />
      {mode === 'you' && zones.map((z) => { const [x, y] = pt(z); return <circle key={z.id} cx={x} cy={y} r={Math.max(6, z.radiusM / mPerPx)} fill="rgba(239,68,68,.12)" stroke="rgba(239,68,68,.6)" strokeDasharray="6 5" />; })}
      {mode === 'you' && <path d={d(segments)} fill="none" stroke="#8a8a8a" strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" strokeLinejoin="round" />}
      {visible.length > 0 && <path d={d(visible)} fill="none" stroke="var(--yc)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(255,230,0,.5))' }} />}
      {mode === 'you' && first && (() => { const [x, y] = pt(first); return <g><circle cx={x} cy={y} r={9} fill="#0a0a0a" stroke="#22c55e" strokeWidth={4} /><text x={x + 14} y={y - 10} className="rs-l">Start</text></g>; })()}
      {mode === 'you' && last && (() => { const [x, y] = pt(last); return <g><circle cx={x} cy={y} r={9} fill="#0a0a0a" stroke="#ef4444" strokeWidth={4} /><text x={x + 14} y={y + 22} className="rs-l">End</text></g>; })()}
      {mode === 'others' && [vFirst, vLast].map((p, i) => { if (!p) return null; const [x, y] = pt(p); return <circle key={i} cx={x} cy={y} r={7} fill={i ? '#FFE600' : '#fff'} stroke="#0a0a0a" strokeWidth={3} />; })}
      {visible.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" className="rs-empty">{mode === 'others' ? 'Map hidden — others see stats only' : 'Nothing visible'}</text>}
    </svg>
  );
}

export function PrivacyPreview({ id, segments, mp, zones, seed, units, height = 200 }: { id: string; segments: RoutePoint[][]; mp: MapPrivacy; zones: PrivacyZone[]; seed: string; units: Units; height?: number }) {
  const [mode, setMode] = useState<'you' | 'others'>('others');
  const r = useMemo(() => trimRoute(segments, mp, zones, seed, id), [segments, mp, zones, seed, id]);
  return (
    <div className="priv-preview" data-testid="privacy-preview">
      <Segmented small value={mode} onChange={setMode} options={[{ v: 'others', label: 'What others see' }, { v: 'you', label: 'What you see' }]} />
      <RouteSketch segments={segments} visible={r.segments} zones={mp.useZones ? zones : []} mode={mode} height={height} />
      <p className="muted small priv-sum" data-testid="privacy-summary"><Icon name={mp.hideMap ? 'eyeoff' : 'shield'} size={14} /> {privacySummary(mp, mp.useZones ? zones.length : 0, units)}{!mp.hideMap && r.removed > 0 ? ` ${Math.round((r.removed / Math.max(1, r.total)) * 100)}% of GPS points removed from anything you share.` : ''}{mode === 'you' ? ' Dashed = hidden from others. You always keep your full route.' : ''}</p>
    </div>
  );
}
