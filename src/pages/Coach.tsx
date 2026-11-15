import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { fmtDist, fmtShort, fmtTime, todayKey } from '../lib/calc';
import type { FoodEntry, Profile } from '../lib/types';
import { intensityText } from '../lib/intensity';
import { exById } from '../data/exercises';
import { sourceById } from '../data/sources';
import { CATALOG } from '../data/planCatalog';
import { ALLERGENS, DIETS, REASON_TEXT, WEEKDAYS, mealMacro, weekdayOf, type PlanDay } from '../lib/wl';
import {
  INJURIES, activeCoachPlan, alternatives, applyCheckIn, baseSession, coachTargetsFor, dateFor, editDay, explain, goalLabel, isDone, moveDay, raceLabel, regenerate,
  roleLabel, startLinks, swapSession, weekIndexOf, weekProgress, weekSessions,
  type CheckIn, type CoachPlan, type CoachSession, type Injury, type Role,
} from '../lib/coach';
import { can } from '../lib/entitlements';
import { useEnergyInput } from './WeightLossSetup';
import { Macros, MealRow, SrcPills } from './WeightLoss';
import { Page, Card, Banner, Disclaimer, Sheet, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

type Tab = 'plan' | 'week' | 'food' | 'why' | 'checkin';
const TABS: { v: Tab; label: string }[] = [{ v: 'plan', label: 'Plan' }, { v: 'week', label: 'Weeks' }, { v: 'food', label: 'Food' }, { v: 'why', label: 'Why' }, { v: 'checkin', label: 'Check-in' }];
const fmtDay = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const r0 = (n: number) => Math.round(n);
const PHASE: Record<string, string> = { build: 'Build', deload: 'Lighter week', taper: 'Taper' };
const DECISION: Record<string, { label: string; tone: string }> = {
  progress: { label: 'Progress', tone: 'ok' }, bump: { label: 'Step up', tone: 'ok' }, 'level-up': { label: 'Level up', tone: 'ok' },
  hold: { label: 'Hold', tone: 'info' }, deload: { label: 'Deload', tone: 'warn' }, 'see-pro': { label: 'See a pro', tone: 'warn' }, edit: { label: 'Edit', tone: 'dim' },
};
export const NOT_AI = 'HYBRD Coach is a rule-based planner built on HYBRD’s programs and published guidelines — not AI, and not medical advice.';

export function blockTarget(b: { sets: number; reps?: number; timeSec?: number; distanceM?: number }, units: Profile['units']) {
  return `${b.sets > 1 ? `${b.sets} × ` : ''}${b.reps ? `${b.reps} reps` : b.timeSec ? fmtTime(b.timeSec) : b.distanceM ? (b.distanceM >= 400 ? fmtDist(b.distanceM, units, b.distanceM % 1000 === 0 || units === 'imperial' ? 2 : 1) : fmtShort(b.distanceM, units)) : ''}`;
}

/** First visit / no plan: what the coach does. */
function Intro({ welcome }: { welcome: boolean }) {
  const { setProfile } = useStore();
  const nav = useNavigate();
  return (
    <Page title="HYBRD Coach" kicker={welcome ? 'Welcome' : 'Your plan'} back={welcome ? undefined : '/'}>
      <div className="coach-intro" data-testid="coach-intro">
        <Card className="hero coach-hero">
          <div className="coach-av big">H</div>
          <div className="kicker">{welcome ? 'You’re in. One more thing' : 'Not sure where to start?'}</div>
          <h2>Let HYBRD build your plan</h2>
          <p>Answer a few quick questions — your goal, a couple of self-tests, your week and your kitchen — and get a training schedule and a food plan made for you.</p>
          <Link className="btn y block" to="/coach/start" data-testid="coach-start">Build my plan <span className="muted-on-y">· about 3 min</span></Link>
          {welcome && <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { setProfile({ coachDismissed: true }); nav('/', { replace: true }); }}>I’ll explore first</button>}
        </Card>
        <div className="coach-feats">
          <Card><Icon name="calendar" /><h3>A 4–8 week schedule</h3><p className="muted small">Built from HYBRD’s programs and exercise library, matched to your level, equipment, time and any injuries. Sessions start in the timers, GPS recorder or logger and count toward your Hybrid Score.</p></Card>
          <Card><Icon name="fuel" /><h3>Food that fits</h3><p className="muted small">Daily calories, protein, carbs and water, plus a 7-day meal plan that respects your diet and allergies. Log meals to Fuel in one tap.</p></Card>
          <Card><Icon name="refresh" /><h3>Adjusts every week</h3><p className="muted small">A 30-second check-in — how it felt, energy, soreness, pain — and the plan progresses, holds or eases off. Every change is shown and explained.</p></Card>
        </div>
        <p className="muted small">{NOT_AI}</p>
      </div>
    </Page>
  );
}

