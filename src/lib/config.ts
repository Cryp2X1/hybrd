declare global { interface Window { HYBRD_CONFIG?: { supabaseUrl?: string; supabaseAnonKey?: string; spotifyClientId?: string; stravaClientId?: string; stravaTokenUrl?: string; supportEmail?: string; turnUrls?: string; turnUsername?: string; turnCredential?: string; turnFunction?: string;
  /** Legal pages (src/legal/*.md placeholders). Fill these before launch; empty values show a visible placeholder. */
  legalName?: string; contactEmail?: string; legalLastUpdated?: string; mailingAddress?: string; governingState?: string; venueCounty?: string; legalEffectiveDate?: string;
  dmcaAgentName?: string; dmcaAgentAddress?: string; dmcaAgentEmail?: string; dmcaAgentPhone?: string; backupRetentionDays?: string; euStatus?: string; minAge?: number } } }

const LS_KEY = 'hybrd:backend';

export interface BackendConfig { url: string; anonKey: string; origin: 'config.js' | 'env' | 'device' | 'none' }

export function getBackendConfig(): BackendConfig {
  try {
    const dev = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (dev?.url && dev?.anonKey) return { url: dev.url, anonKey: dev.anonKey, origin: 'device' };
  } catch { /* ignore */ }
  const w = window.HYBRD_CONFIG;
  if (w?.supabaseUrl && w?.supabaseAnonKey) return { url: w.supabaseUrl, anonKey: w.supabaseAnonKey, origin: 'config.js' };
  const eu = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const ek = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (eu && ek) return { url: eu, anonKey: ek, origin: 'env' };
  return { url: '', anonKey: '', origin: 'none' };
}
export function setDeviceBackend(url: string, anonKey: string) {
  if (!url || !anonKey) localStorage.removeItem(LS_KEY);
  else localStorage.setItem(LS_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
}
export const isBackendConfigured = () => getBackendConfig().origin !== 'none';

/** Absolute app URL incl. GitHub Pages subpath, e.g. https://cryp2x1.github.io/hybrd/ */
export const appUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();
