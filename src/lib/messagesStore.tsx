// Messages: picks the backend (live Supabase when signed in, on-device DEMO with the SAMPLE people otherwise — the same
// switch as Friends & Stories), keeps the inbox + badge fresh, runs the offline outbox (queue → send → retry with backoff),
// tracks typing, and turns new messages into in-app notifications.
//
// Notifications are in-app only today. Every notice goes through `deliverNotice`, so Web Push / APNs / FCM can be added
// later as another sink (the `push_subscriptions` table already exists; see APP-BUILDER-NOTES.md › Messages › Push).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import { useAuth } from './auth';
import { useSocial } from './socialStore';
import { getSupabase } from './supabase';
import {
  afterAttempt, defaultDmSettings, dueItems, enqueue, friendlyDmError, inboxBadge, isRetryable, liveTyping, markSending, notificationFor, resumeOutbox, retryItem,
  type DmNotice, type DmSettings, type Message, type OutboxItem,
} from './messages';
import type { ConvView, DmBackend, DmEvent, Draft, MessageView } from './messagesApi';
import { DemoDm, type DmDemoState } from './messagesDemo';
import { SupabaseDm } from './messagesSupabase';
import { DemoBackend } from './socialDemo';
import { summarizeReactions } from './social';
import { SupabaseSocial } from './socialSupabase';

const DEMO_KEY = 'hybrd:dm-demo:v1';
const OUTBOX_KEY = 'hybrd:dm-outbox:v1';

// ---------- notice sinks (in-app now, push later) ----------
type NoticeSink = (n: DmNotice) => void;
const sinks = new Set<NoticeSink>();
/** Register a place notices go (the in-app banner today; a push bridge later). Returns an unregister function. */
export function addNoticeSink(f: NoticeSink) { sinks.add(f); return () => { sinks.delete(f); }; }
export function deliverNotice(n: DmNotice) { for (const f of sinks) { try { f(n); } catch { /* ignore */ } } }

interface MsgCtx {
  ready: boolean;
  backend: DmBackend | null;
  inbox: ConvView[];
  badge: number;
  requests: number;
  settings: DmSettings;
  /** Bumps on every change so open chats re-read. */
  version: number;
  typing: Record<string, Record<string, number>>;
  outbox: OutboxItem<Draft>[];
  online: boolean;
  refresh(): Promise<void>;
  saveSettings(s: DmSettings): Promise<void>;
  send(conversationId: string, d: Draft): void;
  retry(id: string): void;
  discard(id: string): void;
  setActive(conversationId: string | null): void;
  /** Local outbox items for a chat, shaped like messages so the chat can show them inline. */
  pendingFor(conversationId: string, me: MessageView['sender']): MessageView[];
  notice: DmNotice | null;
  dismissNotice(): void;
}
const Ctx = createContext<MsgCtx>(null as unknown as MsgCtx);
export const useMessages = () => useContext(Ctx);

