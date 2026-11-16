// Fuel › Fasting — user-facing evidence summaries and tips. Every item lists the source ids (src/data/sources.ts) it is based on.
export interface Item { title: string; body: string; points?: string[]; src: string[] }

export const FAST_RESEARCH: Item[] = [
  { title: 'Does fasting beat regular calorie control?', body: 'Mostly no — it ties. In trials that matched calories, time-restricted eating didn’t add weight loss: TREAT (16:8, 12 weeks) found −0.94 vs −0.68 kg (difference −0.26 kg, not significant), and a 12-month NEJM trial found −8.0 vs −6.3 kg with the same calorie target (P = 0.11). 5:2 matched daily restriction over 6 months (−6.4 vs −5.6 kg). A 2025 BMJ network meta-analysis of 99 trials (6,582 adults) found all fasting styles and continuous restriction lowered weight vs eating freely; only alternate-day fasting edged ahead (−1.29 kg), and only in trials under 24 weeks. The ISSN position stand reaches the same conclusion for body composition.', src: ['wl-lowe', 'wl-liu', 'fast-harvie', 'fast-bmj-nma', 'wl-issn-diets', 'fast-harvard'] },
  { title: 'Why it can still help', body: 'Many adults eat across ~15 hours a day. A clear window can make eating less easier: in an 8-week trial, 4- and 6-hour windows cut intake by ~550 kcal/day without counting and gave ~3% weight loss. Johns Hopkins and Mayo Clinic report short-term improvements in weight, blood sugar, blood pressure and cholesterol, while noting long-term effects aren’t clear.', src: ['fast-gill', 'fast-cienfuegos', 'fast-hopkins', 'fast-mayo'] },
  { title: 'Earlier windows', body: 'Eating earlier may add metabolic benefits. In a 5-week supervised study, a 6-hour window ending before 3 p.m. improved insulin sensitivity, blood pressure and oxidative stress without weight loss in men with prediabetes. In 90 adults with obesity, eating 7 a.m.–3 p.m. plus calorie restriction lost 2.3 kg more over 14 weeks than the same restriction over 12+ hours, with better diastolic blood pressure and mood. These are small or short trials.', src: ['fast-sutton', 'fast-jamshed22', 'fast-jamshed19'] },
  { title: '10-hour windows in real life', body: 'In people with metabolic syndrome — most on statins or blood-pressure medicine — 12 weeks of a 10-hour window lowered weight, blood pressure and atherogenic lipids (single-arm study). In 137 firefighters on 24-hour shifts, a 10-hour window was feasible with no adverse effects, and HbA1c and diastolic blood pressure fell in those at higher risk.', src: ['fast-wilkinson', 'fast-manoogian'] },
  { title: 'Muscle and lean mass', body: 'Fasting needs enough protein and training to protect muscle. TREAT saw a small extra loss of appendicular lean mass with 16:8. In lean adults, alternate-day 24-hour fasts lost less fat than the same calorie deficit spread over every day. But with resistance training and enough protein, 16:8 kept strength and fat-free mass in trained men, and a ~7.5-hour window gave the same muscle gain as normal eating in trained women (protein 1.6 g/kg/day in both groups).', src: ['wl-lowe', 'fast-templeman', 'fast-moro', 'fast-tinsley', 'issn-protein'] },
  { title: 'Performance', body: 'Fasting doesn’t improve performance. Eating before exercise improved prolonged aerobic performance (not shorter sessions) in a 46-study meta-analysis. Reviews found no performance benefit from fasting for high-intensity, endurance or resistance exercise, and no significant effect on strength or anaerobic capacity.', src: ['fast-aird', 'fast-levy', 'fast-correia'] },
  { title: 'Ketones, the “metabolic switch” and autophagy', body: 'After roughly 12+ hours without food, liver glycogen runs low and the body leans more on fat and ketones — the “metabolic switch”. Timing varies with your last meal and activity. Autophagy (cellular clean-up) rises with fasting in animal and cell studies; in people the evidence is early (e.g. a 4-day study saw higher autophagy-gene expression with early eating). No study shows a set hour when it “turns on” in humans, so HYBRD doesn’t promise one.', src: ['fast-anton', 'fast-decabo', 'fast-bagherniya', 'fast-jamshed19'] },
  { title: 'Very short windows and heart health', body: 'An analysis of ~19,800 US adults linked eating within less than 8 hours a day to higher cardiovascular mortality. It’s observational and the authors say it may reflect other factors, so it can’t show that short windows cause harm — but it’s one reason HYBRD keeps people with heart disease to 12–14-hour fasts and doesn’t default anyone to 20:4.', src: ['fast-chen', 'fast-mayo'] },
  { title: 'Side effects', body: 'Hunger, irritability and poorer focus are common at first and usually fade within 2–4 weeks. In a meta-analysis of 15 trials, fasting didn’t raise rates of fatigue, headache or dropout vs control, though dizziness was slightly more common with later windows (not significant). Mayo Clinic lists tiredness, dizziness, headaches, mood swings, constipation and menstrual changes as possible effects.', src: ['fast-decabo', 'fast-hopkins', 'fast-zhong', 'fast-mayo'] },
  { title: 'Who shouldn’t fast', body: 'Johns Hopkins, Mayo Clinic and Harvard advise against fasting for children and teens, pregnancy or breastfeeding, type 1 diabetes on insulin, and a history of eating disorders; Harvard adds diabetes and medicines that must be taken with food, and Mayo adds high risk of bone loss and falls. Insulin and sulfonylureas can cause low blood sugar during fasts. Intermittent fasting is also associated with eating-disorder behaviours in young people.', src: ['fast-hopkins', 'fast-mayo', 'fast-harvard', 'fast-grajower', 'fast-ganson'] },
];

