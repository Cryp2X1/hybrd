export interface GuideTopic { id: string; title: string; kicker: string; points: string[]; sources: string[] }
// Every number below is taken from the cited position stands. Individual needs vary — see a registered sports dietitian (RD/CSSD) for a personal plan.
export const GUIDE: GuideTopic[] = [
  { id: 'carbs', title: 'Daily fuel', kicker: 'Carbohydrate scales with training load', sources: ['acsm2016'], points: [
    'Light / skill-based training: 3–5 g carbohydrate per kg body weight per day.',
    'Moderate exercise (~1 h/day): 5–7 g/kg/day.',
    'Endurance training 1–3 h/day at moderate–high intensity: 6–10 g/kg/day.',
    'Extreme commitment (4–5 h/day): 8–12 g/kg/day.',
    'Match the plate to the day: more starch on big training days, more vegetables and protein on rest days.',
  ] },
  { id: 'protein', title: 'Protein', kicker: '1.4–2.0 g/kg/day, spread out', sources: ['issn-protein'], points: [
    'Most exercising people do well on 1.4–2.0 g protein per kg body weight per day.',
    'Per meal: about 0.25 g/kg, or 20–40 g of a high-quality source, with roughly 700–3,000 mg leucine.',
    'Spread doses evenly every 3–4 hours across the day.',
    'When dieting, higher intakes (2.3–3.1 g/kg/day) may help resistance-trained people keep lean mass.',
    'Casein before sleep (30–40 g, e.g. cottage cheese or Greek yogurt) can raise overnight muscle protein synthesis.',
  ] },
  { id: 'pre', title: 'Before training', kicker: 'Carbs in, fat and fibre down', sources: ['acsm2016', 'acsm-fluid'], points: [
    'For sessions over 60 min: 1–4 g carbohydrate/kg eaten 1–4 hours before.',
    'The closer to the session, the smaller and lower in fat/fibre the meal should be (e.g. rice cakes + jam 30–60 min before).',
    'Pre-hydrate: about 5–7 mL/kg of fluid at least 4 h before; if urine is still dark, another 3–5 mL/kg about 2 h before.',
    'Practise race-day food in training first — never try something new on race day.',
  ] },
  { id: 'during', title: 'During long sessions', kicker: '30–60 g/h, up to 90 g/h for 2.5 h+', sources: ['acsm2016', 'issn-timing'], points: [
    'Under ~45 min: no food needed.',
    '45–75 min: small amounts of carbohydrate (even a mouth rinse) can help.',
    '1–2.5 h: 30–60 g carbohydrate per hour.',
    'Over 2.5–3 h: up to 90 g/h, using mixed sugars (glucose + fructose) — train your gut first.',
    'A 6–8% carbohydrate-electrolyte drink (≈ 6–12 fl oz every 10–15 min) covers fuel and fluid together. See the DIY Sports Drink recipe.',
  ] },
  { id: 'post', title: 'Recovery', kicker: 'Protein + carbs, sooner if you train again soon', sources: ['issn-timing', 'acsm2016', 'issn-protein'], points: [
    'Eat a high-quality protein source (20–40 g) within about 2 h after training.',
    'Training again in < 4 h? Aggressive carbohydrate refeeding: ~1.2 g/kg/h, or 0.8 g/kg/h carbohydrate + 0.2–0.4 g/kg/h protein.',
    'Between two demanding sessions, ACSM suggests 1.0–1.2 g/kg/h carbohydrate for the first 4 hours.',
    'If the next session is tomorrow, normal meals that hit your daily carbohydrate and protein targets are enough.',
  ] },
  { id: 'hydration', title: 'Hydration & electrolytes', kicker: 'Avoid losing > 2% of body weight', sources: ['acsm-fluid', 'nasem-water'], points: [
    'Aim to keep sweat losses under ~2% of body weight during exercise; weigh yourself before and after to learn your sweat rate.',
    'Sodium is the main electrolyte lost in sweat. Drinks with sodium (20–50 mEq/L ≈ 460–1,150 mg/L) and salty snacks help you hold onto fluid.',
    'After training, drink about 1.5 L for every kg of body weight lost, with sodium.',
    'Don’t over-drink: gaining weight during exercise means you drank too much.',
    'Default daily target in HYBRD: 3.0 L (men) / 2.2 L (women) from drinks, based on the National Academies Adequate Intake. Change it in Settings.',
  ] },
  { id: 'budget', title: 'Fuel on a budget', kicker: 'Cheap staples that do the job', sources: ['acsm2016', 'usda'], points: [
    'Carbs: oats, rice, potatoes, pasta, bananas, bread.',
    'Protein: eggs, canned tuna, dried or canned beans and lentils, milk, Greek yogurt, chicken thighs, frozen fish.',
    'Produce: frozen vegetables and berries are as useful as fresh and keep for months.',
    'Cook in batches (curry, rice, beans, burritos) and freeze portions.',
  ] },
];
