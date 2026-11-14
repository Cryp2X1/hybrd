import { useEffect, useMemo, useState } from 'react';
import { attachHr } from '../lib/hr';
import { HrButton, HrLive } from '../components/HeartRate';
import { MusicButton } from '../components/Music';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { programById } from '../data/programs';
import { EXERCISES, exById, type Metric } from '../data/exercises';
import { useStore, uid } from '../lib/store';
import { estKcal, fmtTime, fromW, toW, wUnit, WORKOUT_TYPES, wu, toShort, fromShort } from '../lib/calc';
import type { ExerciseEntry, SetEntry, Template, Workout, WorkoutType } from '../lib/types';
import { Page, Card, Sheet, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { useTick } from '../lib/timer';
import { cue, unlockAudio } from '../lib/cues';
import { useToast } from '../lib/toast';

interface Draft { startedAt: number; title: string; type: WorkoutType; exercises: ExerciseEntry[]; rpe: number; notes: string; source?: string; manualMin?: number; restEndsAt?: number }
const KEY = 'hybrd:draft';
const metricOf = (id: string): Metric => exById(id)?.metric || 'reps';

export default function Logger() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, profile, upsert } = useStore();
  const u = wu(profile);
  const du = profile.units;
  const [picker, setPicker] = useState(false);
  const [pq, setPq] = useState('');

  const initial = useMemo<Draft>(() => {
    const saved = localStorage.getItem(KEY);
    const pid = sp.get('program'), sid = sp.get('session'), tid = sp.get('template'), exq = sp.get('ex');
    if (saved && !pid && !tid && !exq) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    const base: Draft = { startedAt: Date.now(), title: 'Workout', type: (sp.get('type') as WorkoutType) || 'strength', exercises: [], rpe: 7, notes: '' };
    if (pid && sid) {
      const p = programById(pid), s = p?.sessions.find((x) => x.id === sid);
      if (p && s) return { ...base, title: s.name, type: s.type, source: `program:${p.id}:${s.id}`, exercises: s.blocks.map((b) => ({ exId: b.exId, name: exById(b.exId)?.name || b.exId, note: b.note, sets: Array.from({ length: b.sets }, () => ({ reps: b.reps, timeSec: b.timeSec, distanceM: b.distanceM })) })) };
    }
    if (tid) { const t = data.templates.find((x) => x.id === tid); if (t) return { ...base, title: t.name, type: t.type, source: `template:${t.id}`, exercises: t.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: false })) })) }; }
    if (exq) { const e = exById(exq); if (e) return { ...base, title: e.name, type: e.cat === 'cardio' ? 'cardio' : e.cat === 'hyrox' ? 'hyrox' : e.cat === 'calisthenics' || e.cat === 'core' ? 'calisthenics' : 'strength', exercises: [{ exId: e.id, name: e.name, sets: [{}, {}, {}] }] }; }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [d, setD] = useState<Draft>(initial);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(d)); }, [d]);
  useTick(true, 500);
  const elapsed = (Date.now() - d.startedAt) / 1000;
  const restLeft = d.restEndsAt ? Math.max(0, Math.ceil((d.restEndsAt - Date.now()) / 1000)) : 0;
  const [restCued, setRestCued] = useState(0);
  useEffect(() => { if (d.restEndsAt && restLeft === 0 && restCued !== d.restEndsAt) { cue('go'); setRestCued(d.restEndsAt); } }, [restLeft, d.restEndsAt, restCued]);

  const setEx = (i: number, fn: (e: ExerciseEntry) => ExerciseEntry) => setD((x) => ({ ...x, exercises: x.exercises.map((e, k) => (k === i ? fn(e) : e)) }));
  const setSet = (i: number, j: number, patch: Partial<SetEntry>) => setEx(i, (e) => ({ ...e, sets: e.sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) }));
  const add = (id: string) => { const e = exById(id)!; setD((x) => ({ ...x, exercises: [...x.exercises, { exId: id, name: e.name, sets: [{}, {}, {}] }] })); setPicker(false); setPq(''); };
  const dur = d.manualMin ? d.manualMin * 60 : Math.round(elapsed);

  const save = () => {
    const exercises = d.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done || s.reps || s.timeSec || s.distanceM || s.weightKg) })).filter((e) => e.sets.length);
    const dist = exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + (['run-easy', 'run-tempo', 'run-intervals', 'walk', 'bike', 'indoor-bike', 'stationary-bike'].includes(e.exId) ? s.distanceM || 0 : 0), 0), 0);
    const w: Workout = { id: uid(), updatedAt: Date.now(), date: new Date(d.startedAt).toISOString(), type: d.type, title: d.title || 'Workout', durationSec: dur, rpe: d.rpe, exercises, notes: d.notes || undefined, source: d.source, distanceM: dist || undefined };
    attachHr(w, profile, d.startedAt);
    upsert<Workout>('workouts', w);
    localStorage.removeItem(KEY);
    cue('done'); toast('Workout saved');
    nav(`/train/workout/${w.id}`, { replace: true });
  };
  const saveTemplate = () => {
    const name = prompt('Template name', d.title); if (!name) return;
    const t: Template = { id: uid(), updatedAt: Date.now(), name, type: d.type, exercises: d.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg, timeSec: s.timeSec, distanceM: s.distanceM })) })) };
    upsert<Template>('templates', t); toast('Saved to My workouts');
  };
  const discard = () => { if (confirm('Discard this workout?')) { localStorage.removeItem(KEY); nav('/train'); } };
  const list = EXERCISES.filter((e) => !pq || e.name.toLowerCase().includes(pq.toLowerCase()) || e.muscles.toLowerCase().includes(pq.toLowerCase()));

  return (
    <Page title={d.title || 'Workout'} kicker={`Live · ${fmtTime(elapsed)}`} back="/train" actions={<><HrButton /><MusicButton /><button className="btn sm y" onClick={save}><Icon name="check" size={18} />Finish</button></>}>
      <HrLive />
      {restLeft > 0 && <Banner tone="yellow"><b>Rest {fmtTime(restLeft)}</b> — next set when it hits zero. <button className="link" style={{ color: '#0a0a0a', textDecoration: 'underline' }} onClick={() => setD((x) => ({ ...x, restEndsAt: undefined }))}>Skip</button></Banner>}
      <Card>
        <label className="field"><span>Title</span><input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <div className="field"><span>Type</span><div className="chips">{WORKOUT_TYPES.filter((t) => t.v !== 'rest').map((t) => <button key={t.v} className={`chip ${d.type === t.v ? 'on' : ''}`} onClick={() => setD({ ...d, type: t.v })}>{t.label}</button>)}</div></div>
      </Card>

      {d.exercises.map((e, i) => {
        const m = metricOf(e.exId);
        const cols: [string, string][] = m === 'weight' ? [['reps', 'Reps'], ['weightKg', wUnit(u)]] : m === 'time' ? [['timeSec', 'Seconds'], ['weightKg', `+${wUnit(u)}`]] : m === 'distance' ? [['distanceM', du === 'imperial' ? 'Yards' : 'Metres'], ['timeSec', 'Seconds']] : [['reps', 'Reps'], ['weightKg', `+${wUnit(u)}`]];
        return (
          <Card key={i}>
            <div className="card-head"><div><h3>{e.name}</h3>{e.note && <div className="muted small">{e.note}</div>}</div>
              <button className="icon-btn" aria-label="Remove exercise" onClick={() => setD((x) => ({ ...x, exercises: x.exercises.filter((_, k) => k !== i) }))}><Icon name="trash" size={18} /></button></div>
            <div className="set-head"><span>Set</span><span>{cols[0][1]}</span><span>{cols[1][1]}</span><span>✓</span></div>
            {e.sets.map((s, j) => (
              <div className="set-row" key={j}>
                <span className="n">{j + 1}</span>
                {cols.map(([k]) => {
                  const raw = s[k as keyof SetEntry] as number | undefined;
                  const shown = k === 'weightKg' ? (raw ? +toW(raw, u).toFixed(1) : '') : k === 'distanceM' ? (raw ? Math.round(toShort(raw, du)) : '') : raw ?? '';
                  return <input key={k} inputMode="decimal" aria-label={`${k} set ${j + 1}`} value={shown} placeholder="–" onChange={(ev) => { const v = parseFloat(ev.target.value); setSet(i, j, { [k]: Number.isFinite(v) ? (k === 'weightKg' ? fromW(v, u) : k === 'distanceM' ? fromShort(v, du) : v) : undefined }); }} />;
                })}
                <button className={`done-btn ${s.done ? 'on' : ''}`} aria-label={`Mark set ${j + 1} done`} onClick={() => { unlockAudio(); setSet(i, j, { done: !s.done }); if (!s.done) setD((x) => ({ ...x, restEndsAt: Date.now() + 90000 })); }}><Icon name="check" size={18} /></button>
              </div>
            ))}
            <div className="row"><button className="btn sm" onClick={() => setEx(i, (x) => ({ ...x, sets: [...x.sets, { ...(x.sets[x.sets.length - 1] || {}), done: false }] }))}><Icon name="plus" size={16} />Add set</button>
              {e.sets.length > 1 && <button className="btn sm ghost" onClick={() => setEx(i, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}>Remove last</button>}</div>
          </Card>
        );
      })}
      <button className="btn block" style={{ marginBottom: 14 }} onClick={() => setPicker(true)}><Icon name="plus" />Add exercise</button>

      <Card>
        <div className="field"><span>Effort (RPE 1–10)</span><div className="rpe">{Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <button key={n} className={d.rpe === n ? 'on' : ''} onClick={() => setD({ ...d, rpe: n })}>{n}</button>)}</div>
          <div className="muted small" style={{ marginTop: 6 }}>1–3 easy · 4–6 moderate · 7–8 hard · 9–10 max. Feeds the Hybrid Score.</div></div>
        <label className="field"><span>Duration override (minutes, optional)</span><input inputMode="numeric" placeholder={`${Math.round(elapsed / 60)} (live timer)`} value={d.manualMin || ''} onChange={(e) => setD({ ...d, manualMin: +e.target.value || undefined })} /></label>
        <label className="field"><span>Notes</span><textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="How did it feel?" /></label>
        <div className="muted small">Estimated burn: ~{estKcal({ type: d.type, durationSec: dur, rpe: d.rpe }, profile.weightKg)} kcal (MET-based estimate).</div>
      </Card>
      <div className="row wrap" style={{ marginBottom: 20 }}>
        <button className="btn y" onClick={save}>Finish & save</button>
        <button className="btn" onClick={saveTemplate}>Save as template</button>
        <button className="btn danger" onClick={discard}>Discard</button>
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Add exercise">
        <div className="search field"><Icon name="search" size={18} /><input autoFocus placeholder="Search" value={pq} onChange={(e) => setPq(e.target.value)} /></div>
        {list.map((e) => <button key={e.id} className="food-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => add(e.id)}><div className="fr-main"><div className="fr-name">{e.name}</div><div className="fr-sub">{e.cat} · {e.muscles}</div></div><Icon name="plus" size={18} className="y" /></button>)}
      </Sheet>
    </Page>
  );
}
