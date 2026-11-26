import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { addDays, fmtTime, prettyDay, todayKey } from '../lib/calc';
import { BURN_ACTIVITIES, burnActivity, burnGoalOf, burnStreak, dayBurn, kcalPerStep, metBurnKcal, rangeBurn, DEFAULT_BURN_GOAL, type DayBurn, type BurnSession } from '../lib/burn';
import { sourceById } from '../data/sources';
import { Page, Card, Segmented, Sheet } from '../components/ui';
import { ScoreRing } from '../components/charts';
import { BURN_COLORS } from '../components/BurnRing';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';
import type { BurnEntry } from '../lib/types';

type View = 'day' | 'week' | 'month';
type Mode = 'active' | 'total';
const PARTS = [
  { k: 'resting', label: 'Resting (BMR)', color: BURN_COLORS.resting },
  { k: 'workouts', label: 'Workouts', color: BURN_COLORS.workouts },
  { k: 'steps', label: 'Steps · daily movement', color: BURN_COLORS.steps },
  { k: 'manual', label: 'Added by you', color: BURN_COLORS.manual },
] as const;
const n0 = (v: number) => Math.round(v).toLocaleString();
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n0(Math.abs(v))}`;

/** Stacked daily bars (resting / workouts / steps / added) with an optional goal line. */
function StackedBars({ days, mode, goal, height = 170, onPick }: { days: DayBurn[]; mode: Mode; goal?: number; height?: number; onPick?: (d: string) => void }) {
  const parts = PARTS.filter((p) => mode === 'total' || p.k !== 'resting');
  const val = (d: DayBurn) => (mode === 'total' ? d.total : d.active);
  const max = Math.max(1, ...(goal && mode === 'active' ? [goal * 1.15] : []), ...days.map(val));
  const w = 100 / Math.max(1, days.length), base = height - 18, span = height - 30;
  const today = todayKey(), many = days.length > 14;
  return (
    <div className="chart burn-chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label={`${mode} calories burned per day`}>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={base - g * span} y2={base - g * span} stroke="var(--line)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />)}
        {days.map((d, i) => {
          let y = base;
          return <g key={d.date} onClick={() => onPick?.(d.date)} style={{ cursor: onPick ? 'pointer' : undefined }}>
            <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
            {parts.map((p) => {
              const v = d[p.k]; if (v <= 0) return null;
              const h = (v / max) * span; y -= h;
              return <rect key={p.k} x={i * w + w * 0.16} width={w * 0.68} y={y} height={Math.max(h, 0.8)} fill={p.color} opacity={d.date === today || !many ? 1 : 0.9} />;
            })}
            {val(d) === 0 && <rect x={i * w + w * 0.16} width={w * 0.68} y={base - 0.6} height={0.6} fill="var(--line2)" />}
          </g>;
        })}
        {goal && mode === 'active' ? <line x1="0" x2="100" y1={base - (goal / max) * span} y2={base - (goal / max) * span} stroke="var(--yc)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="chart-labels">{days.map((d, i) => {
        const dt = new Date(d.date + 'T12:00');
        const lab = !many ? dt.toLocaleDateString(undefined, { weekday: 'narrow' }) : (days.length - 1 - i) % 5 === 0 ? String(dt.getDate()) : '';
        return <span key={d.date} style={{ width: `${w}%` }} className={d.date === today ? 'y' : ''}>{lab}</span>;
      })}</div>
      <div className="chart-max">{n0(max)} kcal</div>
    </div>
  );
}

function Legend({ mode }: { mode: Mode }) {
  return <div className="burn-legend">{PARTS.filter((p) => mode === 'total' || p.k !== 'resting').map((p) => <span key={p.k}><i className="dot" style={{ background: p.color }} />{p.label}</span>)}</div>;
}

/** One horizontal stacked bar for a single day or range. */
function CompositionBar({ v, mode }: { v: { resting: number; workouts: number; steps: number; manual: number }; mode: Mode }) {
  const parts = PARTS.filter((p) => mode === 'total' || p.k !== 'resting');
  const tot = parts.reduce((a, p) => a + v[p.k], 0);
  return (
    <div className="burn-comp" role="img" aria-label="Burn breakdown">
      {tot > 0 ? parts.map((p) => v[p.k] > 0 && <div key={p.k} style={{ flex: v[p.k], background: p.color }} title={`${p.label}: ${n0(v[p.k])} kcal`} />) : <div style={{ flex: 1, background: 'var(--track)' }} />}
    </div>
  );
}

function SessionRow({ s, onEdit }: { s: BurnSession; onEdit?: (id: string) => void }) {
  const body = <>
    <span className="row-ic" style={{ color: s.kind === 'manual' ? BURN_COLORS.manual : undefined }}><Icon name={s.kind === 'manual' ? 'plus' : s.type === 'cycle' || s.type === 'indoor-cycle' ? 'bike' : s.type === 'run' || s.type === 'walk' ? 'record' : 'train'} size={18} /></span>
    <div className="fr-main"><div className="fr-name">{s.label}</div><div className="fr-sub">{new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {s.group !== s.label ? `${s.group} · ` : ''}{s.minutes ? `${fmtTime(s.minutes * 60)} · ` : ''}{s.method}</div></div>
    <div className="fr-k">{n0(s.kcal)} <small className="muted">kcal</small></div>
  </>;
  if (s.kind === 'workout') return <Link to={`/train/workout/${s.id}`} className="food-row burn-row">{body}<Icon name="chevron" size={16} className="muted" /></Link>;
  return <button className="food-row burn-row" onClick={() => onEdit?.(s.id)} aria-label={`Edit ${s.label}`}>{body}<Icon name="gear" size={16} className="muted" /></button>;
}

export default function Burn() {
  const { data, profile, upsert, remove, setProfile } = useStore();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const today = todayKey();
  const view = (sp.get('view') as View) || 'day';
  const day = sp.get('date') && sp.get('date')! <= today ? sp.get('date')! : today;
  const [mode, setMode] = useState<Mode>('active');
  const [info, setInfo] = useState(sp.get('info') === '1');
  const [goalOpen, setGoalOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<BurnEntry> | null>(sp.get('add') === '1' ? { date: day } : null);
  const goal = burnGoalOf(profile);
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) v == null ? n.delete(k) : n.set(k, v); setSp(n, { replace: true }); };

  const db = useMemo(() => dayBurn(data, day, profile), [data, profile, day]);
  const range = useMemo(() => (view === 'day' ? rangeBurn(data, profile, day, 7) : rangeBurn(data, profile, today, view === 'week' ? 7 : 30)), [data, profile, view, day, today]);
  const st = useMemo(() => burnStreak(data, profile, today), [data, profile, today]);
  const pct = Math.min(100, Math.round((db.active / goal) * 100));
  const isToday = day === today;
  const val = (x: { active: number; total: number }) => (mode === 'total' ? x.total : x.active);

  const goalCard = (
    <Card className="burn-goal">
      <div className="card-head"><h3>Daily active goal</h3><button className="link" onClick={() => setGoalOpen(true)}>Edit</button></div>
      <div className="grid3">
        <div className="stat"><div className="stat-v">{n0(goal)}</div><div className="stat-l">kcal / day</div></div>
        <div className="stat accent"><div className="stat-v">{st.current}</div><div className="stat-l">day streak</div></div>
        <div className="stat"><div className="stat-v">{st.best}</div><div className="stat-l">best streak</div></div>
      </div>
      <p className="muted small" style={{ margin: '10px 0 0' }}>A day counts when active burn (not resting) reaches the goal. Today joins the streak once it’s hit.</p>
    </Card>
  );

  const netCard = (r: typeof range, label: string) => (
    <Card>
      <div className="card-head"><h3>Net balance <span className="muted small">· estimate</span></h3><Link to="/fuel" className="link">Fuel →</Link></div>
      <div className="grid2">
        {view === 'day' && <div className="stat"><div className="stat-v">{db.net == null ? '—' : signed(db.net)}<small> kcal</small></div><div className="stat-l">{isToday ? 'today so far' : prettyDay(day)}</div></div>}
        <div className="stat"><div className="stat-v">{r.net == null ? '—' : signed(r.net)}<small> kcal</small></div><div className="stat-l">{label}{r.netDays ? ` · ${r.netDays} food day${r.netDays === 1 ? '' : 's'}` : ''}</div></div>
        {view !== 'day' && <div className="stat"><div className="stat-v">{r.netDays ? n0(Math.round((r.net as number) / r.netDays)) : '—'}<small> kcal</small></div><div className="stat-l">avg per food day</div></div>}
      </div>
      {view === 'day' && db.foodLogged && <p className="muted small" style={{ margin: '10px 0 0' }}>{n0(db.eaten)} eaten − {n0(db.total)} total burned{isToday ? ' so far' : ''}.</p>}
      <p className="muted small" style={{ margin: '8px 0 0' }}>Eaten (Fuel) minus total burned (resting + active), only on days with food logged. Below zero = you burned more than you logged. Both sides are estimates, so treat this as a trend, not a prediction of weight change.{isToday && view === 'day' ? ' Today keeps changing until midnight.' : ''}</p>
    </Card>
  );

  const breakdown = (r: typeof range) => {
    const max = Math.max(1, ...r.byGroup.map((g) => g.kcal));
    return <Card>
      <div className="card-head"><h3>By activity</h3><span className="muted small">active kcal</span></div>
      {r.byGroup.length ? r.byGroup.map((g) => <div key={g.group} className="burn-type">
        <div className="macro-top"><span>{g.group}{g.group.startsWith('Steps') ? '' : <span className="muted small"> · {g.n}×</span>}</span><span className="mono">{n0(g.kcal)} · {Math.round((g.kcal / Math.max(1, r.active)) * 100)}%</span></div>
        <div className="pillar-track"><div className="pillar-fill" style={{ width: `${(g.kcal / max) * 100}%`, background: g.group.startsWith('Steps') ? BURN_COLORS.steps : undefined }} /></div>
      </div>) : <p className="muted small">No active burn logged in this period.</p>}
    </Card>;
  };

  const top = (r: typeof range) => <Card>
    <div className="card-head"><h3>Top burning sessions</h3></div>
    {r.top.length ? r.top.map((s) => <SessionRow key={s.id} s={s} onEdit={(id) => setEdit(data.burns.find((b) => b.id === id) || null)} />) : <p className="muted small">Log or record a workout to see it here.</p>}
  </Card>;

  return (
    <Page title="Burn" kicker="Calories burned · estimates" wide back={false}
      actions={<><button className="icon-btn" aria-label="How burn is estimated" onClick={() => setInfo(true)}><Icon name="info" /></button><button className="btn sm y" onClick={() => setEdit({ date: day })}><Icon name="plus" size={18} />Add</button></>}>
      <div className="burn-bar">
        <Segmented value={view} onChange={(v) => set({ view: v === 'day' ? null : v })} options={[{ v: 'day', label: 'Day' }, { v: 'week', label: 'Week' }, { v: 'month', label: 'Month' }]} />
        <div className="unit-tog burn-mode" role="tablist" aria-label="Active or total">
          <button className={mode === 'active' ? 'on' : ''} onClick={() => setMode('active')}>Active</button>
          <button className={mode === 'total' ? 'on' : ''} onClick={() => setMode('total')}>Total</button>
        </div>
      </div>

      {view === 'day' && <div className="desk-grid">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="icon-btn" aria-label="Previous day" onClick={() => set({ date: addDays(day, -1) })}><Icon name="back" /></button>
            <div className="center" style={{ flex: 1 }}><b>{isToday ? 'Today' : prettyDay(day)}</b>{isToday && <div className="muted small">so far · {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>}</div>
            <button className="icon-btn" aria-label="Next day" disabled={isToday} onClick={() => set({ date: addDays(day, 1) === today ? null : addDays(day, 1) })}><Icon name="chevron" /></button>
          </div>
          <Card className="hero" >
            <div className="hero-score burn-hero" data-testid="burn-today">
              <ScoreRing score={mode === 'active' ? pct : Math.min(100, Math.round((db.total / Math.max(1, db.restingFullDay + goal)) * 100))} size={176} display={n0(val(db))} label={mode === 'active' ? 'active kcal' : 'total kcal'} sub={mode === 'active' ? `${pct}% of ${n0(goal)} goal` : isToday ? 'so far today' : 'whole day'} />
              <div className="pillars">
                <div className="grid3">
                  <div className={`stat ${mode === 'active' ? 'accent' : ''}`}><div className="stat-v">{n0(db.active)}</div><div className="stat-l">active</div></div>
                  <div className="stat"><div className="stat-v">{n0(db.resting)}</div><div className="stat-l">resting</div></div>
                  <div className={`stat ${mode === 'total' ? 'accent' : ''}`}><div className="stat-v">{n0(db.total)}</div><div className="stat-l">total</div></div>
                </div>
                <CompositionBar v={db} mode="total" />
                <div className="burn-parts">
                  {PARTS.map((p) => <div key={p.k}><span><i className="dot" style={{ background: p.color }} />{p.label}</span><b className="mono">{n0(db[p.k])}</b></div>)}
                </div>
              </div>
            </div>
            <p className="muted small" style={{ margin: '12px 0 0' }}>
              <b>Active</b> = workouts + steps outside workouts + calories you add. <b>Total</b> = resting + active.
              Resting is your Mifflin-St Jeor BMR ({n0(db.restingFullDay)} kcal/day){db.partial ? `, counted for the ${Math.floor(db.elapsedMin / 60)} h ${db.elapsedMin % 60} min of today so far` : ''}{db.coveredMin ? `, minus ${db.coveredMin} min already inside workout estimates` : ''}. <button className="link" onClick={() => setInfo(true)}>How it’s estimated</button>
            </p>
          </Card>

          <Card>
            <div className="card-head"><h3>{isToday ? 'Today’s' : 'This day’s'} burn</h3><button className="btn sm" onClick={() => setEdit({ date: day })}><Icon name="plus" size={16} />Add activity</button></div>
            {db.sessions.map((s) => <SessionRow key={s.id} s={s} onEdit={(id) => setEdit(data.burns.find((b) => b.id === id) || null)} />)}
            <div className="food-row burn-row">
              <span className="row-ic" style={{ color: BURN_COLORS.steps }}><Icon name="record" size={18} /></span>
              <div className="fr-main"><div className="fr-name">Steps · daily movement</div><div className="fr-sub">{db.stepInfo.outside.toLocaleString()} steps outside workouts{db.stepInfo.inWorkouts ? ` · ${db.stepInfo.inWorkouts.toLocaleString()} inside recorded walks/runs (not counted again)` : ''}{db.stepInfo.mode === 'none' && !db.stepInfo.inWorkouts ? ' · none typed in yet' : ''}</div></div>
              <div className="fr-k">{n0(db.steps)} <small className="muted">kcal</small></div>
            </div>
            {!db.sessions.length && <p className="muted small" style={{ margin: '10px 0 0' }}>No workouts on this day. <Link className="link" to="/record">Record</Link> or <Link className="link" to="/train/log">log a workout</Link>, or add an activity HYBRD didn’t track.</p>}
            {db.stepInfo.mode === 'none' && <p className="muted small" style={{ margin: '8px 0 0' }}>Type your phone’s step total on <Link className="link" to="/">Home</Link> or <Link className="link" to="/fuel">Fuel</Link> to count daily movement.</p>}
          </Card>
        </div>
        <div>
          {goalCard}
          {netCard(range, 'last 7 days')}
          <Card>
            <div className="card-head"><h3>Last 7 days</h3><button className="link" onClick={() => set({ view: 'week' })}>Week view →</button></div>
            <StackedBars days={range.days} mode={mode} goal={goal} height={130} onPick={(d) => set({ date: d === today ? null : d })} />
            <Legend mode={mode} />
          </Card>
        </div>
      </div>}

      {view !== 'day' && <div className="desk-grid">
        <div>
          <Card className="hero" >
            <div className="card-head"><h3>{view === 'week' ? 'Last 7 days' : 'Last 30 days'} · {mode} burn</h3><span className="muted small">{prettyDay(range.from)} – {prettyDay(range.to)}</span></div>
            <div className="grid4 burn-stats" style={{ marginBottom: 12 }} data-testid="burn-range-stats">
              <div className="stat accent"><div className="stat-v">{n0(val(range))}</div><div className="stat-l">{mode} kcal</div></div>
              <div className="stat"><div className="stat-v">{n0(mode === 'total' ? range.avgTotal : range.avgActive)}</div><div className="stat-l">avg / day</div></div>
              <div className="stat"><div className="stat-v">{range.goalDays}<small>/{range.days.length}</small></div><div className="stat-l">goal days</div></div>
              <div className="stat"><div className="stat-v">{range.best ? n0(range.best.active) : '—'}</div><div className="stat-l">best day{range.best ? ` · ${new Date(range.best.date + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</div></div>
            </div>
            <StackedBars days={range.days} mode={mode} goal={goal} onPick={(d) => set({ view: null, date: d === today ? null : d })} />
            <CompositionBar v={range} mode={mode} />
            <div className="burn-parts">
              {PARTS.filter((p) => mode === 'total' || p.k !== 'resting').map((p) => <div key={p.k}><span><i className="dot" style={{ background: p.color }} />{p.label}</span><b className="mono">{n0(range[p.k])}</b></div>)}
            </div>
            <p className="muted small" style={{ margin: '10px 0 0' }}>Tap a bar to open that day. {mode === 'active' ? 'Dashed line = your daily active goal.' : 'Total includes resting burn; today counts only the hours so far.'}</p>
          </Card>
          {breakdown(range)}
        </div>
        <div>
          {goalCard}
          {netCard(range, view === 'week' ? '7-day net' : '30-day net')}
          {top(range)}
        </div>
      </div>}

      <Sheet open={info} onClose={() => { setInfo(false); if (sp.get('info')) set({ info: null }); }} title="How burn is estimated"><BurnInfo /></Sheet>
      <Sheet open={goalOpen} onClose={() => setGoalOpen(false)} title="Daily active goal">
        <GoalForm goal={goal} onSave={(g) => { setProfile({ burnGoal: g }); setGoalOpen(false); toast(`Daily active goal: ${g} kcal`); }} />
      </Sheet>
      <Sheet open={!!edit} onClose={() => { setEdit(null); if (sp.get('add')) set({ add: null }); }} title={edit?.id ? 'Edit burned calories' : 'Add burned calories'}>
        {edit && <BurnForm key={edit.id || 'new'} init={edit} weightKg={profile.weightKg} today={today}
          onSave={(b) => { upsert<BurnEntry>('burns', b); setEdit(null); if (sp.get('add')) set({ add: null }); toast(edit.id ? 'Entry updated' : `Added ${b.kcal} kcal · ${b.label}`); }}
          onDelete={edit.id ? () => { remove('burns', edit.id!); setEdit(null); toast('Entry deleted'); } : undefined} />}
      </Sheet>
    </Page>
  );
}

