// Legal (v1.7): clickwrap + re-accept rules (src/lib/legal.ts), consents, placeholders, the Markdown parser, the
// documents' required sections, and static wiring (onboarding / sign-up gating, routes, gate, schema, consent gates).
// Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/test-legal.ts
import { readFileSync } from 'node:fs';
import { DEFAULT_MIN_AGE, accept, canProceed, consentAsked, fillPlaceholders, hasConsent, LEGAL_DOCS, LEGAL_VERSIONS, legalValues, minAge, missingPlaceholders, needsAccept, setConsent, type LegalRecord } from '../src/lib/legal.ts';
import { inline, parse, plain, toc } from '../src/lib/markdown.ts';

let fails = 0, n = 0;
const check = (name: string, ok: boolean, info: unknown = '') => { n++; if (ok) console.log('ok', name); else { fails++; console.log('FAIL', name, info); } };
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const doc = (id: string) => src(`src/legal/${id}.md`);
const now = new Date('2026-11-26T12:00:00Z');

// ---------- clickwrap + versions
check('nothing accepted → must accept', needsAccept(undefined) && needsAccept({}));
check('checkbox must be checked (no pre-checked / browsewrap)', canProceed(true) && !canProceed(false) && !canProceed(undefined as unknown as boolean));
const r1 = accept(undefined, 'onboarding', now, LEGAL_VERSIONS, 18);
check('accept records versions, time, source, age', r1.terms === LEGAL_VERSIONS.terms && r1.privacy === LEGAL_VERSIONS.privacy && r1.acceptedAt === now.toISOString() && r1.source === 'onboarding' && r1.ageConfirmed === 18);
check('current acceptance → no prompt', !needsAccept(r1));
check('Terms version bump → re-accept prompt', needsAccept(r1, { terms: '2027-01-01', privacy: LEGAL_VERSIONS.privacy }));
check('Privacy version bump → re-accept prompt', needsAccept(r1, { terms: LEGAL_VERSIONS.terms, privacy: '2027-01-01' }));
const old: LegalRecord = { terms: '2025-01-01', privacy: '2025-01-01', acceptedAt: '2025-01-01T00:00:00Z', source: 'onboarding', history: [{ terms: '2025-01-01', privacy: '2025-01-01', at: '2025-01-01T00:00:00Z', source: 'onboarding', age: 18 }] };
const r2 = accept(old, 'reaccept', now);
check('re-accept clears the prompt and keeps history', !needsAccept(r2) && r2.history!.length === 2 && r2.history![0].terms === '2025-01-01' && r2.source === 'reaccept');
let big: LegalRecord | undefined; for (let i = 0; i < 30; i++) big = accept(big, 'reaccept', new Date(now.getTime() + i));
check('history capped at 20', big!.history!.length === 20);

// ---------- consents
const c1 = setConsent(r1, 'health', true, now);
check('health consent is separate from the Terms', !hasConsent(r1, 'health') && hasConsent(c1, 'health') && !hasConsent(c1, 'location'));
check('consent stores time + version', c1.health!.at === now.toISOString() && c1.health!.v === LEGAL_VERSIONS.health);
const c2 = setConsent(c1, 'health', false, now);
check('withdraw consent', !hasConsent(c2, 'health') && consentAsked(c2, 'health') && !consentAsked(c2, 'location'));
check('accepting Terms keeps consents', hasConsent(accept(c1, 'reaccept', now), 'health'));

// ---------- min age
check('min age defaults to 18', minAge(undefined) === 18 && minAge({}) === 18);
check('min age from config, clamped 13–21', minAge({ minAge: 13 }) === 13 && minAge({ minAge: 16 }) === 16 && minAge({ minAge: 10 }) === 18 && minAge({ minAge: 40 }) === 18 && minAge({ minAge: 'x' }) === 18);

