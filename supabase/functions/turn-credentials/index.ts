// HYBRD · TURN credentials for calls — Supabase Edge Function (Deno). Optional (SETUP.md §13.4).
// Calls work peer-to-peer with free public STUN, but some networks (strict NATs, many mobile carriers, corporate
// Wi-Fi) need a TURN relay. This function hands signed-in users SHORT-LIVED TURN credentials, so no long-term
// TURN secret is ever shipped in the static site. Stateless: stores nothing, logs no credentials.
//
// Pick ONE provider with secrets (Dashboard › Edge Functions › Secrets, or `supabase secrets set ...`):
//   coturn (self-hosted):  TURN_URLS="turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp"
//                          TURN_SECRET=<static-auth-secret from turnserver.conf (use-auth-secret)>   [TURN_TTL=21600]
//   Cloudflare Realtime:   CF_TURN_KEY_ID=<TURN key id>  CF_TURN_API_TOKEN=<TURN key API token>     [TURN_TTL=21600]
//   Metered (Open Relay):  METERED_DOMAIN=<yourapp>.metered.live  METERED_API_KEY=<API key>
// Also: ALLOWED_ORIGINS (comma-separated, e.g. https://cryp2x1.github.io). SUPABASE_URL / SUPABASE_ANON_KEY are
// provided by Supabase automatically and are used to check the caller is a signed-in HYBRD user.
// Deploy WITH JWT verification (the default):  supabase functions deploy turn-credentials
// POST (no body) with the user's access token → { iceServers: [...], ttl }

const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? '';
const D = (globalThis as { Deno?: { serve?: (h: (r: Request) => Promise<Response>) => void } }).Deno;
if (D?.serve) D.serve((req: Request) => handle(req, env));

type Ice = { urls: string | string[]; username?: string; credential?: string };
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** coturn "TURN REST API" credentials: username = "<expiry unix>:<user id>", password = base64(HMAC-SHA1(secret, username)). */
export async function coturnCredential(secret: string, userId: string, ttlSec: number, nowSec = Math.floor(Date.now() / 1000)) {
  const username = `${nowSec + ttlSec}:${userId}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const credential = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username)));
  return { username, credential };
}

export async function handle(req: Request, env: (k: string) => string, fetchImpl: typeof fetch = fetch, nowSec?: number): Promise<Response> {
  const allowed = env('ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin') ?? '';
  const ok = allowed.includes(origin);
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
  if (!ok) return json(403, { error: 'origin not allowed' });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  // who is asking? (only signed-in HYBRD users get relay credentials)
  const auth = req.headers.get('Authorization') ?? '';
  const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(auth)?.[1];
  if (!token) return json(401, { error: 'sign in first' });
  const sbUrl = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  if (!sbUrl || !anon) return json(500, { error: 'function not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing)' });
  let uid = '';
  try {
    const u = await fetchImpl(`${sbUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } });
    if (!u.ok) return json(401, { error: 'sign in first' });
    uid = String(((await u.json()) as { id?: string }).id || '');
  } catch { return json(502, { error: 'could not check your session' }); }
  if (!/^[0-9a-f-]{36}$/i.test(uid)) return json(401, { error: 'sign in first' });

  const ttl = Math.min(86_400, Math.max(600, Number(env('TURN_TTL')) || 21_600));
  try {
    if (env('TURN_SECRET') && env('TURN_URLS')) {
      const urls = env('TURN_URLS').split(',').map((s) => s.trim()).filter((s) => /^turns?:/i.test(s));
      if (!urls.length) return json(500, { error: 'TURN_URLS has no turn: / turns: URLs' });
      const c = await coturnCredential(env('TURN_SECRET'), uid, ttl, nowSec);
      return json(200, { iceServers: [{ urls, username: c.username, credential: c.credential }] as Ice[], ttl });
    }
    if (env('CF_TURN_KEY_ID') && env('CF_TURN_API_TOKEN')) {
      const r = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env('CF_TURN_KEY_ID'))}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${env('CF_TURN_API_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl }),
      });
      if (!r.ok) return json(502, { error: `Cloudflare TURN error ${r.status}` });
      const b = (await r.json()) as { iceServers?: Ice[] | Ice };
      const list = (Array.isArray(b.iceServers) ? b.iceServers : b.iceServers ? [b.iceServers] : [])
        // port 53 is blocked by browsers (Cloudflare's own docs say to drop it)
        .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }));
      return json(200, { iceServers: list, ttl });
    }
    if (env('METERED_DOMAIN') && env('METERED_API_KEY')) {
      const dom = env('METERED_DOMAIN').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (!/^[a-z0-9-]+\.metered\.live$/i.test(dom)) return json(500, { error: 'METERED_DOMAIN should look like yourapp.metered.live' });
      const r = await fetchImpl(`https://${dom}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env('METERED_API_KEY'))}`);
      if (!r.ok) return json(502, { error: `Metered error ${r.status}` });
      const b = await r.json();
      return json(200, { iceServers: Array.isArray(b) ? b : [], ttl: 86_400 });
    }
  } catch { return json(502, { error: 'TURN provider unreachable' }); }
  return json(500, { error: 'no TURN provider configured (see SETUP.md §13.4)' });
}