function GoalForm({ goal, onSave }: { goal: number; onSave: (g: number) => void }) {
  const [v, setV] = useState(String(goal));
  const n = Math.round(parseFloat(v) || 0);
  return <>
    <label className="field"><span>Active kcal per day</span><input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></label>
    <div className="chips" style={{ marginBottom: 12 }}>{[300, 400, 500, 600, 800].map((g) => <button key={g} className={`chip ${n === g ? 'on' : ''}`} onClick={() => setV(String(g))}>{g}</button>)}</div>
    <p className="muted small">Default is {DEFAULT_BURN_GOAL}. Active only: workouts, steps outside workouts and anything you add. Resting burn doesn’t count toward it. Pick something you can hit most days; it’s a consistency target, not a health prescription.</p>
    <button className="btn y block" disabled={n < 50 || n > 5000} onClick={() => onSave(n)}>Save goal</button>
  </>;
}

function BurnForm({ init, weightKg, today, onSave, onDelete }: { init: Partial<BurnEntry>; weightKg: number; today: string; onSave: (b: Omit<BurnEntry, 'updatedAt'>) => void; onDelete?: () => void }) {
  const [activity, setActivity] = useState(init.activity || 'swim');
  const preset = burnActivity(activity);
  const [label, setLabel] = useState(init.activity === 'other' ? init.label || '' : '');
  const [minutes, setMinutes] = useState(String(init.minutes ?? 30));
  const [met, setMet] = useState(String(init.met ?? preset.met));
  const [date, setDate] = useState(init.date || today);
  const [override, setOverride] = useState(init.method === 'manual' ? String(init.kcal) : '');
  const m = parseFloat(minutes) || 0, metV = activity === 'other' ? parseFloat(met) || 0 : preset.met;
  const est = metBurnKcal(metV, m, weightKg);
  const ov = override.trim() ? Math.round(parseFloat(override) || 0) : null;
  const kcal = ov ?? est;
  const ok = m > 0 && m <= 1440 && kcal > 0 && kcal < 10000 && date <= today && (activity !== 'other' || label.trim());
  const pick = (v: string) => { setActivity(v); setMet(String(burnActivity(v).met)); };
  return <div data-testid="burn-form">
    <label className="field"><span>Activity</span>
      <select value={activity} onChange={(e) => pick(e.target.value)}>{BURN_ACTIVITIES.map((a) => <option key={a.v} value={a.v}>{a.label}{a.v !== 'other' ? ` · ${a.met} MET` : ''}</option>)}</select>
    </label>
    {activity === 'other' && <div className="grid2">
      <label className="field"><span>Name</span><input value={label} placeholder="e.g. Climbing" onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="field"><span>MET</span><input inputMode="decimal" value={met} onChange={(e) => setMet(e.target.value)} /></label>
    </div>}
    <div className="grid2">
      <label className="field"><span>Minutes</span><input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
      <label className="field"><span>Date</span><input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
    </div>
    <div className="burn-est">
      <div><div className="kicker">MET estimate</div><div className="burn-est-v">{est ? n0(est) : '—'}<small> kcal</small></div><div className="muted small">{metV || '—'} MET × {Math.round(weightKg)} kg × {(m / 60).toFixed(2)} h</div></div>
      <label className="field" style={{ margin: 0 }}><span>Your number (optional)</span><input inputMode="numeric" placeholder={est ? String(est) : 'kcal'} value={override} onChange={(e) => setOverride(e.target.value)} /></label>
    </div>
    <p className="muted small">Use your own number if a watch or machine showed one. METs are Compendium of Physical Activities averages for that effort, so a real session can be quite different. Added activities count as active burn, not as workouts, so they don’t change your Hybrid Score.</p>
    <div className="row" style={{ gap: 8 }}>
      {onDelete && <button className="btn danger" onClick={onDelete}><Icon name="trash" size={16} />Delete</button>}
      <button className="btn y" style={{ flex: 1 }} disabled={!ok} onClick={() => onSave({
        id: init.id || uid(), date, activity, label: activity === 'other' ? label.trim() : preset.group, minutes: Math.round(m), kcal, met: metV || undefined, method: ov != null ? 'manual' : 'met',
      })}>{init.id ? 'Save changes' : `Add ${kcal > 0 ? n0(kcal) : ''} kcal`}</button>
    </div>
  </div>;
}

