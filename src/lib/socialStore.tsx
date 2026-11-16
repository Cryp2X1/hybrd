// Friends & Stories: picks the backend (live Supabase when signed in, otherwise the opt-in on-device DEMO with sample
// people), and keeps the signed-in person's public profile, friend graph and notification badge in one place.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get, set, del } from 'idb-keyval';
import { useAuth } from './auth';
import { useStore } from './store';
import { getSupabase } from './supabase';
import { ageGate, badgeCount, type AgeGate, type PublicProfile } from './social';
import type { GraphView, NotifView, SocialBackend } from './socialApi';
import { DemoBackend, type DemoState } from './socialDemo';
import { SupabaseSocial } from './socialSupabase';

export type SocialMode = 'loading' | 'underage' | 'connect' | 'signin' | 'demo' | 'live';
interface SocialCtx {
  mode: SocialMode;
  backend: SocialBackend | null;
  me: PublicProfile | null;
  meReady: boolean;
  graph: GraphView | null;
  notifs: NotifView[];
  badge: number;
  age: AgeGate;
  refresh(): Promise<void>;
  setMe(p: PublicProfile | null): void;
  enterDemo(): void;
  exitDemo(): void;
  resetDemo(): Promise<void>;
  seen: Set<string>;
  markSeen(ids: string[]): void;
}
const Ctx = createContext<SocialCtx>(null as unknown as SocialCtx);
export const useSocial = () => useContext(Ctx);

const DEMO_FLAG = 'hybrd:social-demo';
const DEMO_KEY = 'hybrd:social-demo:v1';
const SEEN_KEY = 'hybrd:social-seen';
const demoOn = () => { try { return localStorage.getItem(DEMO_FLAG) === '1'; } catch { return false; } };
const makeDemo = () => new DemoBackend({ load: () => get<DemoState>(DEMO_KEY), save: (s) => set(DEMO_KEY, s), blobUrl: (b) => URL.createObjectURL(b) });

export function SocialProvider({ children }: { children: ReactNode }) {
  const { configured, ready: authReady, user } = useAuth();
  const { profile, ready } = useStore();
  const [demo, setDemo] = useState(demoOn);
  const [backend, setBackend] = useState<SocialBackend | null>(null);
  const [me, setMe] = useState<PublicProfile | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [graph, setGraph] = useState<GraphView | null>(null);
  const [notifs, setNotifs] = useState<NotifView[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => { try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } });
  const age = ageGate(profile.dob, profile.dob ? undefined : profile.age);
  const live = configured && !!user;
  const mode: SocialMode = !ready || (configured && !authReady) ? 'loading' : age === 'under13' ? 'underage' : live ? 'live' : demo ? 'demo' : configured ? 'signin' : 'connect';

  // pick the backend
  useEffect(() => {
    let alive = true;
    setMeReady(false); setMe(null); setGraph(null); setNotifs([]);
    if (mode === 'demo') { setBackend(makeDemo()); return; }
    if (mode === 'live' && user) { getSupabase().then((sb) => { if (alive) setBackend(sb ? new SupabaseSocial(sb, user.id) : null); }); return () => { alive = false; }; }
    setBackend(null);
    return () => { alive = false; };
  }, [mode, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (!backend || busy.current) return;
    busy.current = true;
    try {
      const m = await backend.me();
      setMe(m);
      if (m) { const [g, n] = await Promise.all([backend.graph(), backend.notifications()]); setGraph(g); setNotifs(n); }
    } catch (e) { console.warn('social refresh failed', e); }
    finally { busy.current = false; setMeReady(true); }
  }, [backend]);
  useEffect(() => { refresh(); }, [refresh]);
  // keep the badge fresh: realtime when live, plus a light poll while the tab is visible
  useEffect(() => {
    if (!backend || !me) return;
    const unsub = backend instanceof SupabaseSocial ? backend.subscribe(() => refresh()) : undefined;
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    return () => { window.clearInterval(t); unsub?.(); };
  }, [backend, me?.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<SocialCtx>(() => ({
    mode, backend, me, meReady, graph, notifs, age,
    badge: me ? badgeCount(graph?.incoming.length || 0, notifs) : 0,
    refresh, setMe,
    enterDemo: () => { localStorage.setItem(DEMO_FLAG, '1'); setDemo(true); },
    exitDemo: () => { localStorage.removeItem(DEMO_FLAG); setDemo(false); },
    resetDemo: async () => { await del(DEMO_KEY); sessionStorage.removeItem(SEEN_KEY); setSeen(new Set()); setBackend(makeDemo()); },
    seen,
    markSeen: (ids) => setSeen((s) => { const n = new Set([...s, ...ids]); try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...n])); } catch { /* ignore */ } return n; }),
  }), [mode, backend, me, meReady, graph, notifs, age, refresh, seen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
