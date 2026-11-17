import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { recipeById } from '../data/recipes';
import { sourceById } from '../data/sources';
import { Page, Card, Empty, Pill, Disclaimer } from '../components/ui';
import { useStore, uid } from '../lib/store';
import { todayKey } from '../lib/calc';
import type { FoodEntry } from '../lib/types';
import { useToast } from '../lib/toast';

export default function RecipeDetail() {
  const { id = '' } = useParams();
  const r = recipeById(id);
  const sleepR = r?.cat === 'sleep';
  const { upsert } = useStore();
  const toast = useToast();
  const [meal, setMeal] = useState<FoodEntry['meal']>(() => (r?.kind === 'dinner' ? 'dinner' : r?.kind ? 'snacks' : 'lunch'));
  const [serv, setServ] = useState(1);
  if (!r) return <Page title="Not found" back="/fuel?tab=recipes"><Empty title="Recipe not found" /></Page>;
  const p = r.perServing;
  const log = () => { upsert<FoodEntry>('foods', { id: uid(), date: todayKey(), meal, name: r.name, servings: serv, kcal: Math.round(p.kcal * serv), protein: +(p.protein * serv).toFixed(1), carbs: +(p.carbs * serv).toFixed(1), fat: +(p.fat * serv).toFixed(1), source: 'recipe', ref: r.id }); toast(`Logged ${Math.round(p.kcal * serv)} kcal`); };
  return (
    <Page title={r.name} kicker={`${r.serves > 1 ? `Serves ${r.serves} · ` : ''}${r.minutes ? `${r.minutes} min` : 'No cooking'}`} back={sleepR ? '/fuel/sleep?tab=foods' : '/fuel?tab=recipes'}>
      <div className="grid4" style={{ marginBottom: 14 }}>
        <div className="stat accent"><div className="stat-v">{p.kcal}</div><div className="stat-l">kcal / serving</div></div>
        <div className="stat"><div className="stat-v">{p.protein}<small>g</small></div><div className="stat-l">protein</div></div>
        <div className="stat"><div className="stat-v">{p.carbs}<small>g</small></div><div className="stat-l">carbs</div></div>
        <div className="stat"><div className="stat-v">{p.fat}<small>g</small></div><div className="stat-l">fat</div></div>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>{r.tags.map((t) => <Pill key={t}>{t}</Pill>)}<Pill>fibre {p.fiber} g</Pill><Pill>sodium {p.sodium} mg</Pill>{p.sugar !== undefined && <Pill>sugars {p.sugar} g</Pill>}{r.timing && <Pill tone="yellow">{r.timing}</Pill>}{r.grade && <Pill tone="dim">Sleep evidence: {r.grade}</Pill>}</div>
      <Card className="hero"><div className="kicker">Why it works</div><p style={{ margin: 0 }}>{r.why}</p>
        <div className="tag-row" style={{ marginTop: 10 }}>{r.sources.map((s) => <a key={s} className="pill yellow" href={sourceById(s)?.url} target="_blank" rel="noopener">{sourceById(s)?.cite.split('.')[0]}…</a>)}</div></Card>
      <div className="desk-grid">
        <Card><h3 style={{ marginBottom: 10 }}>Ingredients{r.serves > 1 ? ` (all ${r.serves} servings)` : ''}</h3>
          {r.ingredients.map((i) => <div key={i.fdcId + i.label} className="food-row"><div className="fr-main"><div className="fr-name">{i.label}</div><div className="fr-sub">USDA: {i.usda}</div></div><span className="fr-k">{i.grams} g</span></div>)}</Card>
        <Card><h3 style={{ marginBottom: 10 }}>Steps</h3><ol className="cues">{r.steps.map((s) => <li key={s}>{s}</li>)}</ol></Card>
      </div>
      <Card>
        <h3 style={{ marginBottom: 10 }}>Log it today</h3>
        <div className="chips" style={{ marginBottom: 12 }}>{(['breakfast', 'lunch', 'dinner', 'snacks'] as const).map((m) => <button key={m} className={`chip ${meal === m ? 'on' : ''}`} style={{ textTransform: 'capitalize' }} onClick={() => setMeal(m)}>{m}</button>)}</div>
        <div className="row"><button className="btn sm" onClick={() => setServ(Math.max(0.5, serv - 0.5))}>−</button><b className="mono">{serv} serving{serv === 1 ? '' : 's'}</b><button className="btn sm" onClick={() => setServ(serv + 0.5)}>+</button><span className="spacer" /><button className="btn y" onClick={log}>Log {Math.round(p.kcal * serv)} kcal</button></div>
      </Card>
      <Disclaimer />
    </Page>
  );
}
