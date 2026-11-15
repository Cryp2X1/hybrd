import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import { COLLECTIONS, type Collection, type DataState, type Profile, type Rec } from './types';
import { useAuth } from './auth';
import { getSupabase, TABLES } from './supabase';
import { localeUnits } from './calc';
import { useStrava, stravaVisible, isStravaId, hideStravaActivity, autoSync } from './strava';

export const emptyData = (): DataState => ({ workouts: [], routes: [], foods: [], water: [], body: [], templates: [], steps: [], burns: [], wlplans: [], coachplans: [] });
export const defaultProfile = (): Profile => ({
  name: '', sex: 'male', age: 30, heightCm: 175, weightKg: 75, activity: 1.55, goal: 'maintain', units: localeUnits(),
  disciplines: ['hybrid'], weeklySessions: 4, onboarded: false, sound: true, voice: false, hyroxDivision: 'men-open',
});
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

type Pending = Record<string, { col: Collection | 'profile'; id: string }>;
export type SyncStatus = 'local' | 'idle' | 'syncing' | 'offline' | 'error';

interface StoreCtx {
  ready: boolean;
  ns: string;
  data: DataState;
  profile: Profile;
  syncStatus: SyncStatus;
  syncError: string;
  hasLocalData: boolean;
  upsert<T extends Rec>(col: Collection, rec: Omit<T, 'updatedAt'> & { updatedAt?: number }): void;
  remove(col: Collection, id: string): void;
  setProfile(p: Partial<Profile>): void;
  importJson(json: unknown, mode: 'merge' | 'replace'): number;
  exportJson(): object;
  syncNow(): Promise<void>;
  importLocalIntoAccount(): Promise<number>;
  wipe(): Promise<void>;
}
const Ctx = createContext<StoreCtx>(null as unknown as StoreCtx);
export const useStore = () => useContext(Ctx);

const k = (ns: string, what: string) => `hybrd:${ns}:${what}`;