export function BurnInfo() {
  const { profile } = useStore();
  const src = ['compendium', 'keytel2005', 'mifflin', 'acsm-walk'].map(sourceById).filter(Boolean);
  return <div className="burn-info">
    <p><b>Every number here is an estimate.</b> Formulas and sensors can be off by a meaningful margin for any one person or session, so use the trends and your own feedback (energy, performance, body weight over weeks) more than any single day.</p>
    <h3>What counts</h3>
    <ul className="cues tight">
      <li><b>Active</b> = workouts + steps outside workouts + calories you add by hand. Your daily goal and the ring use active burn.</li>
      <li><b>Total</b> = resting + active. Net balance uses total.</li>
      <li><b>Fuel</b> adds only active burn to your calorie target, because the target is already built on your resting burn and activity level.</li>
    </ul>
    <h3>Workouts, in this order</h3>
    <ol className="cues tight">
      <li><b>Device</b>: calories from your watch file or Strava, when it has them.</li>
      <li><b>Power</b>: average watts × time ÷ 4.184 ÷ an assumed 24% gross efficiency (indoor bike or a power meter).</li>
      <li><b>Heart rate</b>: Keytel et al. (2005) equation using HR, weight, age and sex, for cardio-type sessions with enough HR data. Lifting raises HR without the same energy cost, so strength stays on METs.</li>
      <li><b>MET</b>: MET × body weight (kg) × hours, with METs from the Compendium of Physical Activities (Ainsworth 2011; Herrmann 2024), adjusted for speed or effort.</li>
    </ol>
    <h3>Steps · daily movement</h3>
    <p>Net calories per step from the ACSM walking equation: 0.0005 × weight (kg) × step length (m). For you that is ≈{kcalPerStep(profile).toFixed(3)} kcal per step. Steps recorded inside walks and runs belong to that workout, and walks or runs with a distance but no step count are converted to steps, so a phone’s full-day total isn’t counted twice. Steps you add with “Add to today” count in full.</p>
    <h3>Resting</h3>
    <p>Mifflin-St Jeor BMR from your profile (sex, age, height, weight), {Math.round(10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === 'male' ? 5 : -161)).toLocaleString()} kcal/day for you, spread evenly across the day. Today only counts the hours so far. Workout and added-activity estimates already include your resting burn for those minutes, so those minutes are taken out of resting.</p>
    <h3>Added activities</h3>
    <p>For something HYBRD didn’t track, pick the activity and minutes and you get a MET estimate (same formula), or type the number your machine or watch showed.</p>
    <h3>Sources</h3>
    <ul className="src-list">{src.map((s) => <li key={s!.id}><a href={s!.url} target="_blank" rel="noreferrer">{s!.cite}</a></li>)}</ul>
    <p className="muted small">Not medical advice. HYBRD doesn’t predict weight change from these numbers.</p>
  </div>;
}

