import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page, Card } from '../components/ui';
import { Icon } from '../components/Icon';
import { useStore, uid } from '../lib/store';
import { useToast } from '../lib/toast';
import { applyKcal, fmtDist, fmtTime, typeLabel, splitsFromTrack, splitUnitM, toElev, elevUnit, hrMaxOf, WORKOUT_TYPES } from '../lib/calc';
import { ACCEPT, parseFile, type ParsedActivity } from '../lib/import';
import { HrChart } from '../components/HeartRate';
import type { GpsRoute, Workout, WorkoutType } from '../lib/types';
const MapView = lazy(() => import('../components/MapView').then((m) => ({ default: m.MapView })));

interface Item { key: string; a?: ParsedActivity; error?: string; fileName: string; dupOf?: Workout; dupInBatch?: boolean; pick: boolean; type?: WorkoutType }
const BASE = import.meta.env.BASE_URL;
const SAMPLES = [
  { f: 'hybrd-sample-run.gpx', label: 'GPX · 5 km run' },
  { f: 'hybrd-sample-intervals.tcx', label: 'TCX · intervals + laps' },
  { f: 'hybrd-sample-ride.fit', label: 'FIT · 20 km ride' },
];

/** Same activity = same file hash / external id, or a start within 3 min with a similar duration. */
export function findDuplicate(a: Pick<ParsedActivity, 'hash' | 'start' | 'durationSec'>, ws: Workout[]) {
  return ws.find((w) => w.extId === `file:${a.hash}` || (Math.abs(Date.parse(w.date) - a.start) < 3 * 60_000 && Math.abs(w.durationSec - a.durationSec) <= Math.max(120, a.durationSec * 0.15)));
}

