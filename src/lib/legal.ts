// Legal: document versions, the clickwrap record (which Terms / Privacy version was accepted, when, from where),
// separate opt-in consents (health & mood data, precise location) and placeholder filling for the /legal pages.
// Pure: no React, no storage. The record lives in profile.legal (synced with the account) and, for signed-in
// users, is also logged server-side in public.legal_acceptances (append-only) as proof of assent.

/** Bump a date when the document changes in a way people must accept again (Terms / Privacy) or re-consent to (health). */
export const LEGAL_VERSIONS = { terms: '2026-11-26', privacy: '2026-11-26', health: '2026-11-26', location: '2026-11-26' } as const;
export type LegalVersions = { terms: string; privacy: string; health: string; location: string };

/** Short "what changed" list shown on the re-accept prompt for the current version. */
export const LEGAL_CHANGES: string[] = [
  'New Terms of Service: you are responsible for how you use HYBRD, with an assumption of risk, limits on our liability and a release.',
  'Disputes go to individual arbitration (with a 30-day opt-out and a small-claims option) instead of class actions.',
  'New Privacy Policy and a separate Consumer Health Data Privacy Policy. Still no ads, no selling and no tracking.',
  'Minimum age, Fitness & Nutrition Disclaimer, Copyright (DMCA) Policy and the Account & Data Deletion page.',
];

export const DEFAULT_MIN_AGE = 18;
/** Minimum age to use HYBRD: config.js `minAge` (13–21), default 18. Under 13 is never allowed (COPPA). */
export function minAge(cfg: { minAge?: unknown } | undefined = typeof window !== 'undefined' ? window.HYBRD_CONFIG : undefined): number {
  const n = Math.round(Number(cfg?.minAge));
  return Number.isFinite(n) && n >= 13 && n <= 21 ? n : DEFAULT_MIN_AGE;
}

export type ConsentKind = 'health' | 'location';
export interface ConsentRec { granted: boolean; at: string; v: string }
export type AcceptSource = 'onboarding' | 'sign-up' | 'reaccept';
export interface AcceptEntry { terms: string; privacy: string; at: string; source: AcceptSource; age: number }
export interface LegalRecord {
  terms?: string; privacy?: string; acceptedAt?: string; source?: AcceptSource;
  /** The minimum age the person confirmed when they accepted. */
  ageConfirmed?: number;
  /** Last 20 acceptances (newest last). */
  history?: AcceptEntry[];
  health?: ConsentRec; location?: ConsentRec;
}

/** True when nothing was accepted yet, or the accepted Terms / Privacy version isn't the current one. */
export const needsAccept = (r: LegalRecord | undefined, v: Pick<LegalVersions, 'terms' | 'privacy'> = LEGAL_VERSIONS) =>
  !r || r.terms !== v.terms || r.privacy !== v.privacy;

/** The clickwrap button only works when the box is checked (no pre-checked boxes, no "by continuing" browsewrap). */
export const canProceed = (agreed: boolean) => agreed === true;

export function accept(r: LegalRecord | undefined, source: AcceptSource, now = new Date(), v: LegalVersions = LEGAL_VERSIONS, age = minAge()): LegalRecord {
  const at = now.toISOString();
  const entry: AcceptEntry = { terms: v.terms, privacy: v.privacy, at, source, age };
  return { ...(r || {}), terms: v.terms, privacy: v.privacy, acceptedAt: at, source, ageConfirmed: age, history: [...(r?.history || []), entry].slice(-20) };
}

export const hasConsent = (r: LegalRecord | undefined, k: ConsentKind) => !!r?.[k]?.granted;
/** Never asked (undefined) vs. asked and declined (granted: false). */
export const consentAsked = (r: LegalRecord | undefined, k: ConsentKind) => !!r?.[k];
export function setConsent(r: LegalRecord | undefined, k: ConsentKind, granted: boolean, now = new Date(), v: LegalVersions = LEGAL_VERSIONS): LegalRecord {
  return { ...(r || {}), [k]: { granted, at: now.toISOString(), v: v[k] } };
}

export const CONSENT_TEXT: Record<ConsentKind, { title: string; body: string; allow: string; doc: string }> = {
  health: {
    title: 'Mood and mental-wellbeing data',
    body: 'Mind & Recovery saves your Pulse mood scores, check-ins, optional questionnaires (like PHQ- or GAD-style questions) and journal entries. We use them only to show your trends and suggest sessions. They are never sold, never used for ads and never shared with other users. You can keep them on this device only, and withdraw this consent any time in Settings › Privacy.',
    allow: 'I agree to HYBRD collecting and storing my mood and mental-wellbeing data for these features',
    doc: '/legal/health-data',
  },
  location: {
    title: 'Precise location for GPS recording',
    body: 'Record uses your phone’s GPS only while you record, to draw your route and measure distance and pace. Routes are private unless you share them, and shared routes can hide your start and end and your privacy zones. You can record indoor workouts without location, and withdraw this consent any time in Settings › Privacy.',
    allow: 'I agree to HYBRD using my precise location while I record activities',
    doc: '/legal/privacy',
  },
};

