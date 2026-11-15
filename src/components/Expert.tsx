import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Pill } from './ui';
import { Icon } from './Icon';
import { DistToggle } from './UnitToggle';
import { useStore } from '../lib/store';
import { EXPERT_SAFETY } from '../data/expert';
import { COGGAN, PACE_INFO, RACE_REFS, fmtPaceKm, profilePaces, type PaceKey } from '../lib/intensity';
import { fmtTime } from '../lib/calc';
import { useToast } from '../lib/toast';

/** Readiness & safety note shown on every Expert surface. */
export function ExpertNote({ compact }: { compact?: boolean }) {
  return (
    <div className="banner warn expert-note" data-testid="expert-note">
      <Icon name="info" size={18} />
      <div>
        <b>Expert tier · read first.</b> {compact ? <>{EXPERT_SAFETY[0]} Scale or swap anything when form breaks down, and stop on pain. Not medical advice.</> : <ul className="cues tight">{EXPERT_SAFETY.map((x) => <li key={x}>{x}</li>)}</ul>}
      </div>
    </div>
  );
}

export const parseClock = (s: string) => {
  const parts = s.trim().split(':').map((x) => x.trim());
  if (!parts.length || parts.some((x) => x === '' || isNaN(+x))) return 0;
  return parts.reduce((a, x) => a * 60 + +x, 0);
};

/** Personal targets: recent race → Daniels paces, FTP → Coggan watts. Stored on the profile (syncs). */
export function TargetsCard({ show }: { show: 'run' | 'ride' | 'both' }) {
  const { profile, setProfile } = useStore();
  const toast = useToast();
  const [dist, setDist] = useState(String(profile.runRef?.distM ?? 5000));
  const [time, setTime] = useState(profile.runRef ? fmtTime(profile.runRef.sec) : '');
  const [ftp, setFtp] = useState(profile.ftp ? String(profile.ftp) : '');
  const pp = profilePaces(profile);
  const u = profile.units;
  const saveRun = () => {
    const sec = parseClock(time);
    if (!(sec > 120)) { toast('Enter a time like 22:30 or 1:45:00'); return; }
    setProfile({ runRef: { distM: +dist, sec, date: new Date().toISOString().slice(0, 10) } }); toast('Paces updated');
  };
  const saveFtp = () => { const v = Math.round(+ftp); if (!(v >= 60 && v <= 600)) { toast('Enter FTP in watts (60–600)'); return; } setProfile({ ftp: v }); toast('FTP saved'); };
  return (
    <Card className="targets-card">
      <div className="card-head"><h3>Your targets</h3>{show !== 'ride' && <DistToggle />}</div>
      {show !== 'ride' && <>
        <p className="muted small" style={{ marginTop: 0 }}>Running paces come from a recent race or all-out time trial (Daniels’ VDOT method). They’re estimates — adjust for heat, hills and how you feel.</p>
        <div className="targets-form">
          <label className="field"><span>Recent race</span><select value={dist} onChange={(e) => setDist(e.target.value)} aria-label="Race distance">{RACE_REFS.map((r) => <option key={r.label} value={r.m}>{r.label}</option>)}</select></label>
          <label className="field"><span>Time</span><input inputMode="numeric" placeholder="mm:ss or h:mm:ss" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Race time" /></label>
          <button className="btn y sm" onClick={saveRun} data-testid="save-race">Set paces</button>
        </div>
        {pp ? <div className="pace-grid" data-testid="pace-grid">{(['E', 'M', 'T', 'I', 'R'] as PaceKey[]).map((k) => (
          <div key={k} className="pace-cell"><div className="pk">{k}</div><div className="pv">{k === 'E' ? `${fmtPaceKm(pp.E[1], u).split(' ')[0]}–${fmtPaceKm(pp.E[0], u)}` : fmtPaceKm(pp[k], u)}</div><div className="pn muted">{PACE_INFO[k].name} · {PACE_INFO[k].rpe}</div></div>))}
        </div> : <p className="muted small">No race set — sessions show each pace by effort (RPE) instead.</p>}
      </>}
      {show !== 'run' && <>
        {show === 'both' && <hr className="sep" />}
        <p className="muted small" style={{ marginTop: show === 'both' ? 12 : 0 }}>Cycling targets use % of FTP (Coggan power levels). No power meter? Ride by the RPE shown on each step. From a 20-min test, FTP ≈ 95% of your average power.</p>
        <div className="targets-form">
          <label className="field"><span>FTP (watts)</span><input inputMode="numeric" placeholder="e.g. 250" value={ftp} onChange={(e) => setFtp(e.target.value)} aria-label="FTP watts" /></label>
          <button className="btn y sm" onClick={saveFtp} data-testid="save-ftp">Save FTP</button>
        </div>
        <div className="zone-list">{COGGAN.map((z) => <div key={z.l} className="zone-row"><Pill tone={z.l === 'SS' ? 'yellow' : undefined}>{z.l}</Pill><span>{z.name}</span><span className="muted small">{z.l === 'L1' ? '< 55%' : `${z.lo}–${z.hi}%`}{profile.ftp ? ` · ${z.l === 'L1' ? `< ${Math.round(profile.ftp * 0.55)}` : `${Math.round((profile.ftp * z.lo) / 100)}–${Math.round((profile.ftp * z.hi) / 100)}`} W` : ''}</span><span className="muted small">{z.rpe}</span></div>)}</div>
      </>}
      <p className="muted small" style={{ marginBottom: 0 }}>Saved to your profile. <Link to="/fuel?tab=sources" className="link">Sources</Link></p>
    </Card>
  );
}
