import raw from './recipes.json';
export interface Recipe { id: string; name: string; cat: string; tags: string[]; serves: number; minutes: number; ingredients: { label: string; grams: number; fdcId: number; usda: string }[]; steps: string[]; why: string; sources: string[]; perServing: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodium: number } }
export const RECIPES = raw as Recipe[];
export const recipeById = (id: string) => RECIPES.find((r) => r.id === id);
