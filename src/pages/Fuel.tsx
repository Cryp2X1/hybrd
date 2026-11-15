import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ALL_RECIPES, RECIPES } from '../data/recipes';
import { GUIDE } from '../data/guide';
import { SOURCES, sourceById } from '../data/sources';
import { useStore } from '../lib/store';
import { addDays, dayTotals, prettyDay, todayKey } from '../lib/calc';
import { fuelTargets } from '../lib/fuelTargets';
import { WLCard } from '../components/WLCard';
import { dayBurn } from '../lib/burn';
import { StepsCard } from '../components/StepsCard';
import { Page, Segmented, Card, Banner, Pill, Disclaimer } from '../components/ui';
import { MacroBar, ScoreRing } from '../components/charts';
import { Icon } from '../components/Icon';
import { CoachCard } from '../components/CoachCard';
import type { FoodEntry, WaterDay } from '../lib/types';

const RCATS = [{ v: 'all', label: 'All' }, { v: 'pre', label: 'Pre-workout' }, { v: 'post', label: 'Recovery' }, { v: 'protein', label: 'High protein' }, { v: 'drink', label: 'Drinks & hydration' }, { v: 'fuel', label: 'Endurance fuel' }, { v: 'budget', label: 'Budget' }, { v: 'plan', label: 'Weight-loss meals' }];
const MEALS: FoodEntry['meal'][] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export default function Fuel() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'today';
  const [day, setDay] = useState(sp.get('date') || todayKey());
  const [rc, setRc] = useState('all');
  const { data, profile, upsert, remove } = useStore();
  const nav = useNavigate();
  const t = fuelTargets(profile, data, day);
  const tot = dayTotals(data.foods, day);
  const burnedParts = dayBurn(data, day, profile);
  const burned = burnedParts.active;
  const water = data.water.find((w) => w.date === day);
  const ml = water?.ml || 0;
  const setWater = (v: number) => upsert<WaterDay>('water', { id: day, date: day, ml: Math.max(0, v) });
  const budget = t.kcal + (t.addBurn ? burned : 0);
  const left = budget - tot.kcal;

  return (
    <Page title="Fuel" kicker="Calories · Macros · Water · Recipes" wide actions={<Link className="btn sm y" to={`/fuel/add?date=${day}`}><Icon name="plus" size={18} />Food</Link>}>
      <Segmented value={tab} onChange={(v) => (v === 'wl' ? nav('/fuel/weight-loss') : setSp({ tab: v }))} options={[{ v: 'today', label: 'Food log' }, { v: 'wl', label: 'Weight loss' }, { v: 'recipes', label: 'Meals & drinks' }, { v: 'guide', label: 'Guide' }, { v: 'sources', label: 'Sources' }]} />

      {tab === 'today' && <CoachCard where="fuel" />}
      {tab === 'today' && <div className="desk-grid">
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="icon-btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><Icon name="back" /></button>
            <div className="center" style={{ flex: 1 }}><b>{day === todayKey() ? 'Today' : prettyDay(day)}</b></div>
            <button className="icon-btn" aria-label="Next day" disabled={day >= todayKey()} onClick={() => setDay(addDays(day, 1))}><Icon name="chevron" /></button>
          </div>
          <Card className="hero">
            <div className="hero-score">
              <ScoreRing score={Math.max(0, Math.min(100, Math.round((tot.kcal / Math.max(1, budget)) * 100)))} display={Math.abs(Math.round(left))} label={left >= 0 ? 'kcal left' : 'kcal over'} sub={`of ${Math.round(budget)} kcal`} size={168} />
              <div className="pillars">
                <div className="grid3"><div className="stat"><div className="stat-v">{t.kcal}</div><div className="stat-l">{t.plan ? 'plan target' : 'target'}</div></div><div className="stat"><div className="stat-v">{Math.round(tot.kcal)}</div><div className="stat-l">eaten</div></div><div className="stat"><div className="stat-v">{t.addBurn ? '+' : ''}{burned}</div><div className="stat-l">{t.addBurn ? 'exercise est.' : 'burned (in plan)'}</div></div></div>
                <MacroBar label="Protein" value={tot.protein} target={t.protein} />
                <MacroBar label="Carbs" value={tot.carbs} target={t.carbs} color="#f4f4f4" />
                <MacroBar label="Fat" value={tot.fat} target={t.fat} color="#fb923c" />
              </div>
            </div>
            {t.plan ? <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}><b className="y">{t.label}.</b> The plan already includes your usual activity, so today’s active burn (≈ {burnedParts.active} kcal, estimate) isn’t added on top. <Link className="link" to="/fuel/weight-loss">Open plan</Link> · <Link className="link" to={`/burn?date=${day}`}>Calories burned</Link></p> :
          <p className="muted small" style={{ marginTop: 12, marginBottom: 0 }}>Active burn ≈ {burnedParts.workouts} kcal from workouts + {burnedParts.steps} kcal from steps outside them{burnedParts.manual ? ` + ${burnedParts.manual} kcal added by hand` : ''} (estimates). Your target already covers resting burn, so only active calories are added here; many people eat back only part of them. <Link className="link" to={`/burn?date=${day}`}>Calories burned</Link> · <Link className="link" to="/fuel/calculator">Adjust targets</Link></p>}
          </Card>
          <StepsCard key={day} date={day} compact />
          {MEALS.map((m) => {
            const items = data.foods.filter((f) => f.date === day && f.meal === m);
            const k = items.reduce((a, f) => a + f.kcal, 0);
            return (
              <Card key={m}>
                <div className="card-head"><h3>{m}</h3><span className="mono muted">{Math.round(k)} kcal</span></div>
                {items.map((f) => <div key={f.id} className="food-row"><div className="fr-main"><div className="fr-name">{f.name}</div><div className="fr-sub">{f.grams ? `${Math.round(f.grams)} g · ` : f.servings ? `${f.servings} serving · ` : ''}P {Math.round(f.protein)} · C {Math.round(f.carbs)} · F {Math.round(f.fat)}</div></div><span className="fr-k">{Math.round(f.kcal)}</span><button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => remove('foods', f.id)}><Icon name="x" size={16} /></button></div>)}
                <Link className="btn sm" to={`/fuel/add?meal=${m}&date=${day}`} style={{ marginTop: items.length ? 10 : 0 }}><Icon name="plus" size={16} />Add to {m}</Link>
              </Card>
            );
          })}
        </div>
        <div>
          <WLCard compact />
          <Card>
            <div className="card-head"><h3>Water</h3><span className="muted small">Target {(t.waterMl / 1000).toFixed(1)} L</span></div>
            <div className="row" style={{ marginBottom: 12 }}><div className="water-big">{(ml / 1000).toFixed(2)} L</div><span className="spacer" /><span className="mono muted">{Math.round((ml / t.waterMl) * 100)}%</span></div>
            <div className="water-cups" style={{ marginBottom: 12 }}>{Array.from({ length: Math.ceil(t.waterMl / 250) }, (_, i) => <span key={i} className={`cup ${ml >= (i + 1) * 250 ? 'full' : ''}`} />)}</div>
            <div className="row wrap"><button className="btn sm" onClick={() => setWater(ml + 250)}>+250 ml</button><button className="btn sm" onClick={() => setWater(ml + 500)}>+500 ml</button><button className="btn sm" onClick={() => setWater(ml + 750)}>+750 ml</button><button className="btn sm ghost" onClick={() => setWater(ml - 250)}>−250</button></div>
            <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Default from the National Academies Adequate Intake; add more on hot or long training days. One cup = 250 ml (≈ 8.5 oz).</p>
          </Card>
          <Card>
            <div className="card-head"><h3>Quick picks</h3><Link to="/fuel?tab=recipes">All →</Link></div>
            {RECIPES.filter((r) => ['pre-oats', 'post-chicken-bowl', 'drink-choc-milk', 'drink-diy-electrolyte'].includes(r.id)).map((r) => <Link key={r.id} to={`/fuel/recipe/${r.id}`} className="food-row"><div className="fr-main"><div className="fr-name">{r.name}</div><div className="fr-sub">P {r.perServing.protein} · C {r.perServing.carbs} · F {r.perServing.fat}</div></div><span className="fr-k">{r.perServing.kcal}</span></Link>)}
          </Card>
          <Disclaimer />
        </div>
      </div>}

      {tab === 'recipes' && <>
        <Segmented small value={rc} onChange={setRc} options={RCATS} />
        <div className="tile-grid">
          {ALL_RECIPES.filter((r) => rc === 'all' || r.cat === rc || (rc === 'budget' && r.cat === 'plan' && r.tags.includes('budget'))).map((r) => (
            <Link key={r.id} to={`/fuel/recipe/${r.id}`} className={`tile ${r.cat === 'drink' ? '' : ''}`}>
              <div className="kicker">{RCATS.find((c) => c.v === r.cat)?.label}</div>
              <h3>{r.name}</h3>
              <div className="grid4" style={{ gap: 6 }}>{([['kcal', r.perServing.kcal], ['P', r.perServing.protein], ['C', r.perServing.carbs], ['F', r.perServing.fat]] as const).map(([l, v]) => <div key={l} className="center"><div className="mono" style={{ fontWeight: 700 }}>{Math.round(v)}</div><div className="muted small">{l}</div></div>)}</div>
              <div className="meta">{r.tags.slice(0, 3).map((x) => <Pill key={x}>{x}</Pill>)}{r.minutes > 0 && <Pill>{r.minutes} min</Pill>}</div>
            </Link>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 14 }}>Every macro is calculated from USDA FoodData Central values for the listed ingredients and amounts (per serving). Brands and cooking change the numbers a little.</p>
        <Disclaimer />
      </>}

      {tab === 'guide' && <>
        <Banner>The evidence in one place — straight from the sports-nutrition position stands. Tap a source to read it.</Banner>
        <div className="tile-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {GUIDE.map((g) => (
            <Card key={g.id}>
              <div className="kicker">{g.kicker}</div>
              <h3 style={{ marginBottom: 10 }}>{g.title}</h3>
              <ul className="cues">{g.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <div className="tag-row">{g.sources.map((s) => <a key={s} className="pill yellow" href={sourceById(s)?.url} target="_blank" rel="noopener">{s.toUpperCase()}</a>)}</div>
            </Card>
          ))}
        </div>
        <Disclaimer />
      </>}

      {tab === 'sources' && <Card>
        <h3 style={{ marginBottom: 12 }}>Sources</h3>
        <ol className="src-list">{SOURCES.map((s) => <li key={s.id} id={s.id}><b>{s.cite}</b><br /><span className="muted">Used for: {s.used}</span><br /><a href={s.url} target="_blank" rel="noopener">{s.url}</a></li>)}</ol>
        <Disclaimer />
      </Card>}
    </Page>
  );
}
