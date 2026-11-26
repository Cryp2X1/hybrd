// HYBRD runtime config. Paste your Supabase Project URL and anon (public) key here to turn on accounts.
// The anon key is safe to publish: Row Level Security in supabase/schema.sql protects every row.
// spotifyClientId: the Client ID of your app at developer.spotify.com/dashboard (public; PKCE needs no secret).
// Never put a Spotify Client SECRET here — HYBRD doesn't use one.
// stravaClientId: the (public) Client ID from strava.com/settings/api. stravaTokenUrl: the URL of the
// strava-token function you deployed (SETUP.md §9). The Strava Client SECRET goes ONLY into that function.
// turnFunction: 'supabase' to get short-lived TURN relay credentials from the turn-credentials Edge Function
// (SETUP.md §13.4), or a full https:// URL. turnUrls/turnUsername/turnCredential: quick tests ONLY — they're public.
// supportEmail: where users can ask questions or request data deletion (Strava API Policy §2.4).
// Legal pages (/legal): legalName = the person or company that runs HYBRD; contactEmail = the one address for support,
// privacy, DMCA and all legal notices (email only; there is no postal address for notices); governingState / venueCounty
// for Terms §19–20; legalEffectiveDate / legalLastUpdated; dmcaAgent* = the DMCA agent; backupRetentionDays = the longest
// your Supabase backups are kept; minAge = minimum age (default 18; see SETUP §16). HYBRD is offered in the US only.
// Built-in defaults in src/lib/legal.ts (LEGAL_DEFAULTS) match these, so an older config.js still shows complete pages.
// Empty legal values fall back to LEGAL_DEFAULTS. Have a lawyer review the documents before launch.
window.HYBRD_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  spotifyClientId: '',
  stravaClientId: '',
  stravaTokenUrl: '',
  supportEmail: 'hybrdbeast@gmail.com',
  legalName: 'José Manuel Cruz Ortiz, an individual doing business as HYBRD',
  contactEmail: 'hybrdbeast@gmail.com',
  governingState: 'Ohio',
  venueCounty: 'Delaware County',
  legalEffectiveDate: 'November 26, 2026',
  legalLastUpdated: 'November 26, 2026',
  dmcaAgentName: 'José Manuel Cruz Ortiz',
  dmcaAgentEmail: 'hybrdbeast@gmail.com',
  backupRetentionDays: '30',
  minAge: 18,
  turnFunction: '',
  turnUrls: '',
  turnUsername: '',
  turnCredential: '',
};
