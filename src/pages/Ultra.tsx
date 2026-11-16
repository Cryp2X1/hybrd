import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { KM_PER_MI, ZONES, hrMaxOf, todayKey } from '../lib/calc';
import { profilePaces, fmtPaceKm } from '../lib/intensity';
import {
  PHASE_LABEL, WEEKDAYS, YARD_EXPLAIN, activeUltra, currentWeekIdx, daysBetween, dayTargets, estRaceHours, fmtByuDist, fmtByuPace, fuelPlan, lapPaceSec, loopDist, planOf,
  sweatRate, unitText, type Climate, type DaySession, type FuelPrefs, type GutLevel, type Plan, type UltraSaved,
} from '../lib/ultra';
import {
  ACCLIM, CREW, GEAR, RACE_WEEK, RACE_WEEK_SRC, REAL_FOODS, RECOVERY, ULTRA_RESEARCH, ULTRA_SOURCE_IDS, WARNINGS, raceDayPlan, type CheckGroup,
} from '../data/ultraContent';
import { sourceById } from '../data/sources';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Disclaimer, Segmented, Sheet, Pill } from '../components/ui';
import { SrcPills } from '../components/SrcPills';
import { ByuUnitToggle, ByuYardTable, useByuUnit } from '../components/ByuUnits';
import { TargetsCard } from '../components/Expert';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

