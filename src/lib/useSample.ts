import { useStore } from './store';
import { buildSample, SAMPLE_TAG } from './sample';
import { COLLECTIONS, type Rec } from './types';

export function useSample() {
  const { data, profile, importJson, remove } = useStore();
  const has = data.workouts.some((w) => w.id.startsWith(SAMPLE_TAG));
  const load = () => importJson({ app: 'HYBRD', data: buildSample(profile.weightKg || 75) }, 'merge');
  const clear = () => {
    for (const c of COLLECTIONS) for (const r of data[c] as (Rec & { sample?: boolean })[]) if (r.id.startsWith(SAMPLE_TAG) || r.sample) remove(c, r.id);
  };
  return { has, load, clear };
}
