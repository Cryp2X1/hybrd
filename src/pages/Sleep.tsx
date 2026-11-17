import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { useNow } from '../lib/useNow';
import { addDays, prettyDay, todayKey } from '../lib/calc';
import {
  BAND_TEXT, DRINKS, EFSA_BEDTIME_MG, FLAG_LABEL, GOALS, GRADES, GRADE_HINT, GRADE_LABEL, H, REASON_TEXT, SAFE_MG, SUPP_IDS, band, bedtimeMs, buildPlan, caffeineAt, compareFlag,
  defaultQuiz, dosesFor, halfLife, hoursBetween, lateCaffeine, latestFor, quizHalfLife, stats, suppStatus, trend, validLog,
  type CaffeineLog, type Flag, type Grade, type Sensitivity, type SleepLog,
} from '../lib/sleep';
import { EVIDENCE, EV_CATS, SLEEP_SOURCE_IDS, TIPS, evidenceForSupp, type EvCat } from '../data/sleepContent';
import { SLEEP_RECIPES } from '../data/recipes';
import { sourceById } from '../data/sources';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Segmented, Pill } from '../components/ui';
import { SrcPills } from '../components/SrcPills';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

type Tab = 'plan' | 'caffeine' | 'log' | 'foods' | 'evidence';
const TABS: { v: Tab; label: string }[] = [{ v: 'plan', label: 'Plan' }, { v: 'caffeine', label: 'Caffeine' }, { v: 'log', label: 'Log' }, { v: 'foods', label: 'Foods & drinks' }, { v: 'evidence', label: 'Evidence' }];
const hm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const clockNow = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const SUPP_NAME: Record<string, string> = { melatonin: 'Melatonin', magnesium: 'Magnesium', glycine: 'Glycine', theanine: 'L-theanine', ashwagandha: 'Ashwagandha', valerian: 'Valerian' };
const ST_LABEL = { ok: 'No safety flag', doctor: 'Ask your doctor', avoid: 'Avoid' } as const;

export const GradeTag = ({ g }: { g: Grade }) => <span className={`sl-grade ${g}`} title={GRADE_HINT[g]}><i aria-hidden="true" />{GRADE_LABEL[g]}</span>;
const CbtiBanner = () => <Banner tone="info">Not medical advice. Food and drink can nudge sleep a little. If you have trouble sleeping on most nights for 3 months or more, see a clinician — <b>CBT for insomnia (CBT-I)</b> is the first-line treatment, ahead of pills or supplements. <SrcPills ids={['sleep-aasm-cbti', 'sleep-acp']} /></Banner>;