export const FAST_TIPS: { id: string; kicker: string; title: string; points: string[]; src: string[] }[] = [
  { id: 'start', kicker: 'Getting started', title: 'Build up slowly', points: [
    'Start with a 12-hour overnight fast, then a 10-hour eating window on 5 days a week. The NEJM review suggests shortening the window over several months (10 h → 8 h → 6 h), not all at once.',
    'Expect hunger and irritability for the first 2–4 weeks — it usually passes.',
    'Keep the same window most days. Consistency matters more than the exact hours.',
    'For 5:2, the same review suggests starting with one ~1,000 kcal day a week and working down to 500–600 kcal on two days.',
  ], src: ['fast-decabo', 'fast-hopkins', 'fast-gill'] },
  { id: 'hydrate', kicker: 'Hydration', title: 'Drink through the fast', points: [
    'Water, sparkling water, black coffee and plain tea are fine while fasting.',
    'About 20% of your usual water comes from food, so drink a little more on fasting days. Your Fuel water target still applies.',
    'Training while fasted: drink before and during, and include sodium on long or sweaty sessions (ACSM fluid guidance).',
    'Dizzy, very tired or a pounding headache? Drink, eat if it doesn’t pass, and stop the fast if you feel faint.',
  ], src: ['fast-hopkins', 'nasem-water', 'acsm-fluid', 'fast-mayo'] },
  { id: 'breaks', kicker: 'What breaks a fast', title: 'Calories break it', points: [
    'Anything with calories ends the fast: milk, sugar, juice, “bulletproof” coffee, broth, BCAAs/protein drinks and gum with sugar.',
    'Fine: water, black coffee, plain tea, and unflavoured or zero-calorie electrolyte drinks.',
    'Zero-calorie sweeteners didn’t change blood sugar or insulin in 34 trials, so a diet drink won’t “break” a fast metabolically — but it may keep cravings going for some people.',
    'Medicines: keep taking them as prescribed. If one must be taken with food, ask your doctor how to time it.',
  ], src: ['fast-hopkins', 'fast-greyling', 'fast-harvard'] },
  { id: 'breakfast', kicker: 'Breaking your fast', title: 'Break it with a real meal', points: [
    'Open with a normal, balanced meal built on protein (≈ 20–40 g), plus fibre-rich carbs and some fat — not a binge.',
    'Packing the window with high-calorie foods or much bigger portions cancels the benefit.',
    'A Mediterranean-style pattern (vegetables, whole grains, legumes, fish, olive oil) is a good default inside the window.',
    'After training, make your first meal your recovery meal: protein plus carbs.',
  ], src: ['issn-protein', 'fast-hopkins', 'issn-timing'] },
  { id: 'train', kicker: 'Training while fasting', title: 'Fuel the work that matters', points: [
    'Short or easy sessions (< 60 min) fasted are fine for most people.',
    'Eat before long or hard sessions: pre-exercise food improved prolonged aerobic performance; fasting hasn’t been shown to improve performance.',
    'Place your eating window so your post-workout meal falls inside it. HYBRD does this when you tell it your training time.',
    'Don’t pair 5:2 / alternate-day low days with hard, long or race-pace sessions — use rest or easy days.',
  ], src: ['fast-aird', 'fast-levy', 'fast-correia', 'acsm2016'] },
  { id: 'protein', kicker: 'Protein timing', title: 'Fit your protein into the window', points: [
    'Aim for your daily protein target (HYBRD uses 1.6–2.0 g/kg; up to 2.4 g/kg when dieting) — fasting doesn’t lower it.',
    'Spread it across 3–4 meals of ~20–40 g, every 3–4 hours. 20 g every 3 h beat 2 × 40 g or 8 × 10 g for muscle protein synthesis after training.',
    'With an 8-hour window that’s about 3 protein meals; a 4-hour window makes this hard — one reason HYBRD doesn’t recommend 20:4 to athletes.',
    'Protein within the window plus resistance training kept muscle in 16:8 trials.',
  ], src: ['issn-protein', 'fast-areta', 'fast-moro', 'fast-tinsley', 'wl-helms-protein'] },
  { id: 'stop', kicker: 'Safety', title: 'When to stop', points: [
    'Stop and eat if you feel faint, confused, shaky, have a racing heart or chest pain — and get medical help for chest pain or fainting.',
    'If fasting makes you anxious about food, leads to bingeing or feels hard to control, stop and talk to a professional.',
    'HYBRD never runs a fast over 24 hours. Longer fasts aren’t necessarily better and may be dangerous.',
    'Talk to your doctor before fasting if you take regular medicine or have a medical condition.',
  ], src: ['fast-hopkins', 'fast-mayo', 'fast-ganson', 'fast-grajower'] },
];
export const FAST_SOURCE_IDS = Array.from(new Set([...FAST_RESEARCH.flatMap((r) => r.src), ...FAST_TIPS.flatMap((t) => t.src)]));