function SessionBody({ s, units, profile }: { s: CoachSession; units: Profile['units']; profile: Profile }) {
  return <div className="coach-blocks">
    {s.blocks.map((b, i) => { const e = exById(b.exId); const it = intensityText(b, profile); return (
      <div key={i} className="food-row"><div className="fr-main"><Link to={`/train/exercise/${b.exId}`} className="fr-name">{e?.name || b.exId}</Link>
        {(b.why || b.note) && <div className="fr-sub">{b.why ? <><Icon name="swap" size={12} /> {b.why}</> : b.note}</div>}</div>
        <div className="fr-k">{blockTarget(b, units)}{it && <span className="fr-int">{it}</span>}</div></div>
    ); })}
    {s.notes.length > 0 && <ul className="coach-notes">{s.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
  </div>;
}

export function SessionCard({ plan, w, wd, date, s, done, today, open, onToggle, onEdit, compact }: {
  plan: CoachPlan; w: number; wd: number; date: string; s: CoachSession | null; done?: boolean; today: string; open?: boolean; onToggle?: () => void; onEdit?: () => void; compact?: boolean;
}) {
  const { profile } = useStore();
  const isToday = date === today, past = date < today;
  if (!s) return (
    <div className={`coach-day rest ${isToday ? 'today' : ''}`} data-testid={isToday ? 'coach-today' : undefined}>
      <div className="coach-day-d"><b>{WEEKDAYS[wd]}</b><span>{date.slice(8)}</span></div>
      <div className="coach-day-main"><div className="coach-day-name">Rest day</div><div className="muted small">Recover — an easy walk or light mobility is fine.</div></div>
      {onEdit && <button className="icon-btn" aria-label="Edit day" onClick={onEdit}><Icon name="edit" size={18} /></button>}
    </div>
  );
  const links = startLinks(plan, w, wd, s);
  return (
    <div className={`coach-day ${isToday ? 'today' : ''} ${done ? 'done' : ''} ${past && !done ? 'missed' : ''}`} data-testid={isToday ? 'coach-today' : undefined}>
      <div className="coach-day-d"><b>{WEEKDAYS[wd]}</b><span>{date.slice(8)}</span></div>
      <div className="coach-day-main">
        <button className="coach-day-head" onClick={onToggle} aria-expanded={!!open}>
          <div className="coach-day-name">{s.name}{done && <Icon name="check" size={16} className="coach-done-ic" />}</div>
          <div className="coach-day-meta"><span className={`coach-role r-${s.role}`}>{roleLabel(s.role)}</span><span>{s.minutes} min</span><span>{s.level}</span>{isToday && <span className="coach-now">Today</span>}</div>
        </button>
        {open && <SessionBody s={s} units={profile.units} profile={profile} />}
        {(open || (isToday && !compact)) && !done && <div className="row wrap coach-start">{links.map((l) => <Link key={l.to} to={l.to} className={`btn sm ${l.primary ? 'y' : ''}`}>{l.primary && <Icon name="play" size={14} />} {l.label}</Link>)}</div>}
      </div>
      {onEdit && <button className="icon-btn" aria-label="Edit day" onClick={onEdit}><Icon name="edit" size={18} /></button>}
    </div>
  );
}

export function WeekStrip({ plan, w, today, workouts, onPick, sel }: { plan: CoachPlan; w: number; today: string; workouts: Parameters<typeof isDone>[5]; onPick?: (wd: number) => void; sel?: number }) {
  return <div className="coach-strip">{weekSessions(plan, w).map(({ wd, date, s }) => {
    const d = s ? isDone(plan, w, wd, date, s, workouts) : false;
    return <button key={wd} className={`coach-strip-d ${date === today ? 'today' : ''} ${sel === wd ? 'sel' : ''} ${s ? 'on' : 'rest'} ${d ? 'done' : ''}`} onClick={() => onPick?.(wd)} aria-label={`${WEEKDAYS[wd]} ${s ? s.name : 'rest'}`}>
      <b>{WEEKDAYS[wd].slice(0, 1)}</b><i>{d ? <Icon name="check" size={12} /> : s ? roleLabel(s.role).slice(0, 4) : '—'}</i></button>;
  })}</div>;
}

export default function Coach() {
  const { data, upsert, remove } = useStore();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const energy = useEnergyInput();
  const today = todayKey();
  const plan = activeCoachPlan(data.coachplans);
  const n = plan?.weeks.length || 0;
  const rawW = plan ? weekIndexOf(plan, today) : 0;
  const cw = Math.max(0, Math.min(n - 1, rawW));
  const tab = (sp.get('tab') as Tab) || 'plan';
  const setTab = (t: Tab) => { const q = new URLSearchParams(sp); q.set('tab', t); setSp(q, { replace: true }); };
  const [wSel, setWSel] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ w: number; wd: number } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [foodDay, setFoodDay] = useState(weekdayOf(today));
  const [ci, setCi] = useState<{ feel: CheckIn['feel'] | null; done: number | null; energy: number; soreness: number; pain: Injury[]; sharp: boolean }>({ feel: null, done: null, energy: 3, soreness: 2, pain: [], sharp: false });
  const [justSaved, setJustSaved] = useState(false);

  if (!plan) return <Intro welcome={sp.get('welcome') === '1'} />;
  const save = (p: CoachPlan) => upsert<CoachPlan>('coachplans', p);

  if (plan.stopped) return (
    <Page title="HYBRD Coach" back="/">
      <div className="wl-safety" data-testid="coach-stopped">
        <div className="wl-safety-ic"><Icon name="heart" size={30} /></div>
        <Card><h3>Check with a doctor first</h3><p className="small">{explain(plan)[0].body}</p>
          <div className="row wrap"><Link className="btn y" to="/coach/start">Update my answers</Link><button className="btn ghost" onClick={() => remove('coachplans', plan.id)}>Remove</button></div></Card>
        <p className="muted small">{NOT_AI}</p>
      </div>
    </Page>
  );

  const w = wSel ?? cw;
  const a = plan.answers, nut = plan.nutrition;
  const ended = rawW > n - 1;
  const prog = weekProgress(plan, cw, data.workouts, today);
  const todayWd = weekdayOf(today);
  const todayS = ended ? null : weekSessions(plan, cw)[todayWd];
  const prevNeedsCi = cw > 0 && !plan.checkins.some((c) => c.week === cw - 1);
  const ciWeek = prevNeedsCi ? cw - 1 : ended ? n - 1 : cw;
  const tgt = coachTargetsFor(plan, today);
  const latest = [...plan.changelog].reverse().find((c) => c.decision !== 'edit') || plan.changelog[plan.changelog.length - 1];
  const doRegen = () => { if (!can('coach.regenerate')) return; save(regenerate(plan, today, CATALOG, energy)); toast('New mix of sessions'); };

  // ---------------- Plan overview
  const PlanTab = () => <div className="coach-grid">
    <div className="stack">
      <Card className="hero coach-sum" >
        <div className="row"><div className="kicker">{goalLabel(a.goal)}{a.goal === 'race' ? ` · ${raceLabel(a.race)}` : ''}</div><span className="spacer" /><Pill tone="yellow">{plan.levels.overall}</Pill></div>
        <h2 className="coach-sum-h">{ended ? 'Block complete' : `Week ${cw + 1} of ${n}`}</h2>
        <div className="coach-weeks">{plan.weeks.map((x, i) => <span key={i} className={`coach-wk ${x.phase} ${i < cw || ended ? 'past' : ''} ${i === cw && !ended ? 'cur' : ''}`} title={`Week ${i + 1}: ${PHASE[x.phase]}`} />)}</div>
        <div className="grid3">
          <div className="stat"><div className="stat-v">{prog.done}<small>/{prog.planned}</small></div><div className="stat-l">done this week</div></div>
          <div className="stat"><div className="stat-v">{a.days}<small>×</small></div><div className="stat-l">days / week</div></div>
          <div className="stat"><div className="stat-v">{a.minutes}<small> min</small></div><div className="stat-l">per session</div></div>
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>{PHASE[plan.weeks[cw].phase]} week · {a.equipment.includes('gym') ? 'gym' : a.equipment.filter((e) => e !== 'none').length ? a.equipment.filter((e) => e !== 'none').join(', ') : 'bodyweight'}{plan.painAreas.length || a.injuries.length ? ` · avoiding strain on ${[...new Set([...a.injuries, ...plan.painAreas])].map((x) => INJURIES.find((y) => y.v === x)?.label.toLowerCase()).join(', ')}` : ''}</p>
      </Card>
      {ended && <Banner tone="yellow">You finished this block. Rebuild with your current answers to start the next one — your history and Hybrid Score stay.</Banner>}
      {prevNeedsCi && !ended && <button className="coach-ci-prompt" onClick={() => setTab('checkin')}><Icon name="check" /><span><b>Week {cw} check-in</b><span className="muted small">30 seconds — it sets next week’s plan</span></span><Icon name="chevron" size={18} /></button>}
      {!ended && <Card>
        <div className="card-head"><h3>Today</h3><span className="muted small">{fmtDay(today)}</span></div>
        <SessionCard plan={plan} w={cw} wd={todayWd} date={today} s={todayS?.s || null} done={todayS?.s ? isDone(plan, cw, todayWd, today, todayS.s, data.workouts) : false} today={today} open={open === `t`} onToggle={() => setOpen(open === 't' ? null : 't')} />
      </Card>}
      {!ended && <Card>
        <div className="card-head"><h3>This week</h3><button className="btn sm ghost" onClick={() => { setWSel(cw); setTab('week'); }}>Edit week</button></div>
        <WeekStrip plan={plan} w={cw} today={today} workouts={data.workouts} onPick={() => { setWSel(cw); setTab('week'); }} />
      </Card>}
    </div>
    <div className="stack">
      {nut && nut.targets && tgt ? <Card>
        <div className="card-head"><h3>Food today</h3><button className="btn sm ghost" onClick={() => setTab('food')}>Meal plan</button></div>
        <div className="coach-kcal"><b>{tgt.kcal.toLocaleString()}</b><span>kcal · {tgt.kind === 'train' ? 'training day' : 'rest day'}</span></div>
        <Macros t={tgt} small />
        <p className="muted small" style={{ marginBottom: 0 }}>Water ≈ {(tgt.waterMl / 1000).toFixed(1)} L{plan.applyToFuel ? ' · used as your Fuel target' : ''}</p>
      </Card> : nut && <Card><h3>Food</h3><p className="small muted" style={{ margin: 0 }}>No calorie targets for you right now (see Why). You can still browse meals and log food.</p></Card>}
      {latest && <Card>
        <div className="card-head"><h3>Latest change</h3><button className="btn sm ghost" onClick={() => setTab('checkin')}>All changes</button></div>
        <ChangeItem c={latest} />
      </Card>}
      <Card>
        <h3>Plan tools</h3>
        <div className="row wrap" style={{ gap: 8 }}>
          {can('coach.regenerate') && <button className="btn sm" onClick={doRegen} data-testid="coach-regen"><Icon name="refresh" size={14} /> Regenerate</button>}
          <Link className="btn sm" to="/coach/start">Change answers</Link>
          <button className="btn sm" onClick={() => setTab('why')}>Why this plan</button>
          {confirmDel ? <button className="btn sm danger" onClick={() => { remove('coachplans', plan.id); nav('/coach'); }}>Tap again to delete</button> : <button className="btn sm ghost" onClick={() => setConfirmDel(true)}>Delete plan</button>}
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>Regenerate keeps your answers and history and picks a fresh mix of sessions.</p>
      </Card>
    </div>
  </div>;

  // ---------------- Weeks (edit / move / swap)
  const WeekTab = () => {
    const wk = plan.weeks[w];
    const items = weekSessions(plan, w);
    return <div className="stack" data-testid="coach-week">
      <div className="coach-wtabs">{plan.weeks.map((x, i) => <button key={i} className={`chip ${i === w ? 'on' : ''} ${x.phase !== 'build' ? 'lite' : ''}`} onClick={() => setWSel(i)}>W{i + 1}{x.phase !== 'build' ? ` · ${x.phase === 'deload' ? 'easy' : 'taper'}` : ''}</button>)}</div>
      <Card>
        <div className="card-head"><div><div className="kicker">{fmtDay(dateFor(plan, w, 0))} – {fmtDay(dateFor(plan, w, 6))}</div><h3>Week {w + 1} · {PHASE[wk.phase]}</h3></div>
          {w === cw && !ended && <span className="muted small">{prog.done}/{prog.planned} done</span>}</div>
        <p className="muted small" style={{ marginTop: 0 }}>{wk.phase === 'deload' ? 'Fewer sets so your body can adapt — this is part of the plan.' : wk.phase === 'taper' ? 'Shorter and sharper so you arrive at race day fresh.' : w === 0 ? 'Starting week — learn the movements and find your pace.' : 'A small step up from last week.'} Tap a session to see it, or the pencil to change the day.</p>
        <div className="coach-days">{items.map(({ wd, date, s }) => {
          const k = `${w}-${wd}`;
          return <SessionCard key={k} plan={plan} w={w} wd={wd} date={date} s={s} today={today} done={s ? isDone(plan, w, wd, date, s, data.workouts) : false}
            open={open === k || (open === null && date === today)} onToggle={() => setOpen(open === k ? '' : k)} onEdit={can('coach.edit') ? () => setEdit({ w, wd }) : undefined} />;
        })}</div>
      </Card>
      <p className="muted small">{NOT_AI}</p>
    </div>;
  };

  // ---------------- Edit sheet
  const EditSheet = () => {
    if (!edit) return null;
    const { w: ew, wd } = edit;
    const item = weekSessions(plan, ew)[wd];
    const s = item?.s;
    const close = () => setEdit(null);
    const apply = (p: CoachPlan, msg: string) => { save(p); toast(msg); close(); };
    const alts = s ? alternatives(plan, s.slotId).slice(0, 6) : [];
    return <Sheet open onClose={close} title={`${WEEKDAYS[wd]} · ${fmtDay(item.date)}`}>
      <div className="stack" data-testid="coach-edit">
        {s ? <>
          <div><div className="kicker">Now</div><b>{s.name}</b> <span className="muted small">· {s.minutes} min</span></div>
          <div className="field"><span>Move to another day</span><div className="chips">{WEEKDAYS.map((d, i) => i === wd ? null : <button key={d} className="chip" onClick={() => apply(moveDay(plan, ew, wd, i, today), `Moved to ${d}`)}>{d}{plan.weeks[ew].layout[i] ? ' ⇄' : ''}</button>)}</div><p className="muted small" style={{ margin: '4px 0 0' }}>⇄ swaps with the session already there.</p></div>
          <div className="field"><span>Session length</span><div className="chips">{[20, 30, 45, 60, 75, 90].map((m) => <button key={m} className={`chip ${s.minutes === m ? 'on' : ''}`} onClick={() => apply(editDay(plan, ew, wd, { minutes: m }, today), `Set to about ${m} min`)}>{m} min</button>)}</div></div>
          {alts.length > 0 && <div className="field"><span>Swap for</span><div className="stack">{alts.map((r) => { const b = baseSession(r); return b ? <button key={r} className="coach-alt" onClick={() => apply(swapSession(plan, ew, wd, r, today), `Swapped to ${b.s.name}`)}><b>{b.s.name}</b><span className="muted small">{b.s.focus}{b.programName ? ` · ${b.programName}` : ''}</span></button> : null; })}</div></div>}
          <button className="btn ghost block" onClick={() => apply(editDay(plan, ew, wd, { rest: true }, today), 'Now a rest day')}>Make it a rest day</button>
        </> : <>
          <p className="muted small" style={{ margin: 0 }}>Rest day. Add a session if you have extra time — keep at least one full rest day a week.</p>
          <div className="stack">{(['mobility', 'easy', 'strength'] as Role[]).map((r) => <button key={r} className="coach-alt" onClick={() => apply(editDay(plan, ew, wd, { add: r }, today), `Added ${roleLabel(r).toLowerCase()} session`)}><b>Add {roleLabel(r).toLowerCase()}</b><span className="muted small">{r === 'mobility' ? 'Light — fine the day before a hard session' : r === 'easy' ? 'Conversational pace' : 'Matched to your level and equipment'}</span></button>)}</div>
        </>}
        <p className="muted small" style={{ margin: 0 }}>Changes apply from week {ew + 1} on and are listed in the changelog.</p>
      </div>
    </Sheet>;
  };

  // ---------------- Food
  const logMeal = (d: PlanDay, i: number, date: string) => {
    const m = d.meals[i];
    const r = CATALOG.recipes.find((x) => x.id === m.recipeId);
    const meal = (m.slot === 'snack' ? 'snacks' : m.slot) as FoodEntry['meal'];
    if (r) upsert<FoodEntry>('foods', { id: uid(), date, meal, name: r.name, servings: m.factor, kcal: r0(r.per.kcal * m.factor), protein: +(r.per.protein * m.factor).toFixed(1), carbs: +(r.per.carbs * m.factor).toFixed(1), fat: +(r.per.fat * m.factor).toFixed(1), source: 'recipe', ref: r.id });
    for (const sd0 of m.sides) { const sd = CATALOG.sides.find((x) => x.id === sd0.id); if (sd) upsert<FoodEntry>('foods', { id: uid(), date, meal, name: sd.label, grams: sd.grams * sd0.n, kcal: r0(sd.per.kcal * sd0.n), protein: +(sd.per.protein * sd0.n).toFixed(1), carbs: +(sd.per.carbs * sd0.n).toFixed(1), fat: +(sd.per.fat * sd0.n).toFixed(1), source: 'usda', ref: String(sd.fdcId) }); }
    save({ ...plan, logged: { ...plan.logged, [date]: [...(plan.logged[date] || []), `${m.slot}-${i}`] } });
    toast(`Logged ${r0(mealMacro(CATALOG, m).kcal)} kcal to ${date === today ? 'today' : fmtDay(date)}`);
  };
  const FoodTab = () => {
    if (!nut) return null;
    if (nut.mode === 'stop' || !nut.targets) return <div className="stack" data-testid="coach-food">
      <Card><h3>No calorie targets</h3>{nut.reasons.map((r) => <p key={r} className="small">{REASON_TEXT[r] || r}</p>)}
        <Link className="btn y" to="/fuel?tab=recipes">Browse meals</Link></Card><Disclaimer /></div>;
    const T = nut.targets;
    const d = nut.week.find((x) => x.weekday === foodDay) || nut.week[0];
    const date = dateFor(plan, ended ? n - 1 : cw, d.weekday);
    const logged = plan.logged[date] || [];
    return <div className="coach-grid" data-testid="coach-food">
      <div className="stack">
        <Card className="hero">
          <div className="kicker">{nut.mode === 'fat-loss' ? 'Fat loss · gentle deficit' : nut.mode === 'surplus' ? `Muscle gain · +${nut.surplus} kcal` : 'Fuel for training · maintenance'}</div>
          <div className="grid2" style={{ marginTop: 8 }}>
            <div className="wl-kind train"><div className="kicker">Training days</div><div className="coach-kcal sm"><b>{T.train.kcal.toLocaleString()}</b><span>kcal</span></div><Macros t={T.train} small /></div>
            <div className="wl-kind rest"><div className="kicker">Rest days</div><div className="coach-kcal sm"><b>{T.rest.kcal.toLocaleString()}</b><span>kcal</span></div><Macros t={T.rest} small /></div>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Protein {T.protein} g · fibre ≥ {T.fiber} g · water ≈ {(T.waterMl / 1000).toFixed(1)} L a day (more on hot or long days)</p>
        </Card>
        {[...T.notes, ...nut.notes].map((x) => <Banner key={x} tone="warn">{x}</Banner>)}
        <Card><button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => save({ ...plan, applyToFuel: !plan.applyToFuel })}><span><b>Use these targets in Fuel</b><div className="muted small">{data.wlplans.some((p) => !p.deleted && p.applyToFuel) ? 'Your weight-loss program’s targets take priority while it’s on' : 'Fuel and Home show the coach’s daily target'}</div></span><span className={`switch ${plan.applyToFuel ? 'on' : ''}`} /></button></Card>
      </div>
      <div className="stack">
        <div className="wl-days">{nut.week.map((x) => <button key={x.weekday} className={`wl-day ${x.weekday === foodDay ? 'on' : ''} ${x.kind}`} onClick={() => setFoodDay(x.weekday)}><b>{WEEKDAYS[x.weekday]}</b><span>{r0(x.totals.kcal)}</span><i>{x.kind === 'train' ? 'train' : 'rest'}</i></button>)}</div>
        <Card>
          <div className="card-head"><div><div className="kicker">{fmtDay(date)}</div><h3>{d.kind === 'train' ? 'Training day' : 'Rest day'} meals</h3></div></div>
          {d.meals.map((m, i) => ({ m, i })).sort((x, y) => x.m.time.localeCompare(y.m.time)).map(({ m, i }) => <MealRow key={i} m={m} logged={logged.includes(`${m.slot}-${i}`)} onLog={() => logMeal(d, i, date)} />)}
          <div className="row" style={{ marginTop: 10 }}><span className="muted small">Plan total</span><span className="spacer" /><Macros t={d.totals} small /></div>
          <p className="muted small" style={{ marginBottom: 0 }}>{DIETS.find((x) => x.v === a.diet)?.label}{a.exclude.length ? ` · no ${a.exclude.map((x) => ALLERGENS.find((y) => y.v === x)?.label.toLowerCase()).join(', ')}` : ''}{a.religious !== 'none' ? ` · ${a.religious}-friendly` : ''} · always check labels.</p>
        </Card>
        <Disclaimer />
      </div>
    </div>;
  };

  // ---------------- Why
  const WhyTab = () => {
    const items = explain(plan);
    const ids = [...new Set(items.flatMap((x) => x.src))];
    return <div className="stack" data-testid="coach-why">
      <Card><h3>Why this plan</h3><p className="muted small" style={{ margin: 0 }}>Every choice below comes from your answers and a fixed set of rules. Tap a source to read it.</p></Card>
      <div className="coach-why">{items.map((x) => <Card key={x.title}><h3 style={{ marginBottom: 6 }}>{x.title}</h3><p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{x.body}</p>{x.src.length > 0 && <SrcPills ids={x.src} />}</Card>)}</div>
      <Card><h3>Sources</h3><ol className="wl-src">{ids.map((id) => { const s = sourceById(id); return s ? <li key={id}><a href={s.url} target="_blank" rel="noopener">{s.cite}</a></li> : null; })}</ol></Card>
      <p className="muted small">{NOT_AI}</p>
      <Disclaimer />
    </div>;
  };

  // ---------------- Check-in + changelog
  const CheckinTab = () => {
    const wp = weekProgress(plan, ciWeek, data.workouts, today);
    const existing = plan.checkins.find((c) => c.week === ciWeek);
    const done = ci.done ?? wp.done;
    const setPain = (x: Injury) => setCi({ ...ci, pain: ci.pain.includes(x) ? ci.pain.filter((y) => y !== x) : [...ci.pain, x] });
    const submit = () => {
      if (!ci.feel) return;
      const c: CheckIn = { week: ciWeek, date: today, feel: ci.feel, done, planned: wp.planned, energy: ci.energy, soreness: ci.soreness, pain: ci.pain, sharp: ci.pain.length ? ci.sharp : false };
      save(applyCheckIn(plan, c));
      setCi({ feel: null, done: null, energy: 3, soreness: 2, pain: [], sharp: false });
      setJustSaved(true); toast('Check-in saved — plan updated');
    };
    const Scale = ({ v, on, lo, hi }: { v: number; on: (n: number) => void; lo: string; hi: string }) => <div><div className="coach-scale">{[1, 2, 3, 4, 5].map((k) => <button key={k} className={`chip ${v === k ? 'on' : ''}`} onClick={() => on(k)}>{k}</button>)}</div><div className="row muted small"><span>{lo}</span><span className="spacer" /><span>{hi}</span></div></div>;
    const log = [...plan.changelog].reverse();
    return <div className="coach-grid" data-testid="coach-checkin">
      <div className="stack">
        {justSaved && log[0] && <Card className="coach-result"><div className="kicker">Plan updated</div><ChangeItem c={log[0]} big /></Card>}
        {existing && !justSaved ? <Banner tone="ok">Week {ciWeek + 1} check-in done ({existing.feel === 'right' ? 'about right' : `felt ${existing.feel}`}). You can redo it below.</Banner> : null}
        <Card>
          <div className="card-head"><div><div className="kicker">{fmtDay(dateFor(plan, ciWeek, 0))} – {fmtDay(dateFor(plan, ciWeek, 6))}</div><h3>Week {ciWeek + 1} check-in</h3></div></div>
          <div className="field"><span>How did the week feel?</span><div className="coach-opts three">{([['easy', 'Too easy'], ['right', 'About right'], ['hard', 'Too hard']] as const).map(([v, l]) => <button key={v} className={`coach-opt ${ci.feel === v ? 'on' : ''}`} onClick={() => setCi({ ...ci, feel: v })} data-testid={`feel-${v}`}><b>{l}</b></button>)}</div></div>
          <div className="field"><span>Sessions completed</span><div className="row"><div className="coach-scale">{Array.from({ length: wp.planned + 1 }, (_, k) => <button key={k} className={`chip ${done === k ? 'on' : ''}`} onClick={() => setCi({ ...ci, done: k })}>{k}</button>)}</div><span className="muted small">of {wp.planned}</span></div><p className="muted small" style={{ margin: '4px 0 0' }}>{wp.done} found in your history — change it if you trained without logging.</p></div>
          <div className="field"><span>Energy</span><Scale v={ci.energy} on={(k) => setCi({ ...ci, energy: k })} lo="Drained" hi="Great" /></div>
          <div className="field"><span>Muscle soreness</span><Scale v={ci.soreness} on={(k) => setCi({ ...ci, soreness: k })} lo="None" hi="Very sore" /></div>
          <div className="field"><span>Any pain (not just soreness)?</span><div className="chips">
            <button className={`chip ${!ci.pain.length ? 'on' : ''}`} onClick={() => setCi({ ...ci, pain: [], sharp: false })}>No pain</button>
            {INJURIES.map((x) => <button key={x.v} className={`chip ${ci.pain.includes(x.v) ? 'on' : ''}`} onClick={() => setPain(x.v)}>{x.label}</button>)}</div></div>
          {ci.pain.length > 0 && <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCi({ ...ci, sharp: !ci.sharp })}><span><b>It’s sharp, getting worse, or there’s swelling</b></span><span className={`switch ${ci.sharp ? 'on' : ''}`} /></button>}
          <button className="btn y block" disabled={!ci.feel} onClick={submit} data-testid="coach-ci-submit" style={{ marginTop: 12 }}>Update my plan</button>
        </Card>
        <Card><h3>How check-ins change the plan</h3><ul className="cues small">
          <li><b>Sharp or returning pain</b> → lighter week and a nudge to see a physio or doctor</li>
          <li><b>Any pain</b> → exercises that load that area are swapped; no step up</li>
          <li><b>Too hard</b> with low energy, high soreness or under half done → about 25% lighter</li>
          <li><b>Too hard</b>, or under half done → repeat this week’s level</li>
          <li><b>Too easy</b> and most sessions done → +5%; twice in a row → next level</li>
          <li>Otherwise → progress as planned</li></ul></Card>
      </div>
      <div className="stack">
        <Card><h3>Changelog</h3>
          {log.length ? <div className="coach-log">{log.map((c, i) => <ChangeItem key={i} c={c} />)}</div> : <p className="muted small">No changes yet. Your first check-in is at the end of week 1.</p>}
        </Card>
      </div>
    </div>;
  };

  return (
    <Page title="HYBRD Coach" kicker="Your plan" back="/" wide>
      <div className="coach-tabs" role="tablist">{TABS.filter((t) => t.v !== 'food' || nut).map((t) => <button key={t.v} role="tab" aria-selected={tab === t.v} className={tab === t.v ? 'on' : ''} onClick={() => setTab(t.v)}>{t.label}</button>)}</div>
      {tab === 'plan' && PlanTab()}
      {tab === 'week' && WeekTab()}
      {tab === 'food' && FoodTab()}
      {tab === 'why' && WhyTab()}
      {tab === 'checkin' && CheckinTab()}
      {EditSheet()}
    </Page>
  );
}

function ChangeItem({ c, big }: { c: { date: string; week: number; decision: string; title: string; changes: string[] }; big?: boolean }) {
  const d = DECISION[c.decision] || DECISION.progress;
  return <div className={`coach-change ${big ? 'big' : ''}`}>
    <div className="row"><span className={`coach-dec ${d.tone}`}>{d.label}</span><span className="muted small">{fmtDay(c.date)}{c.decision !== 'edit' ? ` · after week ${c.week + 1}` : ''}</span></div>
    <b>{c.title}</b>
    {c.changes.length > 0 && <ul>{c.changes.map((x) => <li key={x}>{x}</li>)}</ul>}
  </div>;
}
