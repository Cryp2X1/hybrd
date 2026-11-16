import { sourceById } from '../data/sources';
/** Linked source chips (first author …). Same look as the Weight-loss research cards. */
export function SrcPills({ ids }: { ids: string[] }) {
  return <div className="tag-row" style={{ marginTop: 10 }}>{ids.map((s) => { const x = sourceById(s); return x ? <a key={s} className="pill yellow" href={x.url} target="_blank" rel="noopener">{x.cite.split(/[.,]/)[0]}…</a> : null; })}</div>;
}
