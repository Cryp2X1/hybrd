import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { Page, Card, RowLink } from '../components/ui';
import { fromW, toW, wUnit, wu, stepGoalOf, strideM } from '../lib/calc';
import { DistToggle, WeightToggle } from '../components/UnitToggle';
import { HYROX_DIVISIONS } from '../data/programs';
import { unlockAudio, cue } from '../lib/cues';
import type { Profile } from '../lib/types';

export default function Me() {
  const { profile: p, setProfile } = useStore();
  const { configured, user } = useAuth();
  const loc = useLocation();
  useEffect(() => { if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' }); }, [loc.hash]);
  const imp = p.units === 'imperial';
  const autoStride = Math.round(strideM({ heightCm: p.heightCm }, 'walk') * (imp ? 39.37 : 100));
  const T = ({ k, label, sub }: { k: 'sound' | 'voice'; label: string; sub: string }) => (
    <button className="toggle" style={{ width: '100%', textAlign: 'left' }} onClick={() => { unlockAudio(); setProfile({ [k]: !(p[k] ?? k === 'sound') }); if (k === 'sound') setTimeout(() => cue('go'), 50); }}><span><b>{label}</b><div className="muted small">{sub}</div></span><span className={`switch ${(p[k] ?? k === 'sound') ? 'on' : ''}`} /></button>
  );
  return (
    <Page title={p.name || 'Me'} kicker={user ? user.email || 'Signed in' : configured ? 'Not signed in' : 'Local mode'} wide>
      <div className="desk-grid">
        <div>
          <Card className="units-card">
            <div className="card-head" id="goals"><h3 id="units">Units & goals</h3><span className="muted small">Applies everywhere, instantly</span></div>
            <div className="unit-row"><span><b>Distance</b><span className="muted small">{p.units === 'imperial' ? 'Miles · feet · mph · min/mi' : 'Kilometres · metres · km/h · min/km'}</span></span><DistToggle /></div>
            <div className="unit-row"><span><b>Weight</b><span className="muted small">Lifts, body weight</span></span><WeightToggle /></div>
            <div className="unit-row"><span><b>Daily step goal</b><span className="muted small">Default 10,000 · research benefits level off around 6,000–10,000 depending on age</span></span>
              <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="numeric" aria-label="Daily step goal" defaultValue={stepGoalOf(p)} onChange={(e) => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (Number.isFinite(v) && v >= 500) setProfile({ stepGoal: Math.min(v, 100000) }); }} onBlur={(e) => { e.target.value = String(stepGoalOf(p)); }} /></div>
            <div className="unit-row"><span><b>Step length</b><span className="muted small">Walking; used to estimate steps when the motion sensor isn’t available. Blank = auto from height ({autoStride} {imp ? 'in' : 'cm'})</span></span>
              <input className="input" style={{ width: 110, textAlign: 'right' }} inputMode="decimal" aria-label={`Step length in ${imp ? 'inches' : 'centimetres'}`} placeholder={`${autoStride} ${imp ? 'in' : 'cm'}`} value={p.strideCm ? Math.round(p.strideCm / (imp ? 2.54 : 1)) : ''} onChange={(e) => { const v = parseFloat(e.target.value); setProfile({ strideCm: Number.isFinite(v) && v > 0 ? v * (imp ? 2.54 : 1) : undefined }); }} /></div>
          </Card>
          <Card>
            <RowLink to="/me/account" icon="lock" title="Account" sub={user ? 'Email, password, sync' : configured ? 'Sign in or create an account' : 'Local mode — how accounts turn on'} />
            <RowLink to="/progress" icon="progress" title="Progress & PRs" sub="Charts, records, body weight" />
            <RowLink to="/timers" icon="timer" title="Timers" sub="Stopwatch, intervals, EMOM, AMRAP, HYROX" />
            <RowLink to="/routes" icon="map" title="Route history" sub="Every GPS activity on one map" />
            <RowLink to="/fuel/calculator" icon="fuel" title="Calorie targets" sub="TDEE calculator" />
            <RowLink to="/me/data" icon="download" title="Your data" sub="Export, import, sample data" />
            <RowLink to="/me/help" icon="info" title="Help & phone tips" sub="Install, GPS, iPhone limits, privacy" />
            <RowLink to="/fuel?tab=sources" icon="book" title="Sources" sub="Where every number comes from" />
          </Card>
        </div>
        <div>
          <Card>
            <h3 style={{ marginBottom: 12 }}>Profile</h3>
            <label className="field"><span>Name</span><input value={p.name} onChange={(e) => setProfile({ name: e.target.value })} /></label>
            <div className="grid2">
              <label className="field"><span>Weight ({wUnit(wu(p))})</span><input inputMode="decimal" value={Math.round(toW(p.weightKg, wu(p)) * 10) / 10} onChange={(e) => setProfile({ weightKg: fromW(+e.target.value || 0, wu(p)) })} /></label>
              <label className="field"><span>Training days / wk</span><select value={p.weeklySessions} onChange={(e) => setProfile({ weeklySessions: +e.target.value })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n}>{n}</option>)}</select></label>
            </div>
            <label className="field"><span>HYROX division</span><select value={p.hyroxDivision} onChange={(e) => setProfile({ hyroxDivision: e.target.value as Profile['hyroxDivision'] })}>{Object.entries(HYROX_DIVISIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <Link className="link" to="/fuel/calculator">Age, height, activity & goal →</Link>
          </Card>
          <Card>
            <h3 style={{ marginBottom: 4 }}>Cues</h3>
            <T k="sound" label="Sounds & vibration" sub="Beeps for intervals and splits (vibration on Android only)" />
            <T k="voice" label="Voice cues" sub="Speaks splits and interval names" />
          </Card>
          <p className="muted small">HYBRD v1.0 · made for José Manuel Cruz Ortiz & friends.</p>
        </div>
      </div>
    </Page>
  );
}
