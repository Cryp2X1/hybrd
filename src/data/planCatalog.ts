import raw from './recipes.json';
import planFoods from './plan-foods.json';
import { makeCatalog } from '../lib/wl';
/** Recipes, sides, grocery aisles and names for the weight-loss meal planner. */
export const CATALOG = makeCatalog(raw as never, planFoods as never);
