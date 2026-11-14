// HYBRD runtime config. Paste your Supabase Project URL and anon (public) key here to turn on accounts.
// The anon key is safe to publish: Row Level Security in supabase/schema.sql protects every row.
// spotifyClientId: the Client ID of your app at developer.spotify.com/dashboard (public; PKCE needs no secret).
// Never put a Spotify Client SECRET here — HYBRD doesn't use one.
// stravaClientId: the (public) Client ID from strava.com/settings/api. stravaTokenUrl: the URL of the
// strava-token function you deployed (SETUP.md §9). The Strava Client SECRET goes ONLY into that function.
// supportEmail: where users can ask questions or request data deletion (Strava API Policy §2.4).
window.HYBRD_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  spotifyClientId: '',
  stravaClientId: '',
  stravaTokenUrl: '',
  supportEmail: '',
};
