// Me › Bio: normalize, length cap, plain-text rendering (safe auto-links), collapse for "Read more".
export const BIO_MAX = 1000;
/** Collapse the view when the bio is longer than this many characters, or more than BIO_PREVIEW_LINES lines. */
export const BIO_PREVIEW = 280;
export const BIO_PREVIEW_LINES = 5;

/** Trim, normalize line breaks, drop control characters, and cap at BIO_MAX. Empty after trim → ''. */
export function normalizeBio(raw: string | undefined | null): string {
  if (raw == null) return '';
  let s = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Keep \n and \t; drop other C0 controls and DEL so pasted junk can't hide in the string.
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n');
  s = s.replace(/^\n+/, '').replace(/\n+$/, '').trimEnd();
  // trimStart after the leading-newline strip, but keep intentional first-line content
  s = s.replace(/^[ \t]+/, '').trimEnd();
  if (s.length > BIO_MAX) s = s.slice(0, BIO_MAX);
  return s;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type BioPart = { t: 'text' | 'url'; v: string };

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

/** Split plain text into text and http(s) URL parts. Trailing punctuation is kept as text, not part of the href. */
export function bioParts(text: string): BioPart[] {
  const parts: BioPart[] = [];
  const re = new RegExp(URL_RE.source, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let url = m[0];
    let trail = '';
    while (url.length && /[.,;:!?)\]]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    if (url && isSafeUrl(url)) parts.push({ t: 'url', v: url });
    else if (url) parts.push({ t: 'text', v: url });
    if (trail) parts.push({ t: 'text', v: trail });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}

/** Only http(s) URLs — never javascript:, data:, or protocol-relative tricks. */
export function isSafeUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

/** HTML string for tests / any non-React renderer. Prefer React nodes in the UI (see BioView). */
export function renderBioHtml(text: string): string {
  return bioParts(text).map((p) => {
    if (p.t === 'url' && isSafeUrl(p.v)) {
      return `<a href="${escapeHtml(p.v)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(p.v)}</a>`;
    }
    return escapeHtml(p.v);
  }).join('').replace(/\n/g, '<br />');
}

export function collapseBio(text: string): { preview: string; collapsed: boolean } {
  const lines = text.split('\n');
  let preview = text;
  let collapsed = false;
  if (lines.length > BIO_PREVIEW_LINES) {
    preview = lines.slice(0, BIO_PREVIEW_LINES).join('\n');
    collapsed = true;
  }
  if (preview.length > BIO_PREVIEW) {
    const cut = preview.slice(0, BIO_PREVIEW);
    const sp = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
    preview = (sp > 200 ? cut.slice(0, sp) : cut).replace(/[ \n]+$/g, '');
    collapsed = true;
  }
  return { preview, collapsed };
}

/** Bio field to write when "Delete all data" runs. */
export function clearedBio(): { bio: string } {
  return { bio: '' };
}

/** Pull the (normalized) bio out of a HYBRD JSON export. */
export function bioFromExport(json: unknown): string {
  const j = json as { app?: string; profile?: { bio?: string } };
  if (!j || j.app !== 'HYBRD') return '';
  return normalizeBio(j.profile?.bio);
}
