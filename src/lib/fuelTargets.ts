// What Fuel and Home show as "today's target": the weight-loss plan's target for that day when a plan is applied,
// otherwise the profile's TDEE targets. The plan already includes your usual activity (activity factor or your
// tracked average burn), so today's active burn is NOT added on top — only the profile targets add it back.
import type { DataState, Profile } from './types';
import { computeTargets } from './calc';
import { activePlan, planTargetsFor } from './wl';

export interface FuelTargets { kcal: number; protein: number; carbs: number; fat: number; waterMl: number; addBurn: boolean; plan: boolean; label: string }
export function fuelTargets(profile: Profile, data: Pick<DataState, 'wlplans'>, day: string): FuelTargets {
  const base = computeTargets(profile);
  const p = activePlan(data.wlplans || []);
  if (p && p.applyToFuel && p.targets && p.targets.level !== 'stop') {
    const t = planTargetsFor(p, day);
    const label = t.onBreak ? 'Weight-loss plan · diet break (maintenance)' : p.targets.periodized ? `Weight-loss plan · ${t.kind === 'train' ? 'training' : 'rest'} day` : 'Weight-loss plan';
    return { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, waterMl: base.waterMl, addBurn: false, plan: true, label };
  }
  return { kcal: base.kcal, protein: base.protein, carbs: base.carbs, fat: base.fat, waterMl: base.waterMl, addBurn: true, plan: false, label: 'Daily target' };
}