export default function Sleep() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'plan';
  const setTab = (v: Tab) => setSp(v === 'plan' ? {} : { tab: v });
  const { data, profile, upsert, remove } = useStore();
  const toast = useToast();
  const plan = profile.sleep || null;
  const quiz = plan?.quiz || defaultQuiz(profile);
  const p = useMemo(() => (plan ? buildPlan(plan.quiz) : null), [plan]);
  const now = useNow(60_000, tab === 'caffeine' || tab === 'plan');
  const today = todayKey();

  // ---------------- Plan ----------------
  const Landing = () => <div className="stack" data-testid="sleep-landing">
    <Card className="wl-hero">
      <div className="kicker">Fuel · Sleep</div>
      <h2 className="fast-h">Eat and drink for better sleep</h2>
      <p className="muted" style={{ marginTop: 0 }}>A quick safety check, then an evening timeline built around your bedtime and training: caffeine cutoff, last big meal, bedtime snack, fluids and a drink — each step linked to the research behind it.</p>
      <ul className="cues">
        <li>Caffeine tracker that estimates what’s left in your system at bedtime.</li>
        <li>19 evening dinners, bedtime snacks and drinks with USDA macros.</li>
        <li>A sleep & fuel log with streaks and your own patterns.</li>
        <li>Every claim graded strong, moderate, limited or weak — including what doesn’t work.</li>
      </ul>
      <div className="row wrap" style={{ marginTop: 12 }}><Link className="btn y" to="/fuel/sleep/setup" data-testid="sleep-start">Build my evening plan · 2 min</Link><button className="btn ghost" onClick={() => setTab('evidence')}>See the evidence</button></div>
    </Card>
    <Card>
      <h3 style={{ marginBottom: 8 }}>The big three (strongest evidence)</h3>
      <ul className="cues">
        <li><b>Caffeine:</b> coffee at least 8.8 h before bed; a pre-workout at least 13.2 h. <GradeTag g="strong" /></li>
        <li><b>Alcohol:</b> even ~2 drinks cut REM sleep. <GradeTag g="strong" /></li>
        <li><b>Big late meals:</b> finish 3 h+ before bed, especially with reflux. <GradeTag g="moderate" /></li>
      </ul>
      <SrcPills ids={['sleep-gardiner-caffeine', 'sleep-gardiner-alcohol', 'sleep-fujiwara', 'sleep-acg-gerd']} />
    </Card>
    <CbtiBanner />
  </div>;

  const PlanTab = () => {
    if (!plan || !p) return Landing();
    const supps = SUPP_IDS.map((id) => ({ id, ...suppStatus(id, plan.quiz) }));
    const suggested = new Set(p.supps.map((s) => s.id));
    return <div className="sl-grid" data-testid="sleep-plan">
      <div className="stack">
        <Card className="wl-hero">
          <div className="card-head"><div><div className="kicker">Tonight · {GOALS.find((g) => g.v === plan.quiz.goal)?.label}</div><h3>Your evening timeline</h3></div><span className="muted small">{p.sleepH.toFixed(1)} h in bed</span></div>
          <ol className="sl-tl" data-testid="sleep-timeline">
            {p.items.map((i) => <li key={i.id} className={`${i.kind} ${i.warn ? 'warn' : ''}`}>
              <span className="t">{i.clock}</span><span className="dot" aria-hidden="true" />
              <div><b>{i.title}{i.practical && <> <Pill tone="dim">HYBRD default</Pill></>}</b><p>{i.detail}</p>
                {i.recipe && <Link className="rl" to={`/fuel/recipe/${i.recipe}`}>{SLEEP_RECIPES.find((r) => r.id === i.recipe)?.name || 'Recipe'} →</Link>}
                <SrcPills ids={i.src} /></div>
            </li>)}
          </ol>
        </Card>
        {p.notes.map((n) => <Banner key={n.text} tone={n.tone === 'warn' ? 'warn' : 'info'}>{n.text} <SrcPills ids={n.src} /></Banner>)}
      </div>
      <div className="stack">
        <Card>
          <div className="grid2">
            <div className="stat accent"><div className="stat-v">{p.noCaffeine ? 'Skip' : p.cutoffClock || '—'}</div><div className="stat-l">last caffeine</div></div>
            <div className="stat"><div className="stat-v">{p.hl}<small> h</small></div><div className="stat-l">caffeine half-life (est.)</div></div>
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setTab('caffeine')}><Icon name="timer" size={16} />Track today’s caffeine</button>
        </Card>
        <Card>
          <h3 style={{ marginBottom: 4 }}>Supplements</h3>
          <p className="muted small" style={{ margin: '0 0 8px' }}>Food first. {plan.level === 'minor' ? 'Under 18: no supplements.' : plan.quiz.supplements ? 'Your safety check for each one:' : 'You chose not to see supplement options — here’s your safety check anyway.'}</p>
          {plan.level !== 'minor' && supps.map((s) => <div key={s.id} className="sl-supp" data-testid={`supp-${s.id}`}>
            <div style={{ minWidth: 0 }}><b>{SUPP_NAME[s.id]}</b> <GradeTag g={evidenceForSupp(s.id).grade} />
              <div className="muted small">{s.status === 'ok' ? (suggested.has(s.id) ? p.supps.find((x) => x.id === s.id)!.why : evidenceForSupp(s.id).verdict) : REASON_TEXT[s.why[0]].split('. ')[0] + '.'}</div></div>
            <span className={`sl-st ${s.status}`}>{s.status === 'ok' && suggested.has(s.id) ? 'Option' : ST_LABEL[s.status]}</span>
          </div>)}
          {plan.level === 'minor' && <p className="small" style={{ margin: 0 }}>{REASON_TEXT.under18}</p>}
          <p className="muted small" style={{ margin: '10px 0 0' }}>US: supplements aren’t FDA-approved before sale and labels can be off (melatonin gummies measured 74–347% of the label). Drug-tested? Use third-party batch-tested products only. <button className="link" onClick={() => setTab('evidence')}>Doses & safety</button></p>
          <SrcPills ids={['sleep-fda-supps', 'sleep-cohen-gummies', 'sleep-ioc-supps']} />
        </Card>
        <Card>
          <h3 style={{ marginBottom: 8 }}>Keep in mind</h3>
          <ul className="cues">{TIPS.map((t) => <li key={t.text}>{t.text}</li>)}</ul>
          <SrcPills ids={Array.from(new Set(TIPS.flatMap((t) => t.src)))} />
        </Card>
        <CbtiBanner />
      </div>
    </div>;
  };

  // ---------------- Caffeine ----------------
  const [sens, setSens] = useState<Sensitivity>('unknown');
  const [cTime, setCTime] = useState(clockNow());
  const [custom, setCustom] = useState('');
  const CaffeineTab = () => {
    const hl = plan ? quizHalfLife(quiz) : halfLife({ sensitivity: sens });
    const bed = bedtimeMs(today, quiz.bed, quiz.wake);
    const logs = data.caffeine.filter((l) => !l.deleted && l.date === today).sort((a, b) => a.at - b.at);
    const doses = dosesFor(data.caffeine, today);
    const atBed = caffeineAt(doses, bed, hl);
    const nowMg = caffeineAt(doses, now, hl);
    const b = band(atBed);
    const total = logs.reduce((a, l) => a + l.mg, 0);
    const coffee = latestFor(95, doses, bed, hl);
    const tea = latestFor(47, doses, bed, hl);
    const at = (() => { const [h, m] = (cTime || clockNow()).split(':').map(Number); const d = new Date(today + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); })();
    const add = (mg: number, drink: string, label: string) => {
      if (!can('sleep.caffeine') || !(mg > 0) || mg > 1000) return;
      upsert<CaffeineLog>('caffeine', { id: uid(), date: today, at, mg, drink, label });
      toast(`Added ${label} · ${Math.round(mg)} mg`);
    };
    // curve from the first dose (or 6 h before now) to bedtime
    const start = Math.min(logs[0]?.at ?? now - 6 * H, now - H);
    const end = Math.max(bed, now + H);
    const N = 60, W = 320, Hh = 110, max = Math.max(150, ...Array.from({ length: N + 1 }, (_, i) => caffeineAt(doses, start + ((end - start) * i) / N, hl)));
    const xy = (t: number, mg: number) => `${((t - start) / (end - start)) * W},${Hh - (mg / max) * (Hh - 6)}`;
    const path = Array.from({ length: N + 1 }, (_, i) => { const t = start + ((end - start) * i) / N; return xy(t, caffeineAt(doses, t, hl)); }).join(' ');
    return <div className="sl-grid" data-testid="sleep-caffeine">
      <div className="stack">
        <Card className="wl-hero">
          <div className="kicker">Estimated caffeine left at bedtime ({quiz.bed})</div>
          <div className={`sl-caf ${b}`} data-testid="caf-bed"><div className="big">{Math.round(atBed)}<small>mg</small></div></div>
          <div className="sl-meter" role="img" aria-label={`About ${Math.round(atBed)} mg at bedtime`}><i style={{ left: `${Math.min(100, (atBed / 150) * 100)}%` }} /></div>
          <div className="sl-meter-l"><span>0</span><span>{Math.round(SAFE_MG)}</span><span>{EFSA_BEDTIME_MG}</span><span>150+ mg</span></div>
          <p className="small" style={{ margin: '10px 0 0' }}>{BAND_TEXT[b]}</p>
          <svg className="sl-curve" viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" role="img" aria-label="Caffeine over the day (estimate)">
            <line x1="0" x2={W} y1={Hh - (SAFE_MG / max) * (Hh - 6)} y2={Hh - (SAFE_MG / max) * (Hh - 6)} stroke="rgba(74,222,128,.6)" strokeDasharray="4 4" />
            <polyline points={path} fill="none" stroke="#FFE600" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
            <line x1={((now - start) / (end - start)) * W} x2={((now - start) / (end - start)) * W} y1="0" y2={Hh} stroke="rgba(255,255,255,.5)" />
            <line x1={((bed - start) / (end - start)) * W} x2={((bed - start) / (end - start)) * W} y1="0" y2={Hh} stroke="#a78bfa" strokeDasharray="3 3" />
          </svg>
          <div className="sl-meter-l"><span>{hm(start)}</span><span>now {Math.round(nowMg)} mg</span><span>bed {quiz.bed}</span></div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Estimate only: assumes a {hl} h half-life{plan ? ' from your plan' : ''} and instant absorption. Real levels vary a lot between people (1.5–9.5 h half-life). The green line is what one coffee leaves after the 8.8 h research cutoff.</p>
          <SrcPills ids={['sleep-iom-caffeine', 'sleep-gardiner-caffeine', 'sleep-efsa-caffeine']} />
        </Card>
        <Card>
          <div className="grid3">
            <div className="stat"><div className="stat-v">{Math.round(total)}<small> mg</small></div><div className="stat-l">today</div></div>
            <div className="stat"><div className="stat-v">{coffee === null ? 'none' : coffee >= bed ? 'any' : hm(coffee)}</div><div className="stat-l">latest coffee</div></div>
            <div className="stat"><div className="stat-v">{tea === null ? 'none' : tea >= bed ? 'any' : hm(tea)}</div><div className="stat-l">latest black tea</div></div>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>“Latest” keeps you at or under ~{Math.round(SAFE_MG)} mg at bedtime, counting what you’ve already had. Daily ceiling for healthy adults: 400 mg (200 mg if pregnant).{total > 400 ? ' You’re over 400 mg today.' : ''}</p>
          {total > 400 && <Banner tone="warn">That’s more than the 400 mg/day EFSA and FDA consider safe for most healthy adults.</Banner>}
        </Card>
      </div>
      <div className="stack">
        <Card>
          <div className="card-head"><h3>Add a drink</h3><label className="field" style={{ margin: 0, width: 120 }}><span className="sr-only">Time</span><input type="time" aria-label="Time you had it" data-testid="caf-time" value={cTime} onChange={(e) => setCTime(e.target.value)} /></label></div>
          <div className="sl-drinks">{DRINKS.map((d) => <button key={d.id} data-testid={`caf-add-${d.id}`} onClick={() => add(d.mg, d.id, d.label)}><b>{d.label}</b><span>~{d.mg} mg · {d.serving.split(' (')[0]}</span></button>)}</div>
          <div className="row" style={{ marginTop: 10 }}><input inputMode="numeric" placeholder="Custom mg (check the label)" aria-label="Custom caffeine in mg" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} style={{ flex: 1 }} /><button className="btn sm y" disabled={!custom} onClick={() => { add(+custom, 'custom', 'Custom'); setCustom(''); }}>Add</button></div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Amounts are typical values from USDA FoodData Central; the pre-workout is the serve used in the caffeine meta-analysis. Cafés and brands vary — use the label when you have it. Decaf still has ~2–15 mg.</p>
          <SrcPills ids={['sleep-usda-fdc', 'sleep-fda-caffeine']} />
        </Card>
        {!plan && <Card><h3 style={{ marginBottom: 8 }}>How does caffeine affect you?</h3><Segmented small value={sens} onChange={setSens} options={[{ v: 'fast', label: 'Barely' }, { v: 'unknown', label: 'Average' }, { v: 'slow', label: 'Very sensitive' }]} /><p className="muted small" style={{ margin: '10px 0 0' }}>Half-life {hl} h. <Link className="link" to="/fuel/sleep/setup">Build your plan</Link> to set your bedtime and personal factors (smoking, contraceptives, pregnancy).</p></Card>}
        <Card>
          <div className="card-head"><h3>Today</h3><span className="muted small">{logs.length} drink{logs.length === 1 ? '' : 's'}</span></div>
          {!logs.length && <p className="muted small" style={{ margin: 0 }}>Nothing logged yet today.</p>}
          {logs.map((l) => <div key={l.id} className="food-row"><div className="fr-main"><div className="fr-name">{l.label}</div><div className="fr-sub">{hm(l.at)} · ≈ {Math.round(l.mg * Math.pow(0.5, (bed - l.at) / (hl * H)))} mg left at bed</div></div><span className="fr-k">{Math.round(l.mg)}</span><button className="icon-btn" aria-label={`Delete ${l.label}`} onClick={() => remove('caffeine', l.id)}><Icon name="trash" size={16} /></button></div>)}
        </Card>
      </div>
    </div>;
  };

  // ---------------- Log ----------------
  const [form, setForm] = useState<Partial<SleepLog> | null>(null);
  const LogTab = () => {
    const s = stats(data.sleeps, today);
    const tr = trend(data.sleeps, today, 14);
    const entries = data.sleeps.filter((l) => !l.deleted).sort((a, b) => b.date.localeCompare(a.date));
    const f: Partial<SleepLog> = form || (() => {
      const ex = entries.find((e) => e.date === today);
      if (ex) return ex;
      const bed = quiz.bed, wake = quiz.wake;
      return { date: today, bed, wake, hours: +hoursBetween(bed, wake).toFixed(1), quality: 3, caffeineLate: lateCaffeine(data.caffeine, addDays(today, -1), bed, wake, quizHalfLife(quiz)), alcohol: false, lateMeal: false };
    })();
    const set = (x: Partial<SleepLog>) => setForm({ ...f, ...x, ...(x.bed || x.wake ? { hours: +hoursBetween(x.bed || f.bed || '23:00', x.wake || f.wake || '07:00').toFixed(1) } : {}) });
    const save = () => {
      if (!can('sleep.log') || !validLog(f)) return;
      upsert<SleepLog>('sleeps', { ...(f as SleepLog), id: f.id || `night-${f.date}` });
      setForm(null); toast('Night logged');
    };
    const comps = (['caffeineLate', 'alcohol', 'lateMeal'] as Flag[]).map((k) => ({ k, c: compareFlag(data.sleeps, k) })).filter((x) => x.c);
    return <div className="sl-grid" data-testid="sleep-log">
      <div className="stack">
        <Card>
          <div className="card-head"><h3>Log a night</h3><span className="muted small">Woke {f.date === today ? 'today' : prettyDay(f.date!)}</span></div>
          <label className="field"><span>Woke on</span><input type="date" value={f.date} max={today} onChange={(e) => set({ date: e.target.value || today, id: undefined })} /></label>
          <div className="grid2">
            <label className="field"><span>Bed</span><input type="time" value={f.bed || ''} onChange={(e) => set({ bed: e.target.value || '23:00' })} /></label>
            <label className="field"><span>Up</span><input type="time" value={f.wake || ''} onChange={(e) => set({ wake: e.target.value || '07:00' })} /></label>
          </div>
          <label className="field"><span>Hours asleep (edit if you were awake a while)</span><input inputMode="decimal" data-testid="log-hours" value={f.hours ?? ''} onChange={(e) => setForm({ ...f, hours: Math.min(16, Math.max(0, +e.target.value || 0)) })} /></label>
          <div className="field"><span>Sleep quality</span><div className="sl-q" role="radiogroup" aria-label="Sleep quality 1 to 5">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={f.quality === n} aria-label={`${n} of 5`} className={f.quality === n ? 'on' : ''} onClick={() => setForm({ ...f, quality: n as SleepLog['quality'] })}>{n}</button>)}</div><div className="muted small" style={{ display: 'flex', justifyContent: 'space-between' }}><span>Awful</span><span>Great</span></div></div>
          <div className="field"><span>Yesterday evening</span><div className="sl-flags">{(['caffeineLate', 'alcohol', 'lateMeal'] as Flag[]).map((k) => <button key={k} className={`chip ${f[k] ? 'on' : ''}`} aria-pressed={!!f[k]} onClick={() => setForm({ ...f, [k]: !f[k] })}>{FLAG_LABEL[k]}</button>)}<button className={`chip ${f.trainedLate ? 'on' : ''}`} aria-pressed={!!f.trainedLate} onClick={() => setForm({ ...f, trainedLate: !f.trainedLate })}>Trained late</button></div></div>
          <label className="field"><span>Bedtime snack or drink (optional)</span><select value={f.snack || ''} onChange={(e) => setForm({ ...f, snack: e.target.value || undefined })}><option value="">None</option>{SLEEP_RECIPES.filter((r) => r.kind !== 'dinner').map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}<option value="Other">Other</option></select></label>
          <button className="btn y block" data-testid="log-save" disabled={!validLog(f)} onClick={save}>{entries.some((e) => e.date === f.date) ? 'Update night' : 'Save night'}</button>
          <p className="muted small" style={{ margin: '8px 0 0' }}>Saved on this device; synced to your account when you’re signed in. “Late caffeine” is pre-ticked when your logged caffeine left more than ~{Math.round(SAFE_MG)} mg at bedtime.</p>
        </Card>
        {comps.length > 0 && <Card>
          <h3 style={{ marginBottom: 8 }}>Your patterns</h3>
          {comps.map(({ k, c }) => <p key={k} className="small" style={{ margin: '0 0 8px' }}><b>{FLAG_LABEL[k]}:</b> quality {c!.withQ.toFixed(1)} vs {c!.withoutQ.toFixed(1)}, {c!.withH.toFixed(1)} h vs {c!.withoutH.toFixed(1)} h ({c!.nWith} vs {c!.nWithout} nights).</p>)}
          <p className="muted small" style={{ margin: 0 }}>From your own log only — a pattern, not proof. Shown once you have 3+ nights on each side.</p>
        </Card>}
      </div>
      <div className="stack">
        <Card>
          <div className="grid2">
            <div className="stat accent"><div className="stat-v">{s.n7 ? s.avgHours7.toFixed(1) : '–'}<small> h</small></div><div className="stat-l">avg sleep, 7 nights</div></div>
            <div className="stat"><div className="stat-v">{s.n7 ? s.avgQuality7.toFixed(1) : '–'}<small> /5</small></div><div className="stat-l">avg quality</div></div>
            <div className="stat"><div className="stat-v">{s.nights7plus}<small>/{s.n7}</small></div><div className="stat-l">nights 7 h+</div></div>
            <div className="stat"><div className="stat-v">{s.logStreak}</div><div className="stat-l">logging streak</div></div>
            <div className="stat"><div className="stat-v">{s.goodStreak}</div><div className="stat-l">7 h+ streak</div></div>
            <div className="stat"><div className="stat-v">{s.bestGood}</div><div className="stat-l">best 7 h+ streak</div></div>
          </div>
        </Card>
        <Card>
          <div className="card-head"><h3>Last 14 nights</h3><span className="muted small">dashed line = 7 h</span></div>
          <div className="sl-trend" data-testid="sleep-trend">{tr.map((d) => <div key={d.day} className="c" title={`${prettyDay(d.day)}: ${d.hours ?? '—'} h`}>
            <div className="bar"><em style={{ bottom: `${(7 / 10) * 100}%` }} />{d.hours !== null && <div className={d.hours >= 7 ? 'ok' : ''} style={{ height: `${Math.min(100, (d.hours / 10) * 100)}%` }} />}</div>
            <span>{d.quality ?? '·'}</span><span>{new Date(d.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>)}</div>
          <p className="muted small" style={{ margin: '8px 0 0' }}>Numbers under the bars are quality (1–5). Adults need 7+ h; teens 8–10 h.</p>
          <SrcPills ids={['sleep-watson', 'sleep-nsf']} />
        </Card>
        <Card>
          <div className="card-head"><h3>Nights</h3><span className="muted small">{entries.length}</span></div>
          {!entries.length && <p className="muted small" style={{ margin: 0 }}>No nights logged yet.</p>}
          {entries.slice(0, 30).map((l) => <div key={l.id} className="food-row">
            <div className={`fast-dot ${l.hours >= 7 ? 'met' : ''}`}>{l.hours >= 7 ? <Icon name="check" size={14} /> : null}</div>
            <div className="fr-main"><div className="fr-name">{l.hours} h · quality {l.quality}/5</div><div className="fr-sub">{prettyDay(l.date)}{l.caffeineLate ? ' · late caffeine' : ''}{l.alcohol ? ' · alcohol' : ''}{l.lateMeal ? ' · late meal' : ''}{l.snack ? ` · ${l.snack}` : ''}</div></div>
            <button className="icon-btn" aria-label="Edit night" onClick={() => setForm(l)}><Icon name="edit" size={16} /></button>
            <button className="icon-btn" aria-label="Delete night" onClick={() => { remove('sleeps', l.id); toast('Night deleted'); }}><Icon name="trash" size={16} /></button>
          </div>)}
        </Card>
      </div>
    </div>;
  };

  // ---------------- Foods & drinks ----------------
  const [kind, setKind] = useState<'all' | 'dinner' | 'snack' | 'drink'>('all');
  const [tagF, setTagF] = useState<string>('');
  const FoodsTab = () => {
    const TAGS = ['vegetarian', 'vegan', 'dairy-free', 'gluten-free', 'high-protein', 'recovery', 'light', 'fall-asleep'];
    const list = SLEEP_RECIPES.filter((r) => (kind === 'all' || r.kind === kind) && (!tagF || r.tags.includes(tagF)));
    return <div className="stack" data-testid="sleep-foods">
      <Segmented small value={kind} onChange={setKind} options={[{ v: 'all', label: 'All' }, { v: 'dinner', label: 'Dinners' }, { v: 'snack', label: 'Bedtime snacks' }, { v: 'drink', label: 'Drinks' }]} />
      <div className="chips">{TAGS.map((t) => <button key={t} className={`chip ${tagF === t ? 'on' : ''}`} aria-pressed={tagF === t} onClick={() => setTagF(tagF === t ? '' : t)}>{t}</button>)}</div>
      <div className="tile-grid">
        {list.map((r) => <Link key={r.id} to={`/fuel/recipe/${r.id}`} className="tile">
          <div className="kicker">{r.kind === 'dinner' ? 'Evening dinner' : r.kind === 'snack' ? 'Bedtime snack' : 'Evening drink'} · {r.timing}</div>
          <h3>{r.name}</h3>
          <div className="grid4" style={{ gap: 6 }}>{([['kcal', r.perServing.kcal], ['P', r.perServing.protein], ['C', r.perServing.carbs], ['F', r.perServing.fat]] as const).map(([l, v]) => <div key={l} className="center"><div className="mono" style={{ fontWeight: 700 }}>{Math.round(v)}</div><div className="muted small">{l}</div></div>)}</div>
          <div className="meta">{r.grade && <GradeTag g={r.grade} />}{r.tags.slice(0, 2).map((x) => <Pill key={x}>{x}</Pill>)}</div>
        </Link>)}
        {!list.length && <p className="muted small">Nothing matches — try another filter.</p>}
      </div>
      <p className="muted small">Macros per serving from USDA FoodData Central (SR Legacy) for the listed ingredients. The grade is for the sleep evidence behind the star ingredient, not the whole recipe.</p>
    </div>;
  };

  // ---------------- Evidence ----------------
  const [cat, setCat] = useState<EvCat>('food');
  const EvidenceTab = () => <div className="stack" data-testid="sleep-evidence">
    <Card>
      <h3 style={{ marginBottom: 6 }}>How we grade</h3>
      <div className="row wrap" style={{ gap: 8 }}>{GRADES.map((g) => <GradeTag key={g} g={g} />)}</div>
      <ul className="cues" style={{ marginTop: 10 }}>{GRADES.map((g) => <li key={g}><b>{GRADE_LABEL[g]}:</b> {GRADE_HINT[g]}</li>)}</ul>
    </Card>
    <Segmented small value={cat} onChange={setCat} options={EV_CATS} />
    {cat === 'supplement' && <Banner tone="warn">Food first. Supplements are optional, not needed for good sleep, and HYBRD never auto-recommends them. Check with your doctor or pharmacist — especially if you take medicines, are pregnant or breastfeeding, or are under 18.</Banner>}
    <div className="sl-ev">
      {EVIDENCE.filter((e) => e.cat === cat).map((e) => { const st = e.supp && plan ? suppStatus(e.supp, plan.quiz) : null; return <Card key={e.id}>
        <GradeTag g={e.grade} />
        <h3>{e.title}</h3>
        <p className="verdict">{e.verdict}</p>
        <p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{e.detail}</p>
        {e.howTo && <p className="small" style={{ margin: '8px 0 0' }}><b>How:</b> {e.howTo}</p>}
        {e.dose && <p className="small" style={{ margin: '8px 0 0' }}><b>Studied dose:</b> {e.dose}</p>}
        {e.safety && <p className="small" style={{ margin: '8px 0 0' }}><b>Safety:</b> {e.safety}</p>}
        {e.us && <p className="muted small" style={{ margin: '8px 0 0' }}>{e.us}</p>}
        {st && <div className="supp-st"><span className={`sl-st ${st.status}`}>For you: {ST_LABEL[st.status]}</span>{st.why.length > 0 && <span className="muted small"> — {st.why.map((w) => w === 'under18' ? 'under 18' : w.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ')}</span>}</div>}
        {e.recipes && <div className="tag-row" style={{ marginTop: 8 }}>{e.recipes.map((r) => <Link key={r} className="pill" to={`/fuel/recipe/${r}`}>{SLEEP_RECIPES.find((x) => x.id === r)?.name}</Link>)}</div>}
        <SrcPills ids={e.src} />
      </Card>; })}
    </div>
    <Card><h3>All sources ({SLEEP_SOURCE_IDS.length})</h3><ol className="wl-src" data-testid="sleep-sources">{SLEEP_SOURCE_IDS.map((id) => { const s = sourceById(id); return s ? <li key={id}><a href={s.url} target="_blank" rel="noopener">{s.cite}</a></li> : null; })}</ol></Card>
    <CbtiBanner />
  </div>;

  return <Page title="Sleep" kicker={plan ? `Fuel · Bed ${plan.quiz.bed} · Up ${plan.quiz.wake}` : 'Fuel · Evening plan · Caffeine · Log'} back="/fuel" wide actions={plan ? <Link className="btn sm ghost" to="/fuel/sleep/setup">Edit</Link> : undefined}>
    <div className="wl-tabs"><Segmented value={tab} options={TABS} onChange={setTab} small /></div>
    <div className="sl-root">
      {tab === 'plan' && PlanTab()}
      {tab === 'caffeine' && CaffeineTab()}
      {tab === 'log' && LogTab()}
      {tab === 'foods' && FoodsTab()}
      {tab === 'evidence' && EvidenceTab()}
    </div>
  </Page>;
}
