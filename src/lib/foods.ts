export interface FoodItem {
  key: string; name: string; brand?: string; category?: string; source: 'usda' | 'off';
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number; sugar?: number; sodium?: number };
  portion?: { label: string; grams: number };
}
type Row = [string, string, number, number, number, number, number, number, number, string, number, number];
let cache: FoodItem[] | null = null;
let loading: Promise<FoodItem[]> | null = null;

export function loadUsda(): Promise<FoodItem[]> {
  if (cache) return Promise.resolve(cache);
  if (!loading) loading = fetch(`${import.meta.env.BASE_URL}data/foods-usda.json`).then((r) => r.json()).then((j: { foods: Row[] }) => {
    cache = j.foods.map((f) => ({
      key: `usda:${f[11]}`, name: f[0], category: f[1], source: 'usda' as const,
      per100: { kcal: f[2], protein: f[3], carbs: f[4], fat: f[5], fiber: f[6], sugar: f[7], sodium: f[8] },
      portion: f[9] && f[10] ? { label: f[9], grams: f[10] } : undefined,
    }));
    return cache;
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

const RAWISH = /\b(raw|cooked|boiled|roasted|baked|plain|whole|fresh|drained)\b/;
export function searchUsda(all: FoodItem[], q: string, limit = 60): FoodItem[] {
  const toks = q.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!toks.length) return [];
  const res: { f: FoodItem; s: number }[] = [];
  for (const f of all) {
    const n = f.name.toLowerCase();
    if (!toks.every((t) => n.includes(t))) continue;
    let s = 0;
    if (n.startsWith(toks[0])) s += 30;
    const first = n.split(',')[0];
    if (toks.some((t) => first.includes(t))) s += 15;
    s -= n.length / 6;
    if (RAWISH.test(n)) s += 4;
    if (/fast foods|restaurant/i.test(f.category || '')) s -= 6;
    if (/[A-Z]{3,}/.test(f.name)) s -= 8; // brand names in caps
    res.push({ f, s });
  }
  return res.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}

interface OffProduct { code?: string; product_name?: string; brands?: string; serving_size?: string; serving_quantity?: number | string; nutriments?: Record<string, number> }
const OFF_FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments';
function fromOff(p: OffProduct): FoodItem | null {
  const n = p.nutriments || {};
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : undefined);
  if (!p.product_name || kcal == null) return null;
  const sq = Number(p.serving_quantity);
  return {
    key: `off:${p.code}`, name: p.product_name, brand: p.brands?.split(',')[0], source: 'off',
    per100: { kcal: Math.round(kcal), protein: n['proteins_100g'] || 0, carbs: n['carbohydrates_100g'] || 0, fat: n['fat_100g'] || 0, fiber: n['fiber_100g'], sugar: n['sugars_100g'], sodium: n['sodium_100g'] != null ? Math.round(n['sodium_100g'] * 1000) : undefined },
    portion: sq > 0 ? { label: p.serving_size || `${sq} g`, grams: sq } : undefined,
  };
}
export async function searchOff(q: string): Promise<FoodItem[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${OFF_FIELDS}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open Food Facts error ${r.status}`);
  const j = await r.json();
  return (j.products || []).map(fromOff).filter(Boolean) as FoodItem[];
}
export async function lookupBarcode(code: string): Promise<FoodItem | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.status === 1 && j.product ? fromOff({ ...j.product, code }) : null;
}
export const macrosFor = (f: FoodItem, grams: number) => {
  const m = grams / 100;
  return { kcal: Math.round(f.per100.kcal * m), protein: +(f.per100.protein * m).toFixed(1), carbs: +(f.per100.carbs * m).toFixed(1), fat: +(f.per100.fat * m).toFixed(1) };
};
