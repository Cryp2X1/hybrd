// Unit checks for Me › Bio: length cap, trimming, plain-text rendering / escaping, safe auto-links,
// collapse ("Read more"), persistence via normalize, export / delete helpers, schema + entitlements.
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-bio.ts
import { readFileSync } from 'node:fs';
import {
  BIO_MAX, BIO_PREVIEW, BIO_PREVIEW_LINES,
  normalizeBio, escapeHtml, bioParts, isSafeUrl, renderBioHtml, collapseBio,
  clearedBio, bioFromExport,
} from '../src/lib/bio.ts';
import { FEATURES, can } from '../src/lib/entitlements.ts';

let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (!cond) { failed++; console.error('FAIL', name, detail ?? ''); }
  else console.log('ok', name);
};

// ---------- length limit ----------
check('BIO_MAX is 1000', BIO_MAX === 1000);
check('empty / null / undefined → empty string', normalizeBio('') === '' && normalizeBio(null) === '' && normalizeBio(undefined) === '');
check('exactly 1000 is kept', normalizeBio('a'.repeat(1000)).length === 1000);
check('1001 is cut to 1000', normalizeBio('a'.repeat(1001)).length === 1000 && normalizeBio('a'.repeat(1001)) === 'a'.repeat(1000));
check('well over the cap is cut', normalizeBio('x'.repeat(5000)).length === 1000);

// ---------- trimming ----------
check('trims leading and trailing spaces', normalizeBio('  hello  ') === 'hello');
check('trims leading and trailing blank lines', normalizeBio('\n\nhello\n\n') === 'hello');
check('normalizes CRLF and CR to LF', normalizeBio('a\r\nb\rc') === 'a\nb\nc');
check('strips trailing spaces on each line, keeps mid-bio line breaks', normalizeBio('line one  \n  line two  \n') === 'line one\n  line two');
check('whitespace-only becomes empty', normalizeBio('   \n\t  \n') === '');
check('strips null bytes and other control chars, keeps tab and newline', normalizeBio('a\u0000b\tc\nd\u0007e') === 'ab\tc\nde');
check('keeps emoji and non-Latin text', normalizeBio('Hola 💪 meta: correr un 10K') === 'Hola 💪 meta: correr un 10K');

// ---------- plain-text rendering / escaping ----------
const xss = '<script>alert(1)</script>';
const escaped = escapeHtml(xss);
check('escapeHtml turns <script> into text entities', escaped === '&lt;script&gt;alert(1)&lt;/script&gt;');
check('escapeHtml encodes & < > " \'', escapeHtml('&<>"\'') === '&amp;&lt;&gt;&quot;&#39;');
check('stored bio keeps the raw characters (not stripped as HTML)', normalizeBio(xss) === xss);
check('renderBioHtml does not emit a real <script> tag', !renderBioHtml(xss).includes('<script') && renderBioHtml(xss).includes('&lt;script&gt;'));
check('renderBioHtml preserves line breaks as <br />', renderBioHtml('a\nb') === 'a<br />b');
check('img onerror is escaped, not a tag', renderBioHtml('<img src=x onerror=alert(1)>') === '&lt;img src=x onerror=alert(1)&gt;');
check('bioParts does not treat markup as a URL', bioParts('<a href="javascript:alert(1)">x</a>').every((p) => p.t === 'text'));

// ---------- safe auto-links ----------
check('https URL is a link part', bioParts('see https://example.com/plan for more')[1].t === 'url' && bioParts('see https://example.com/plan for more')[1].v === 'https://example.com/plan');
check('http URL is accepted', isSafeUrl('http://example.com'));
check('https URL is accepted', isSafeUrl('https://cryp2x1.github.io/hybrd/'));
check('javascript: is not a safe URL', !isSafeUrl('javascript:alert(1)'));
check('data: is not a safe URL', !isSafeUrl('data:text/html,<script>alert(1)</script>'));
check('javascript: in text is not auto-linked', bioParts('go javascript:alert(1) now').every((p) => p.t === 'text'));
check('trailing punctuation is not part of the href', (() => {
  const parts = bioParts('Visit https://example.com.');
  return parts.some((p) => p.t === 'url' && p.v === 'https://example.com') && parts.some((p) => p.t === 'text' && p.v === '.');
})());
check('renderBioHtml links have rel + target and escaped href', (() => {
  const h = renderBioHtml('https://example.com/a?x=1&y=2');
  return h.includes('rel="noopener noreferrer nofollow"') && h.includes('target="_blank"') && h.includes('href="https://example.com/a?x=1&amp;y=2"') && !h.includes('href="javascript');
})());

// ---------- collapse / Read more ----------
check('short bio is not collapsed', collapseBio('Short bio.').collapsed === false && collapseBio('Short bio.').preview === 'Short bio.');
check('long bio collapses around the preview limit', (() => {
  const t = 'word '.repeat(80).trim(); // 399 chars
  const c = collapseBio(t);
  return c.collapsed && c.preview.length <= BIO_PREVIEW && t.startsWith(c.preview.replace(/…$/, ''));
})(), collapseBio('word '.repeat(80).trim()));
check('more than 5 lines collapses even if short', (() => {
  const t = 'a\nb\nc\nd\ne\nf';
  const c = collapseBio(t);
  return c.collapsed && c.preview === 'a\nb\nc\nd\ne' && BIO_PREVIEW_LINES === 5;
})());

// ---------- persistence (normalize is what setProfile writes) ----------
const saved = normalizeBio('  HYROX racer.\nI train 5 days a week.  \n');
check('persisted value is the normalized form', saved === 'HYROX racer.\nI train 5 days a week.');
check('re-normalizing is idempotent', normalizeBio(saved) === saved);
check('missing bio on a profile-shaped object is treated as empty', bioFromExport({ app: 'HYBRD', profile: { name: 'José' } }) === '');

// ---------- export / delete ----------
const profile = { name: 'José', bio: saved };
const exported = { app: 'HYBRD', version: 1, profile, data: {} };
check('export includes the bio on the profile', bioFromExport(exported) === saved);
check('a non-HYBRD file yields no bio', bioFromExport({ profile: { bio: 'nope' } }) === '');
check('exported bio over the cap is trimmed on read', bioFromExport({ app: 'HYBRD', profile: { bio: 'z'.repeat(1200) } }).length === 1000);
const wiped = { ...profile, ...clearedBio() };
check('Delete all data clears the bio', wiped.bio === '' && wiped.name === 'José');
check('clearedBio only touches bio', JSON.stringify(clearedBio()) === '{"bio":""}');

// An export after wipe has an empty bio
check('export after wipe has empty bio', bioFromExport({ app: 'HYBRD', profile: wiped }) === '');

// ---------- entitlements + schema wiring ----------
check('entitlement profile.bio is free', FEATURES['profile.bio']?.free === true && can('profile.bio'));
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
check('schema: bio column added idempotently', /add column if not exists bio text/.test(schema));
check('schema: length check is dropped then re-added (safe to re-run)',
  /drop constraint if exists profiles_bio_len/.test(schema)
  && /add constraint profiles_bio_len check \(bio is null or char_length\(bio\) <= 1000\)/.test(schema));
check('schema: 1000 matches BIO_MAX', /char_length\(bio\) <= 1000/.test(schema) && BIO_MAX === 1000);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log('\nall bio checks passed');
