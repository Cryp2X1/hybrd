import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { addDays, fromW, toW, todayKey, wUnit, wu } from '../lib/calc';
import type { BodyLog, FoodEntry, Units } from '../lib/types';
import {
  ALLERGENS, DIETS, PACES, WEEKDAYS, activePlan, buildWeek, computeWL, groceryList, mealMacro, onBreak, planTargetsFor, resolveDay, retarget,
  suggest, swapMeal, swapOptions, trendRate, weekdayOf, weightTrend, windowEnd, withinTolerance,
  type PlanDay, type PlanMeal, type SuggestAction, type TrendPoint, type WLPlan,
} from '../lib/wl';
import { CATALOG } from '../data/planCatalog';
import { sourceById } from '../data/sources';
import { Page, Card, Banner, Disclaimer, Segmented, Sheet, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

type Tab = 'plan' | 'week' | 'grocery' | 'progress' | 'research';
const TABS: { v: Tab; label: string }[] = [{ v: 'plan', label: 'Today' }, { v: 'week', label: 'Week' }, { v: 'grocery', label: 'Grocery' }, { v: 'progress', label: 'Progress' }, { v: 'research', label: 'Research' }];
const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const recipe = (id: string) => CATALOG.recipes.find((r) => r.id === id);
const side = (id: string) => CATALOG.sides.find((s) => s.id === id);
const r0 = (n: number) => Math.round(n);
/** Next date (today included) that falls on a plan weekday (0 = Monday). */
export const dateForWeekday = (wd: number, today = todayKey()) => addDays(today, (wd - weekdayOf(today) + 7) % 7);
const byTime = (d: PlanDay) => d.meals.map((m, i) => ({ m, i })).sort((a, b) => a.m.time.localeCompare(b.m.time));
const fmtDay = (key: string) => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// ---------------- research content (every claim links to its source) ----------------
export const RESEARCH: { title: string; body: string; src: string[] }[] = [
  { title: 'How big a deficit', body: 'Guidelines for adults with overweight suggest about 1,200–1,500 kcal/day for women and 1,500–1,800 for men, or a 500–750 kcal/day deficit. For people who train, losing about 0.5–1% of body weight a week is recommended to keep muscle and performance; athletes losing ~0.7%/week kept more strength and lean mass than those losing ~1.4%/week.', src: ['wl-aha2013', 'wl-helms-prep', 'wl-garthe', 'wl-issn-diets'] },
  { title: 'Calorie floor', body: 'HYBRD never sets less than 1,200 kcal/day (women) or 1,500 kcal/day (men) — the level below which intake isn’t advised without a health professional. Very-low-calorie diets (<800 kcal) are only for medically supervised programs.', src: ['wl-harvard', 'wl-aha2013'] },
  { title: 'Why the weekly rate is an estimate', body: 'The “7,700 kcal per kg” rule is a simplification: as you lose weight your body needs less energy, so loss slows over time. Dynamic models (NIH Body Weight Planner) show this, and studies find energy expenditure drops a bit more than predicted from weight lost (metabolic adaptation). That’s why the plan watches your weigh-in trend instead of trusting the formula.', src: ['wl-hall2011', 'wl-bwp', 'wl-hall2008', 'wl-thomas2013', 'wl-rosenbaum', 'wl-trexler', 'wl-fothergill'] },
  { title: 'Protein first', body: 'In a deficit, higher protein helps keep lean mass. Reviews suggest about 1.6–2.4 g/kg of body weight per day (and 2.3–3.1 g/kg of fat-free mass for lean athletes). Gains from protein plateau around 1.6 g/kg on average when you lift. HYBRD uses 1.6–2.4 g/kg, based on your goal weight range if your BMI is over 25.', src: ['wl-helms-protein', 'wl-morton', 'wl-wycherley', 'wl-issn-diets'] },
  { title: 'Fibre and water', body: 'The Dietary Guidelines set fibre at 14 g per 1,000 kcal; higher fibre intake is linked with better weight outcomes and helps fullness. Daily water targets follow the National Academies Adequate Intake (about 80% of total water from drinks).', src: ['wl-dga', 'wl-fiber', 'nasem-water'] },
  { title: 'Diet breaks and refeeds', body: 'In MATADOR, men who alternated 2 weeks of dieting with 2 weeks at maintenance lost more fat (14.1 vs 9.1 kg) and kept more of it off. In ICECAP, resistance-trained people with 2 refeed days a week lost similar fat with less hunger. A short refeed has not been shown to “boost metabolism”, so HYBRD offers 1–2-week breaks as an option for adherence, not a requirement.', src: ['wl-matador', 'wl-icecap', 'wl-campbell'] },
  { title: 'Carbs around training', body: 'For endurance and HYROX athletes, carbohydrate needs scale with training load. HYBRD moves carbs to training days and away from rest days while keeping the weekly total the same (“fuel for the work required”). Chronic low energy availability harms health and performance (REDs), which is one reason for the floors and max rate.', src: ['wl-impey', 'acsm2016', 'wl-reds'] },
  { title: 'Which diet works best?', body: 'When calories and protein are matched, different patterns lead to similar weight loss. DIETFITS found no difference between healthy low-fat and healthy low-carb over 12 months (−5.3 vs −6.0 kg); DIRECT found −2.9, −4.4 and −4.7 kg for low-fat, Mediterranean and low-carb. Pick the pattern you can keep.', src: ['wl-dietfits', 'wl-shai', 'wl-huang'] },
  { title: 'Time-restricted eating', body: 'Eating windows help some people structure their day, but in trials that matched calories, TRE didn’t add weight loss: TREAT (16:8) showed −0.26 kg vs control (not significant), and a 12-month trial found −8.0 vs −6.3 kg with calorie restriction alone (P = 0.11). It’s an optional tool here.', src: ['wl-lowe', 'wl-liu'] },
  { title: 'Maintenance estimate', body: 'Resting energy uses the Mifflin-St Jeor equation, which was the most accurate predictor in an evidence review but can still be off by more than 10% for some people. If you log activity in the Burn tracker on at least 7 of 14 days, HYBRD can use that instead.', src: ['mifflin', 'wl-frankenfield'] },
];
export const RESEARCH_IDS = Array.from(new Set(RESEARCH.flatMap((r) => r.src)));

function SrcPills({ ids }: { ids: string[] }) {
  return <div className="tag-row" style={{ marginTop: 10 }}>{ids.map((s) => { const x = sourceById(s); return x ? <a key={s} className="pill yellow" href={x.url} target="_blank" rel="noopener">{x.cite.split(/[.,]/)[0]}…</a> : null; })}</div>;
}

function Macros({ t, small }: { t: { kcal: number; protein: number; carbs: number; fat: number }; small?: boolean }) {
  return <div className={`wl-macros ${small ? 'sm' : ''}`}><span><b>{r0(t.kcal)}</b> kcal</span><span><b>{r0(t.protein)}</b>g P</span><span><b>{r0(t.carbs)}</b>g C</span><span><b>{r0(t.fat)}</b>g F</span></div>;
}

function Research() {
  return <div className="stack" data-testid="wl-research">
    <Card><h3>What the research says</h3><p className="muted small" style={{ margin: 0 }}>Short summaries of the studies and guidelines behind your plan. Tap a source to read it.</p></Card>
    {RESEARCH.map((r) => <Card key={r.title}><h3 style={{ marginBottom: 6 }}>{r.title}</h3><p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{r.body}</p><SrcPills ids={r.src} /></Card>)}
    <Card><h3>All sources</h3><ol className="wl-src">{RESEARCH_IDS.map((id) => { const s = sourceById(id); return s ? <li key={id}><a href={s.url} target="_blank" rel="noopener">{s.cite}</a></li> : null; })}</ol></Card>
    <Disclaimer />
  </div>;
}

function MealRow({ m, onLog, onSwap, logged }: { m: PlanMeal; onLog?: () => void; onSwap?: () => void; logged?: boolean }) {
  const r = recipe(m.recipeId);
  const mm = mealMacro(CATALOG, m);
  return <div className="wl-meal">
    <div className="wl-meal-time"><b>{m.time}</b><span>{SLOT_LABEL[m.slot]}</span></div>
    <div className="wl-meal-main">
      <Link to={`/fuel/recipe/${m.recipeId}`} className="wl-meal-name">{r?.name || m.recipeId}</Link>
      <div className="muted small">{m.factor} serving{m.factor === 1 ? '' : 's'}{m.sides.map((s) => ` + ${s.n > 1 ? `${s.n}× ` : ''}${side(s.id)?.label || s.id}`).join('')}</div>
      <Macros t={mm} small />
    </div>
    <div className="wl-meal-act">
      {onLog && <button className={`btn sm ${logged ? '' : 'y'}`} disabled={logged} onClick={onLog}>{logged ? <><Icon name="check" size={14} /> Logged</> : 'Log'}</button>}
      {onSwap && <button className="btn sm ghost" onClick={onSwap}>Swap</button>}
    </div>
  </div>;
}

function TrendChart({ pts, goal, u }: { pts: TrendPoint[]; goal: number | null; u: Units }) {
  if (pts.length < 2) return <div className="muted small" style={{ padding: '18px 0' }}>Add two or more weigh-ins to see your trend.</div>;
  const W = 640, H = 230, P = 26, PL = 52;
  const xs = pts.map((p) => new Date(p.date + 'T12:00:00').getTime());
  const vals = pts.flatMap((p) => [p.kg, p.avg]).concat(goal != null ? [goal] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
  const x = (t: number) => PL + ((t - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0])) * (W - PL - P);
  const y = (v: number) => H - P + -((v - lo) / (hi - lo)) * (H - P * 2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  return <svg viewBox={`0 0 ${W} ${H}`} className="wl-chart" role="img" aria-label="Weight trend">
    {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={PL} x2={W - P} y1={y(v)} y2={y(v)} className="grid" /><text x={0} y={y(v) + 7}>{toW(v, u).toFixed(0)}</text></g>)}
    {goal != null && goal >= lo && <><line x1={PL} x2={W - P} y1={y(goal)} y2={y(goal)} className="goal" /><text x={W - P - 2} y={y(goal) - 5} textAnchor="end" className="goal-t">goal</text></>}
    {pts.map((p, i) => <circle key={p.date} cx={x(xs[i])} cy={y(p.kg)} r={6} className="dot" />)}
    <path d={line} className="avg" />
  </svg>;
}

export default function WeightLoss() {
  const { data, profile, upsert, remove, setProfile } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some((t) => t.v === sp.get('tab')) ? sp.get('tab') : 'plan') as Tab;
  const setTab = (t: Tab) => setSp(t === 'plan' ? {} : { tab: t }, { replace: true });
  const plan = activePlan(data.wlplans);
  const today = todayKey();
  const u = wu(profile);
  const [dayIdx, setDayIdx] = useState(weekdayOf(today));
  const [swap, setSwap] = useState<{ wd: number; i: number } | null>(null);
  const [wIn, setWIn] = useState('');
  const [wDate, setWDate] = useState(today);
  const [confirmDel, setConfirmDel] = useState(false);
  const logs = useMemo(() => data.body.filter((b) => !b.deleted).map((b) => ({ date: b.date, weightKg: b.weightKg })), [data.body]);

  const save = (p: WLPlan, patch: Partial<WLPlan>) => upsert<WLPlan>('wlplans', { ...p, ...patch });

  if (!plan || tab === 'research' && !plan) {
    return <Page title="Weight-loss programs" kicker="Fuel" back="/fuel" wide>
      {tab === 'research' ? <Research /> : <div className="stack">
        <Card className="wl-hero">
          <div className="kicker">Built from research · personalised to you</div>
          <h2 style={{ margin: '6px 0 10px' }}>Lose fat, keep your training</h2>
          <ul className="cues">
            <li>A safe daily calorie target from your body, activity and pace — never below 1,200 (women) / 1,500 (men) kcal, never faster than 1% of body weight a week.</li>
            <li>Protein first (1.6–2.4 g/kg), more carbs on training days.</li>
            <li>7 days of meals from HYBRD’s USDA-checked recipes that fit your diet, allergies, halal/kosher needs, budget and cooking time — plus a grocery list.</li>
            <li>Weekly weigh-ins with a 7-day average trend, and suggestions if you stall. Nothing changes without your OK.</li>
          </ul>
          <div className="row wrap" style={{ gap: 10 }}><Link className="btn y" to="/fuel/weight-loss/setup" data-testid="wl-start">Build my plan · 2 min</Link><button className="btn ghost" onClick={() => setTab('research')}>See the research</button></div>
        </Card>
        <Banner>Estimates, not promises. Not for under-18s, pregnancy or breastfeeding, or anyone with an eating disorder; if you have diabetes or another condition, check with your doctor first.</Banner>
        <Disclaimer />
      </div>}
    </Page>;
  }

  if (plan.targets.level === 'stop') {
    return <Page title="Weight-loss programs" kicker="Fuel" back="/fuel">
      <Card><p style={{ marginTop: 0 }}>Based on your health check, HYBRD doesn’t set a calorie-cutting target. A doctor or registered dietitian can help with a plan that’s right for you.</p>
        <div className="row wrap"><Link className="btn" to="/fuel/weight-loss/setup">Edit answers</Link><button className="btn ghost" onClick={() => remove('wlplans', plan.id)}>Remove</button></div></Card>
    </Page>;
  }

  const q = plan.quiz, T = plan.targets;
  const todayT = planTargetsFor(plan, today);
  const todayDay = plan.week.find((d) => d.weekday === weekdayOf(today))!;
  const logged = (date: string) => plan.logged[date] || [];

  const logMeal = (d: PlanDay, i: number, date: string) => {
    const m = d.meals[i];
    const r = recipe(m.recipeId);
    const meal = (m.slot === 'snack' ? 'snacks' : m.slot) as FoodEntry['meal'];
    if (r) upsert<FoodEntry>('foods', { id: uid(), date, meal, name: r.name, servings: m.factor, kcal: r0(r.per.kcal * m.factor), protein: +(r.per.protein * m.factor).toFixed(1), carbs: +(r.per.carbs * m.factor).toFixed(1), fat: +(r.per.fat * m.factor).toFixed(1), source: 'recipe', ref: r.id });
    for (const s of m.sides) { const sd = side(s.id); if (sd) upsert<FoodEntry>('foods', { id: uid(), date, meal, name: sd.label, grams: sd.grams * s.n, kcal: r0(sd.per.kcal * s.n), protein: +(sd.per.protein * s.n).toFixed(1), carbs: +(sd.per.carbs * s.n).toFixed(1), fat: +(sd.per.fat * s.n).toFixed(1), source: 'usda', ref: String(sd.fdcId) }); }
    save(plan, { logged: { ...plan.logged, [date]: [...logged(date), `${m.slot}-${i}`] } });
    toast(`Logged ${r0(mealMacro(CATALOG, m).kcal)} kcal to ${date === today ? 'today' : fmtDay(date)}`);
  };

  const newWeek = () => { const seed = Math.floor(Math.random() * 1e9); save(plan, { seed, week: buildWeek(CATALOG, q, T, seed, plan.trainDays), checked: [] }); toast('New week of meals'); };

  const act = (a: SuggestAction) => {
    if (a === 'break7' || a === 'break14') {
      const to = addDays(today, a === 'break7' ? 6 : 13);
      save(plan, { breakFrom: today, breakUntil: to, breaks: [...plan.breaks, { from: today, to }], adjustments: [...plan.adjustments, { date: today, kcal: 0, reason: `Diet break until ${to}` }] });
      toast('Diet break started'); return;
    }
    const adj = a === 'minus100' ? plan.adjustKcal - 100 : a === 'plus150' ? plan.adjustKcal + 150 : 99999;
    const nt = computeWL(q, plan.energy, { adjustKcal: adj });
    const week = retarget(CATALOG, q, nt, plan.week, plan.trainDays);
    save(plan, { adjustKcal: a === 'maintain' ? nt.tdee - (T.kcal - T.adjustKcal) : adj, targets: nt, week, adjustments: [...plan.adjustments, { date: today, kcal: nt.kcal - T.kcal, reason: a === 'maintain' ? 'Moved to maintenance' : a === 'minus100' ? 'Stall: −100 kcal/day' : 'Losing fast: +150 kcal/day' }] });
    toast(`Target now ${nt.kcal.toLocaleString()} kcal`);
  };

  const addWeighIn = () => {
    const v = parseFloat(wIn); if (!Number.isFinite(v) || v <= 0) return;
    const kg = Math.round(fromW(v, u) * 100) / 100;
    const ex = data.body.find((b) => b.date === wDate && !b.deleted);
    upsert<BodyLog>('body', { id: ex?.id || uid(), date: wDate, weightKg: kg });
    if (wDate >= (data.body.filter((b) => !b.deleted).map((b) => b.date).sort().pop() || '')) setProfile({ weightKg: kg });
    setWIn(''); toast('Weigh-in saved');
  };

  // ---------------- tabs ----------------
  const PlanTab = () => <div className="wl-grid">
    <div className="stack">
      <Card className="wl-hero">
        <div className="row"><div className="kicker">{fmtDay(today)} · {todayT.onBreak ? 'Diet break (maintenance)' : T.periodized ? (todayT.kind === 'train' ? 'Training day' : 'Rest day') : T.atMaintenance ? 'Maintenance' : `${PACES[T.pace || 'gentle'].label} pace`}</div><span className="spacer" /><button className="icon-btn" aria-label="Research" onClick={() => setTab('research')}><Icon name="info" /></button></div>
        <div className="wl-big"><b>{todayT.kcal.toLocaleString()}</b><span>kcal today</span></div>
        <div className="grid3">
          <div className="stat"><div className="stat-v">{todayT.protein}<small> g</small></div><div className="stat-l">protein</div></div>
          <div className="stat"><div className="stat-v">{todayT.carbs}<small> g</small></div><div className="stat-l">carbs</div></div>
          <div className="stat"><div className="stat-v">{todayT.fat}<small> g</small></div><div className="stat-l">fat</div></div>
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>Fibre ≥ {T.fiber} g · water ≈ {(T.waterMl / 1000).toFixed(1)} L · {T.atMaintenance ? 'no deficit' : `≈ ${toW(T.weeklyLossKg, u).toFixed(1)} ${wUnit(u)}/week (estimate, ${T.weeklyPct}% of body weight)`}{T.weeksToGoal ? ` · goal in ~${T.weeksToGoal} weeks if the estimate holds` : ''}</p>
      </Card>
      {T.notes.map((n) => <Banner key={n} tone="warn">{n}</Banner>)}
      <Card>
        <div className="card-head"><h3>Today’s meals</h3><span className="muted small">{q.window ? `Window ${q.window.start}–${windowEnd(q.window)}` : `${q.meals} meals`}</span></div>
        {byTime(todayDay).map(({ m, i }) => <MealRow key={i} m={m} logged={logged(today).includes(`${m.slot}-${i}`)} onLog={() => logMeal(todayDay, i, today)} />)}
        <div className="row" style={{ marginTop: 10 }}><span className="muted small">Plan total</span><span className="spacer" /><Macros t={todayDay.totals} small /></div>
        {!todayDay.ok && <p className="small wl-warn">This day is a little off target{todayDay.totals.protein < todayDay.target.protein * 0.9 ? ' — protein is short; add a protein snack (Greek yogurt, tofu, a shake)' : ''}. Try Swap in Week.</p>}
      </Card>
    </div>
    <div className="stack">
      {T.periodized && <Card><h3>Training vs rest days</h3>
        <div className="grid2"><div className="wl-kind train"><div className="kicker">Training ({plan.trainDays.length}×)</div><Macros t={T.train} /></div><div className="wl-kind rest"><div className="kicker">Rest ({7 - plan.trainDays.length}×)</div><Macros t={T.rest} /></div></div>
        <p className="muted small" style={{ marginBottom: 0 }}>Carbs shift toward training days; the weekly total equals {T.kcal.toLocaleString()} kcal/day on average.</p></Card>}
      <Card><h3>How we got this</h3>
        <table className="wl-table"><tbody>
          <tr><td>Resting (Mifflin-St Jeor)</td><td>{T.bmr.toLocaleString()} kcal</td></tr>
          <tr><td>Maintenance ({T.method === 'tracked' ? 'tracked burn' : `× ${q.activity}`})</td><td>{T.tdee.toLocaleString()} kcal</td></tr>
          <tr><td>Deficit ({T.pace ? PACES[T.pace].label.toLowerCase() : 'none'})</td><td>−{T.deficit} kcal</td></tr>
          {T.adjustKcal !== 0 && <tr><td>Your adjustments</td><td>{T.adjustKcal > 0 ? '+' : ''}{T.adjustKcal} kcal</td></tr>}
          <tr><td>Floor</td><td>{T.floor.toLocaleString()} kcal{T.floorApplied ? ' (applied)' : ''}</td></tr>
          <tr><td>Protein</td><td>{T.proteinPerKg} g/kg × {toW(T.refWeightKg, u).toFixed(0)} {wUnit(u)}</td></tr>
          <tr><td>Fat</td><td>{T.fatPct}% of kcal</td></tr>
        </tbody></table>
        <p className="muted small" style={{ marginBottom: 0 }}>{DIETS.find((d) => d.v === q.diet)?.label}{q.exclude.length ? ` · no ${q.exclude.map((x) => ALLERGENS.find((a) => a.v === x)?.label.toLowerCase()).join(', ')}` : ''}{q.religious !== 'none' ? ` · ${q.religious}-friendly` : ''}{q.budget ? ' · budget' : ''}{q.cookTime ? ` · ≤ ${q.cookTime} min` : ''}</p>
      </Card>
      <Card>
        <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => save(plan, { applyToFuel: !plan.applyToFuel })}><span><b>Use these targets in Fuel</b><div className="muted small">Fuel and Home show the plan’s daily target instead of the general one</div></span><span className={`switch ${plan.applyToFuel ? 'on' : ''}`} /></button>
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          <Link className="btn sm" to="/fuel/weight-loss/setup">Edit answers</Link>
          <button className="btn sm" onClick={newWeek}>New week of meals</button>
          {confirmDel ? <button className="btn sm danger" onClick={() => { remove('wlplans', plan.id); nav('/fuel'); }}>Tap again to delete</button> : <button className="btn sm ghost" onClick={() => setConfirmDel(true)}>Delete plan</button>}
        </div>
      </Card>
    </div>
  </div>;

  const WeekTab = () => {
    const d = plan.week.find((x) => x.weekday === dayIdx)!;
    const date = dateForWeekday(dayIdx, today);
    const toggleKind = () => {
      const trainDays = d.kind === 'train' ? plan.trainDays.filter((x) => x !== dayIdx) : [...plan.trainDays, dayIdx].sort();
      const nd = resolveDay(CATALOG, q, T, d, d.kind === 'train' ? 'rest' : 'train');
      save(plan, { trainDays, week: plan.week.map((x) => (x.weekday === dayIdx ? nd : x)) });
    };
    return <div className="stack" data-testid="wl-week">
      <div className="wl-days">{plan.week.map((x) => <button key={x.weekday} className={`wl-day ${x.weekday === dayIdx ? 'on' : ''} ${x.kind}`} onClick={() => setDayIdx(x.weekday)}><b>{WEEKDAYS[x.weekday]}</b><span>{r0(x.totals.kcal)}</span>{T.periodized && <i>{x.kind === 'train' ? 'train' : 'rest'}</i>}{!x.ok && <em>!</em>}</button>)}</div>
      <Card>
        <div className="card-head"><div><div className="kicker">{fmtDay(date)}{onBreak(plan, date) ? ' · diet break' : ''}</div><h3>{d.kind === 'train' ? 'Training day' : 'Rest day'}</h3></div>
          <button className="btn sm ghost" onClick={toggleKind}>Make it a {d.kind === 'train' ? 'rest' : 'training'} day</button></div>
        <div className="row" style={{ marginBottom: 6 }}><span className="muted small">Target</span><span className="spacer" /><Macros t={d.target} small /></div>
        {byTime(d).map(({ m, i }) => <MealRow key={i} m={m} logged={logged(date).includes(`${m.slot}-${i}`)} onLog={() => logMeal(d, i, date)} onSwap={() => setSwap({ wd: d.weekday, i })} />)}
        <div className="row" style={{ marginTop: 10 }}><span className="muted small">Plan total</span><span className="spacer" /><Macros t={d.totals} small /></div>
        <p className={`small ${d.ok ? 'muted' : 'wl-warn'}`} style={{ marginBottom: 0 }}>{withinTolerance(d.target, d.totals) ? <><Icon name="check" size={14} /> Within ±5% of calories and protein on target</> : d.totals.protein < d.target.protein * 0.9 ? 'Protein is short this day — add a protein snack or swap a meal.' : 'A little off target — try a swap.'}</p>
      </Card>
      <Disclaimer />
    </div>;
  };

  const GroceryTab = () => {
    const list = groceryList(CATALOG, plan.week);
    const fmt = (g: number) => u === 'imperial' ? (g >= 454 ? `${(g / 453.6).toFixed(1)} lb` : `${(g / 28.35).toFixed(1)} oz`) : g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${r0(g)} g`;
    const text = list.map((a) => `${a.aisle}\n${a.items.map((i) => `- ${i.name}: ${fmt(i.grams)}${i.pieces ? ` (~${i.pieces})` : ''}`).join('\n')}`).join('\n\n');
    const toggle = (k: string) => save(plan, { checked: plan.checked.includes(k) ? plan.checked.filter((x) => x !== k) : [...plan.checked, k] });
    const share = async () => { try { if (navigator.share) await navigator.share({ title: 'HYBRD grocery list', text }); else { await navigator.clipboard.writeText(text); toast('Copied'); } } catch { /* cancelled */ } };
    const n = list.reduce((s, a) => s + a.items.length, 0);
    return <div className="stack" data-testid="wl-grocery">
      <Card><div className="card-head"><div><div className="kicker">7 days · {n} items</div><h3>Grocery list</h3></div><button className="btn sm" onClick={share}><Icon name="share" size={14} /> Share</button></div>
        <p className="muted small" style={{ margin: 0 }}>Raw/dry weights for the whole week, rounded. Piece counts are approximate.</p></Card>
      <div className="wl-aisles">{list.map((a) => <Card key={a.aisle}><h3 style={{ marginBottom: 6 }}>{a.aisle}</h3>
        {a.items.map((i) => { const on = plan.checked.includes(i.key); return <label key={i.key} className={`wl-gi ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => toggle(i.key)} /><span className="wl-gi-n">{i.name}</span><span className="mono small">{fmt(i.grams)}{i.pieces ? ` · ~${i.pieces}` : ''}</span></label>; })}
      </Card>)}</div>
    </div>;
  };

  const ProgressTab = () => {
    const pts = weightTrend(logs.filter((l) => l.date >= addDays(plan.startDate, -14)));
    const s = suggest(plan, logs, today);
    const rate = trendRate(pts, today);
    const last = pts[pts.length - 1];
    const first = pts.find((p) => p.date >= plan.startDate) || pts[0];
    const label: Record<SuggestAction, string> = { minus100: 'Eat 100 kcal less', plus150: 'Eat 150 kcal more', break7: '1-week diet break', break14: '2-week diet break', maintain: 'Move to maintenance' };
    return <div className="wl-grid" data-testid="wl-progress">
      <div className="stack">
        <Card><div className="card-head"><h3>Weight trend</h3><span className="muted small">line = 7-day avg</span></div>
          <TrendChart pts={pts} goal={T.goalWeightKg} u={u} />
          <div className="grid3" style={{ marginTop: 8 }}>
            <div className="stat"><div className="stat-v">{last ? toW(last.avg, u).toFixed(1) : '—'}<small> {wUnit(u)}</small></div><div className="stat-l">7-day avg</div></div>
            <div className="stat"><div className="stat-v">{last && first ? `${last.avg - first.avg > 0 ? '+' : ''}${toW(last.avg - first.avg, u).toFixed(1)}` : '—'}</div><div className="stat-l">since start</div></div>
            <div className="stat"><div className="stat-v">{rate == null ? '—' : `${rate > 0 ? '+' : ''}${toW(rate, u).toFixed(2)}`}</div><div className="stat-l">{wUnit(u)} / week</div></div>
          </div>
        </Card>
        <Card className={`wl-sug ${s.kind}`}><div className="kicker">Suggestion</div><h3 style={{ margin: '4px 0 6px' }}>{s.title}</h3><p className="small" style={{ margin: 0, lineHeight: 1.5 }}>{s.body}</p>
          {s.actions.length > 0 && <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>{s.actions.map((a) => <button key={a} className="btn sm y" onClick={() => act(a)}>{label[a]}</button>)}</div>}
          <p className="muted small" style={{ margin: '10px 0 0' }}>HYBRD never changes your plan on its own — you choose.</p></Card>
      </div>
      <div className="stack">
        <Card><h3>Weekly weigh-in</h3>
          <div className="grid2"><label className="field"><span>Weight ({wUnit(u)})</span><input inputMode="decimal" value={wIn} placeholder={toW(profile.weightKg, u).toFixed(1)} onChange={(e) => setWIn(e.target.value)} /></label>
            <label className="field"><span>Date</span><input type="date" value={wDate} max={today} onChange={(e) => setWDate(e.target.value)} /></label></div>
          <button className="btn y block" onClick={addWeighIn} disabled={!wIn}>Save weigh-in</button>
          <p className="muted small" style={{ marginBottom: 0 }}>Same scale, in the morning, after the bathroom. Once a week is enough; more often makes the average smoother.</p></Card>
        <Card><h3>Recent weigh-ins</h3>{logs.length ? <table className="wl-table"><tbody>{[...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((l) => <tr key={l.date}><td>{fmtDay(l.date)}</td><td>{toW(l.weightKg, u).toFixed(1)} {wUnit(u)}</td></tr>)}</tbody></table> : <Empty icon="progress" title="No weigh-ins yet" />}</Card>
        {plan.adjustments.length > 0 && <Card><h3>Changes you made</h3><table className="wl-table"><tbody>{plan.adjustments.slice().reverse().map((a, i) => <tr key={i}><td>{fmtDay(a.date)}</td><td>{a.reason}</td></tr>)}</tbody></table></Card>}
      </div>
    </div>;
  };

  const swapDay = swap ? plan.week.find((x) => x.weekday === swap.wd)! : null;
  const swapCur = swapDay ? swapDay.meals[swap!.i] : null;
  return <Page title="Weight-loss plan" kicker={`Fuel · started ${fmtDay(plan.startDate)}`} back="/fuel" wide actions={<Link className="btn sm ghost" to="/fuel/weight-loss/setup">Edit</Link>}>
    <div className="wl-tabs"><Segmented value={tab} options={TABS} onChange={setTab} small /></div>
    {tab === 'plan' && PlanTab()}
    {tab === 'week' && WeekTab()}
    {tab === 'grocery' && GroceryTab()}
    {tab === 'progress' && ProgressTab()}
    {tab === 'research' && <Research />}
    <Sheet open={!!swap} onClose={() => setSwap(null)} title={`Swap ${swapCur ? SLOT_LABEL[swapCur.slot].toLowerCase() : 'meal'}`}>
      {swapDay && swapCur && <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>Every option fits your diet and exclusions. Portions are rescaled to hit the day’s target.</p>
        {swapOptions(CATALOG, q, swapCur.slot, swapCur.recipeId).slice(0, 12).map((r) => <button key={r.id} className="wl-swap" onClick={() => { const nd = swapMeal(CATALOG, q, T, swapDay, swap!.i, r.id); save(plan, { week: plan.week.map((x) => (x.weekday === swapDay.weekday ? nd : x)) }); setSwap(null); toast('Swapped'); }}>
          <b>{r.name}</b><span className="muted small">{r.minutes ? `${r.minutes} min` : 'No cooking'} · per serving {r0(r.per.kcal)} kcal · {r0(r.per.protein)} g protein</span></button>)}
      </div>}
    </Sheet>
  </Page>;
}
