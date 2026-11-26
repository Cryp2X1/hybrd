// Appearance: Light, Dark or System (follow the device). The choice lives in localStorage (so index.html can apply it
// before first paint — no flash) and, when signed in, in profile.theme (so it follows you to another device).
// The theme is applied as <html data-theme="light|dark">; every colour in styles.css comes from the tokens that
// attribute switches. Pure helpers are tested in tools/test-theme.ts.
import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'hybrd:theme';
/** What people get before they choose. 'system' follows the phone / computer. */
export const DEFAULT_PREF: ThemePref = 'system';
/** Browser / PWA chrome colours — must match --bg in styles.css (and the inline script in index.html). */
export const THEME_COLORS: Record<Theme, string> = { dark: '#0a0a0a', light: '#f4f4f1' };
export const THEME_OPTIONS: { v: ThemePref; label: string; sub: string; icon: string }[] = [
  { v: 'light', label: 'Light', sub: 'Bright screens, easy to read in daylight', icon: 'sun' },
  { v: 'dark', label: 'Dark', sub: 'Easier on the eyes at night, saves battery on OLED', icon: 'moon' },
  { v: 'system', label: 'System', sub: 'Matches your phone or computer, switches automatically', icon: 'monitor' },
];

export const parsePref = (v: unknown): ThemePref => (v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT_PREF);
export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref);
export const prefLabel = (p: ThemePref) => THEME_OPTIONS.find((o) => o.v === p)!.label;

const mq = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);
export const systemIsDark = () => mq()?.matches ?? true;

export function readStoredPref(): ThemePref {
  try { return parsePref(localStorage.getItem(THEME_KEY)); } catch { return DEFAULT_PREF; }
}
export const hasStoredPref = () => { try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' || v === 'system'; } catch { return false; } };

/** Apply a theme to the page: data-theme, color-scheme and the browser's theme-color. */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
  const color = THEME_COLORS[theme];
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = color;
  // iOS home-screen apps: light text over the dark theme, dark text over the light theme
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default');
}

export const THEME_EVENT = 'hybrd:theme-changed';
export function setStoredPref(pref: ThemePref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode: still applied for this session */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(THEME_EVENT)); // every useTheme() in this tab updates
}

/** The current preference + resolved theme; setPref saves and applies it everywhere. */
export function useTheme(onSave?: (p: ThemePref) => void) {
  const [pref, setPrefState] = useState<ThemePref>(readStoredPref);
  const [sysDark, setSysDark] = useState<boolean>(systemIsDark);
  useEffect(() => {
    const m = mq(); if (!m) return;
    const on = () => setSysDark(m.matches);
    m.addEventListener?.('change', on); return () => m.removeEventListener?.('change', on);
  }, []);
  useEffect(() => { // changed elsewhere in this tab, or in another tab
    const same = () => setPrefState(readStoredPref());
    const other = (e: StorageEvent) => { if (e.key === THEME_KEY) same(); };
    window.addEventListener(THEME_EVENT, same); window.addEventListener('storage', other);
    return () => { window.removeEventListener(THEME_EVENT, same); window.removeEventListener('storage', other); };
  }, []);
  const theme = resolveTheme(pref, sysDark);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const setPref = useCallback((p: ThemePref) => { setStoredPref(p); onSave?.(p); }, [onSave]);
  return { pref, theme, setPref, sysDark };
}
