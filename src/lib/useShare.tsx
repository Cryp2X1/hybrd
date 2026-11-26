// Publishing a saved activity's shared copy (live accounts) and knowing whether links can work right now.
import { useCallback } from 'react';
import { useAuth } from './auth';
import { useStore } from './store';
import { useSocial } from './socialStore';
import { getSupabase } from './supabase';
import { publishActivity, unpublishActivity } from './activities';
import { appUrl } from './config';
import { shareUrl } from './share';
import type { GpsRoute, Workout } from './types';

export type LinkState = 'ready' | 'needs-visibility' | 'needs-profile' | 'local' | 'demo' | 'signin' | 'strava';
export function useActivityPublisher() {
  const { configured, user } = useAuth();
  const social = useSocial();
  const { profile, upsert } = useStore();
  const live = configured && !!user && social.mode === 'live';
  const canPublish = live && !!social.me;
  const linkState = (w: Pick<Workout, 'visibility' | 'source'>): LinkState => {
    if (w.source === 'strava') return 'strava';
    if (!configured) return social.mode === 'demo' ? 'demo' : 'local';
    if (!user) return 'signin';
    if (!social.me) return 'needs-profile';
    if (!w.visibility || w.visibility === 'only-me') return 'needs-visibility';
    return 'ready';
  };
  const publish = useCallback(async (w: Workout, route: GpsRoute | undefined, image?: Blob | null): Promise<string | null> => {
    if (!canPublish || !user || w.source === 'strava') return null;
    const sb = await getSupabase(); if (!sb) return null;
    const id = await publishActivity(sb, user.id, w, route, profile, image);
    if (id !== (w.shareId || null)) upsert<Workout>('workouts', { ...w, shareId: id || undefined, updatedAt: Date.now() });
    return id;
  }, [canPublish, user, profile, upsert]);
  const unpublish = useCallback(async (w: Workout) => {
    if (!live || !user) return;
    const sb = await getSupabase(); if (!sb) return;
    await unpublishActivity(sb, user.id, w);
  }, [live, user]);
  const linkFor = (shareId?: string) => (shareId ? shareUrl(appUrl(), shareId) : '');
  return { live, canPublish, linkState, publish, unpublish, linkFor, socialMode: social.mode, me: social.me };
}