function mergeArr<T extends Rec>(a: T[], b: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of a) m.set(r.id, r);
  for (const r of b) { const cur = m.get(r.id); if (!cur || (r.updatedAt || 0) >= (cur.updatedAt || 0)) m.set(r.id, r); }
  return [...m.values()];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const ns = user?.id ?? 'local';
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DataState>(emptyData);
  const [profile, setProfileState] = useState<Profile>(defaultProfile);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [syncError, setSyncError] = useState('');
  const [hasLocalData, setHasLocalData] = useState(false);
  const pending = useRef<Pending>({});
  const dataRef = useRef(data); dataRef.current = data;
  const profileRef = useRef(profile); profileRef.current = profile;
  const saveTimer = useRef<number>();

  // load namespace
  useEffect(() => {
    let alive = true;
    setReady(false);
    (async () => {
      const [d, p, pend] = await Promise.all([get(k(ns, 'data')), get(k(ns, 'profile')), get(k(ns, 'pending'))]);
      if (!alive) return;
      const base = emptyData();
      const loaded: DataState = { ...base, ...(d || {}) };
      setData(loaded);
      setProfileState({ ...defaultProfile(), ...(p || {}) });
      pending.current = pend || {};
      if (ns !== 'local') {
        const ld = await get(k('local', 'data')) as DataState | undefined;
        setHasLocalData(!!ld && COLLECTIONS.some((c) => (ld[c] || []).some((r) => !r.deleted)));
      } else setHasLocalData(false);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [ns]);

  const persist = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      set(k(ns, 'data'), dataRef.current);
      set(k(ns, 'profile'), profileRef.current);
      set(k(ns, 'pending'), pending.current);
    }, 250);
  }, [ns]);

  const flush = useCallback(async () => {
    if (ns === 'local') { setSyncStatus('local'); return; }
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    const sb = await getSupabase(); if (!sb) return;
    const items = Object.values(pending.current);
    if (!items.length) { setSyncStatus('idle'); return; }
    setSyncStatus('syncing');
    try {
      const byCol: Record<string, Rec[]> = {};
      for (const it of items) {
        if (it.col === 'profile') continue;
        const r = (dataRef.current[it.col] as Rec[]).find((x) => x.id === it.id);
        if (r) (byCol[it.col] ||= []).push(r);
      }
      for (const [col, recs] of Object.entries(byCol)) {
        const rows = recs.map((r) => ({
          id: r.id, user_id: ns, data: r, deleted: !!r.deleted, updated_at: new Date(r.updatedAt).toISOString(),
          ...('date' in r ? { day: String((r as unknown as { date: string }).date).slice(0, 10) } : {}),
        }));
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await sb.from(TABLES[col]).upsert(rows.slice(i, i + 200));
          if (error) throw error;
        }
      }
      if (items.some((i) => i.col === 'profile')) {
        const { error } = await sb.from('profiles').upsert({ id: ns, data: profileRef.current, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
      for (const it of items) delete pending.current[`${it.col}:${it.id}`];
      persist();
      setSyncStatus('idle'); setSyncError('');
    } catch (e) {
      setSyncStatus('error'); setSyncError((e as Error).message || String(e));
    }
  }, [ns, persist]);

  const pull = useCallback(async () => {
    if (ns === 'local') return;
    const sb = await getSupabase(); if (!sb || !navigator.onLine) return;
    setSyncStatus('syncing');
    try {
      const next = { ...dataRef.current };
      for (const col of COLLECTIONS) {
        const { data: rows, error } = await sb.from(TABLES[col]).select('data').eq('user_id', ns);
        if (error) throw error;
        const remote = (rows || []).map((r: { data: Rec }) => r.data);
        // records that are only local need pushing
        const remoteIds = new Map(remote.map((r) => [r.id, r.updatedAt]));
        for (const r of next[col] as Rec[]) if (!remoteIds.has(r.id) || (remoteIds.get(r.id) || 0) < r.updatedAt) pending.current[`${col}:${r.id}`] = { col, id: r.id };
        (next as unknown as Record<string, Rec[]>)[col] = mergeArr(next[col] as Rec[], remote);
      }
      const { data: prow } = await sb.from('profiles').select('data,updated_at').eq('id', ns).maybeSingle();
      if (prow?.data && ((prow.data as Profile).updatedAt || 0) >= (profileRef.current.updatedAt || 0)) setProfileState({ ...defaultProfile(), ...(prow.data as Profile) });
      else pending.current['profile:me'] = { col: 'profile', id: 'me' };
      setData(next); dataRef.current = next;
      persist();
      await flush();
    } catch (e) { setSyncStatus('error'); setSyncError((e as Error).message); }
  }, [ns, flush, persist]);

  useEffect(() => { if (ready && ns !== 'local') pull(); if (ns === 'local') setSyncStatus('local'); }, [ready, ns, pull]);
  useEffect(() => {
    const on = () => flush();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [flush]);

  const flushSoon = useRef<number>();
  const queue = useCallback((col: Collection | 'profile', id: string) => {
    if (ns === 'local') return;
    pending.current[`${col}:${id}`] = { col, id };
    window.clearTimeout(flushSoon.current);
    flushSoon.current = window.setTimeout(() => flush(), 800);
  }, [ns, flush]);

  const upsert: StoreCtx['upsert'] = useCallback((col, rec) => {
    if (isStravaId(rec.id)) return; // Strava data stays in its 7-day device cache — never stored or synced as HYBRD data
    const r = { ...rec, updatedAt: Date.now() } as Rec;
    setData((d) => {
      const arr = (d[col] as Rec[]).filter((x) => x.id !== r.id);
      const nd = { ...d, [col]: [...arr, r] } as DataState;
      dataRef.current = nd; return nd;
    });
    queue(col, r.id); persist();
  }, [queue, persist]);

  const remove: StoreCtx['remove'] = useCallback((col, id) => {
    if (isStravaId(id)) { if (col === 'workouts') hideStravaActivity(id); return; }
    setData((d) => {
      const nd = { ...d, [col]: (d[col] as Rec[]).map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: Date.now() } : x)) } as DataState;
      dataRef.current = nd; return nd;
    });
    queue(col, id); persist();
  }, [queue, persist]);

  const setProfile = useCallback((p: Partial<Profile>) => {
    setProfileState((cur) => { const n = { ...cur, ...p, updatedAt: Date.now() }; profileRef.current = n; return n; });
    queue('profile', 'me'); persist();
  }, [queue, persist]);

  const exportJson = useCallback(() => ({
    app: 'HYBRD', version: 1, exportedAt: new Date().toISOString(),
    units: { stored: 'metric — distanceM in metres, elevGainM in metres, weightKg in kg, durationSec/sec in seconds, GPS e in ms', display: { distance: profileRef.current.units === 'imperial' ? 'mi' : 'km', weight: (profileRef.current.weightUnit || (profileRef.current.units === 'imperial' ? 'lb' : 'kg')) } }, profile: profileRef.current, data: dataRef.current,
  }), []);

  const importJson = useCallback((json: unknown, mode: 'merge' | 'replace') => {
    const j = json as { app?: string; profile?: Profile; data?: Partial<DataState> };
    if (!j || j.app !== 'HYBRD' || !j.data) throw new Error('That file is not a HYBRD export.');
    let n = 0;
    const next = mode === 'replace' ? emptyData() : { ...dataRef.current };
    for (const col of COLLECTIONS) {
      const inc = (j.data[col] || []) as Rec[];
      n += inc.length;
      (next as unknown as Record<string, Rec[]>)[col] = mergeArr(next[col] as Rec[], inc.map((r) => ({ ...r, updatedAt: Math.max(r.updatedAt || 0, mode === 'replace' ? Date.now() : 0) })));
      for (const r of inc) if (ns !== 'local') pending.current[`${col}:${r.id}`] = { col, id: r.id };
    }
    setData(next); dataRef.current = next;
    if (j.profile) setProfile({ ...j.profile, onboarded: true });
    persist(); if (ns !== 'local') flush();
    return n;
  }, [ns, persist, flush, setProfile]);

  const importLocalIntoAccount = useCallback(async () => {
    const ld = await get(k('local', 'data')) as DataState | undefined;
    const lp = await get(k('local', 'profile')) as Profile | undefined;
    if (!ld) return 0;
    const n = importJson({ app: 'HYBRD', data: ld, profile: profileRef.current.onboarded ? undefined : lp }, 'merge');
    await set(k('local', 'data'), emptyData());
    setHasLocalData(false);
    return n;
  }, [importJson]);

  const wipe = useCallback(async () => {
    const all = dataRef.current;
    for (const col of COLLECTIONS) for (const r of all[col] as Rec[]) if (!r.deleted) remove(col, r.id);
  }, [remove]);

  const strava = useStrava();
  useEffect(() => { if (ready && profile.onboarded && strava.connected) autoSync(profile); }, [ready, strava.connected]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => {
    const v = {} as DataState;
    for (const col of COLLECTIONS) (v as unknown as Record<string, Rec[]>)[col] = (data[col] as Rec[]).filter((r) => !r.deleted);
    // Strava activities (device-only cache) are shown alongside, minus any that duplicate your own workouts
    const sv = stravaVisible(v.workouts);
    if (sv.workouts.length) { v.workouts = [...v.workouts, ...sv.workouts]; v.routes = [...v.routes, ...sv.routes]; }
    return v;
  }, [data, strava.cache, strava.meta.hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: StoreCtx = {
    ready, ns, data: visible, profile, syncStatus, syncError, hasLocalData,
    upsert, remove, setProfile, importJson, exportJson, syncNow: pull, importLocalIntoAccount, wipe,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
