import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Sheet } from './ui';
import { useStore } from '../lib/store';
import { hrMaxOf, timeInZones, zoneOf, ZONES, fmtTime } from '../lib/calc';
import { useHr, connectHr, disconnectHr, reconnectHr, hrFresh, recentHr, type HrState } from '../lib/hr';

function useTick(ms = 1000, on = true) { const [, t] = useState(0); useEffect(() => { if (!on) return; const i = setInterval(() => t((n) => n + 1), ms); return () => clearInterval(i); }, [ms, on]); }

const statusText = (h: HrState) => h.status === 'connected' ? (hrFresh(h) ? (h.contact === false ? 'No skin contact' : 'Live') : 'Waiting for signal…')
  : h.status === 'reconnecting' ? `Reconnecting… (try ${h.reconnects})` : h.status === 'connecting' ? 'Connecting…' : h.status === 'requesting' ? 'Choose your sensor…' : h.status === 'lost' ? 'Connection lost' : h.status === 'error' ? 'Error' : 'Not connected';

/** Connect / status panel. */
export function HrPanel() {
  const h = useHr();
  const { profile } = useStore();
  useTick(1000, h.status !== 'idle');
  const max = hrMaxOf(profile);
  const fresh = hrFresh(h);
  const z = fresh && h.bpm ? zoneOf(h.bpm, max) : null;
  if (!h.support.ok) return (
    <div className="hr-panel" data-testid="hr-panel">
      <div className="hr-unsupported"><Icon name="info" size={18} /><div><b>Bluetooth heart rate isn’t available in this browser</b><div className="muted small">{h.support.reason}</div></div></div>
    </div>
  );
  return (
    <div className="hr-panel" data-testid="hr-panel">
      <div className="hr-row">
        <div className={`hr-bpm ${fresh ? '' : 'dim'}`} style={z ? { color: z.color } : undefined} data-testid="hr-bpm"><Icon name="heart" size={26} fill={fresh} />{fresh && h.bpm ? h.bpm : '—'}<small>bpm</small></div>
        <div className="hr-meta">
          <div><b>{h.device || 'Heart-rate sensor'}</b></div>
          <div className="muted small" data-testid="hr-status">{statusText(h)}{h.battery != null ? ` · battery ${h.battery}%` : ''}</div>
          {z && <div className="small" style={{ color: z.color }}>Zone {z.z} · {z.name} · {Math.round((h.bpm! / max) * 100)}% of max {max}</div>}
        </div>
      </div>
      {h.status !== 'idle' && <ZoneStrip bpm={fresh ? h.bpm : undefined} max={max} />}
      {h.error && <p className="small" style={{ color: '#ff8a8a', margin: '6px 0' }}>{h.error}</p>}
      <div className="row gap8 wrap" style={{ marginTop: 8 }}>
        {h.status === 'idle' || h.status === 'error'
          ? <button className="btn sm y" onClick={() => connectHr().catch(() => {})}><Icon name="heart" size={16} />Connect heart-rate sensor</button>
          : <>
            {(h.status === 'lost' || h.status === 'reconnecting') && <button className="btn sm y" onClick={() => reconnectHr()}><Icon name="refresh" size={16} />Reconnect</button>}
            <button className="btn sm" onClick={disconnectHr}>Disconnect</button>
          </>}
      </div>
      {h.status === 'idle' && <p className="muted small" style={{ margin: '8px 0 0' }}>Works with Bluetooth chest straps and arm bands (Polar, Garmin HRM-Dual, Wahoo TICKR, Coros…) and watches set to “broadcast heart rate”. Max HR {max} bpm{profile.hrMax ? ' (set in Me)' : ' (from age — set yours in Me)'}.</p>}
    </div>
  );
}

function ZoneStrip({ bpm, max }: { bpm?: number; max: number }) {
  const lo = 0.5 * max, hi = max;
  const pos = bpm ? Math.max(0, Math.min(1, (bpm - lo) / (hi - lo))) : null;
  return (
    <div className="zone-strip" aria-hidden="true">
      {ZONES.map((z) => <span key={z.z} style={{ background: z.color }}>Z{z.z}</span>)}
      {pos != null && <i style={{ left: `${pos * 100}%` }} />}
    </div>
  );
}

