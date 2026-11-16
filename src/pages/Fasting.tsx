import { useMemo, useState } from 'react';
import { useNow } from '../lib/useNow';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore, uid } from '../lib/store';
import { computeTargets, dayTotals, prettyDay, todayKey } from '../lib/calc';
import { fuelTargets } from '../lib/fuelTargets';
import {
  PROTOCOLS, STAGES, LEVEL_LABEL, EVIDENCE_LABEL, MAX_FAST_H, H, activeFast, allowedProtocols, bestDayStreak, dayOf, dayStreak, defaultLowDays, eatingWindow,
  fastHours, fmtClock, fmtDur, goalAt, lowCalTarget, metTarget, placeWindow, progress, protocolById, proteinPlan, recommend, remainingMs, stageAt, startFromClock,
  stats, toHM, validStart, weekStreak, weekView, weekdayIdx, type FastLog, type Level, type ProtocolId,
} from '../lib/fasting';
import { FAST_RESEARCH, FAST_TIPS, FAST_SOURCE_IDS } from '../data/fastingContent';
import { sourceById } from '../data/sources';
import { can } from '../lib/entitlements';
import { Page, Card, Banner, Disclaimer, Segmented, Sheet, Pill } from '../components/ui';
import { ScoreRing } from '../components/charts';
import { SrcPills } from '../components/SrcPills';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';

type Tab = 'timer' | 'plans' | 'history' | 'tips' | 'research';
const TABS: { v: Tab; label: string }[] = [{ v: 'timer', label: 'Timer' }, { v: 'plans', label: 'Protocols' }, { v: 'history', label: 'History' }, { v: 'tips', label: 'Tips' }, { v: 'research', label: 'Research' }];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hm = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (ms: number) => { const k = dayOf(ms); const t = todayKey(); return k === t ? 'today' : k === dayOf(Date.now() - 86400000) ? 'yesterday' : prettyDay(k); };

