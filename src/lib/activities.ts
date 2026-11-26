// Shared activities in Supabase (`shared_activities` + the private `activity-images` bucket). The app only ever sends
// publicActivity() output — the privacy-trimmed payload — never the raw route. RLS decides who can read it.
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicActivity, newShareId, isShareId, type PublicActivity } from './share';
import type { GpsRoute, Profile, Workout } from './types';

export const ACTIVITY_BUCKET = 'activity-images';
export interface SharedRow { id: string; data: PublicActivity; visibility: 'friends' | 'public'; image_path: string | null; created_at: string; updated_at?: string; mine: boolean; author: { display_name: string; username: string | null } | null }

export function activityError(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/minor_public/.test(m)) return 'Under-18 accounts can share with friends, not with everyone.';
  if (/not_member/.test(m)) return 'Set up your HYBRD public profile first (Social › Public profile), then share.';
  if (/banned/.test(m)) return 'This account can’t share activities.';
  if (/rate_limit/.test(m)) return 'You’ve shared a lot today. Try again tomorrow.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'You’re offline. Try again when you have a connection.';
  return m;
}

/** Create or update the shared copy. Only-me → removes it. Returns the share id (or null when private). */
export async function publishActivity(sb: SupabaseClient, uid: string, w: Workout, route: Pick<GpsRoute, 'segments'> | undefined, profile: Profile, image?: Blob | null): Promise<string | null> {
  const vis = w.visibility || 'only-me';
  if (vis === 'only-me') { await unpublishActivity(sb, uid, w); return null; }
  const id = isShareId(w.shareId) ? w.shareId : newShareId();
  const data = publicActivity(w, route, profile);
  let image_path: string | null = null;
  if (image) {
    const path = `${uid}/${id}.png`;
    const up = await sb.storage.from(ACTIVITY_BUCKET).upload(path, image, { upsert: true, contentType: 'image/png', cacheControl: '300' });
    if (!up.error) image_path = path;
  }
  const row = { id, workout_id: w.id, visibility: vis, data, ...(image_path ? { image_path } : {}) };
  const { error } = await sb.from('shared_activities').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return id;
}
export async function unpublishActivity(sb: SupabaseClient, uid: string, w: Pick<Workout, 'id' | 'shareId'>): Promise<void> {
  await sb.from('shared_activities').delete().eq('workout_id', w.id);
  if (isShareId(w.shareId)) await sb.storage.from(ACTIVITY_BUCKET).remove([`${uid}/${w.shareId}.png`]);
}
export async function fetchSharedActivity(sb: SupabaseClient, id: string): Promise<SharedRow | null> {
  if (!isShareId(id)) return null;
  const { data, error } = await sb.rpc('activity_public', { p_id: id });
  if (error) throw error;
  return (data as SharedRow | null) || null;
}
export async function sharedImageUrl(sb: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await sb.storage.from(ACTIVITY_BUCKET).download(path);
  return data ? URL.createObjectURL(data) : null;
}