/** Compact live tile for an active session (Record / Timers / Logger). Hidden when no sensor is connected. */
export function HrLive() {
  const h = useHr();
  const { profile } = useStore();
  useTick(1000, h.status !== 'idle');
  if (h.status === 'idle' || !h.support.ok) return null;
  const max = hrMaxOf(profile);
  const fresh = hrFresh(h);
  const z = fresh && h.bpm ? zoneOf(h.bpm, max) : null;
  const pts = recentHr(180);
  return (
    <div className="hr-live" data-testid="hr-live" style={z ? { borderColor: z.color } : undefined}>
      <div className="hr-live-n" style={z ? { color: z.color } : undefined}><Icon name="heart" size={20} fill={fresh} />{fresh && h.bpm ? h.bpm : '—'}<small> bpm</small></div>
      <div className="hr-live-z">{z ? <><b style={{ color: z.color }}>Z{z.z}</b> {z.name}</> : <span className="muted">{statusText(h)}</span>}</div>
      {pts.length > 2 && <HrChart samples={pts.map(([t, b]) => [(t - pts[0][0]) / 1000, b])} max={max} height={46} bare />}
    </div>
  );
}

/** Small "♥ 142" button for page headers; opens the panel. */
export function HrButton() {
  const h = useHr();
  const [open, setOpen] = useState(false);
  useTick(1000, h.status !== 'idle');
  const fresh = hrFresh(h);
  return (
    <>
      <button className={`btn sm ${fresh ? 'hr-on' : ''}`} aria-label="Heart rate" data-testid="hr-btn" onClick={() => setOpen(true)}><Icon name="heart" size={18} fill={fresh} /><span className="btn-l">{fresh && h.bpm ? `${h.bpm}` : 'HR'}</span></button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Heart rate"><HrPanel /></Sheet>
    </>
  );
}

/** HR line chart over zone bands. samples = [sec, bpm]. */
export function HrChart({ samples, max, height = 140, bare }: { samples: [number, number][]; max: number; height?: number; bare?: boolean }) {
  if (samples.length < 2) return null;
  const W = 600, H = height;
  const t0 = samples[0][0], t1 = samples[samples.length - 1][0] || 1;
  const bs = samples.map((s) => s[1]);
  const lo = Math.max(40, Math.min(...bs, 0.5 * max) - 5), hi = Math.max(...bs, 0.9 * max) + 5;
  const y = (b: number) => H - ((b - lo) / (hi - lo)) * H;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const d = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s[0]).toFixed(1)},${y(s[1]).toFixed(1)}`).join('');
  return (
    <svg className="hr-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label="Heart-rate chart">
      {ZONES.map((z, i) => { const top = y(Math.min(hi, (ZONES[i + 1]?.lo ?? 1.2) * max)), bot = y(Math.max(lo, z.lo * max)); return bot > top ? <rect key={z.z} x={0} width={W} y={top} height={bot - top} fill={z.color} opacity={bare ? 0.08 : 0.1} /> : null; })}
      <path d={d} fill="none" stroke="#ff4d6d" strokeWidth={bare ? 2 : 2.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Avg/max + chart + time in zones, for a saved workout. */
export function HrSummary({ hr, durationSec }: { hr: NonNullable<import('../lib/types').Workout['hr']>; durationSec: number }) {
  const { profile } = useStore();
  const max = hrMaxOf(profile);
  const tz = hr.samples ? timeInZones(hr.samples, max) : null;
  const tot = tz ? tz.reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="hr-summary" data-testid="hr-summary">
      <div className="card-head"><h3>Heart rate</h3><span className="muted small">{hr.from === 'ble' ? 'Bluetooth sensor' : hr.from === 'strava' ? 'from Strava' : hr.from === 'file' ? 'from the file' : ''}</span></div>
      <div className="grid3" style={{ marginBottom: 10 }}>
        <div className="stat"><div className="stat-v">{hr.avg}</div><div className="stat-l">avg bpm</div></div>
        <div className="stat"><div className="stat-v">{hr.max}</div><div className="stat-l">max bpm</div></div>
        <div className="stat"><div className="stat-v">{Math.round((hr.avg / max) * 100)}%</div><div className="stat-l">avg of max {max}</div></div>
      </div>
      {hr.samples && hr.samples.length > 1 && <HrChart samples={hr.samples} max={max} />}
      {tz && tot > 0 && <div className="zone-bars">{ZONES.map((z, i) => (
        <div key={z.z} className="zone-bar"><span className="mono small" style={{ color: z.color, width: 26 }}>Z{z.z}</span><span className="small" style={{ width: 78 }}>{z.name}</span>
          <div className="pillar-track"><div className="pillar-fill" style={{ width: `${(tz[i] / tot) * 100}%`, background: z.color }} /></div>
          <span className="mono small" style={{ width: 54, textAlign: 'right' }}>{fmtTime(Math.round(tz[i]))}</span></div>))}</div>}
      <p className="muted small" style={{ margin: '8px 0 0' }}>Zones = % of max HR {max} bpm ({profile.hrMax ? 'set in Me' : '208 − 0.7 × age, Tanaka 2001 — set your real max in Me'}). Time without HR: {fmtTime(Math.max(0, durationSec - Math.round(tot)))}.</p>
    </div>
  );
}
