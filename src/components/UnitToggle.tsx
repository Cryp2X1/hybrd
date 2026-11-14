import { useStore } from '../lib/store';
import type { Units } from '../lib/types';

/** One-tap mi | km switch. Changes only the display — everything is stored in metres. */
export function DistToggle({ onChange, label = 'Distance units' }: { onChange?: (u: Units) => void; label?: string }) {
  const { profile, setProfile } = useStore();
  const set = (u: Units) => { if (u !== profile.units) { setProfile({ units: u }); onChange?.(u); } };
  return (
    <div className="unit-tog" role="radiogroup" aria-label={label}>
      {([['imperial', 'mi', 'Miles'], ['metric', 'km', 'Kilometres']] as const).map(([v, t, aria]) => (
        <button key={v} role="radio" aria-checked={profile.units === v} aria-label={aria} data-unit={t} className={profile.units === v ? 'on' : ''} onClick={() => set(v)}>{t}</button>
      ))}
    </div>
  );
}

export function WeightToggle() {
  const { profile, setProfile } = useStore();
  const cur = profile.weightUnit || (profile.units === 'imperial' ? 'lb' : 'kg');
  return (
    <div className="unit-tog" role="radiogroup" aria-label="Weight units">
      {(['lb', 'kg'] as const).map((v) => (
        <button key={v} role="radio" aria-checked={cur === v} aria-label={v === 'lb' ? 'Pounds' : 'Kilograms'} data-unit={v} className={cur === v ? 'on' : ''} onClick={() => setProfile({ weightUnit: v })}>{v}</button>
      ))}
    </div>
  );
}