export default function Fasting() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'timer';
  const setTab = (v: Tab) => setSp(v === 'timer' ? {} : { tab: v });
  const { data, profile, upsert, remove, setProfile } = useStore();
  const toast = useToast();
  const plan = profile.fasting && profile.fasting.level !== 'stop' ? profile.fasting : null;
  const proto = protocolById(plan?.protocol);
  const logs = data.fasts;
  const active = activeFast(logs);
  const now = useNow(1000, tab === 'timer' || !!active);
  const today = todayKey();
  const allowed = useMemo(() => (plan ? allowedProtocols(plan.quiz) : []), [plan]);
  const maxH = Math.min(MAX_FAST_H, Math.max(12, ...allowed.map((id) => protocolById(id)!.fastH).filter((h) => h < 24 || allowed.includes('once24'))));
  const [targetH, setTargetH] = useState<number | null>(null);
  const tgt = Math.min(maxH, targetH ?? (proto && proto.kind === 'daily' ? proto.fastH : proto?.kind === 'weekly' ? 24 : 16));
  const [editStart, setEditStart] = useState<{ time: string; daysAgo: number; err?: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [lvl, setLvl] = useState<'all' | Level>('all');
  const t = fuelTargets(profile, data, today);
  const lastEnded = logs.filter((l) => !l.deleted && l.kind === 'timed' && l.end).sort((a, b) => b.end! - a.end!)[0];

  const start = () => {
    if (!can('fasting.timer') || active) return;
    const n = Date.now();
    upsert<FastLog>('fasts', { id: uid(), date: dayOf(n), kind: 'timed', start: n, targetH: tgt, protocol: proto && proto.kind === 'daily' && tgt === proto.fastH ? proto.id : proto?.kind === 'weekly' && tgt === 24 ? proto.id : 'custom' });
    toast(`Fast started · goal ${tgt} h`);
  };
  const end = () => { if (!active) return; upsert<FastLog>('fasts', { ...active, end: Date.now() }); setConfirmEnd(false); toast(metTarget({ ...active, end: Date.now() }) ? 'Fast complete — nice work' : 'Fast ended'); };
  const saveStart = () => {
    if (!active || !editStart) return;
    const s = startFromClock(editStart.time, Date.now(), editStart.daysAgo);
    const prev = logs.filter((l) => !l.deleted && l.id !== active.id && l.end && l.end <= active.start + 1).sort((a, b) => b.end! - a.end!)[0];
    const err = validStart(s, Date.now(), prev?.end);
    if (err) { setEditStart({ ...editStart, err }); return; }
    upsert<FastLog>('fasts', { ...active, start: s, date: dayOf(s) }); setEditStart(null); toast('Start time updated');
  };
  const markLowDay = () => {
    if (!proto) return;
    upsert<FastLog>('fasts', { id: `low-${today}`, date: today, kind: 'lowcal', start: new Date(today + 'T00:00:00').getTime(), end: new Date(today + 'T23:59:00').getTime(), targetH: 24, protocol: proto.id });
    toast('Low-calorie day logged');
  };
  const usePlan = (id: ProtocolId) => {
    if (!plan) return;
    const p = protocolById(id)!;
    setProfile({ fasting: { ...plan, protocol: id, window: p.kind === 'daily' ? placeWindow(p.eatH, plan.quiz, id === 'etre').window : null, lowDays: p.kind === 'daily' ? [] : plan.lowDays?.length && protocolById(plan.protocol)?.kind === p.kind ? plan.lowDays : defaultLowDays(id) } });
    setTargetH(null); toast(`Switched to ${p.tag}`); setTab('timer');
  };

  // ---------------- tabs ----------------
  const Landing = () => <div className="stack" data-testid="fast-landing">
    <Card className="wl-hero">
      <div className="kicker">Fuel · Fasting</div>
      <h2 className="fast-h">Fast with a plan, not a guess</h2>
      <p className="muted" style={{ marginTop: 0 }}>A 2-minute safety check, then a research-backed protocol and eating window that fit your training. Live timer, honest stage info and your streaks — all free.</p>
      <ul className="cues">
        <li>9 protocols from 12:12 to 5:2 and alternate-day — each with what the studies actually found.</li>
        <li>Your eating window placed around your workout so you can fuel and recover.</li>
        <li>No fasts over 24 hours, and no plan for people it isn’t safe for.</li>
      </ul>
      <div className="row wrap" style={{ marginTop: 12 }}><Link className="btn y" to="/fuel/fasting/setup" data-testid="fast-start">Find my plan · 2 min</Link><button className="btn ghost" onClick={() => setTab('plans')}>Browse protocols</button></div>
    </Card>
    <Banner>Heads up: in trials that matched calories, fasting matched — but didn’t beat — regular calorie control for weight loss. It’s a tool for structure, not magic. <button className="link" onClick={() => setTab('research')}>See the research</button></Banner>
    <Disclaimer />
  </div>;

  const StageStrip = ({ h }: { h: number }) => <div className="fast-stages">{STAGES.slice(0, 4).map((s) => <div key={s.key} className={`fast-stage ${h >= s.from ? 'on' : ''} ${stageAt(h).key === s.key ? 'now' : ''}`}><b>{s.from}h</b><span>{s.title}</span></div>)}</div>;

  const TimerTab = () => {
    if (!plan || !proto) return Landing();
    const lowDays = plan.lowDays || [];
    const isLowToday = proto.kind !== 'daily' && lowDays.includes(weekdayIdx(today));
    const eaten = dayTotals(data.foods, today).kcal;
    const lowTarget = lowCalTarget(proto.id, profile.sex, computeTargets(profile).tdee);
    const lowDone = logs.some((l) => !l.deleted && l.kind === 'lowcal' && l.date === today);
    const pp = proteinPlan(t.protein, proto.eatH || (plan.window?.eatH ?? 0));
    const eat = lastEnded && proto.kind === 'daily' ? eatingWindow(lastEnded.end!, proto.eatH, now) : null;
    return <div className="fast-grid">
      <div className="stack">
        {active ? (() => {
          const h = fastHours(active, now);
          const st = stageAt(h);
          const pct = Math.round(progress(active.start, active.targetH, now) * 100);
          const done = now >= goalAt(active.start, active.targetH);
          return <Card className="fast-timer" >
            <div className="card-head"><div><div className="kicker">{protocolById(active.protocol)?.tag || 'Custom'} · goal {active.targetH} h</div><h3>Fasting</h3></div><Pill tone={done ? 'yellow' : undefined}>{done ? 'Goal reached' : `${pct}%`}</Pill></div>
            <div className="fast-ring" data-testid="fast-running"><ScoreRing score={pct} size={236} numSize={34} display={fmtClock(now - active.start)} label="fasted" sub={done ? `+${fmtDur(now - goalAt(active.start, active.targetH))} over` : `${fmtDur(remainingMs(active.start, active.targetH, now))} to go`} /></div>
            <div className="fast-times">
              <div><span className="muted small">Started</span><b>{hm(active.start)}</b><span className="muted small">{dayLabel(active.start)}</span></div>
              <div><span className="muted small">Goal</span><b>{hm(goalAt(active.start, active.targetH))}</b><span className="muted small">{dayLabel(goalAt(active.start, active.targetH))}</span></div>
            </div>
            {h >= MAX_FAST_H && <Banner tone="warn">You’ve passed 24 hours. HYBRD doesn’t guide longer fasts — longer isn’t necessarily better and may be dangerous. Consider breaking your fast with a balanced meal.</Banner>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn y block" data-testid="fast-end" onClick={() => (done ? end() : setConfirmEnd(true))}><Icon name="stop" size={18} fill />End fast</button>
              <button className="btn" onClick={() => { const d = new Date(active.start); setEditStart({ time: toHM(d.getHours() * 60 + d.getMinutes()), daysAgo: 0 }); }}><Icon name="edit" size={18} />Edit start</button>
            </div>
            <div className="fast-now">
              <div className="kicker">Now · {st.title}</div>
              <p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{st.body}</p>
              <SrcPills ids={st.src} />
              <StageStrip h={h} />
              <p className="muted small" style={{ margin: '8px 0 0' }}>Stages are approximate and differ from person to person. They’re for context, not a target.</p>
            </div>
          </Card>;
        })() : <Card className="fast-timer">
          <div className="card-head"><div><div className="kicker">{proto.tag}{proto.name !== proto.tag ? ` · ${proto.name}` : ''}</div><h3>{eat?.open ? 'Eating window open' : 'Ready to fast'}</h3></div><Link className="link" to="/fuel/fasting?tab=plans">Change</Link></div>
          {eat?.open ? <div className="fast-ring"><ScoreRing score={Math.round((1 - eat.leftMs / (proto.eatH * H)) * 100)} size={220} numSize={30} display={fmtClock(eat.leftMs)} label="window left" sub={`closes ${hm(eat.closes)}`} /></div>
            : <div className="fast-ring"><ScoreRing score={0} size={220} numSize={34} display={`${tgt} h`} label="fast goal" sub={plan.window ? `eat ${plan.window.start}–${plan.window.end}` : proto.schedule.split(',')[0]} /></div>}
          {plan.window && <div className="fast-win"><div><span className="muted small">Eat</span><b>{plan.window.start}–{plan.window.end}</b></div><div><span className="muted small">Fast</span><b>{plan.window.end}–{plan.window.start}</b></div></div>}
          {eat?.open && <p className="muted small" style={{ margin: '10px 0 0' }}>Last fast: {fmtDur(lastEnded!.end! - lastEnded!.start)}. Next fast starts around {hm(eat.nextFastAt)}.</p>}
          <div className="field" style={{ marginTop: 14, marginBottom: 10 }}><span>Fast length</span><div className="chips">{[12, 13, 14, 16, 18, 20, 24].filter((x) => x <= maxH).map((x) => <button key={x} className={`chip ${tgt === x ? 'on' : ''}`} onClick={() => setTargetH(x)}>{x} h</button>)}</div></div>
          <button className="btn y big block" data-testid="fast-go" onClick={start}><Icon name="play" size={20} fill />Start fast</button>
          <p className="muted small" style={{ margin: '10px 0 0' }}>Water, black coffee and plain tea are fine while you fast. {maxH < 24 ? `Longer fasts unlock as you gain experience (max ${maxH} h for your plan).` : 'HYBRD caps fasts at 24 h.'}</p>
        </Card>}

        {proto.kind !== 'daily' && <Card>
          <div className="card-head" data-testid="fast-lowcal"><h3>{proto.kind === 'weekly' ? '24-hour fast day' : 'Low-calorie days'}</h3><span className="muted small">{lowDays.map((d) => WD[d]).join(' · ')}</span></div>
          <div className="wl-days">{WD.map((d, i) => <button key={d} className={`wl-day ${lowDays.includes(i) ? 'on' : ''}`} onClick={() => { const nd = lowDays.includes(i) ? lowDays.filter((x) => x !== i) : [...lowDays, i].sort(); setProfile({ fasting: { ...plan, lowDays: nd } }); }}><b>{d}</b><i>{lowDays.includes(i) ? 'low' : ''}</i></button>)}</div>
          {proto.kind === 'lowcal' && lowDays.some((d) => lowDays.includes((d + 1) % 7)) && <Banner tone="warn">Low days work best non-consecutive. Avoid hard training on them.</Banner>}
          {proto.kind === 'lowcal' && <div style={{ marginTop: 12 }}>
            {isLowToday ? <>
              <div className="row"><b>Today: ~{lowTarget} kcal</b><span className="spacer" /><span className="mono muted">{Math.round(eaten)} eaten</span></div>
              <div className="pillar-track" style={{ margin: '8px 0 10px' }}><div className="pillar-fill" style={{ width: `${Math.min(100, (eaten / lowTarget) * 100)}%`, background: eaten > lowTarget * 1.15 ? '#ffb86b' : undefined }} /></div>
              <div className="row wrap"><button className="btn sm y" disabled={lowDone} onClick={markLowDay}>{lowDone ? <><Icon name="check" size={14} /> Logged</> : 'Mark today done'}</button><Link className="btn sm" to={`/fuel/add?date=${today}`}>Log food</Link></div>
              <p className="muted small" style={{ margin: '8px 0 0' }}>{proto.id === 'madf' ? 'About 25% of your usual intake (estimate from your Fuel target).' : 'One 500–600 kcal meal, per Johns Hopkins. Build it around protein and vegetables.'} Don’t pair with hard training.</p>
            </> : <p className="muted small" style={{ margin: 0 }}>Today is a normal day — eat to your Fuel targets. Tap days above to move your low days.</p>}
          </div>}
        </Card>}
      </div>

      <div className="stack">
        <Card>
          <div className="card-head"><h3>Inside your window</h3><Link className="link" to="/fuel">Fuel log →</Link></div>
          <div className="grid3">
            <div className="stat accent"><div className="stat-v">{t.protein}<small> g</small></div><div className="stat-l">protein</div></div>
            <div className="stat"><div className="stat-v">{pp.meals}×{pp.perMeal}<small> g</small></div><div className="stat-l">protein meals</div></div>
            <div className="stat"><div className="stat-v">{(t.waterMl / 1000).toFixed(1)}<small> L</small></div><div className="stat-l">water</div></div>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>From your Fuel targets ({t.label.toLowerCase()}, {t.kcal.toLocaleString()} kcal est.). Fasting doesn’t lower your protein needs: spread it every 3–4 h. Drink through the fast.</p>
        </Card>
        <StreakCard />
        <Card>
          <div className="card-head"><h3>Quick tips</h3><button className="link" onClick={() => setTab('tips')}>All tips →</button></div>
          <ul className="cues tight">
            <li>Calories break a fast; water, black coffee and plain tea don’t.</li>
            <li>Break it with a balanced, protein-first meal — not a binge.</li>
            <li>Eat before long or hard sessions; short easy ones fasted are fine.</li>
            <li>Dizzy, shaky or faint? Stop and eat.</li>
          </ul>
        </Card>
        <Disclaimer />
      </div>
    </div>;
  };

  const StreakCard = () => {
    const weekly = proto && proto.kind !== 'daily';
    const per = weekly ? Math.max(1, (plan?.lowDays?.length || proto!.daysPerWeek || 1)) : 0;
    const cur = weekly ? weekStreak(logs, per, today) : dayStreak(logs, today);
    const wv = weekView(logs, today, now);
    const maxBar = Math.max(24, ...wv.map((d) => d.hours));
    return <Card className="click" onClick={() => setTab('history')}>
      <div className="card-head"><h3>This week</h3><span className="link">History →</span></div>
      <div className="fast-week" data-testid="fast-week">{wv.map((d) => <div key={d.day} className={`fast-bar ${d.met ? 'met' : ''} ${d.day === today ? 'today' : ''}`}>
        <div className="fast-bar-t"><div style={{ height: `${d.lowcal ? 100 : (d.hours / maxBar) * 100}%` }} className={d.lowcal ? 'low' : ''} />{d.target > 0 && !d.lowcal && <i style={{ bottom: `${(d.target / maxBar) * 100}%` }} />}</div>
        <b>{d.lowcal ? 'low' : d.hours ? `${Math.round(d.hours)}h` : '–'}</b><span>{WD[weekdayIdx(d.day)].slice(0, 2)}</span></div>)}</div>
      <div className="grid3" style={{ marginTop: 12 }}>
        <div className="stat accent"><div className="stat-v">{cur}</div><div className="stat-l">{weekly ? 'week' : 'day'} streak</div></div>
        <div className="stat"><div className="stat-v">{bestDayStreak(logs)}</div><div className="stat-l">best (days)</div></div>
        <div className="stat"><div className="stat-v">{wv.filter((d) => d.met).length}/7</div><div className="stat-l">done</div></div>
      </div>
    </Card>;
  };

  const PlansTab = () => {
    const rec = plan ? recommend(plan.quiz) : null;
    return <div className="stack" data-testid="fast-protocols">
      <Card>
        <h3 style={{ marginBottom: 6 }}>Protocol library</h3>
        <p className="muted small" style={{ margin: '0 0 12px' }}>Each protocol shows what it is, who it suits, what to watch, and what the research found. {plan ? 'Locked ones need more experience — or are off because of a health flag.' : 'Take the 2-minute check to unlock a personal pick.'}</p>
        <Segmented small value={lvl} onChange={setLvl} options={[{ v: 'all', label: 'All' }, { v: 'beginner', label: 'Beginner' }, { v: 'intermediate', label: 'Intermediate' }, { v: 'advanced', label: 'Advanced' }]} />
      </Card>
      <div className="fast-protos">
        {PROTOCOLS.filter((p) => lvl === 'all' || p.level === lvl).map((p) => {
          const mine = plan?.protocol === p.id; const ok = allowed.includes(p.id);
          return <Card key={p.id} className={`fast-proto ${mine ? 'mine' : ''}`}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="fast-tag sm">{p.tag}</div>
              <div style={{ flex: 1, minWidth: 0 }}><h3 style={{ margin: 0 }}>{p.name}</h3>
                <div className="meta" style={{ marginTop: 6 }}><Pill tone={p.level === 'advanced' ? 'expert' : p.level === 'intermediate' ? 'yellow' : undefined}>{LEVEL_LABEL[p.level]}</Pill><Pill tone="dim">{EVIDENCE_LABEL[p.evidence]}</Pill>{rec?.protocol === p.id && <Pill tone="yellow">★ Picked for you</Pill>}{mine && <Pill tone="yellow">Your plan</Pill>}</div></div>
            </div>
            <p className="small" style={{ margin: '10px 0 6px' }}><b>{p.schedule}</b></p>
            <p className="small muted" style={{ margin: '0 0 8px' }}>{p.what}</p>
            <div className="fast-kv"><span>Suits</span><p>{p.suits}</p></div>
            <div className="fast-kv"><span>Watch</span><p>{p.watch}</p></div>
            <div className="fast-kv"><span>Evidence</span><p>{p.evidenceText}</p></div>
            <SrcPills ids={p.src} />
            <div style={{ marginTop: 12 }}>
              {!plan ? <Link className="btn sm" to="/fuel/fasting/setup">Check if it fits me</Link>
                : mine ? <span className="muted small"><Icon name="check" size={14} /> Current plan</span>
                : ok ? <button className="btn sm y" onClick={() => usePlan(p.id)}>Use this plan</button>
                : <span className="muted small"><Icon name="lock" size={14} /> {plan.level === 'caution' ? 'Off while a doctor check is pending' : `Needs ${p.level === 'advanced' ? 'regular' : 'some'} fasting experience`}</span>}
            </div>
          </Card>;
        })}
      </div>
      <p className="muted small">Fasts longer than 24 hours (36–72 h, multi-day) are deliberately not offered: Johns Hopkins notes they aren’t necessarily better and may be dangerous.</p>
      <Disclaimer />
    </div>;
  };

  const HistoryTab = () => {
    const s = stats(logs, today, now);
    const items = logs.filter((l) => !l.deleted && (l.end || l.kind === 'lowcal')).sort((a, b) => (b.end || b.start) - (a.end || a.start));
    return <div className="fast-grid" data-testid="fast-history">
      <div className="stack">
        <StreakCard />
        <Card>
          <div className="grid2">
            <div className="stat"><div className="stat-v">{s.total}</div><div className="stat-l">fasts logged</div></div>
            <div className="stat"><div className="stat-v">{s.avg7 ? s.avg7.toFixed(1) : '–'}<small> h</small></div><div className="stat-l">avg, last 7 days</div></div>
            <div className="stat"><div className="stat-v">{s.longest ? s.longest.toFixed(1) : '–'}<small> h</small></div><div className="stat-l">longest</div></div>
            <div className="stat"><div className="stat-v">{Math.round(s.metRate * 100)}%</div><div className="stat-l">goals met</div></div>
          </div>
          <p className="muted small" style={{ margin: '10px 0 0' }}>A fast counts for the day it ends. Missed a day? The streak restarts — the work you did doesn’t disappear.</p>
        </Card>
      </div>
      <Card>
        <div className="card-head"><h3>Log</h3><span className="muted small">{items.length} entries</span></div>
        {!items.length && <p className="muted small" style={{ margin: 0 }}>No fasts yet. Start one from the Timer tab.</p>}
        {items.slice(0, 60).map((l) => <div key={l.id} className="food-row">
          <div className={`fast-dot ${metTarget(l) ? 'met' : ''}`}>{metTarget(l) ? <Icon name="check" size={14} /> : null}</div>
          <div className="fr-main"><div className="fr-name">{l.kind === 'lowcal' ? `Low-calorie day · ${protocolById(l.protocol)?.tag || ''}` : `${fmtDur(l.end! - l.start)} of ${l.targetH} h`}</div>
            <div className="fr-sub">{l.kind === 'lowcal' ? prettyDay(l.date) : `${prettyDay(dayOf(l.start))} ${hm(l.start)} → ${dayOf(l.end!) !== dayOf(l.start) ? prettyDay(dayOf(l.end!)) + ' ' : ''}${hm(l.end!)}`}</div></div>
          <button className="icon-btn" aria-label="Delete entry" onClick={() => { remove('fasts', l.id); toast('Entry deleted'); }}><Icon name="trash" size={16} /></button>
        </div>)}
      </Card>
    </div>;
  };

  const TipsTab = () => <div className="stack" data-testid="fast-tips">
    <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
      {FAST_TIPS.map((g) => <Card key={g.id}><div className="kicker">{g.kicker}</div><h3 style={{ marginBottom: 10 }}>{g.title}</h3><ul className="cues">{g.points.map((p) => <li key={p}>{p}</li>)}</ul><SrcPills ids={g.src} /></Card>)}
    </div>
    <Disclaimer />
  </div>;

  const ResearchTab = () => <div className="stack" data-testid="fast-research">
    <Card><h3>What the research says</h3><p className="muted small" style={{ margin: 0 }}>Short, honest summaries of the trials, reviews and guidance behind this section — including where fasting doesn’t help. Tap a source to read it.</p></Card>
    {FAST_RESEARCH.map((r) => <Card key={r.title}><h3 style={{ marginBottom: 6 }}>{r.title}</h3><p className="small" style={{ margin: 0, lineHeight: 1.55 }}>{r.body}</p><SrcPills ids={r.src} /></Card>)}
    <Card><h3>All sources ({FAST_SOURCE_IDS.length})</h3><ol className="wl-src">{FAST_SOURCE_IDS.map((id) => { const s = sourceById(id); return s ? <li key={id}><a href={s.url} target="_blank" rel="noopener">{s.cite}</a></li> : null; })}</ol></Card>
    <Disclaimer />
  </div>;

  return <Page title="Fasting" kicker={plan && proto ? `Fuel · ${proto.tag} plan` : 'Fuel · Protocols · Timer · Research'} back="/fuel" wide actions={plan ? <Link className="btn sm ghost" to="/fuel/fasting/setup">Edit</Link> : undefined}>
    <div className="wl-tabs"><Segmented value={tab} options={TABS} onChange={setTab} small /></div>
    {tab === 'timer' && TimerTab()}
    {tab === 'plans' && PlansTab()}
    {tab === 'history' && (plan || logs.length ? HistoryTab() : Landing())}
    {tab === 'tips' && TipsTab()}
    {tab === 'research' && ResearchTab()}
    <Sheet open={!!editStart} onClose={() => setEditStart(null)} title="Edit start time">
      {editStart && <div className="stack">
        <label className="field"><span>Started at</span><input type="time" data-testid="fast-edit-time" value={editStart.time} onChange={(e) => setEditStart({ ...editStart, time: e.target.value, err: undefined })} /></label>
        <div className="chips">{[0, 1].map((d) => <button key={d} className={`chip ${editStart.daysAgo === d ? 'on' : ''}`} onClick={() => setEditStart({ ...editStart, daysAgo: d, err: undefined })}>{d === 0 ? 'Most recent' : 'A day earlier'}</button>)}</div>
        <p className="muted small" style={{ margin: 0 }}>A time later than now means last night (e.g. 20:00 entered at 9:00 → yesterday 20:00). → {hm(startFromClock(editStart.time || '00:00', Date.now(), editStart.daysAgo))} {dayLabel(startFromClock(editStart.time || '00:00', Date.now(), editStart.daysAgo))}</p>
        {editStart.err && <Banner tone="warn">{editStart.err}</Banner>}
        <button className="btn y block" data-testid="fast-edit-save" onClick={saveStart}>Save</button>
      </div>}
    </Sheet>
    <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="End your fast early?">
      {active && <div className="stack">
        <p style={{ margin: 0 }}>You’re at <b>{fmtDur(now - active.start)}</b> of {active.targetH} h. Ending now is completely fine — it stays in your log, it just won’t count toward the streak.</p>
        <p className="muted small" style={{ margin: 0 }}>Feeling dizzy, shaky or unwell? Eat — that’s the right call.</p>
        <div className="row"><button className="btn block" onClick={() => setConfirmEnd(false)}>Keep going</button><button className="btn y block" data-testid="fast-end-confirm" onClick={end}>End fast</button></div>
      </div>}
    </Sheet>
  </Page>;
}