// ---------- placeholders
const vals = legalValues({ legalName: 'Example LLC', supportEmail: 'help@example.com', governingState: '  ' }, 'https://x.test/hybrd/');
check('config overrides defaults (contactEmail falls back to supportEmail)', vals.LEGAL_NAME === 'Example LLC' && vals.CONTACT_EMAIL === 'help@example.com' && vals.MIN_AGE === '18' && vals.APP_URL === 'https://x.test/hybrd/');
check('blank config value falls back to the owner default', vals.GOVERNING_STATE === 'Ohio');
const none = legalValues({}, 'https://x.test/hybrd/', LEGAL_VERSIONS, {});
check('with no config and no defaults a value stays a visible placeholder', !('GOVERNING_STATE' in none) && fillPlaceholders('law of [[GOVERNING_STATE]]', none) === 'law of [[GOVERNING_STATE]]' && missingPlaceholders('a [[GOVERNING_STATE]] b')[0] === 'GOVERNING_STATE');
const def = legalValues(undefined, 'https://x.test/hybrd/');
check('owner details filled: José Manuel Cruz Ortiz dba HYBRD, hybrdbeast@gmail.com, Ohio, Delaware County, Nov 26 2026', /^José Manuel Cruz Ortiz, an individual doing business as HYBRD$/.test(def.LEGAL_NAME) && def.CONTACT_EMAIL === 'hybrdbeast@gmail.com' && def.DMCA_AGENT_EMAIL === 'hybrdbeast@gmail.com' && def.DMCA_AGENT_NAME === 'José Manuel Cruz Ortiz' && def.GOVERNING_STATE === 'Ohio' && def.VENUE_COUNTY === 'Delaware County' && def.EFFECTIVE_DATE === 'November 26, 2026' && def.LAST_UPDATED === 'November 26, 2026' && def.BACKUP_RETENTION_DAYS === '30');
const allDocs = (['terms', 'privacy', 'health-data', 'disclaimer', 'dmca', 'delete-account'] as const).map((id) => fillPlaceholders(doc(id), def));
check('every document is fully filled (no [[TOKENS]] left)', allDocs.every((d) => missingPlaceholders(d).length === 0));
check('source documents carry the final text (no tokens in src/legal)', (['terms', 'privacy', 'health-data', 'disclaimer', 'dmca', 'delete-account'] as const).every((id) => !/\[\[[A-Z_]+\]\]/.test(doc(id))));
check('versions in the document headers match LEGAL_VERSIONS', new RegExp(`Version:\\*\\* ${LEGAL_VERSIONS.terms}`).test(doc('terms')) && new RegExp(`Version:\\*\\* ${LEGAL_VERSIONS.privacy}`).test(doc('privacy')) && new RegExp(`Version:\\*\\* ${LEGAL_VERSIONS.health}`).test(doc('health-data')));
check('no blank or placeholder wording left in the documents', allDocs.every((d) => !/\[\[|TODO|YOUR_|placeholder|\bTBD\b|\[(name|address|state|county|date)\]/i.test(d)));
check('notices only by email: no postal address, arbitration notice + opt-out + DMCA go to the email', !/MAILING_ADDRESS|DMCA_AGENT_ADDRESS|DMCA_AGENT_PHONE/.test(allDocs.join('\n')) && /Notice of dispute/.test(allDocs[0]) && /opt out of this arbitration agreement by sending an email to hybrdbeast@gmail\.com/.test(allDocs[0]) && /must be sent by email/.test(allDocs[0]) && /\*\*Email:\*\* hybrdbeast@gmail\.com/.test(allDocs[4]));
check('Ohio law, Delaware County venue and small claims, US only', /laws of the State of \*\*Ohio\*\*/.test(allDocs[0]) && /Delaware County, Ohio, USA/.test(allDocs[0]) && /small-claims court\*\* \(in the county where you live or in Delaware County, Ohio\)/.test(allDocs[0]) && /intended for users in the \*\*United States\*\*/.test(allDocs[0]) && /United States only/.test(allDocs[1]));
check('effective + last updated dates on every document', allDocs.every((d) => /Effective date:\*\* November 26, 2026 · \*\*Last updated:\*\* November 26, 2026/.test(d)));

// ---------- markdown
const inl = inline('**Bold** and *it* and [Terms](/legal/terms) and [[LEGAL_NAME]].');
check('inline: bold, italic, link, placeholder', inl.some((x) => x.t === 'b') && inl.some((x) => x.t === 'i') && inl.some((x) => x.t === 'a' && x.href === '/legal/terms') && inl.some((x) => x.t === 'ph' && x.key === 'LEGAL_NAME'));
const pb = parse(doc('privacy'));
const nested = pb.find((b) => b.t === 'ul' && b.items.some((it) => it.blocks.some((x) => x.t === 'ul')));
check('nested lists parse (privacy › health and body)', !!nested);
check('tables parse (retention table)', pb.some((b) => b.t === 'table' && b.head.length === 2 && b.rows.length >= 6));
const tt = toc(parse(doc('terms')));
check('terms table of contents has the main sections', tt.length >= 20 && tt.some((t) => /ARBITRATION/.test(t.text)) && new Set(tt.map((t) => t.id)).size === tt.length);
check('plain() flattens', plain(inline('**a** [b](/x)')) === 'a b');

// ---------- documents: required content
const T = doc('terms'), P = doc('privacy'), H = doc('health-data'), D = doc('disclaimer'), M = doc('dmca'), X = doc('delete-account');
check('terms: clickwrap acceptance + version record', /checking the box/i.test(T) && /records the version/i.test(T));
check('terms: minimum age + under-13 statement', new RegExp(`at least \\*\\*${DEFAULT_MIN_AGE} years old`).test(T) && /children under 13/i.test(T));
check('terms: users own content + licence', /You own your content/.test(T) && /royalty-free licence/.test(T));
check('terms: assumption of risk is conspicuous (caps)', /ASSUMPTION OF RISK/.test(T) && /YOU KNOWINGLY AND VOLUNTARILY ASSUME ALL OF THESE RISKS/.test(T));
check('terms: not medical advice, Pulse non-clinical, 988 / 911', /NOT MEDICAL ADVICE/.test(T) && /not clinical tools/i.test(T) && /988/.test(T) && /911/.test(T));
check('terms: warranty disclaimer in caps', /"AS IS" AND "AS AVAILABLE"/.test(T));
check('terms: liability cap greater of 12 months paid or $50', /GREATER OF \(A\) THE AMOUNT YOU PAID US FOR THE SERVICE IN THE 12 MONTHS/.test(T) && /US \$50/.test(T));
check('terms: carve-outs where the law forbids (gross negligence, fraud)', /cannot be limited or excluded under applicable law/i.test(T) && /gross negligence/i.test(T) && /Virginia and Louisiana/.test(T));
check('terms: release + Cal. Civ. Code §1542', /RELEASE/.test(T) && /1542/.test(T));
check('terms: indemnity', /indemnify and hold harmless/i.test(T));
check('terms: arbitration (FAA, AAA consumer + mass rules, small claims, class waiver, 30-day opt-out, McGill carve-out)', /Federal Arbitration Act/.test(T) && /Consumer Arbitration Rules/.test(T) && /Mass Arbitration Supplementary Rules/.test(T) && /small-claims court/i.test(T) && /CLASS-ACTION AND JURY WAIVER/.test(T) && /30-DAY RIGHT TO OPT OUT/.test(T) && /public injunctive relief/i.test(T));
check('terms: governing law Ohio + venue Delaware County', /laws of the State of \*\*Ohio\*\*/.test(T) && /Delaware County, Ohio, USA/.test(T));
check('terms: future subscriptions + auto-renew disclosure', /renew automatically/i.test(T) && /17600/.test(T));
check('terms: severability, entire agreement, changes, electronic notices, no SMS', /Severability/.test(T) && /Entire agreement/.test(T) && /Changes to these Terms/.test(T) && /Electronic communications/.test(T) && /does not send marketing texts or SMS/i.test(T));
check('privacy: no sale, no sharing for ads, no analytics', /do not sell your personal information/i.test(P) && /cross-context behavioural advertising/.test(P) && /do not run analytics software/i.test(P));
check('privacy: calls not recorded, messages not end-to-end encrypted', /We do not record calls/.test(P) && /not end-to-end encrypted/.test(P));
check('privacy: 30-day deletion + retention table + stories 24 h', /30 days/.test(P) && /Stories/.test(P) && /24 hours/.test(P));
check('privacy: CalOPPA Do Not Track + GPC', /Do Not Track/.test(P) && /Global Privacy Control/.test(P));
check('privacy: California + state rights + appeal', /California notice/.test(P) && /Virginia/.test(P) && /Appeal/.test(P));
check('privacy: cookies & local storage section', /Cookies and local storage/.test(P) && /localStorage/.test(P) && /service worker/i.test(P));
check('privacy: children under 13 + breach notice (FTC HBNR)', /children under 13/i.test(P) && /Health Breach Notification Rule/.test(P));
check('privacy links the separate health-data policy', /\(\/legal\/health-data\)/.test(P));
check('health-data policy: the five MHMDA elements', /Categories of consumer health data we collect/.test(H) && /Sources/.test(H) && /Categories of consumer health data we share/.test(H) && /Third parties and affiliates/.test(H) && /Your rights and how to use them/.test(H));
check('health-data policy: no unrelated content (no Terms / arbitration)', !/arbitration/i.test(H) && !/cookie/i.test(H));
check('disclaimer: see a doctor + 988 + estimates', /Talk to a doctor/.test(D) && /988/.test(D) && /can be inaccurate/.test(D));
check('dmca: agent named, six elements, counter-notice, 10–14 business days, repeat infringers, 512(f)', /\*\*Name:\*\* José Manuel Cruz Ortiz/.test(M) && /penalty of perjury/.test(M) && /Counter-notice/.test(M) && /10 to 14 business days/.test(M) && /Repeat infringers/.test(M) && /512\(f\)/.test(M));
check('dmca: does not claim registration (to-do for the owner)', !/is registered/i.test(M));
check('deletion page: in-app path, email path (Google Play), what is kept', /Settings › Account › Delete account/.test(X) && /Delete my HYBRD account/.test(X) && /What we keep/.test(X) && /30 days/.test(X));

// ---------- facts the policies claim, checked against the code
const pkg = JSON.parse(src('package.json'));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ');
check('no analytics / ads SDKs in dependencies', !/analytics|gtag|segment|mixpanel|amplitude|posthog|sentry|admob|adsense|facebook/i.test(deps));
const html = src('index.html');
check('no tracking scripts in index.html', !/googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|plausible/i.test(html));
check('Strava data stays on the device (claim in privacy policy)', /isn’t synced to HYBRD accounts/.test(src('src/lib/strava.ts')));
check('unsend window 24 h and story expiry 24 h (claims match schema)', /interval '24 hours'/.test(src('supabase/schema.sql')) && /dm_unsend_window/.test(src('supabase/schema.sql')));
check('deletion is 30 days in the schema', /purge timestamptz := now\(\) \+ interval '30 days'/.test(src('supabase/schema.sql')));

// ---------- wiring
const onb = src('src/pages/Onboarding.tsx'), auth = src('src/pages/Auth.tsx'), app = src('src/App.tsx'), legalC = src('src/components/Legal.tsx');
check('onboarding: unchecked box, Get started disabled until checked, acceptance stored', /useState\(false\)/.test(onb) && /disabled=\{!canProceed\(agree\)\}/.test(onb) && /accept\(p\.legal, 'onboarding'\)/.test(onb));
check('onboarding: separate optional consents + separate health-data link', /consent-\$\{k\}/.test(onb) && /LegalLinks/.test(onb) && /\/legal\/health-data/.test(legalC));
check('sign-up: checkbox blocks submit + metadata', /signup-agree/.test(auth) && /mode === 'sign-up' && !canProceed\(agree\)/.test(auth) && /terms_version: LEGAL_VERSIONS\.terms/.test(auth));
check('clickwrap text: agree + Terms + Privacy + age', /I agree to the/.test(legalC) && /\/legal\/terms/.test(legalC) && /\/legal\/privacy/.test(legalC) && /or older/.test(legalC));
check('re-accept gate mounted and blocks until checked', /<LegalGate \/>/.test(app) && /disabled=\{!canProceed\(agree\)\}/.test(legalC) && /needsAccept\(lg\.rec\)/.test(legalC));
check('legal routes (in app and public before onboarding)', /path="\/legal"/.test(app) && /path="\/legal\/:doc"/.test(app) && /loc\.pathname\.startsWith\('\/legal\/'\)/.test(app));
check('every doc has a page route in postbuild', LEGAL_DOCS.every((d) => src('tools/postbuild.mjs').includes(`'legal/${d.id}'`)));
check('consent gates on Record (location) and Mind (health)', /ConsentGate kind="location"/.test(app) && /ConsentGate kind="health"/.test(app));
check('Settings: data consents + legal links; index searchable', /DataConsentsCard/.test(src('src/pages/Settings.tsx')) && /settings-legal/.test(src('src/pages/Settings.tsx')) && /Terms of Service/.test(src('src/lib/settingsIndex.ts')));
check('acceptances logged server-side through the RPC', /legal_record_acceptance/.test(legalC) && /create table if not exists public\.legal_acceptances/.test(src('supabase/schema.sql')) && /legal_acceptances\s+enable row level security/.test(src('supabase/schema.sql')));
check('styles: legal block uses theme tokens only', (() => { const css = src('src/styles.css'); const i = css.indexOf('v1.7 Legal'); return i > 0 && !/#[0-9a-f]{3,8}\b/i.test(css.slice(i)); })());
for (const id of ['terms', 'privacy', 'health-data', 'disclaimer', 'dmca', 'delete-account']) {
  const links = [...doc(id).matchAll(/\]\((\/[^)]+)\)/g)].map((m) => m[1].split('#')[0]);
  const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  const bad = links.filter((l) => !routes.includes(l) && !(l.startsWith('/legal/') && routes.includes('/legal/:doc')));
  check(`${id}: internal links point at real routes`, bad.length === 0, bad);
}

console.log(fails ? `\n${fails} FAILED` : `\nALL ${n} LEGAL CHECKS PASSED`);
if (fails) process.exit(1);
