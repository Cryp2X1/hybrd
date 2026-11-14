import { useState } from 'react';
import { useStore } from '../lib/store';
import { ACTIVITY_LEVELS, computeTargets, fromW, toW, wUnit, wu } from '../lib/calc';
import { Page, Card, Disclaimer, Banner } from '../components/ui';
import type { Goal, Profile } from '../lib/types';
import { useToast } from '../lib/toast';

export default function Calculator() {
  const { profile, setProfile } = useStore();
  const toast = useToast();
  const [p, setP] = useState<Profile>(profile);
  const u = wu(profile);
  const auto = computeTargets({ ...p, targets: undefined });
  const [ov, setOv] = useState(p.targets || {});
  const save = () => { setProfile({ ...p, targets: Object.fromEntries(Object.entries(ov).filter(([, v]) => v)) }); toast('Targets saved'); };
  return (
    <Page title="TDEE calculator" kicker="Daily targets" back="/fuel">
      <Card>
        <div className="grid2">
          <label className="field"><span>Sex</span><select value={p.sex} onChange={(e) => setP({ ...p, sex: e.target.value as Profile['sex'] })}><option value="male">Male</option><option value="female">Female</option></select></label>
          <label className="field"><span>Age</span><input inputMode="numeric" value={p.age} onChange={(e) => setP({ ...p, age: +e.target.value || 0 })} /></label>
          <label className="field"><span>Height (cm)</span><input inputMode="numeric" value={Math.round(p.heightCm)} onChange={(e) => setP({ ...p, heightCm: +e.target.value || 0 })} /></label>
          <label className="field"><span>Weight ({wUnit(u)})</span><input inputMode="decimal" value={Math.round(toW(p.weightKg, u) * 10) / 10} onChange={(e) => setP({ ...p, weightKg: fromW(+e.target.value || 0, u) })} /></label>
        </div>
        <label className="field"><span>Activity</span><select value={p.activity} onChange={(e) => setP({ ...p, activity: +e.target.value as Profile['activity'] })}>{ACTIVITY_LEVELS.map((a) => <option key={a.v} value={a.v}>{a.label} — {a.hint} (×{a.v})</option>)}</select></label>
        <label className="field"><span>Goal</span><select value={p.goal} onChange={(e) => setP({ ...p, goal: e.target.value as Goal })}><option value="lose">Lose fat (−20%)</option><option value="maintain">Maintain / perform</option><option value="gain">Build muscle (+10%)</option></select></label>
      </Card>
      <div className="grid3" style={{ marginBottom: 14 }}>
        <div className="stat"><div className="stat-v">{auto.bmr}</div><div className="stat-l">BMR (Mifflin-St Jeor)</div></div>
        <div className="stat"><div className="stat-v">{auto.tdee}</div><div className="stat-l">TDEE</div></div>
        <div className="stat accent"><div className="stat-v">{auto.kcal}</div><div className="stat-l">target kcal</div></div>
      </div>
      <Banner>BMR = 10 × kg + 6.25 × cm − 5 × age {p.sex === 'male' ? '+ 5' : '− 161'}. TDEE = BMR × activity. Protein {p.goal === 'lose' ? '2.0' : p.goal === 'gain' ? '1.8' : '1.6'} g/kg (ISSN 1.4–2.0 g/kg range), fat ≈ 27% of calories, carbs = the rest. All estimates.</Banner>
      <Card>
        <h3 style={{ marginBottom: 6 }}>Your own targets (optional)</h3>
        <p className="muted small">Leave blank to use the calculated value.</p>
        <div className="grid2">{([['kcal', 'Calories', auto.kcal], ['protein', 'Protein g', auto.protein], ['carbs', 'Carbs g', auto.carbs], ['fat', 'Fat g', auto.fat], ['waterMl', 'Water ml', auto.waterMl]] as const).map(([k, l, a]) => <label key={k} className="field"><span>{l}</span><input inputMode="numeric" placeholder={String(a)} value={(ov as Record<string, number>)[k] || ''} onChange={(e) => setOv({ ...ov, [k]: +e.target.value || undefined })} /></label>)}</div>
        <button className="btn y block" onClick={save}>Save profile & targets</button>
      </Card>
      <Disclaimer />
    </Page>
  );
}
