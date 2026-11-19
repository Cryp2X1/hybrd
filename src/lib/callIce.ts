// ICE servers for calls: free public STUN always; TURN when configured (SETUP.md §13.4).
// Best: the turn-credentials Edge Function hands out short-lived TURN credentials to signed-in users.
// Testing only: a static TURN username/password in config.js or VITE_TURN_* — anyone can read those from the site.
import type { SupabaseClient } from '@supabase/supabase-js';
import { iceServersFrom, type RTCIceServerLike, type TurnConfig } from './calls';

export function turnConfig(): TurnConfig & { fn: string } {
  const w = (typeof window !== 'undefined' && window.HYBRD_CONFIG) || {};
  const e = import.meta.env as Record<string, string | undefined>;
  return {
    turnUrls: w.turnUrls || e.VITE_TURN_URLS || '',
    turnUsername: w.turnUsername || e.VITE_TURN_USERNAME || '',
    turnCredential: w.turnCredential || e.VITE_TURN_CREDENTIAL || '',
    /** "supabase" = the turn-credentials function in your Supabase project, or a full https:// URL */
    fn: w.turnFunction || e.VITE_TURN_FUNCTION || '',
  };
}
let cache: { at: number; ttl: number; servers: RTCIceServerLike[] } | null = null;
export async function getIceServers(sb: SupabaseClient | null): Promise<RTCIceServerLike[]> {
  const cfg = turnConfig();
  if (cache && Date.now() - cache.at < (cache.ttl * 1000) / 2) return iceServersFrom(cfg, cache.servers);
  let extra: RTCIceServerLike[] = [];
  if (cfg.fn && sb) {
    try {
      let body: { iceServers?: RTCIceServerLike[]; ttl?: number } | null = null;
      if (/^https:\/\//.test(cfg.fn)) {
        const { data } = await sb.auth.getSession();
        const r = await fetch(cfg.fn, { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } });
        if (r.ok) body = await r.json();
      } else {
        const { data, error } = await sb.functions.invoke('turn-credentials', { method: 'POST' });
        if (!error) body = data as typeof body;
      }
      extra = Array.isArray(body?.iceServers) ? body!.iceServers! : [];
      cache = { at: Date.now(), ttl: Number(body?.ttl) || 3600, servers: extra };
    } catch (e) { console.warn('TURN credentials unavailable; using STUN only', e); }
  }
  return iceServersFrom(cfg, extra);
}
