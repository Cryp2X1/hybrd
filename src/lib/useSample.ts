import { useStore } from './store';
import { buildSample, SAMPLE_TAG } from './sample';
import { demoCenter } from './location';
import { COLLECTIONS, type Rec } from './types';

export function useSample() {
  const { data, profile, importJson, remove } = useStore();
  const has = data.workouts.some((w) => w.id.startsWith(SAMPLE_TAG));
  const load = async () => { const c = await demoCenter(); importJson({ app: 'HYBRD', data: buildSample(profile.weightKg || 75, c) }, 'merge'); };
  const clear = () => {
    for (const c of COLLECTIONS) for (const r of data[c] as (Rec & { sample?: boolean })[]) if (r.id.startsWith(SAMPLE_TAG) || r.sample) remove(c, r.id);
  };
  return { has, load, clear };
}
