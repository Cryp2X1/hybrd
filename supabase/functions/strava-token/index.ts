// HYBRD · Strava token exchange — Supabase Edge Function (Deno). Holds the Strava client secret so the
// static site never sees it. Stateless: stores nothing, logs no tokens.
//
// Secrets (Dashboard › Edge Functions › Secrets, or `supabase secrets set ...`):
//   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, ALLOWED_ORIGINS (comma-separated, e.g. https://cryp2x1.github.io)
// Deploy with JWT verification OFF (the browser calls it before anyone is signed in):
//   supabase functions deploy strava-token --no-verify-jwt
//
// POST JSON { action: 'exchange', code } | { action: 'refresh', refresh_token } | { action: 'revoke', token }

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve((req: Request) => handle(req, env));

export async function handle(req: Request, env: (k: string) => string, fetchImpl: typeof fetch = fetch): Promise<Response> {
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
  const id = env('STRAVA_CLIENT_ID'), secret = env('STRAVA_CLIENT_SECRET');
  if (!id || !secret) return json(500, { error: 'function not configured (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET missing)' });

  let b: { action?: string; code?: string; refresh_token?: string; token?: string };
  try { b = await req.json(); } catch { return json(400, { error: 'invalid JSON' }); }
  const tok = /^[A-Za-z0-9._-]{8,200}$/;

  if (b.action === 'exchange' || b.action === 'refresh') {
    const grant = b.action === 'exchange'
      ? (tok.test(b.code ?? '') ? { grant_type: 'authorization_code', code: b.code! } : null)
      : (tok.test(b.refresh_token ?? '') ? { grant_type: 'refresh_token', refresh_token: b.refresh_token! } : null);
    if (!grant) return json(400, { error: 'missing or malformed code/token' });
    const r = await fetchImpl('https://www.strava.com/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, ...grant }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json(r.status === 429 ? 429 : 400, { error: j.message || 'Strava rejected the request' });
    // Return only what the app needs (no profile photo, email, etc.)
    return json(200, {
      access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, scope: j.scope,
      athlete: j.athlete ? { id: j.athlete.id, firstname: j.athlete.firstname } : undefined,
    });
  }
  if (b.action === 'revoke') {
    if (!tok.test(b.token ?? '')) return json(400, { error: 'missing token' });
    const r = await fetchImpl('https://www.strava.com/oauth/revoke', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: b.token! }),
    });
    return json(r.ok ? 200 : 502, { revoked: r.ok });
  }
  return json(400, { error: 'unknown action' });
}
