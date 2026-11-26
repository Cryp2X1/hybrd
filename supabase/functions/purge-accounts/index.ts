// HYBRD · purge-accounts — Supabase Edge Function (Deno). Required for "Delete account" (SETUP.md §15).
// Runs once a day (pg_cron + pg_net, see SETUP §15.3). For every account whose 30 days to reopen are over it:
//   1. deletes the person's files from Storage: user-media/<uid>/, social-media/<uid>/, activity-images/<uid>/
//      and the message-media files they sent (paths from account_purge_message_media),
//   2. calls account_purge_finish(uid), which deletes their messages and the auth user (→ cascades to every table).
// It also clears expired time-off pauses (account_housekeeping).
//
// Secrets (Dashboard › Edge Functions › Secrets, or `supabase secrets set PURGE_SECRET=...`):
//   PURGE_SECRET   a long random string; the cron job sends it in the `x-purge-secret` header.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically. Nothing is hard-coded here.
// Deploy WITHOUT JWT verification (the cron job authenticates with the shared secret instead):
//   supabase functions deploy purge-accounts --no-verify-jwt
// Logs only counts and user ids, never file contents.

const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? '';
const D = (globalThis as { Deno?: { serve?: (h: (r: Request) => Promise<Response>) => void } }).Deno;
if (D?.serve) D.serve((req: Request) => handle(req, env));

export const USER_BUCKETS = ['user-media', 'social-media', 'activity-images'] as const;
export const MESSAGE_BUCKET = 'message-media';
const MAX_PER_RUN = 50;

/** Constant-time string compare (avoids leaking the secret through timing). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export interface PurgeDeps { url: string; key: string; fetch: typeof fetch; log?: (...a: unknown[]) => void }
const headers = (d: PurgeDeps) => ({ apikey: d.key, Authorization: `Bearer ${d.key}`, 'Content-Type': 'application/json' });

async function rpc<T>(d: PurgeDeps, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await d.fetch(`${d.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(d), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}
/** Every file under `prefix/` (Storage lists one folder level at a time; folders come back with id = null). */
export async function listAll(d: PurgeDeps, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await d.fetch(`${d.url}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: headers(d), body: JSON.stringify({ prefix, limit: 1000, offset }) });
    if (!r.ok) throw new Error(`list ${bucket}/${prefix}: ${r.status}`);
    const items = (await r.json()) as { name: string; id: string | null }[];
    for (const it of items) {
      const p = `${prefix}/${it.name}`;
      if (it.id) out.push(p); else out.push(...(await listAll(d, bucket, p, depth + 1)));
    }
    if (items.length < 1000) break;
  }
  return out;
}
export async function removeFiles(d: PurgeDeps, bucket: string, paths: string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < paths.length; i += 500) {
    const batch = paths.slice(i, i + 500);
    const r = await d.fetch(`${d.url}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: headers(d), body: JSON.stringify({ prefixes: batch }) });
    if (!r.ok) throw new Error(`delete ${bucket}: ${r.status}`);
    n += batch.length;
  }
  return n;
}

/** Purge one account: files first (so nothing is orphaned), then the database rows. */
export async function purgeOne(d: PurgeDeps, uid: string): Promise<{ files: number; done: boolean }> {
  let files = 0;
  for (const b of USER_BUCKETS) files += await removeFiles(d, b, await listAll(d, b, uid));
  const msgPaths = (await rpc<string[] | { account_purge_message_media: string }[]>(d, 'account_purge_message_media', { p_user: uid }))
    .map((x) => (typeof x === 'string' ? x : x.account_purge_message_media)).filter(Boolean);
  files += await removeFiles(d, MESSAGE_BUCKET, msgPaths);
  const done = await rpc<boolean>(d, 'account_purge_finish', { p_user: uid });
  return { files, done };
}

export async function handle(req: Request, getEnv: (k: string) => string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const secret = getEnv('PURGE_SECRET');
  if (!secret) return json(500, { error: 'PURGE_SECRET is not set' });
  if (!safeEqual(req.headers.get('x-purge-secret') ?? '', secret)) return json(401, { error: 'unauthorized' });
  const d: PurgeDeps = { url: getEnv('SUPABASE_URL').replace(/\/$/, ''), key: getEnv('SUPABASE_SERVICE_ROLE_KEY'), fetch: fetchImpl, log: console.log };
  if (!d.url || !d.key) return json(500, { error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' });
  const resumed = await rpc<number>(d, 'account_housekeeping').catch(() => 0);
  const due = await rpc<{ user_id: string }[]>(d, 'account_purge_candidates', { p_limit: MAX_PER_RUN });
  const results: { user: string; files: number; done: boolean; error?: string }[] = [];
  for (const { user_id } of due) {
    try { results.push({ user: user_id, ...(await purgeOne(d, user_id)) }); }
    catch (e) { results.push({ user: user_id, files: 0, done: false, error: String((e as Error).message || e).slice(0, 200) }); }
  }
  d.log?.(`purge-accounts: resumed ${resumed}, due ${due.length}, purged ${results.filter((r) => r.done).length}`);
  return json(200, { resumed, due: due.length, purged: results.filter((r) => r.done).length, results });
}
