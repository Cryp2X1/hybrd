import type { ReactNode } from 'react';

export function ScoreRing({ score, size = 200, label, sub, display, numSize }: { score: number | null; size?: number; label?: string; sub?: ReactNode; display?: ReactNode; numSize?: number }) {
  const r = 84, C = 2 * Math.PI * r, v = score ?? 0;
  const ticks = Array.from({ length: 40 }, (_, i) => i);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <linearGradient id="sr-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#FFF27A" /><stop offset="1" stopColor="#FFE600" /></linearGradient>
        </defs>
        {ticks.map((i) => {
          const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
          return <line key={i} x1={100 + Math.cos(a) * 97} y1={100 + Math.sin(a) * 97} x2={100 + Math.cos(a) * 93} y2={100 + Math.sin(a) * 93} stroke={i / 40 < v / 100 ? '#FFE600' : '#2a2a2a'} strokeWidth="2" />;
        })}
        <circle cx="100" cy="100" r={r} fill="none" stroke="#1d1d1d" strokeWidth="12" />
        <circle cx="100" cy="100" r={r} fill="none" stroke="url(#sr-g)" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="sr-center">
        <div className="sr-num" style={numSize ? { fontSize: numSize } : undefined}>{display ?? score ?? '—'}</div>
        {label && <div className="sr-label">{label}</div>}
        {sub && <div className="sr-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function PillarBar({ label, score, detail, onClick }: { label: string; score: number | null; detail?: string; onClick?: () => void }) {
  return (
    <button className="pillar" onClick={onClick}>
      <div className="pillar-top"><span>{label}</span><b>{score ?? '—'}</b></div>
      <div className="pillar-track"><div className="pillar-fill" style={{ width: `${score ?? 0}%` }} /></div>
      {detail && <div className="pillar-detail">{detail}</div>}
    </button>
  );
}

export function BarChart({ data, height = 140, unit = '', highlightLast = true, fmt, goal }: { data: { label: string; value: number }[]; height?: number; unit?: string; highlightLast?: boolean; fmt?: (v: number) => string; goal?: number }) {
  const max = Math.max(1, goal ? goal * 1.1 : 0, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label="bar chart">
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="100" y1={height - 18 - g * (height - 30)} y2={height - 18 - g * (height - 30)} stroke="#222" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />)}
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 30);
          return <rect key={i} x={i * w + w * 0.18} width={w * 0.64} y={height - 18 - h} height={Math.max(h, d.value ? 1.5 : 0.6)} rx="1" fill={goal ? (d.value >= goal ? '#FFE600' : d.value ? '#8a8a8a' : '#2a2a2a') : highlightLast && i === data.length - 1 ? '#FFE600' : d.value ? '#f4f4f4' : '#2a2a2a'} />;
        })}
        {goal ? <line x1="0" x2="100" y1={height - 18 - (goal / max) * (height - 30)} y2={height - 18 - (goal / max) * (height - 30)} stroke="#FFE600" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="chart-labels">{data.map((d, i) => <span key={i} style={{ width: `${w}%` }}>{d.label}</span>)}</div>
      <div className="chart-max">{fmt ? fmt(max) : Math.round(max)}{unit}</div>
    </div>
  );
}

export function LineChart({ data, height = 140, min, max, fmt }: { data: { label: string; value: number | null }[]; height?: number; min?: number; max?: number; fmt?: (v: number) => string }) {
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  if (vals.length < 2) return <div className="chart-empty muted">Not enough data yet — keep logging.</div>;
  const lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals);
  const span = hi - lo || 1;
  const pts = data.map((d, i) => d.value == null ? null : [ (i / (data.length - 1)) * 100, 8 + (1 - (d.value - lo) / span) * (height - 26) ] as [number, number]);
  const path = pts.reduce((acc, p, i) => (p ? acc + `${acc && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}` : acc), '');
  const last = [...pts].reverse().find(Boolean)!;
  const firstIdx = pts.findIndex(Boolean);
  const area = `${path}L${last[0]},${height - 18}L${pts[firstIdx]![0]},${height - 18}Z`;
  return (
    <div className="chart">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img" aria-label="line chart">
        <defs><linearGradient id="lc-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FFE600" stopOpacity=".35" /><stop offset="1" stopColor="#FFE600" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#lc-g)" />
        <path d={path} fill="none" stroke="#FFE600" strokeWidth="2.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="chart-labels spread"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></div>
      <div className="chart-max">{fmt ? fmt(hi) : Math.round(hi)}</div>
    </div>
  );
}

export function MacroBar({ label, value, target, unit = 'g', color }: { label: string; value: number; target: number; unit?: string; color?: string }) {
  const pct = Math.min(100, (value / Math.max(1, target)) * 100);
  return (
    <div className="macro">
      <div className="macro-top"><span>{label}</span><span className="mono">{Math.round(value)} / {Math.round(target)}{unit}</span></div>
      <div className="pillar-track"><div className="pillar-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}
