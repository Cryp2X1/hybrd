// Export the legal documents as standalone Markdown to /workspace/hybrd-legal/ (or argv[2]).
// Fills every [[KEY]] from LEGAL_DEFAULTS in src/lib/legal.ts (the owner's details) plus versions, min age and app URL. Run: node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/export-legal.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LEGAL_DOCS, LEGAL_VERSIONS, PLACEHOLDERS, DEFAULT_MIN_AGE, fillPlaceholders, missingPlaceholders, legalValues } from '../src/lib/legal.ts';

const OUT = process.argv[2] || '/workspace/hybrd-legal';
const APP_URL = process.env.APP_URL || 'https://cryp2x1.github.io/hybrd/';
mkdirSync(OUT, { recursive: true });
const known: Record<string, string> = legalValues({ minAge: DEFAULT_MIN_AGE }, APP_URL);
const left = new Set<string>();
const index: string[] = [];
LEGAL_DOCS.forEach((d, i) => {
  const src = readFileSync(new URL(`../src/legal/${d.id}.md`, import.meta.url), 'utf8');
  const body = fillPlaceholders(src, known);
  missingPlaceholders(body).forEach((k) => left.add(k));
  const file = `${String(i + 1).padStart(2, '0')}-${d.id}.md`;
  // in-app links (/legal/x) → sibling files, so the folder reads on its own
  const linked = body.replace(/\]\(\/legal\/([a-z-]+)\)/g, (_m, id) => { const j = LEGAL_DOCS.findIndex((x) => x.id === id); return j < 0 ? `](${APP_URL}legal/${id})` : `](./${String(j + 1).padStart(2, '0')}-${id}.md)`; })
    .replace(/\]\(\/(?!legal)([^)]*)\)/g, (_m, p) => `](${APP_URL}${p})`);
  writeFileSync(`${OUT}/${file}`, linked.endsWith('\n') ? linked : linked + '\n');
  index.push(`| ${file} | ${d.title} | ${APP_URL}legal/${d.id} |`);
});
const readme = `# HYBRD legal documents (draft, ${LEGAL_VERSIONS.terms})

These are exported from the app (\`src/legal/*.md\`), the same text shown at ${APP_URL}legal.
**Not legal advice.** They are a researched starting point written to fit what HYBRD actually does; a licensed
attorney in your state should review them before launch, and again before any paid features.

| File | Document | In-app URL |
|---|---|---|
${index.join('\n')}

## Filled-in details
${left.size ? `**Still missing:** ${[...left].sort().map((k) => `${k} (${PLACEHOLDERS[k] || k})`).join(', ')}\n\n` : 'Every placeholder is filled.\n\n'}| Item | Value |
|---|---|
| Operator | ${known.LEGAL_NAME} |
| Contact email (support, privacy, DMCA, all legal notices incl. arbitration notices and opt-outs) | ${known.CONTACT_EMAIL} |
| Postal address for notices | None; notices are by email only |
| DMCA agent | ${known.DMCA_AGENT_NAME}, ${known.DMCA_AGENT_EMAIL} |
| Governing law | ${known.GOVERNING_STATE} |
| Venue and small claims | ${known.VENUE_COUNTY}, ${known.GOVERNING_STATE}, USA (small claims also in the user's home county) |
| Effective date / last updated | ${known.EFFECTIVE_DATE} / ${known.LAST_UPDATED} |
| Where offered | United States only (not EU/EEA, Switzerland or UK) |
| Backup retention stated | up to ${known.BACKUP_RETENTION_DAYS} days |
| Minimum age | ${known.MIN_AGE} |
| App URL | ${APP_URL} |

These come from \`LEGAL_DEFAULTS\` in \`src/lib/legal.ts\`; \`public/config.js\` can override them.
Changing a document? Bump its date in \`src/lib/legal.ts\` (\`LEGAL_VERSIONS\`) so existing users get the re-accept prompt.

## Before launch (outside the app)
- Have a licensed attorney in your state review all six documents (before launch and before any paid feature).
- The operator is currently you personally (sole proprietor dba HYBRD). Consider an LLC so the company, not you, is the party to these terms; then update \`legalName\`. In Ohio a trade name (dba) can be registered with the Secretary of State.
- Register the DMCA designated agent at https://www.copyright.gov/dmca-directory/ ($6, renew every 3 years). The registration form asks for a postal address and phone number (a P.O. box is accepted); the in-app page lists email only.
- Check that your Supabase plan keeps backups no longer than the stated 30 days (change \`backupRetentionDays\` if not).
- HYBRD is US-only. Offering it in the EU/UK later would need GDPR work (Art. 27 representative, explicit consent for health data).
- Optional: register the arbitration clause with the AAA Consumer Clause Registry before relying on AAA consumer arbitration.
- Google Play Data safety → delete-account URL: ${APP_URL}legal/delete-account. Apple 5.1.1(v): in-app deletion is in Settings › Account.
- If you ever allow under-18 users: parental-consent flows, a written COPPA data-retention / security program, and state teen social-media laws (FL, TN, others).
- Consider general liability / professional (E&O) insurance.

## Main sources
- Clickwrap enforceability: Berman v. Freedom Financial (9th Cir. 2022) https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/05/20-16900.pdf · Meyer v. Uber (2d Cir. 2017) https://law.justia.com/cases/federal/appellate-courts/ca2/16-2750/16-2750-2017-08-17.html
- Washington My Health My Data Act: https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.020 · https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy
- Nevada SB 370: https://archive.leg.state.nv.us/Session/82nd2023/Bills/SB/SB370_EN.pdf · Connecticut CTDPA: https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act
- COPPA amended rule (2025): https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm
- FTC Health Breach Notification Rule: https://www.federalregister.gov/documents/2024/05/30/2024-10855/health-breach-notification-rule
- CCPA sensitive data: https://www.law.cornell.edu/regulations/california/11-CCR-7027 · CalOPPA DNT: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22575
- Arbitration: AAA consumer rules https://www.adr.org/rules-forms-and-fees/consumer/ · mass-arbitration rules https://www.adr.org/media/ofkbtyz2/mass-arbitration-supplementary-rules.pdf · Heckman v. Live Nation https://law.justia.com/cases/federal/appellate-courts/ca9/23-55770/23-55770-2024-10-28.html · McGill v. Citibank https://law.justia.com/cases/california/supreme-court/2017/s224086.html
- Liability waivers: https://www.reuters.com/practical-law-the-journal/transactional/enforceability-liability-waivers-2024-07-01/
- DMCA: https://www.copyright.gov/dmca-directory/faq.html · https://www.congress.gov/crs-product/IF11478 · Section 230: https://www.congress.gov/crs-product/R46751
- Account deletion: Apple https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/ · Google Play https://support.google.com/googleplay/android-developer/answer/13327111
- Strava API terms: https://developers.strava.com/guidelines/ · OSM attribution: https://osmfoundation.org/wiki/Licence/Attribution%5FGuidelines · Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
`;
writeFileSync(`${OUT}/README.md`, readme);
console.log(`exported ${LEGAL_DOCS.length} documents + README to ${OUT}; ${left.size} placeholders left: ${[...left].sort().join(', ')}`);