export function MessagesProvider({ children }: { children: ReactNode }) {
  const social = useSocial();
  const { user } = useAuth();
  const [backend, setBackend] = useState<DmBackend | null>(null);
  const [inbox, setInbox] = useState<ConvView[]>([]);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<DmSettings>(defaultDmSettings(!!social.me?.isMinor));
  const [version, setVersion] = useState(0);
  const [typing, setTyping] = useState<Record<string, Record<string, number>>>({});
  const [outbox, setOutbox] = useState<OutboxItem<Draft>[]>([]);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [notice, setNotice] = useState<DmNotice | null>(null);
  const active = useRef<string | null>(null);
  const inboxRef = useRef<ConvView[]>([]);
  const obRef = useRef<OutboxItem<Draft>[]>([]);
  const obLoaded = useRef(false);

  // pick the backend — needs a social profile (Messages uses the same handles, friends and blocks)
  const sb = social.backend; const meId = social.me?.id;
  useEffect(() => {
    let alive = true;
    setReady(false); setInbox([]); inboxRef.current = [];
    if (!sb || !meId) { setBackend(null); return; }
    if (sb instanceof DemoBackend) {
      setBackend(new DemoDm({
        load: () => get<DmDemoState>(DEMO_KEY), save: (s) => set(DEMO_KEY, s),
        world: () => sb.peek(), act: (a) => sb.act(a), searchPeople: (q) => sb.search(q),
        blobUrl: (b) => URL.createObjectURL(b), schedule: (fn, ms) => { window.setTimeout(fn, ms); },
      }));
    } else if (sb instanceof SupabaseSocial && user) {
      getSupabase().then((c) => { if (alive) setBackend(c ? new SupabaseDm(c, user.id, sb) : null); });
    } else setBackend(null);
    return () => { alive = false; };
  }, [sb, meId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = useRef(false); const again = useRef(false);
  const refresh = useCallback(async () => {
    if (!backend) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true;
    try {
      do {
        again.current = false;
        const [list, s] = await Promise.all([backend.inbox(), backend.getSettings()]);
        inboxRef.current = list; setInbox(list); setSettings(s);
      } while (again.current);
    } catch (e) { console.warn('messages refresh failed', e); }
    finally { busy.current = false; setReady(true); setVersion((v) => v + 1); }
  }, [backend]);
  useEffect(() => { refresh(); }, [refresh]);

  // live events + light polling + presence heartbeat
  useEffect(() => {
    if (!backend) return;
    const onEvent = (e: DmEvent) => {
      if (e.type === 'typing') { setTyping((t) => ({ ...t, [e.conversationId]: { ...(t[e.conversationId] || {}), [e.userId]: e.on ? Date.now() : 0 } })); return; }
      if (e.type === 'message') {
        setTyping((t) => (t[e.conversationId]?.[e.senderId] ? { ...t, [e.conversationId]: { ...t[e.conversationId], [e.senderId]: 0 } } : t));
        notifyFor(e.message);
      }
      refresh();
    };
    const notifyFor = (m: Message) => {
      const c = inboxRef.current.find((x) => x.id === m.conversationId);
      const sender = c?.members.find((x) => x.userId === m.senderId);
      const n = notificationFor({
        msg: m, recipient: backend.myId, member: c ? { state: c.me.state, mutedUntil: c.me.mutedUntil, archived: c.me.archived } : { state: 'request' },
        senderName: sender?.profile.displayName || 'New message', groupTitle: c?.kind === 'group' ? c.title : undefined,
        blocked: c?.blocked != null, activeConversation: active.current,
      });
      if (n) deliverNotice(n);
    };
    const off = backend.subscribe(onEvent);
    const beat = () => { if (document.visibilityState === 'visible') backend.heartbeat().catch(() => undefined); };
    beat();
    const t1 = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, backend.kind === 'live' ? 45_000 : 60_000);
    const t2 = window.setInterval(beat, 60_000);
    return () => { off(); window.clearInterval(t1); window.clearInterval(t2); };
  }, [backend, refresh]);

  // in-app banner sink
  useEffect(() => addNoticeSink((n) => { setNotice(n); window.setTimeout(() => setNotice((c) => (c?.messageId === n.messageId ? null : c)), 5000); }), []);

  // typing indicators expire on their own
  useEffect(() => {
    const t = window.setInterval(() => setTyping((m) => {
      let changed = false; const out: typeof m = {};
      for (const [c, us] of Object.entries(m)) { const live = liveTyping(us); if (live.length !== Object.values(us).filter(Boolean).length) changed = true; if (live.length) out[c] = Object.fromEntries(live.map((u) => [u, us[u]])); }
      return changed ? out : m;
    }), 1500);
    return () => window.clearInterval(t);
  }, []);

  // ---------- offline outbox ----------
  const saveOb = useCallback((q: OutboxItem<Draft>[]) => { obRef.current = q; setOutbox(q); set(OUTBOX_KEY, q).catch(() => undefined); }, []);
  useEffect(() => {
    get<OutboxItem<Draft>[]>(OUTBOX_KEY).then((q) => { obLoaded.current = true; if (q?.length) saveOb(resumeOutbox(q, Date.now())); }).catch(() => { obLoaded.current = true; });
  }, [saveOb]);
  const pumping = useRef(false);
  const pump = useCallback(async () => {
    if (!backend || pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const due = dueItems(obRef.current, Date.now(), navigator.onLine);
        if (!due.length) break;
        const it = due[0];
        saveOb(markSending(obRef.current, it.id));
        try {
          await backend.send(it.conversationId, it.draft);
          saveOb(afterAttempt(obRef.current, it.id, { ok: true }, Date.now()));
        } catch (e) {
          saveOb(afterAttempt(obRef.current, it.id, { ok: false, retryable: isRetryable(e), error: friendlyDmError(e) }, Date.now()));
        }
        refresh();
      }
    } finally { pumping.current = false; }
  }, [backend, refresh, saveOb]);
  useEffect(() => {
    const on = () => { setOnline(true); pump(); }; const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    const t = window.setInterval(() => pump(), 3000);
    pump();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.clearInterval(t); };
  }, [pump]);

  const send = useCallback((conversationId: string, d: Draft) => {
    saveOb(enqueue(obRef.current, { id: d.clientId, conversationId, draft: d, createdAt: Date.now() }));
    setVersion((v) => v + 1);
    window.setTimeout(() => pump(), 0);
  }, [pump, saveOb]);

  const value = useMemo<MsgCtx>(() => {
    const b = inboxBadge(inbox);
    return {
      ready, backend, inbox, badge: b, requests: inbox.filter((c) => c.folder === 'requests').length, settings, version, typing, outbox, online, refresh,
      saveSettings: async (s) => { if (!backend) return; setSettings(await backend.saveSettings(s)); },
      send,
      retry: (id) => { saveOb(retryItem(obRef.current, id, Date.now())); pump(); },
      discard: (id) => { saveOb(obRef.current.filter((x) => x.id !== id)); },
      setActive: (id) => { active.current = id; if (id && notice?.conversationId === id) setNotice(null); },
      pendingFor: (cid, me) => outbox.filter((x) => x.conversationId === cid).map((x) => ({
        id: x.id, conversationId: cid, senderId: backend?.myId || '', kind: x.draft.kind, body: x.draft.body, workout: x.draft.workout, replyTo: x.draft.replyTo, forwarded: x.draft.forwarded,
        media: x.draft.media ? { url: x.draft.media.preview || '', w: x.draft.media.w, h: x.draft.media.h, mime: x.draft.media.mime, duration: x.draft.media.duration } : undefined,
        createdAt: x.createdAt, mine: true, sender: me, reactions: summarizeReactions([]), myReaction: null,
        pending: x.status === 'failed' ? 'failed' : 'sending', error: x.error,
      } as MessageView)),
      notice, dismissNotice: () => setNotice(null),
    };
  }, [ready, backend, inbox, settings, version, typing, outbox, online, refresh, send, pump, saveOb, notice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
