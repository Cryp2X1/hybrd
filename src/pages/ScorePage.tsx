import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { addDays, hybridScore, todayKey } from '../lib/calc';
import { Page, Card, Banner } from '../components/ui';
import { ScoreRing, PillarBar, LineChart } from '../components/charts';
import { suggestions } from './Home';
import { sourceById } from '../data/sources';

export default function ScorePage() {
  const { data, profile } = useStore();
  const s = useMemo(() => hybridScore(data, profile), [data, profile]);
  const trend = useMemo(() => Array.from({ length: 28 }, (_, i) => { const d = addDays(todayKey(), i - 27); return { label: d.slice(5), value: hybridScore(data, profile, d).score }; }), [data, profile]);
  return (
    <Page title="Hybrid Score" kicker={`Formula ${s.version} · rolling 7 days`} back="/">
      <Card className="hero">
        <div className="hero-score">
          <ScoreRing score={s.score} label={s.tier} sub={s.score == null ? 'Needs 2+ pillars' : undefined} size={200} />
          <div className="pillars">{s.pillars.map((p) => <PillarBar key={p.key} label={p.label} score={p.score} detail={p.detail} />)}</div>
        </div>
      </Card>
      <Card><div className="card-head"><h3>Last 28 days</h3></div><LineChart data={trend} min={0} max={100} /></Card>
      <Card>
        <h3 style={{ marginBottom: 10 }}>How every number is made</h3>
        {s.pillars.map((p) => <div key={p.key} style={{ marginBottom: 12 }}><b className="y">{p.label}{p.score != null ? ` · ${p.score}` : ''}</b><div className="muted small">{p.formula}</div></div>)}
        <div style={{ marginBottom: 12 }}><b className="y">Total</b><div className="muted small">Average of the pillars that have data (needs at least 2), minus a balance penalty of 10% of the gap between your strongest and weakest pillar{s.balancePenalty ? ` (−${s.balancePenalty} right now)` : ''}. Hybrid athletes are rewarded for even development, not one huge number.</div></div>
        <div style={{ marginBottom: 12 }}><b className="y">Steps (new in hs-2)</b><div className="muted small">Daily steps add a small Consistency bonus: +2 for each of the last 7 days that reached your step goal, up to +10, capped at 100. Steps never create a score on their own — you still need logged training. For context, the Paluch et al. (2022) meta-analysis found mortality risk kept falling up to about 6,000–8,000 steps/day in adults 60+ and 8,000–10,000 under 60 (Sources).</div></div>
        <div><b className="y">Tiers</b><div className="muted small">0–39 Building · 40–59 Contender · 60–79 Hybrid · 80–89 Elite · 90+ Apex</div></div>
      </Card>
      {suggestions(s).length > 0 && <Card><h3 style={{ marginBottom: 8 }}>Ideas to move it</h3>{suggestions(s).map((x) => <div key={x.title} className="food-row"><div className="fr-main"><Link className="fr-name" to={x.to}>{x.title}</Link><div className="fr-sub">{x.why}</div></div></div>)}</Card>}
      <Banner>The Hybrid Score is HYBRD’s own motivation metric. It only compares you with your own goals — it isn’t a validated fitness test or a medical measure. Built on: <a href={sourceById('foster')?.url} target="_blank" rel="noopener">session-RPE load</a>, <a href={sourceById('who2020')?.url} target="_blank" rel="noopener">WHO activity guidelines</a>, <a href={sourceById('issn-protein')?.url} target="_blank" rel="noopener">ISSN protein range</a>.</Banner>
    </Page>
  );
}