export default function Import() {
  const { data, profile, upsert } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const u = profile.units;
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const add = useCallback(async (files: File[]) => {
    setBusy((b) => b + files.length);
    for (const f of files) {
      try {
        const acts = await parseFile(f);
        setItems((cur) => {
          const next = [...cur];
          for (const a of acts) {
            if (next.some((x) => x.a?.hash === a.hash)) continue; // same file dropped twice
            const dupOf = findDuplicate(a, data.workouts);
            const dupInBatch = next.some((x) => x.a && x.pick && Math.abs(x.a.start - a.start) < 3 * 60_000);
            next.push({ key: a.hash, a, fileName: f.name, dupOf, dupInBatch, pick: !dupOf && !dupInBatch });
          }
          return next;
        });
        setOpen((o) => o ?? acts[0]?.hash ?? null);
      } catch (e) {
        setItems((cur) => [...cur, { key: `${f.name}:${Date.now()}`, fileName: f.name, error: (e as Error).message, pick: false }]);
      } finally { setBusy((b) => b - 1); }
    }
  }, [data.workouts]);

  // drag & drop anywhere on the page
  useEffect(() => {
    const dragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setOver(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setOver(false); };
    const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) add(fs); };
    window.addEventListener('dragover', dragOver); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', dragOver); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [add]);

  const loadSample = async (f: string) => {
    const r = await fetch(`${BASE}samples/${f}`); const b = await r.blob();
    add([new File([b], f)]);
  };
  const picked = items.filter((i) => i.pick && i.a);
  const save = () => {
    let n = 0;
    for (const it of picked) {
      const a = it.a!, type = it.type || a.type, id = uid();
      const route: GpsRoute | undefined = a.segments.length ? { id: uid(), workoutId: id, segments: a.segments, updatedAt: Date.now() } : undefined;
      const w: Workout = {
        id, updatedAt: Date.now(), date: new Date(a.start).toISOString(), type, title: a.name || `${typeLabel(type)}`,
        durationSec: a.durationSec, distanceM: a.distanceM ? Math.round(a.distanceM) : undefined, elevGainM: a.elevGainM,
        splits: route ? splitsFromTrack(route.segments, splitUnitM(u)) : undefined, routeId: route?.id, source: 'file', extId: `file:${a.hash}`,
        device: a.device, hr: a.hr ? { ...a.hr, from: 'file' } : undefined, cadence: a.cadence, laps: a.laps,
        avgWatts: a.avgWatts, maxWatts: a.maxWatts, bikeKind: type === 'indoor-cycle' ? 'indoor' : undefined,
        notes: `Imported from ${a.fileName} (${a.format})`,
        ...(a.cadence && ['run', 'walk'].includes(type) ? { steps: Math.round(a.cadence * (a.durationSec / 60)), stepsSource: 'sensor' as const } : {}),
      };
      applyKcal(w, profile, a.kcal);
      if (route) upsert<GpsRoute>('routes', route);
      upsert<Workout>('workouts', w); n++;
    }
    toast(`Saved ${n} activit${n === 1 ? 'y' : 'ies'}`);
    setItems([]); nav('/train?tab=history');
  };
  const max = hrMaxOf(profile);

  return (
    <Page title="Import files" kicker="GPX · TCX · FIT — from any watch" back="/settings/devices">
      <label className={`drop-zone ${over ? 'over' : ''}`} data-testid="drop-zone">
        <Icon name="upload" size={30} />
        <h3 style={{ margin: '8px 0 4px' }}>{busy ? `Reading ${busy} file${busy > 1 ? 's' : ''}…` : 'Drop files here or tap to choose'}</h3>
        <div className="muted small">.fit, .tcx, .gpx — several at once. Files are read on this device; nothing is uploaded.</div>
        <input type="file" multiple accept={ACCEPT} data-testid="file-input" onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) add(fs); }} />
      </label>
      <div className="row gap8 wrap" style={{ margin: '10px 0 14px' }}><span className="muted small">Try a sample:</span>{SAMPLES.map((s) => <button key={s.f} className="chip" onClick={() => loadSample(s.f)}>{s.label}</button>)}</div>

      {items.map((it) => it.error ? (
        <div key={it.key} className="imp-card off" data-testid="imp-error"><b>{it.fileName}</b><div className="small imp-err">{it.error}</div></div>
      ) : <Preview key={it.key} it={it} u={u} max={max} open={open === it.key} onOpen={() => setOpen(open === it.key ? null : it.key)}
        onChange={(p) => setItems((cur) => cur.map((x) => (x.key === it.key ? { ...x, ...p } : x)))} />)}

      {items.length > 0 && <div className="save-bar">
        <span className="small"><b>{picked.length}</b> of {items.filter((i) => i.a).length} selected</span>
        <div className="row gap8"><button className="btn sm ghost" onClick={() => setItems([])}>Clear</button><button className="btn sm y" disabled={!picked.length} onClick={save} data-testid="import-save"><Icon name="check" size={16} />Save {picked.length || ''}</button></div>
      </div>}

      <Card>
        <h3 style={{ marginBottom: 8 }}>Where to get the files</h3>
        <ul className="cues small">
          <li><b>Garmin Connect</b> (web): activity › ⚙ › Export Original (.fit) or Export to TCX/GPX.</li>
          <li><b>Coros</b> app: activity › ⋯ › Export (.fit / .tcx / .gpx). <b>Suunto</b> app: activity › ⋯ › Export (.fit / .gpx).</li>
          <li><b>Polar Flow</b> (web): training session › Export (.tcx / .gpx). <b>Wahoo</b> ELEMNT app: history › share › .fit.</li>
          <li><b>Strava</b> (web): activity › ⋯ › Export Original / Export GPX — files you export yourself are yours to keep.</li>
          <li><b>Apple Watch / Health:</b> Apple doesn’t export workouts as files directly. Use an app such as HealthFit or RunGap to export .fit/.gpx, or Health › profile › Export All Health Data (the zip’s <i>workout-routes</i> folder has .gpx routes, without heart rate).</li>
        </ul>
        <p className="muted small" style={{ margin: 0 }}>Duplicates are detected by the file itself and by start time (±3 min with a similar duration), including workouts you recorded in HYBRD or synced from Strava.</p>
      </Card>
      <Link className="link" to="/settings/help#devices">Help: devices & imports →</Link>
    </Page>
  );
}

