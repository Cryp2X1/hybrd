import type { SupabaseClient } from '@supabase/supabase-js';
import { getBackendConfig } from './config';

let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;

/** Lazily creates the Supabase client (only when keys are configured). */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (client) return Promise.resolve(client);
  const cfg = getBackendConfig();
  if (cfg.origin === 'none') return Promise.resolve(null);
  if (!loading) {
    loading = import('@supabase/supabase-js').then(({ createClient }) => {
      client = createClient(cfg.url, cfg.anonKey, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'hybrd-auth' },
      });
      return client;
    }).catch((e) => { console.warn('Supabase failed to load', e); loading = null; return null; });
  }
  return loading;
}

export const TABLES: Record<string, string> = {
  workouts: 'workouts', routes: 'gps_routes', foods: 'food_logs', water: 'water_logs', body: 'body_logs', templates: 'templates', steps: 'step_logs', burns: 'burn_logs',
};