// ---------------------------------------------------------------- documents + placeholders
export type LegalDocId = 'terms' | 'privacy' | 'health-data' | 'disclaimer' | 'dmca' | 'delete-account';
export interface LegalDoc { id: LegalDocId; title: string; blurb: string; icon: string }
export const LEGAL_DOCS: LegalDoc[] = [
  { id: 'terms', title: 'Terms of Service', blurb: 'The rules for using HYBRD, your responsibilities, liability limits and arbitration.', icon: 'flag' },
  { id: 'privacy', title: 'Privacy Policy', blurb: 'What we collect, why, who we share it with (no ads, no selling) and your rights. Includes cookies & local storage.', icon: 'lock' },
  { id: 'health-data', title: 'Consumer Health Data Privacy Policy', blurb: 'Required by Washington’s My Health My Data Act and similar Nevada and Connecticut laws.', icon: 'heart' },
  { id: 'disclaimer', title: 'Fitness & Nutrition Disclaimer', blurb: 'Not medical advice. Exercise, nutrition and fasting risks, and when to see a doctor.', icon: 'info' },
  { id: 'dmca', title: 'Copyright (DMCA) Policy', blurb: 'How to report copyright infringement and send a counter-notice.', icon: 'copy' },
  { id: 'delete-account', title: 'Account & Data Deletion', blurb: 'How to delete your account and data, in the app or by email, and what is kept.', icon: 'trash' },
];
export const isLegalDocId = (s: string | undefined): s is LegalDocId => !!s && LEGAL_DOCS.some((d) => d.id === s);

export const PLACEHOLDERS: Record<string, string> = {
  LEGAL_NAME: 'Legal name of the person or company that runs HYBRD',
  CONTACT_EMAIL: 'Contact email',
  GOVERNING_STATE: 'State',
  VENUE_COUNTY: 'County',
  EFFECTIVE_DATE: 'Effective date',
  LAST_UPDATED: 'Last updated',
  DMCA_AGENT_NAME: 'DMCA agent name',
  DMCA_AGENT_EMAIL: 'DMCA agent email',
  BACKUP_RETENTION_DAYS: 'Backup retention, in days',
  APP_URL: 'App URL',
};
/**
 * The operator's details as given by the owner (Jose, 2026-11-26). Built in so the published pages are complete even
 * when a deployed config.js predates these keys; config.js values override them. Notices go by email only
 * (no postal mailing address yet). HYBRD is offered in the US only.
 */
export const LEGAL_DEFAULTS = {
  legalName: 'José Manuel Cruz Ortiz, an individual doing business as HYBRD',
  contactEmail: 'hybrdbeast@gmail.com',
  governingState: 'Ohio',
  venueCounty: 'Delaware County',
  legalEffectiveDate: 'November 26, 2026',
  legalLastUpdated: 'November 26, 2026',
  dmcaAgentName: 'José Manuel Cruz Ortiz',
  dmcaAgentEmail: 'hybrdbeast@gmail.com',
  backupRetentionDays: '30',
} as const;
type Cfg = NonNullable<Window['HYBRD_CONFIG']>;
/** Values for [[KEY]] tokens: config.js first, then LEGAL_DEFAULTS. Anything still missing stays a visible token. */
export function legalValues(cfg: Cfg | undefined, appUrl: string, v: LegalVersions = LEGAL_VERSIONS, defaults: Partial<Record<keyof typeof LEGAL_DEFAULTS, string>> = LEGAL_DEFAULTS): Record<string, string> {
  const c = (cfg || {}) as Record<string, unknown>;
  const t = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' ? String(x) : undefined);
  const g = (k: keyof typeof LEGAL_DEFAULTS) => t(c[k]) ?? t(defaults[k]);
  const out: Record<string, string | undefined> = {
    LEGAL_NAME: g('legalName'), CONTACT_EMAIL: t(c.contactEmail) || t(c.supportEmail) || t(defaults.contactEmail),
    GOVERNING_STATE: g('governingState'), VENUE_COUNTY: g('venueCounty'), EFFECTIVE_DATE: g('legalEffectiveDate'),
    LAST_UPDATED: t(c.legalLastUpdated) || t(c.legalEffectiveDate) || t(defaults.legalLastUpdated),
    DMCA_AGENT_NAME: g('dmcaAgentName'), DMCA_AGENT_EMAIL: t(c.dmcaAgentEmail) || t(c.contactEmail) || t(defaults.dmcaAgentEmail),
    BACKUP_RETENTION_DAYS: g('backupRetentionDays'),
    APP_URL: appUrl || undefined, MIN_AGE: String(minAge(cfg)),
    TERMS_VERSION: v.terms, PRIVACY_VERSION: v.privacy, HEALTH_VERSION: v.health,
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as Record<string, string>;
}
/** Replace [[KEY]] tokens with values; unknown / empty ones are left as [[KEY]] for the renderer to highlight. */
export const fillPlaceholders = (md: string, values: Record<string, string>) => md.replace(/\[\[([A-Z_]+)\]\]/g, (m, k: string) => values[k] ?? m);
export const missingPlaceholders = (md: string) => [...new Set([...md.matchAll(/\[\[([A-Z_]+)\]\]/g)].map((m) => m[1]))];
