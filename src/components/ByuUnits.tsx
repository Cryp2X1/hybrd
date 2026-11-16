import { useStore } from '../lib/store';
import {
  BYU_DIST_UNITS, YARD_EXPLAIN, LOOP_EQUALS, byuTableYards, fmtByuEquals, fmtByuNumber,
  resolveByuUnit, type ByuDistUnit,
} from '../lib/ultra';

const ARIA: Record<ByuDistUnit, string> = { mi: 'Miles', km: 'Kilometres', m: 'Metres', ft: 'Feet' };

/** Backyard distance unit (mi / km / m / ft). Persisted on the profile; does not change the global mi/km setting. */
export function useByuUnit() {
  const { profile, setProfile } = useStore();
  const unit = resolveByuUnit(profile);
  const setUnit = (u: ByuDistUnit) => { if (u !== profile.byuDistUnit) setProfile({ byuDistUnit: u }); };
  return [unit, setUnit] as const;
}

export function ByuUnitToggle({ label = 'Backyard distance units' }: { label?: string }) {
  const [unit, setUnit] = useByuUnit();
  return (
    <div className="unit-tog byu-unit-tog" role="radiogroup" aria-label={label} data-testid="byu-unit-tog">
      {BYU_DIST_UNITS.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={unit === v} aria-label={ARIA[v]} data-unit={v} data-testid={`byu-unit-${v}`} className={unit === v ? 'on' : ''} onClick={() => setUnit(v)}>{v}</button>
      ))}
    </div>
  );
}

/** Compact "24 yards = 100 mi = 160.9 km = 160,934 m = 528,000 ft" line plus the loop explainer. */
export function ByuEquals({ yards, className }: { yards: number; className?: string }) {
  return <p className={className ?? 'muted small'} data-testid="byu-equals">{YARD_EXPLAIN}. {fmtByuEquals(yards)}.</p>;
}

export function ByuYardTable({ highlight, extra }: { highlight?: number; extra?: number | number[] }) {
  const [unit] = useByuUnit();
  const rows = byuTableYards(extra ?? highlight);
  return (
    <div className="byu-table-wrap" data-testid="byu-yard-table">
      <div className="card-head" style={{ marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0 }}>Yards to distance</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{YARD_EXPLAIN} · {LOOP_EQUALS.replace('1 yard = ', '').replace(' = ', ' / ')}.</p>
        </div>
        <ByuUnitToggle />
      </div>
      <div className="byu-table-scroll">
        <table className="byu-conv">
          <thead>
            <tr>
              <th>Yards</th>
              {BYU_DIST_UNITS.map((u) => <th key={u} className={u === unit ? 'cur' : ''}>{u}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((y) => (
              <tr key={y} className={y === highlight ? 'on' : undefined} data-yards={y}>
                <td>{y}</td>
                {BYU_DIST_UNITS.map((u) => <td key={u} className={u === unit ? 'cur' : ''}>{fmtByuNumber(y, u)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