type Tab = 'plan' | 'weeks' | 'fuel' | 'prep' | 'research';
const TABS: { v: Tab; label: string }[] = [{ v: 'plan', label: 'Plan' }, { v: 'weeks', label: 'Weeks' }, { v: 'fuel', label: 'Fuel' }, { v: 'prep', label: 'Prep' }, { v: 'research', label: 'Research' }];
const fmtDay = (k: string) => new Date(k + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const KIND_ROLE: Record<string, string> = { long: 'Long', sim: 'Backyard sim', b2b: 'Back-to-back', night: 'Night', easy: 'Easy', strides: 'Easy+', hills: 'Hills', threshold: 'Quality', uphill: 'Quality', 'race-effort': 'Quality', gears: 'Yard pace', sharpen: 'Sharpen', hike: 'Vert', strength: 'Strength', opener: 'Opener', race: 'Race', rest: 'Rest' };

export default function Ultra() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'plan';
  const setTab = (v: Tab) => setSp(v === 'plan' ? {} : { tab: v });
  const { data, profile, setProfile } = useStore();
  const toast = useToast();
  const saved = activeUltra(profile.ultra);
  const paused = profile.ultra && !saved;
  const plan = useMemo(() => (saved ? planOf(saved) : null), [saved]);
  const today = todayKey();
  const imp = profile.units === 'imperial';
  const [byuU] = useByuUnit();
  const dU = imp ? 'mi' : 'km';
  const d = (km: number) => `${Math.round((imp ? km / KM_PER_MI : km) * 10) / 10} ${dU}`;
  const ut = (x: string) => unitText(x, imp);
  const el = (m: number) => `${Math.round(imp ? m * 3.28084 : m).toLocaleString()} ${imp ? 'ft' : 'm'}`;
  const cw = plan ? Math.max(0, Math.min(plan.weeks.length - 1, currentWeekIdx(plan, today))) : 0;
  const [wSel, setWSel] = useState<number | null>(null);
  const [open, setOpen] = useState<{ w: number; s: DaySession } | null>(null);
  const done = (w: number, wd: number) => data.workouts.some((x) => !x.deleted && x.source === `ultra:${w}:${wd}`);
  const [pre, setPre] = useState(''); const [post, setPost] = useState(''); const [drank, setDrank] = useState(''); const [pee, setPee] = useState(''); const [mins, setMins] = useState('60');
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const updateSaved = (patch: Partial<UltraSaved>) => profile.ultra && setProfile({ ultra: { ...profile.ultra, ...patch } });

  // ---------------- landing ----------------
  const Landing = () => <div className="stack" data-testid="ultra-landing">
    <Card className="wl-hero ultra-hero">
      <div className="kicker">Train · Ultra & Backyard</div>
      <h2 className="fast-h">From marathon to last one standing</h2>
      <p className="muted" style={{ marginTop: 0 }}>A safety and readiness check first, then a week-by-week plan for a backyard ultra, 50K, 50 mi, 100K or 100 mi. It covers long runs, back-to-backs, climbing, strength, gut training, a race fuelling planner, crew checklists and a backyard lap timer. All free, with every claim cited.</p>
      <ul className="cues">
        <li>Weekly volume never rises more than 10% on your last full week, and no long run is more than 10% longer than your longest of the last 30 days.</li>
        <li>Backyard-specific training: on-the-hour simulations, yard-pace “gears”, night yards, a between-yards routine, and a sleep and caffeine plan.</li>
        <li>Fuelling sized to you: carbs, fluid and sodium per hour, a sweat-rate test, and food per yard or aid station.</li>
      </ul>
      <div className="row wrap" style={{ marginTop: 12 }}>
        <Link className="btn y" to="/train/ultra/setup" data-testid="ultra-start">Build my plan · 3 min</Link>
        <Link className="btn ghost" to="/timers?t=backyard" data-testid="ultra-byu-link"><Icon name="timer" size={18} />Backyard lap timer</Link>
      </div>
    </Card>
    {paused && <Banner tone="warn">Your saved ultra plan is paused because of a health answer. <Link className="link" to="/train/ultra/setup">Review your answers</Link></Banner>}
    <div className="tile-grid">
      <button className="tile" onClick={() => setTab('fuel')}><div className="kicker">Fuel</div><h3>Race fuelling planner</h3><div className="muted small">Carbs, fluid and sodium per hour, plus caffeine and real food.</div></button>
      <button className="tile" onClick={() => setTab('prep')}><div className="kicker">Prep</div><h3>Gear, crew & warning signs</h3><div className="muted small">Checklists, acclimation, race week, recovery.</div></button>
      <button className="tile" onClick={() => setTab('research')}><div className="kicker">Research</div><h3>{ULTRA_SOURCE_IDS.length} sources</h3><div className="muted small">Position stands, consensus statements, studies and coaches.</div></button>
    </div>
    <Disclaimer />
  </div>;

  // ---------------- day row + sheet ----------------
  const DayRow = ({ w, s }: { w: number; s: DaySession }) => {
    const isToday = s.date === today, isDone = done(w, s.wd), past = s.date < today;
    const rest = s.kind === 'rest';
    return <button className={`coach-day ultra-day k-${s.kind} ${rest ? 'rest' : ''} ${isToday ? 'today' : ''} ${isDone ? 'done' : ''} ${past && !isDone && !rest ? 'missed' : ''}`} onClick={() => !rest && setOpen({ w, s })} data-testid={isToday ? 'ultra-today' : `ultra-day-${w}-${s.wd}`}>
      <div className="coach-day-d"><b>{WEEKDAYS[s.wd]}</b><span>{s.date.slice(8)}</span></div>
      <div className="coach-day-main" style={{ textAlign: 'left' }}>
        <div className="coach-day-name">{ut(s.title)}{s.strength && s.kind !== 'strength' && <span className="ultra-plus">+ strength</span>}{isDone && <Icon name="check" size={16} className="coach-done-ic" />}</div>
        {!rest && <div className="coach-day-meta"><span className={`coach-role ultra-role r-${s.kind}`}>{KIND_ROLE[s.kind]}</span>{s.km > 0 && <span>{d(s.km)}</span>}{s.min > 0 && <span>{s.min >= 60 ? hm(s.min) : `${s.min} min`}</span>}{s.vertM > 0 && <span>↑{el(s.vertM)}</span>}{s.carbsPerH && <span>{s.carbsPerH} g/h</span>}{isToday && <span className="coach-now">Today</span>}</div>}
      </div>
      {!rest && <Icon name="chevron" size={18} className="muted" />}
    </button>;
  };
  const SessionSheet = () => {
    if (!open || !plan) return null;
    const { w, s } = open;
    const timer = s.steps.length > 0 && s.kind !== 'strength' && s.kind !== 'race' && s.kind !== 'rest';
    return <Sheet open onClose={() => setOpen(null)} title={`${WEEKDAYS[s.wd]} · ${fmtDay(s.date)}`}>
      <div className="stack" data-testid="ultra-session">
        <div><div className="kicker">Week {w + 1} · {PHASE_LABEL[plan.weeks[w].phase]}{plan.weeks[w].cut ? ' · cut-back' : ''}</div><h2 style={{ margin: '4px 0 6px' }}>{ut(s.title)}</h2>
          <div className="row wrap" style={{ gap: 6 }}>{s.km > 0 && <Pill tone="yellow">{d(s.km)}</Pill>}{s.min > 0 && <Pill>{s.min >= 60 ? hm(s.min) : `${s.min} min`} est.</Pill>}{s.vertM > 0 && <Pill>↑ {el(s.vertM)}</Pill>}<Pill>{s.zone}</Pill>{s.yards && <Pill tone="yellow">{s.yards} yards</Pill>}</div></div>
        <ul className="cues">{s.detail.map((x) => <li key={x}>{ut(x)}</li>)}</ul>
        {s.steps.length > 1 && <div className="plan-list" data-testid="ultra-steps">{s.steps.map((x, i) => <div key={i} className="plan-row"><span>{ut(x.label)}</span><span className="t">{x.sec >= 3600 ? hm(Math.round(x.sec / 60)) : `${Math.round(x.sec / 60) || `${x.sec}s`}${x.sec >= 60 ? ' min' : ''}`}</span>{x.note && <span className="n">{ut(x.note)}</span>}</div>)}</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          {(s.kind === 'sim' || s.kind === 'night' || s.kind === 'race' && saved?.target === 'byu') && <Link className="btn y" to={`/timers?t=backyard&yards=${s.yards || saved?.yards || 12}&lap=${saved?.quiz.lapMin || 50}`} data-testid="ultra-open-byu">Backyard lap timer</Link>}
          {timer && <Link className={`btn ${s.kind === 'sim' || s.kind === 'night' ? '' : 'y'}`} to={`/timers?t=ultra&w=${w}&d=${s.wd}`} data-testid="ultra-open-timer">Open session timer</Link>}
          {s.kind !== 'strength' && s.kind !== 'race' && <Link className="btn" to="/record?type=run">Record with GPS</Link>}
          <Link className="btn" to="/train/log">Log manually</Link>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Times are estimates from your easy pace, terrain and climbing. Run by effort: Zone 1–2 should feel conversational. Feel pain (not just tiredness)? Make it an easy day or rest.</p>
      </div>
    </Sheet>;
  };
  const PhaseBar = ({ p, cur }: { p: Plan; cur?: number }) => <div className="ultra-phasebar" data-testid="ultra-phasebar">{p.weeks.map((w) => <button key={w.i} className={`p-${w.phase} ${w.cut ? 'cut' : ''} ${w.i === cur ? 'cur' : ''}`} title={`Week ${w.i + 1}: ${PHASE_LABEL[w.phase]}${w.cut ? ' (cut-back)' : ''} · ${Math.round(w.km)} km`} onClick={() => { setWSel(w.i); setTab('weeks'); }} />)}</div>;
  const WeekStats = ({ w }: { w: Plan['weeks'][number] }) => <div className="ultra-wstats">
    <div><b>{d(w.km)}</b><span>week</span></div><div><b>{d(w.longKm)}</b><span>{plan?.spec.id === 'byu' && w.days.some((x) => x.kind === 'sim') ? 'sim' : 'long'}</span></div>
    {w.b2bKm > 0 && <div><b>{d(w.b2bKm)}</b><span>{w.days.some((x) => x.kind === 'night') ? 'night' : 'B2B'}</span></div>}{w.vertM > 0 && <div><b>↑{el(w.vertM)}</b><span>climb</span></div>}<div><b>{w.gut}</b><span>g carbs/h</span></div>
  </div>;

  // ---------------- tabs ----------------
  const PlanTab = () => {
    if (!plan || !saved) return Landing();
    const w = plan.weeks[cw];
    const toRace = daysBetween(today, plan.raceDate);
    const started = today >= plan.startDate;
    const hrMax = hrMaxOf(profile);
    const pp = profilePaces(profile);
    return <div className="ultra-grid">
      <div className="stack">
        <Card className="wl-hero ultra-hero" >
          <div className="kicker">{saved.target === 'base' ? 'Bridge plan' : `Race day ${fmtDay(plan.raceDate)}`}</div>
          <h2 className="fast-h" data-testid="ultra-plan-title">{plan.spec.name}</h2>
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>{saved.target !== 'base' && <Pill tone="yellow">{toRace >= 0 ? `${toRace} days to go` : 'Race done'}</Pill>}<Pill>{started ? `Week ${cw + 1} of ${plan.weeks.length}` : `Starts ${fmtDay(plan.startDate)}`}</Pill><Pill>{PHASE_LABEL[w.phase]}{w.cut ? ' · cut-back' : ''}</Pill>{saved.quiz.terrain !== 'road' && <Pill>{saved.quiz.terrain}</Pill>}</div>
          <PhaseBar p={plan} cur={cw} />
          <div className="ultra-legend"><span className="p-base" />Base<span className="p-build" />Build<span className="p-specific" />Specific<span className="p-taper" />Taper<span className="cut" />Cut-back</div>
          <p className="small" style={{ margin: '12px 0 0' }}>{w.focus}</p>
          <WeekStats w={w} />
        </Card>
        <Card>
          <div className="card-head"><h3>{started ? 'This week' : 'Week 1'}</h3><button className="link" onClick={() => { setWSel(cw); setTab('weeks'); }}>All weeks →</button></div>
          <div className="coach-days" data-testid="ultra-week">{w.days.map((s) => <DayRow key={s.wd} w={cw} s={s} />)}</div>
        </Card>
      </div>
      <div className="stack">
        {saved.target === 'byu' && <>
          <Link to={`/timers?t=backyard&yards=${saved.yards}&lap=${saved.quiz.lapMin}`} className="card hero click" style={{ display: 'block' }} data-testid="ultra-byu-card">
            <div className="row"><div style={{ flex: 1 }}><div className="kicker">Backyard · {YARD_EXPLAIN}</div><h3>Lap timer</h3><p className="muted small" style={{ margin: '6px 0 0' }}>An hourly bell countdown, your lap time, rest left, yards done and total distance. {loopDist(byuU)} in {saved.quiz.lapMin} min = {fmtByuPace(lapPaceSec(saved.quiz.lapMin), byuU)}.</p></div><Icon name="timer" size={34} className="y" /></div>
          </Link>
          <Card data-testid="ultra-byu-units">
            <ByuYardTable highlight={saved.yards} />
          </Card>
        </>}
        <Card>
          <h3 style={{ marginBottom: 6 }}>Your zones</h3>
          <p className="muted small" style={{ marginTop: 0 }}>Heart-rate zones from {profile.hrMax ? 'your max HR' : `an estimated max HR of ${hrMax} (208 − 0.7 × age)`}. Long runs, back-to-backs and yards stay in Zone 1–2.</p>
          <div className="zone-list" data-testid="ultra-zones">{ZONES.slice(0, 5).map((z, i) => { const hi = ZONES[i + 1]?.lo ?? 1; return <div key={z.z} className="zone-row"><Pill tone={z.z <= 2 ? 'yellow' : undefined}>Z{z.z}</Pill><span>{z.name}</span><span className="muted small">{Math.round(hrMax * z.lo)}–{Math.round(hrMax * hi)} bpm</span><span className="muted small">{z.z <= 2 ? 'Most of the week' : z.z === 4 ? 'Quality day' : z.z === 3 ? 'Race effort' : 'Hill sprints only'}</span></div>; })}</div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Easy pace in your plan: {fmtPaceKm(saved.quiz.easyPaceSec, profile.units)}{pp ? ` · Threshold ${fmtPaceKm(pp.T, profile.units)}` : ''}.</p>
        </Card>
        <TargetsCard show="run" />
        <Card>
          <h3 style={{ marginBottom: 6 }}>How this plan keeps you healthy</h3>
          <ul className="cues tight small">
            <li>+10% caps on weekly volume and on each long run, with a cut-back every {plan.cycle === 3 ? '3rd' : '4th'} week.</li>
            <li>Gut training climbs from 30 g/h to {plan.weeks[plan.weeks.length - 1].gut} g/h before race-specific work.</li>
            <li>Warning signs (hyponatremia, rhabdo, heat illness) are in Prep, and they mean stop and get help.</li>
          </ul>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}><Link className="btn sm" to="/train/ultra/setup">Edit answers</Link><button className="btn sm ghost" onClick={() => setTab('prep')}>Warning signs</button></div>
        </Card>
      </div>
    </div>;
  };

  const WeeksTab = () => {
    if (!plan) return Landing();
    const i = wSel ?? cw;
    const w = plan.weeks[i];
    return <div className="stack" data-testid="ultra-weeks">
      <div className="coach-wtabs">{plan.weeks.map((x) => <button key={x.i} className={`chip sm ${x.i === i ? 'on' : ''} ${x.cut ? 'lite' : ''}`} onClick={() => setWSel(x.i)}>W{x.i + 1}<span className="mono">{x.phase === 'specific' ? 'SP' : x.phase.slice(0, 2).toUpperCase()}</span></button>)}</div>
      <div className="ultra-grid">
        <Card>
          <div className="card-head"><div><div className="kicker">Week {i + 1} · {fmtDay(w.startDate)} · {PHASE_LABEL[w.phase]}{w.cut ? ' · cut-back' : ''}</div><h3>{d(w.km)} · long {d(w.longKm)}</h3></div></div>
          <p className="muted small" style={{ marginTop: 0 }}>{w.focus}</p>
          <div className="coach-days">{w.days.map((s) => <DayRow key={s.wd} w={i} s={s} />)}</div>
        </Card>
        <Card>
          <h3 style={{ marginBottom: 8 }}>Volume by week</h3>
          <div className="ultra-bars" data-testid="ultra-bars">{plan.weeks.map((x) => <button key={x.i} className={`p-${x.phase} ${x.cut ? 'cut' : ''} ${x.i === i ? 'cur' : ''}`} style={{ height: `${Math.max(6, (x.km / plan.peakKm) * 100)}%` }} onClick={() => setWSel(x.i)} title={`W${x.i + 1}: ${Math.round(x.km)} km`} />)}</div>
          <WeekStats w={w} />
          <p className="muted small" style={{ margin: '10px 0 0' }}>Each week is at most +10% on your last full week, and each long run at most +10% on your longest of the last 30 days. Cut-back weeks drop about 30%.</p>
        </Card>
      </div>
    </div>;
  };

  const FuelTab = () => {
    const fp: FuelPrefs = saved?.fuel || {};
    const q = saved?.quiz;
    const wKg = profile.weightKg || 70;
    const race = saved?.target === 'base' ? q?.race || '50k' : saved?.target || '50k';
    const hours = fp.hours ?? (q ? estRaceHours(race, saved?.yards ?? q.yards, q.terrain, q.vertM, q.easyPaceSec) : 8);
    const climate: Climate = fp.climate ?? q?.climate ?? 'mild';
    const gut: GutLevel = fp.gut ?? (plan && today >= plan.weeks[Math.max(0, plan.weeks.findIndex((x) => x.phase === 'specific'))].startDate ? 'trained' : q?.gut || 'none');
    const fo = fuelPlan({ weightKg: wKg, hours, climate, gut, sweatRateL: fp.sweatRateL ?? null, salty: fp.salty, caffeineSensitive: fp.caffeineSensitive, race, lapMin: q?.lapMin });
    const setFp = (x: Partial<FuelPrefs>) => { if (profile.ultra) updateSaved({ fuel: { ...fp, ...x } }); else toast('Build a plan first to save these'); };
    const lbsOk = imp;
    const kgOf = (v: string) => (+v > 0 ? (lbsOk ? +v / 2.20462 : +v) : 0);
    const sr = sweatRate(kgOf(pre), kgOf(post), (+drank || 0) / (imp ? 33.814 : 1), (+pee || 0) / (imp ? 33.814 : 1), +mins || 0);
    const byu = race === 'byu';
    const hide = !!q?.edHistory;
    const ptH = Math.max(0.5, fp.aidEveryH ?? 1.5);
    const segs = byu ? Array.from({ length: Math.min(30, Math.max(1, Math.round(hours))) }, (_, k) => k + 1) : Array.from({ length: Math.min(16, Math.ceil(hours / ptH)) }, (_, k) => k + 1);
    const wk = plan ? plan.weeks[cw] : null;
    return <div className="ultra-grid" data-testid="ultra-fuel">
      <div className="stack">
        <Card className="wl-hero">
          <div className="kicker">Race fuelling & hydration</div>
          <h3 style={{ margin: '2px 0 10px' }}>{byu ? `${Math.round(hours)} yards (${Math.round(hours)} h)` : `~${hours} h race`} · {Math.round(wKg)} kg</h3>
          <div className="ultra-fuel-stats">
            <div className="stat accent"><div className="stat-v" data-testid="fuel-carbs">{fo.carbs[0]}–{fo.carbs[1]}<small> g</small></div><div className="stat-l">carbs / hour</div></div>
            <div className="stat"><div className="stat-v" data-testid="fuel-fluid">{fo.fluid[0]}–{fo.fluid[1]}<small> mL</small></div><div className="stat-l">fluid / hour, to thirst</div></div>
            <div className="stat"><div className="stat-v" data-testid="fuel-sodium">{fo.sodium[0]}–{fo.sodium[1]}<small> mg</small></div><div className="stat-l">sodium / hour</div></div>
            {!hide && <div className="stat"><div className="stat-v">{fo.kcal[0]}–{fo.kcal[1]}</div><div className="stat-l">kcal / hour</div></div>}
          </div>
          <p className="small" style={{ margin: '10px 0 0' }}>Every 20 min: <b>{fo.per20.carbs[0]}–{fo.per20.carbs[1]} g carbs</b> and <b>{fo.per20.fluid[0]}–{fo.per20.fluid[1]} mL</b>, plus {fo.protein[0]}–{fo.protein[1]} g protein an hour from real food as the race goes on.</p>
          {fo.notes.map((n) => <Banner key={n}>{n}</Banner>)}
          <SrcPills ids={['ultra-issn', 'ultra-costa2019', 'ultra-jeuk2014', 'ultra-hew-butler', 'ultra-hoffman-na']} />
        </Card>
        <Card>
          <h3 style={{ marginBottom: 8 }}>Adjust</h3>
          <div className="grid2">
            <label className="field"><span>{byu ? 'Target yards' : 'Expected time (h)'}</span><input inputMode="decimal" data-testid="fuel-hours" value={hours} onChange={(e) => setFp({ hours: Math.max(1, Math.min(120, +e.target.value || 1)) })} /></label>
            {!byu && <label className="field"><span>Aid every (h)</span><input inputMode="decimal" value={ptH} onChange={(e) => setFp({ aidEveryH: Math.max(0.5, +e.target.value || 1.5) })} /></label>}
          </div>
          <div className="field"><span>Weather</span><div className="chips">{(['cool', 'mild', 'hot'] as Climate[]).map((c) => <button key={c} className={`chip ${climate === c ? 'on' : ''}`} onClick={() => setFp({ climate: c })}>{c === 'hot' ? 'Hot > 25 °C' : c[0].toUpperCase() + c.slice(1)}</button>)}</div></div>
          <div className="field"><span>Gut training</span><div className="chips">{(['none', 'some', 'trained'] as GutLevel[]).map((g) => <button key={g} data-testid={`fuel-gut-${g}`} className={`chip ${gut === g ? 'on' : ''}`} onClick={() => setFp({ gut: g })}>{g === 'none' ? 'Not yet · 30–50 g/h' : g === 'some' ? 'Some · 40–60 g/h' : 'Trained · 60–90 g/h'}</button>)}</div></div>
          <label className="toggle"><span><b>Salty sweater</b><div className="muted small">White salt streaks on your cap or shirt</div></span><input type="checkbox" checked={!!fp.salty} onChange={(e) => setFp({ salty: e.target.checked })} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>
          <label className="toggle"><span><b>Caffeine doesn’t suit me</b><div className="muted small">Sensitive, anxious, heart rhythm issues, or advised to avoid it</div></span><input type="checkbox" checked={!!fp.caffeineSensitive} onChange={(e) => setFp({ caffeineSensitive: e.target.checked })} style={{ width: 22, height: 22, accentColor: '#FFE600' }} /></label>
        </Card>
        <Card>
          <h3 style={{ marginBottom: 6 }}>Sweat-rate test</h3>
          <p className="muted small" style={{ marginTop: 0 }}>Weigh yourself with no clothes on before and after a 60+ min run at race effort, in race-like weather. Note what you drank and any urine. Sweat rate = (before − after + drank − urine) ÷ hours.</p>
          <div className="grid2">
            <label className="field"><span>Before ({imp ? 'lb' : 'kg'})</span><input inputMode="decimal" data-testid="sw-pre" value={pre} onChange={(e) => setPre(e.target.value)} /></label>
            <label className="field"><span>After ({imp ? 'lb' : 'kg'})</span><input inputMode="decimal" data-testid="sw-post" value={post} onChange={(e) => setPost(e.target.value)} /></label>
            <label className="field"><span>Drank ({imp ? 'fl oz' : 'L'})</span><input inputMode="decimal" data-testid="sw-drank" value={drank} onChange={(e) => setDrank(e.target.value)} /></label>
            <label className="field"><span>Urine ({imp ? 'fl oz' : 'L'})</span><input inputMode="decimal" value={pee} onChange={(e) => setPee(e.target.value)} /></label>
            <label className="field"><span>Run length (min)</span><input inputMode="numeric" data-testid="sw-min" value={mins} onChange={(e) => setMins(e.target.value)} /></label>
          </div>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            <b data-testid="sw-result">{sr ? `${sr.toFixed(2)} L/h` : fp.sweatRateL ? `Saved: ${fp.sweatRateL.toFixed(2)} L/h` : '—'}</b>
            <button className="btn sm y" disabled={!sr} data-testid="sw-save" onClick={() => { setFp({ sweatRateL: sr }); toast('Sweat rate saved'); }}>Use it</button>
            {fp.sweatRateL && <button className="btn sm ghost" onClick={() => setFp({ sweatRateL: null })}>Clear</button>}
          </div>
          <SrcPills ids={['ultra-baker-sweat', 'acsm-fluid']} />
        </Card>
      </div>
      <div className="stack">
        <Card>
          <h3 style={{ marginBottom: 8 }}>{byu ? 'Per yard' : 'Per aid-station leg'}</h3>
          <div className="ultra-sched" data-testid="fuel-schedule">
            <div className="hd"><span>{byu ? 'Yard' : 'Leg'}</span><span>Carbs</span><span>Fluid</span><span>Sodium</span><span>Notes</span></div>
            {segs.map((k) => { const h = byu ? 1 : Math.min(ptH, hours - (k - 1) * ptH); const night = byu ? k >= 12 : (k - 1) * ptH >= 10; const caf = fo.caffeine && (byu ? k >= Math.max(fo.caffeine.startHour, 12) : (k - 1) * ptH >= fo.caffeine.startHour); return <div key={k} className={night ? 'night' : ''}><span>{byu ? <>Y{k}<small className="muted" style={{ display: 'block' }} data-testid={k === 1 ? 'fuel-yard-dist' : undefined}>{fmtByuDist(k, byuU)}</small></> : `${Math.round((k - 1) * ptH * 10) / 10}–${Math.round(Math.min(hours, k * ptH) * 10) / 10} h`}</span><span>{Math.round(fo.carbs[0] * h)}–{Math.round(fo.carbs[1] * h)} g</span><span>{Math.round((fo.fluid[0] * h) / 10) * 10}–{Math.round((fo.fluid[1] * h) / 10) * 10} mL</span><span>{Math.round((fo.sodium[0] * h) / 10) * 10}–{Math.round((fo.sodium[1] * h) / 10) * 10} mg</span><span className="muted">{k === 1 ? 'Start eating in the first 30 min' : night ? `Savoury, warm${caf ? ' · caffeine option' : ''}` : caf ? 'Caffeine option' : byu ? 'Eat on the walk-in' : 'Sweet + savoury mix'}</span></div>; })}
          </div>
          {byu && <div className="byu-head-units" style={{ marginTop: 8 }}><p className="muted small" style={{ margin: 0 }}>{YARD_EXPLAIN} of {loopDist(byuU)}. Each yard is one hour of fuel. Carry a little for the loop and eat most of it in your between-yards routine. Rows from Y12 on are shaded for the first night.</p><ByuUnitToggle /></div>}
        </Card>
        <Card>
          <h3 style={{ marginBottom: 6 }}>Caffeine</h3>
          {fo.caffeine ? <><p className="small" style={{ margin: 0 }}>Doses of <b>{fo.caffeine.perDoseMg[0]}–{fo.caffeine.perDoseMg[1]} mg</b> (1–2 mg/kg), first from about <b>hour {fo.caffeine.startHour}</b>. Stay under <b>{fo.caffeine.maxMg} mg</b> in total per 24 h (6 mg/kg). {fo.caffeine.note}</p><p className="muted small" style={{ margin: '6px 0 0' }}>Practise it in long runs first. Very high doses (around 9 mg/kg) mostly add side effects.</p></>
            : <p className="small" style={{ margin: 0 }}>No caffeine plan, since you said it doesn’t suit you. Use sleep strategy, cold water on the face and company for the low points.</p>}
          <SrcPills ids={['ultra-caffeine', 'ultra-issn']} />
        </Card>
        <Card>
          <h3 style={{ marginBottom: 6 }}>Real food that works</h3>
          <div className="ultra-foods" data-testid="ultra-foods">{REAL_FOODS.map((f) => <div key={f.name}><b>{f.name}</b><span className="muted small">{f.portion} · {f.when}</span><span className="mono">{f.carbs} g carbs · {f.sodium} mg Na</span></div>)}</div>
          <p className="muted small" style={{ margin: '8px 0 0' }}>Values from USDA FoodData Central for the portion shown. For gels and drink mixes, use the label. As the race goes on, most runners switch from sweet to savoury.</p>
          <SrcPills ids={['usda', 'ultra-issn']} />
        </Card>
        <Card>
          <h3 style={{ marginBottom: 6 }}>Sleep strategy</h3>
          <ul className="cues tight small">
            <li>The week before: bank sleep with 1–2 extra hours a night. Extra sleep before a sleepless night reduced attention lapses.</li>
            <li>{byu ? 'During: micro-naps of ~5 min on night yards, or two faster yards (e.g. 45 min) to earn a 15–20 min sleep. Set an alarm and ask your crew to wake you.' : 'During (races over 24 h): short naps of 10–20 min at an aid station beat stumbling on. Time them before the sleepiest hours (about 2–5 a.m.).'}</li>
            <li>Plan caffeine around your naps so it doesn’t keep you awake when you finally get the chance to sleep.</li>
          </ul>
          <SrcPills ids={['ultra-arnal', 'ultra-martin-sleep', 'ultra-poussel', 'ultra-milestogether']} />
        </Card>
        {plan && wk && <Card>
          <div className="card-head"><h3>Daily training fuel</h3>{!hide && <label className="row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" data-testid="ultra-apply-fuel" checked={!!saved?.applyToFuel} onChange={(e) => { updateSaved({ applyToFuel: e.target.checked }); toast(e.target.checked ? 'Fuel targets now follow your ultra plan' : 'Fuel targets back to your profile'); }} style={{ accentColor: '#FFE600', width: 18, height: 18 }} />Use in Fuel</label>}</div>
          {hide ? <p className="small" style={{ margin: 0 }}>Calorie and macro numbers are hidden because of your health answers. Plan daily fuelling with your care team or a sports dietitian. Eat regular meals and snacks, and add carbs on long-run days.</p> : <>
            <p className="muted small" style={{ marginTop: 0 }}>Carbs follow each day’s session (4 g/kg rest → 10 g/kg biggest days). Protein is 1.6–1.8 g/kg, and fat about 1 g/kg. This is week {cw + 1}:</p>
            <div className="ultra-sched day" data-testid="ultra-daily">
              <div className="hd"><span>Day</span><span>Session</span><span>Carbs</span><span>Protein</span><span>kcal</span></div>
              {wk.days.map((s) => { const t = dayTargets(wKg, s, wk.phase); return <div key={s.wd} className={s.date === today ? 'today' : ''}><span>{WEEKDAYS[s.wd]}</span><span className="muted">{KIND_ROLE[s.kind]}</span><span>{t.carbs} g <small className="muted">({t.carbGkg}/kg)</small></span><span>{t.protein} g</span><span>~{t.kcal.toLocaleString()}</span></div>; })}
            </div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>Estimates. Use your weight and hunger as a guide. {saved?.applyToFuel ? 'Your Fuel targets use these numbers (unless a weight-loss or Coach plan is applied first).' : 'Tick “Use in Fuel” to make these your daily Fuel targets.'}</p>
          </>}
          <SrcPills ids={['ultra-issn', 'acsm2016', 'issn-protein']} />
        </Card>}
        <Card className="ultra-warn-card">
          <h3 style={{ marginBottom: 6 }}>Under-fuelling (REDs) warning signs</h3>
          <p className="small" style={{ margin: 0 }}>Missed or irregular periods, low libido, frequent colds, stress fractures, constant tiredness, poor sleep, irritability, or performance that keeps dropping. If you have any of these, see a sports doctor or dietitian. Ultra blocks make under-eating easy.</p>
          <SrcPills ids={['wl-reds']} />
        </Card>
      </div>
    </div>;
  };

  const PrepTab = () => {
    const checks = saved?.checks || {};
    const all = { ...checks, ...local };
    const toggle = (id: string) => { const v = !all[id]; if (saved) updateSaved({ checks: { ...checks, [id]: v } }); else setLocal((c) => ({ ...c, [id]: v })); };
    const race = saved?.target === 'base' ? saved.quiz.race : saved?.target;
    const kind: 'road' | 'trail' | 'byu' | 'all' = race === 'byu' ? 'byu' : saved ? (saved.quiz.terrain === 'road' ? 'road' : 'trail') : 'all';
    const groups = GEAR.map((g) => ({ ...g, items: g.items.filter((it) => kind === 'all' || !it.races || it.races.includes(kind as 'road')) })).filter((g) => g.items.length);
    const Group = ({ g }: { g: CheckGroup }) => { const n = g.items.filter((i) => all[`${g.id}:${i.id}`]).length; return <Card key={g.id}><div className="card-head"><h3>{g.title}</h3><Pill tone={n === g.items.length ? 'yellow' : undefined}>{n}/{g.items.length}</Pill></div>{g.intro && <p className="muted small" style={{ marginTop: 0 }}>{g.intro}</p>}
      <div className="ultra-checks">{g.items.map((i) => <label key={i.id}><input type="checkbox" data-testid={`chk-${g.id}-${i.id}`} checked={!!all[`${g.id}:${i.id}`]} onChange={() => toggle(`${g.id}:${i.id}`)} /><span>{i.text}</span></label>)}</div><SrcPills ids={g.src} /></Card>; };
    const taper = plan ? plan.weeks.filter((w) => w.phase === 'taper') : [];
    const peak = plan ? Math.max(...plan.weeks.filter((w) => w.phase !== 'taper').map((w) => w.km)) : 0;
    const acclim = saved ? [...ACCLIM].sort((a, b) => (a.title.startsWith('Heat') && saved.quiz.climate === 'hot' ? -1 : 0) - (b.title.startsWith('Heat') && saved.quiz.climate === 'hot' ? -1 : 0) || (a.title.startsWith('Altitude') && saved.quiz.altitude ? -1 : 0) - (b.title.startsWith('Altitude') && saved.quiz.altitude ? -1 : 0)) : ACCLIM;
    return <div className="ultra-grid" data-testid="ultra-prep">
      <div className="stack">
        <Card className="ultra-warn-card" >
          <div className="card-head"><h3><Icon name="info" size={18} /> Warning signs: stop and get help</h3></div>
          <div className="ultra-warns" data-testid="ultra-warnings">{WARNINGS.map((w) => <div key={w.id}><b>{w.title}</b><span className="small"><span className="muted">Signs:</span> {w.signs}</span><span className="small"><span className="y">Do:</span> {w.act}</span><SrcPills ids={w.src} /></div>)}</div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>In an emergency, call your local emergency number (911 in the US) or find race medical. No NSAIDs (ibuprofen, naproxen) during ultras.</p>
        </Card>
        {groups.map((g) => Group({ g }))}
        <Card><h3 style={{ marginBottom: 8 }}>Crew guide</h3>{CREW.map((c) => <div key={c.title} className="ultra-note"><b>{c.title}</b><p className="small">{c.body}</p><SrcPills ids={c.src} /></div>)}</Card>
      </div>
      <div className="stack">
        <Card><h3 style={{ marginBottom: 8 }}>Heat, cold & altitude</h3>{acclim.map((c) => <div key={c.title} className="ultra-note"><b>{c.title}</b><p className="small">{c.body}</p><SrcPills ids={c.src} /></div>)}</Card>
        <Card>
          <h3 style={{ marginBottom: 6 }}>Your taper</h3>
          {taper.length ? <><p className="small" style={{ marginTop: 0 }}>{taper.length} weeks. Volume steps down from your {d(peak)} peak while short faster efforts stay in.</p>
            <div className="ultra-taper" data-testid="ultra-taper">{taper.map((w) => <div key={w.i}><span>Week {w.i + 1}</span><b>{d(w.km)}</b><span className="muted small">{Math.round((1 - w.km / peak) * 100)}% less{w.i === plan!.weeks.length - 1 ? ', plus race' : ''}</span></div>)}</div></>
            : <p className="small" style={{ marginTop: 0 }}>A 2-week taper (3 weeks for 100 mi and long backyards) cuts volume by about 41–60% while keeping some intensity. Build a plan to see yours.</p>}
          <SrcPills ids={['ultra-bosquet', 'ultra-uphill', 'ultra-mujika']} />
        </Card>
        <Card><div className="card-head"><h3>Race-week checklist</h3><Pill>{RACE_WEEK.filter((i) => all[`rw:${i.id}`]).length}/{RACE_WEEK.length}</Pill></div>
          <div className="ultra-checks">{RACE_WEEK.map((i) => <label key={i.id}><input type="checkbox" checked={!!all[`rw:${i.id}`]} onChange={() => toggle(`rw:${i.id}`)} /><span>{i.text}</span></label>)}</div><SrcPills ids={RACE_WEEK_SRC} /></Card>
        <Card><h3 style={{ marginBottom: 8 }}>Race-day plan</h3>{raceDayPlan(race || '50k', saved?.quiz.lapMin || 50).map((c) => <div key={c.title} className="ultra-note"><b>{c.title}</b><p className="small">{c.body}</p><SrcPills ids={c.src} /></div>)}</Card>
        <Card><h3 style={{ marginBottom: 8 }}>After the race: recovery & return to run</h3>{RECOVERY.map((c) => <div key={c.title} className="ultra-note"><b>{c.title}</b><p className="small">{c.body}</p><SrcPills ids={c.src} /></div>)}</Card>
      </div>
    </div>;
  };

  const ResearchTab = () => <div className="stack" data-testid="ultra-research">
    <Card><h3>What the research says</h3><p className="muted small" style={{ margin: 0 }}>Short, honest summaries of the position stands, consensus statements, studies and coaching sources behind this section, including where evidence is thin. Tap a source to read it. Backyard ultras have very little research so far, so some advice comes from coaches and race organisers and is labelled that way.</p></Card>
    <div className="ultra-research">{ULTRA_RESEARCH.map((r) => <Card key={r.title}><h3 style={{ marginBottom: 6 }}>{r.title}</h3><p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{r.body}</p><SrcPills ids={r.src} /></Card>)}</div>
    <Card><h3>All sources ({ULTRA_SOURCE_IDS.length})</h3><ol className="wl-src" data-testid="ultra-sources">{ULTRA_SOURCE_IDS.map((id) => { const s = sourceById(id); return s ? <li key={id}><a href={s.url} target="_blank" rel="noopener">{s.cite}</a><div className="muted small">{s.used}</div></li> : null; })}</ol></Card>
    <Disclaimer />
  </div>;

  if (!can('ultra.plan')) return null;
  return <Page title="Ultra & Backyard" kicker={plan ? `Train · ${plan.spec.name}` : 'Train · Backyard · 50K → 100 mi'} back="/train" wide actions={plan ? <Link className="btn sm ghost" to="/train/ultra/setup">Edit</Link> : undefined}>
    <div className="wl-tabs"><Segmented value={tab} options={TABS} onChange={setTab} small /></div>
    {tab === 'plan' && PlanTab()}
    {tab === 'weeks' && WeeksTab()}
    {tab === 'fuel' && FuelTab()}
    {tab === 'prep' && PrepTab()}
    {tab === 'research' && ResearchTab()}
    {SessionSheet()}
  </Page>;
}

