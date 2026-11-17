import raw from './recipes.json';
import planFoods from './plan-foods.json';
import sleepRaw from './sleep-recipes.json';
export interface Recipe { id: string; name: string; cat: string; tags: string[]; serves: number; minutes: number; ingredients: { label: string; grams: number; fdcId: number; usda: string }[]; steps: string[]; why: string; sources: string[]; perServing: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodium: number; sugar?: number }; kind?: 'dinner' | 'snack' | 'drink'; timing?: string; grade?: 'strong' | 'moderate' | 'limited' | 'weak' }
export const RECIPES = raw as Recipe[];
/** Weight-loss-friendly breakfasts, mains and snacks (macros from USDA, built by tools/build_plan_foods.py). */
export const PLAN_RECIPES = planFoods.recipes as unknown as Recipe[];
/** Fuel › Sleep evening dinners, bedtime snacks and drinks (macros from USDA SR Legacy, built by tools/build_sleep_recipes.py). */
export const SLEEP_RECIPES = sleepRaw as unknown as Recipe[];
export const ALL_RECIPES = [...RECIPES, ...PLAN_RECIPES, ...SLEEP_RECIPES];
export const recipeById = (id: string) => ALL_RECIPES.find((r) => r.id === id);
