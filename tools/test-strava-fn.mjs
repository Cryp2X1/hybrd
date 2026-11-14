// Unit test for both token-exchange functions with Strava mocked (no network).
let served = null;
globalThis.Deno = { serve: (h) => { served = h; }, env: { get: () => '' } };
const sb = await import('../supabase/functions/strava-token/index.ts');
const cf = await import('../workers/strava-token/worker.js');
const ENV = { STRAVA_CLIENT_ID: '123456', STRAVA_CLIENT_SECRET: 'sekret-value-xyz', ALLOWED_ORIGINS: 'https://cryp2x1.github.io,http://127.0.0.1:4173' };
const env = (k) => ENV[k] ?? '';
let calls = [];
const fakeStrava = async (url, init) => {
  calls.push({ url, init });
  const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams(init.body);
  if (url.endsWith('/oauth/token')) {
    if (body.get('client_secret') !== 'sekret-value-xyz' || body.get('client_id') !== '123456') return new Response('{"message":"Bad Request"}', { status: 400 });
    if (body.get('grant_type') === 'authorization_code' && body.get('code') === 'goodcode123') return new Response(JSON.stringify({ access_token: 'acc12345', refresh_token: 'ref12345', expires_at: 2e9, scope: 'read,activity:read_all', athlete: { id: 42, firstname: 'José', lastname: 'X', profile: 'https://photo', city: 'Austin' } }));
    if (body.get('grant_type') === 'refresh_token' && body.get('refresh_token') === 'ref12345') return new Response(JSON.stringify({ access_token: 'acc67890', refresh_token: 'ref67890', expires_at: 2e9 }));
    return new Response('{"message":"Bad Request","errors":[{"code":"invalid"}]}', { status: 400 });
  }
  if (url.endsWith('/oauth/revoke')) return new Response('', { status: init.headers.Authorization === `Basic ${btoa('123456:sekret-value-xyz')}` ? 200 : 401 });
  return new Response('', { status: 404 });
};
const req = (body, origin = 'https://cryp2x1.github.io', method = 'POST') => new Request('https://fn.example/strava-token', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
let fail = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
for (const [name, h] of [['supabase', sb.handle], ['cloudflare', cf.handle]]) {
  calls = [];
  let r = await h(req(null, 'https://cryp2x1.github.io', 'OPTIONS'), env, fakeStrava);
  ok(r.status === 204 && r.headers.get('access-control-allow-origin') === 'https://cryp2x1.github.io', `${name}: CORS preflight`);
  r = await h(req({ action: 'exchange', code: 'goodcode123' }, 'https://evil.example'), env, fakeStrava);
  ok(r.status === 403 && calls.length === 0, `${name}: other origins refused (no Strava call)`);
  r = await h(req({ action: 'exchange', code: 'goodcode123' }), env, fakeStrava);
  let j = await r.json();
  ok(r.status === 200 && j.access_token === 'acc12345' && j.athlete.id === 42 && j.athlete.firstname === 'José' && !('profile' in j.athlete) && !JSON.stringify(j).includes('sekret'), `${name}: exchange returns only needed fields, never the secret`);
  ok(new URLSearchParams(calls.at(-1).init.body).get('client_secret') === 'sekret-value-xyz', `${name}: secret added server-side`);
  r = await h(req({ action: 'refresh', refresh_token: 'ref12345' }), env, fakeStrava); j = await r.json();
  ok(r.status === 200 && j.refresh_token === 'ref67890', `${name}: refresh`);
  r = await h(req({ action: 'exchange', code: 'bad code!' }), env, fakeStrava);
  ok(r.status === 400, `${name}: malformed code rejected`);
  r = await h(req({ action: 'exchange', code: 'wrongcode1' }), env, fakeStrava);
  ok(r.status === 400, `${name}: Strava error passed through as 400`);
  r = await h(req({ action: 'revoke', token: 'ref67890' }), env, fakeStrava); j = await r.json();
  ok(r.status === 200 && j.revoked === true, `${name}: revoke uses Basic auth`);
  r = await h(req({ action: 'exchange', code: 'goodcode123' }), () => '', fakeStrava);
  ok(r.status === 403 || r.status === 500, `${name}: unconfigured function refuses`);
}
ok(typeof served === 'function', 'supabase: Deno.serve registered');
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