function Preview({ it, u, max, open, onOpen, onChange }: { it: Item; u: 'metric' | 'imperial'; max: number; open: boolean; onOpen: () => void; onChange: (p: Partial<Item>) => void }) {
  const a = it.a!;
  const type = it.type || a.type;
  const routes = useMemo(() => [{ id: a.hash, segments: a.segments, highlight: true }], [a]);
  return (
    <div className={`imp-card ${it.pick ? '' : 'off'}`} data-testid="imp-card">
      <div className="imp-head">
        <input type="checkbox" checked={it.pick} onChange={(e) => onChange({ pick: e.target.checked })} aria-label={`Import ${a.name || a.fileName}`} />
        <div className="imp-title">
          <b>{a.name || typeLabel(type)}</b>
          <span className="muted small">{new Date(a.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {a.format}{a.device ? ` · ${a.device}` : ''}</span>
        </div>
        <select className="input" style={{ width: 120, height: 38 }} value={type} onChange={(e) => onChange({ type: e.target.value as WorkoutType })} aria-label="Workout type">
          {WORKOUT_TYPES.filter((t) => t.v !== 'rest').map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
      </div>
      {it.dupOf && <div className="imp-warn" data-testid="imp-dup">Looks like a duplicate of “{it.dupOf.title}” ({new Date(it.dupOf.date).toLocaleDateString()}) — unticked. Tick to import anyway.</div>}
      {it.dupInBatch && !it.dupOf && <div className="imp-warn">Same start time as another file in this batch — unticked.</div>}
      {a.warnings.map((w) => <div key={w} className="imp-warn">{w}</div>)}
      <div className="imp-stats">
        <div><b>{fmtTime(a.durationSec)}</b><span>{a.elapsedSec - a.durationSec > 30 ? `moving · ${fmtTime(a.elapsedSec)} total` : 'time'}</span></div>
        <div><b>{a.distanceM ? fmtDist(a.distanceM, u) : '—'}</b><span>distance</span></div>
        <div><b>{a.elevGainM != null ? `${Math.round(toElev(a.elevGainM, u))} ${elevUnit(u)}` : '—'}</b><span>elev. gain</span></div>
        <div><b>{a.hr ? `${a.hr.avg} / ${a.hr.max}` : '—'}</b><span>avg / max bpm</span></div>
        <div><b>{a.cadence ?? '—'}</b><span>{type === 'cycle' || type === 'indoor-cycle' ? 'cadence rpm' : 'cadence spm'}</span></div>
        <div><b>{a.kcal ?? '—'}</b><span>{a.kcal ? 'kcal (device)' : 'kcal'}</span></div>
        {(a.avgWatts || type === 'indoor-cycle') && <div><b>{a.avgWatts ?? '—'}</b><span>{a.maxWatts ? `avg W · max ${a.maxWatts}` : 'avg watts'}</span></div>}
      </div>
      <button className="link small" onClick={onOpen}>{open ? 'Hide details' : `Details: ${a.segments.length ? 'route, ' : ''}${a.hr?.samples.length ? 'heart rate, ' : ''}${a.laps?.length ? `${a.laps.length} laps` : 'more'}`}</button>
      {open && <div style={{ marginTop: 10 }}>
        {a.segments.length > 0 && <Suspense fallback={<div className="map" style={{ height: 200 }} />}><MapView routes={routes} height={200} locateOnOpen={false} /></Suspense>}
        {a.hr && a.hr.samples.length > 1 && <div style={{ marginTop: 10 }}><HrChart samples={a.hr.samples} max={max} height={110} /></div>}
        {a.laps && <table className="laps-table"><thead><tr><th>Lap</th><th>Time</th><th>Dist</th><th>Avg HR</th></tr></thead>
          <tbody>{a.laps.map((l, i) => <tr key={i}><td>{i + 1}</td><td>{fmtTime(l.sec)}</td><td>{l.distanceM ? fmtDist(l.distanceM, u) : '—'}</td><td>{l.avgHr ?? '—'}</td></tr>)}</tbody></table>}
        <div className="muted small" style={{ marginTop: 6 }}>{a.fileName}</div>
      </div>}
    </div>
  );
}
