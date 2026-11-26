// Safety: picks the backend (live Supabase RPCs when signed in to a configured backend, otherwise the on-device demo)
// and keeps the account status (time off, deletion, moderator decisions) in one place for every screen.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import { useAuth } from './auth';
import { getSupabase } from './supabase';
import { decisionActive, effectiveStatus, messagingRestricted, type Decision, type EffectiveStatus } from './safety';
import type { SafetyBackend, SafetyStatus } from './safetyApi';
import { SafetyDemoBackend, type SafetyDemoState } from './safetyDemo';
import { SupabaseSafety } from './safetySupabase';

interface SafetyCtx {
  backend: SafetyBackend | null;
  mode: 'loading' | 'demo' | 'live';
  status: SafetyStatus | null;
  effective: EffectiveStatus;
  /** Active content removals by content id (only your own content shows a notice). */
  removed: Map<string, Decision>;
  msgRestricted: Decision | null;
  isModerator: boolean;
  /** Live backend reachable but the safety SQL isn't installed (SETUP §15). */
  setupNeeded: boolean;
  refresh(): Promise<void>;
  /** The "welcome back" / "scheduled for deletion" / "suspended" screen shown after signing in. */
  gateOpen: boolean;
  /** Close the screen; pass the status you just chose (e.g. right after starting time off) so it doesn't pop up. */
  closeGate(kind?: string): void;
  /** Demo: show the screen as if you had just logged back in. */
  previewLogin(): void;
}
const Ctx = createContext<SafetyCtx>(null as unknown as SafetyCtx);
export const useSafety = () => useContext(Ctx);

const KEY = 'hybrd:safety-demo:v1';
const GATE_KEY = 'hybrd:safety-gate-seen';
export const makeSafetyDemo = () => new SafetyDemoBackend({ load: () => get<SafetyDemoState>(KEY), save: (s) => set(KEY, s) });

export function SafetyProvider({ children }: { children: ReactNode }) {
  const { configured, ready, user } = useAuth();
  const [backend, setBackend] = useState<SafetyBackend | null>(null);
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [gateSeen, setGateSeen] = useState(() => { try { return sessionStorage.getItem(GATE_KEY) || ''; } catch { return ''; } });
  const [preview, setPreview] = useState(false);
  const live = configured && !!user;
  const mode: SafetyCtx['mode'] = configured && !ready ? 'loading' : live ? 'live' : 'demo';

  useEffect(() => {
    let alive = true;
    setStatus(null); setSetupNeeded(false);
    if (mode === 'loading') { setBackend(null); return; }
    if (mode === 'live' && user) { getSupabase().then((sb) => { if (alive) setBackend(sb ? new SupabaseSafety(sb, user.email || null) : makeSafetyDemo()); }); return () => { alive = false; }; }
    setBackend(makeSafetyDemo());
    return () => { alive = false; };
  }, [mode, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!backend) return;
    try { setStatus(await backend.status()); setSetupNeeded(false); }
    catch (e) {
      const m = String((e as Error)?.message || e);
      if (/account_status|function .* does not exist|schema cache/i.test(m)) setSetupNeeded(true);
      setStatus({ account: {}, decisions: [], isModerator: false, serverNow: Date.now() });
    }
  }, [backend]);
  useEffect(() => { refresh(); }, [refresh]);
  // auto-resume and expiring suspensions: re-check now and then while the app is open
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5 * 60_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const value = useMemo<SafetyCtx>(() => {
    const decisions = status?.decisions || [];
    const effective = effectiveStatus(status?.account, decisions);
    const removed = new Map(decisions.filter((d) => d.kind === 'remove_content' && d.contentId && decisionActive(d)).map((d) => [d.contentId!, d]));
    const gateId = `${user?.id || 'device'}:${effective.kind}`;
    return {
      backend, mode, status, effective, removed, msgRestricted: messagingRestricted(decisions), isModerator: !!status?.isModerator, setupNeeded, refresh,
      gateOpen: preview || (effective.kind !== 'active' && gateSeen !== gateId),
      closeGate: (kind?: string) => { const id = kind ? `${user?.id || 'device'}:${kind}` : gateId; setPreview(false); setGateSeen(id); try { sessionStorage.setItem(GATE_KEY, id); } catch { /* ignore */ } },
      previewLogin: () => setPreview(true),
    };
  }, [backend, mode, status, setupNeeded, refresh, gateSeen, preview, user?.id]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
