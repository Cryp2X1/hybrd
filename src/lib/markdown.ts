// Tiny Markdown subset for the legal documents (src/legal/*.md): # / ## / ### headings, paragraphs, - and 1. lists
// (nested by indenting 2+ spaces), pipe tables, **bold**, *italic*, [links](/path) and [[PLACEHOLDER]] tokens.
// Pure parser (tested in tools/test-legal.ts); components/Markdown.tsx renders the tree.

export type Inline =
  | { t: 'text'; v: string } | { t: 'b'; c: Inline[] } | { t: 'i'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] } | { t: 'ph'; key: string };
export type Block =
  | { t: 'h'; level: 1 | 2 | 3; id: string; c: Inline[]; text: string }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: { c: Inline[]; blocks: Block[] }[] }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

export const slug = (s: string) => s.toLowerCase().replace(/\*|\[\[|\]\]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const plain = (c: Inline[]): string => c.map((x) => (x.t === 'text' ? x.v : x.t === 'ph' ? `[${x.key}]` : plain(x.c))).join('');

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\[\[([A-Z_]+)\]\]/))) { flush(); out.push({ t: 'ph', key: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*\*(.+?)\*\*/))) { flush(); out.push({ t: 'b', c: inline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) { flush(); out.push({ t: 'a', href: m[2], c: inline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*([^*\s][^*]*?)\*/))) { flush(); out.push({ t: 'i', c: inline(m[1]) }); i += m[0].length; continue; }
    buf += s[i]; i++;
  }
  flush();
  return out;
}

const indentOf = (l: string) => l.length - l.trimStart().length;
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((x) => inline(x.trim()));

export function parse(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  const used = new Map<string, number>();
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^(#{1,3})\s+(.*)$/))) {
      const c = inline(m[2]); const text = plain(c);
      let id = slug(text) || 'section'; const n = used.get(id) || 0; used.set(id, n + 1); if (n) id = `${id}-${n + 1}`;
      out.push({ t: 'h', level: m[1].length as 1 | 2 | 3, id, c, text }); i++; continue;
    }
    if (/^\s*\|/.test(l)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r, k) => !(k === 1 && /^\s*\|?\s*:?-{2,}/.test(r)));
      out.push({ t: 'table', head: cells(body[0]), rows: body.slice(1).map(cells) });
      continue;
    }
    const li = l.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
    if (li) {
      const base = li[1].length; const kind = li[2] === '-' ? 'ul' : 'ol';
      const items: { c: Inline[]; blocks: Block[] }[] = [];
      while (i < lines.length) {
        const x = lines[i].match(/^(\s*)(-|\d+\.)\s+(.*)$/);
        if (!x || x[1].length !== base || (x[2] === '-' ? 'ul' : 'ol') !== kind) break;
        i++;
        const sub: string[] = [];
        while (i < lines.length) {
          const y = lines[i];
          if (!y.trim()) { const next = lines.slice(i + 1).find((z) => z.trim()); if (next !== undefined && indentOf(next) > base) { sub.push(''); i++; continue; } break; }
          if (indentOf(y) > base) { sub.push(y.slice(Math.min(indentOf(y), base + 2))); i++; continue; }
          break;
        }
        items.push({ c: inline(x[3]), blocks: sub.length ? parse(sub.join('\n')) : [] });
        while (i < lines.length && !lines[i].trim()) { const next = lines.slice(i + 1).find((z) => z.trim()); const nx = next?.match(/^(\s*)(-|\d+\.)\s+/); if (nx && nx[1].length === base) i++; else break; }
      }
      out.push({ t: kind, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s/.test(lines[i]) && !/^\s*(-|\d+\.)\s+/.test(lines[i]) && !/^\s*\|/.test(lines[i])) para.push(lines[i++].trim());
    out.push({ t: 'p', c: inline(para.join(' ')) });
  }
  return out;
}

/** h2 headings for a table of contents. */
export const toc = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { t: 'h' }> => b.t === 'h' && b.level === 2).map((b) => ({ id: b.id, text: b.text }));
