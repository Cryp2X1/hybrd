import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { daySteps, stepGoalOf, todayKey, prettyDay } from '../lib/calc';
import { kcalPerStep, stepBurnKcal, stepBurnSteps } from '../lib/burn';
import type { StepDay } from '../lib/types';
import { Card, Segmented } from './ui';
import { ScoreRing } from './charts';
import { useToast } from '../lib/toast';

/** Daily steps: goal ring, what came from recordings vs. typed in, and quick manual entry. */
export function StepsCard({ date = todayKey(), compact = false }: { date?: string; compact?: boolean }) {
  const { data, profile, upsert, remove } = useStore();
  const toast = useToast();
  const goal = stepGoalOf(profile);
  const ds = daySteps(data, date);
  const [val, setVal] = useState('');
  const [mode, setMode] = useState<'add' | 'set'>(ds.mode === 'set' ? 'set' : 'add');
  const [open, setOpen] = useState(!compact);
  const pct = Math.min(100, Math.round((ds.total / goal) * 100));
  const kcal = stepBurnKcal(stepBurnSteps(data, date, profile).outside, profile);
  const recs = data.steps.filter((s) => s.date === date);
  const save = () => {
    const v = Math.round(parseFloat(val.replace(/[^\d.]/g, '')) || 0);
    if (v <= 0 || v > 150000) { toast('Enter a step count'); return; }
    let next: Pick<StepDay, 'steps' | 'mode'>;
    if (mode === 'set') next = { steps: v, mode: 'set' };
    else next = { steps: ds.manual + v, mode: ds.mode === 'set' ? 'set' : 'add' };
    for (const r of recs) if (r.id !== `steps-${date}`) remove('steps', r.id);
    upsert<StepDay>('steps', { id: `steps-${date}`, updatedAt: Date.now(), date, ...next });
    setVal(''); toast(mode === 'set' ? `Day total set to ${v.toLocaleString()} steps` : `Added ${v.toLocaleString()} steps`);
  };
  const clear = () => { for (const r of recs) remove('steps', r.id); toast('Typed steps cleared'); };
  return (
    <Card className="steps-card">
      <div className="card-head"><h3>Steps{date !== todayKey() ? ` · ${prettyDay(date)}` : ''}</h3><Link to="/me#goals">Goal {goal.toLocaleString()} →</Link></div>
      <div className="steps-top">
        <ScoreRing score={pct} size={compact ? 118 : 136} numSize={compact ? 26 : 30} display={ds.total.toLocaleString()} label="steps" sub={`${pct}% of goal`} />
        <div className="steps-break">
          <div><span className="muted small">From recordings</span><b className="mono">{ds.activity.toLocaleString()}</b></div>
          <div><span className="muted small">{ds.mode === 'set' ? 'Day total typed' : 'Typed in'}</span><b className="mono">{ds.manual ? ds.manual.toLocaleString() : '—'}</b></div>
          <div><span className="muted small">Burned from steps</span><b className="mono">≈{kcal} kcal</b></div>
          {ds.total >= goal ? <span className="pill yellow" style={{ alignSelf: 'flex-start' }}>Goal hit</span> : <span className="muted small">{(goal - ds.total).toLocaleString()} to go</span>}
        </div>
      </div>
      {!open ? <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>+ Enter steps</button> : <>
        <Segmented small value={mode} onChange={setMode} options={[{ v: 'add', label: 'Add to today' }, { v: 'set', label: 'Set day total' }]} />
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} inputMode="numeric" aria-label="Steps" placeholder={mode === 'set' ? 'Full-day total from your phone' : 'Steps to add'} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn y" onClick={save}>{mode === 'set' ? 'Set' : 'Add'}</button>
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>
          {mode === 'set'
            ? 'Use this for a full-day number from Apple Health (Browse › Activity › Steps) or Google Fit. Walks and runs you recorded here are already inside that number, so nothing is counted twice.'
            : 'Adds steps on top of what HYBRD recorded (e.g. a walk you didn’t record). Tip: to copy your phone’s whole-day count instead, pick “Set day total”.'}
          {recs.length > 0 && <> <button className="link" onClick={clear}>Clear typed steps</button></>}
        </p>
      </>}
      <p className="muted small" style={{ margin: '8px 0 0' }}>Calories from steps are an estimate (≈{kcalPerStep(profile).toFixed(3)} kcal per step from your weight and step length), only for steps outside recorded workouts. <Link className="link" to="/burn">Calories burned →</Link></p>
    </Card>
  );
}
