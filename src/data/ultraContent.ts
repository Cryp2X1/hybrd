/**
 * Train › Ultra & Backyard — research summaries, preparation checklists, warning signs and real-food options.
 * Every item cites source ids from src/data/sources.ts. Food numbers are computed from the bundled USDA FoodData
 * Central SR Legacy table (public/data/foods-usda.json, per 100 g) for the stated portion.
 */
import type { RaceId } from '../lib/ultra';

export interface Card { title: string; body: string; src: string[] }
export const ULTRA_RESEARCH: Card[] = [
  { title: 'Most training is easy, and that’s deliberate', body: 'Well-trained endurance athletes do about 80% of their training at low intensity, with a small share of hard work. For ultras, Uphill Athlete adds lots of time below the aerobic threshold, short hill sprints, and muscular-endurance work before the race-specific block. HYBRD keeps most of your week in Zone 1–2 and has one quality session.', src: ['ultra-seiler', 'ultra-uphill', 'ultra-koop'] },
  { title: 'Progress slowly: the +10% caps', body: 'In a 2025 study of 5,205 runners, a single run more than 10% longer than the longest run of the previous 30 days was linked to more overuse injuries. A 10–30% jump raised the injury rate 1.64×, and more than double the distance raised it 2.28×. Weekly jumps above 30% were also linked to distance-related injuries in novices. HYBRD caps every long run at +10% of your 30-day longest and every week at +10% of your last full week, with a cut-back week every 3rd or 4th week.', src: ['ultra-frandsen', 'ultra-nielsen'] },
  { title: 'Back-to-backs and time on feet', body: 'Coaches build ultra durability with long runs and back-to-back long days rather than one huge run. That way your legs and gut get used to hours of work without a big single-session spike. Long runs are sized by time on feet and km-effort (km + metres of climbing ÷ 100), because 30 km with 1,500 m of climbing is a very different day from 30 flat road km.', src: ['ultra-uphill', 'ultra-koop', 'ultra-itra'] },
  { title: 'Hike the steep stuff', body: 'On inclines steeper than about 16°, walking uses less energy than running at the same climbing speed. Mountain plans add power-hiking and uphill intervals, and long runs tell you to hike the steep climbs.', src: ['ultra-giovanelli', 'ultra-uphill'] },
  { title: 'Strength makes you more economical', body: 'A systematic review found that heavy and explosive strength training, added to running, improves running economy in distance runners. Every HYBRD ultra plan has 1–2 short strength and mobility sessions a week, including slow step-downs to prepare your quads for long descents.', src: ['ultra-blagrove'] },
  { title: 'Taper: cut volume, keep some intensity', body: 'In a meta-analysis of competitive athletes, the best taper lasted about 2 weeks and cut volume by 41–60%, while keeping intensity and frequency. Uphill Athlete suggests 3 weeks for races over 100 miles, with about 25% less each week. HYBRD uses 2 weeks for 50K to 100K and 3 weeks for 100 mi and long backyards.', src: ['ultra-bosquet', 'ultra-mujika', 'ultra-uphill'] },
  { title: 'Daily food: carbs fuel the training', body: 'The ISSN ultra position stand recommends a moderate-to-high carb diet (about 5–8 g/kg a day) and around 1.6 g/kg of protein, up to 2.5 g/kg in very demanding blocks. Low-carb, high-fat diets raised fat burning in elite race walkers but hurt their economy and erased the benefit of training. HYBRD sets carbs by each day’s session, from 4 g/kg on rest days to 10 g/kg on the biggest days.', src: ['ultra-issn', 'acsm2016', 'ultra-burke-lchf', 'ultra-costa2019'] },
  { title: 'Race fuel: 30–50 g/h, more if your gut is trained', body: 'The ISSN recommends 150–300 kcal/h for races up to 50 miles and 200–400 kcal/h for longer ones, with 30–50 g of carbs and 5–10 g of protein per hour. Up to about 90 g/h of mixed glucose and fructose works for efforts over 2.5–3 h if you’ve trained your gut. In real races most ultrarunners only manage 20–40 g/h. Elite runners in one study took 120 g/h, but HYBRD never sets that as a default.', src: ['ultra-issn', 'ultra-costa2019', 'ultra-jeuk2014', 'ultra-viribay'] },
  { title: 'Train your gut like a muscle', body: 'Two weeks of taking carbs during runs, as gels or real food, cut GI symptoms by about 60% and improved a 1-hour run test compared with placebo. HYBRD’s long runs start at 30 g/h and climb to your race target before the race-specific block. If your gut is prone to trouble, a short low-FODMAP diet before key runs and races may help.', src: ['ultra-costa-gut', 'ultra-jeuk-gut', 'ultra-lis-fodmap', 'ultra-costa-eigs'] },
  { title: 'Drink to thirst, and salt your fluids', body: 'The ISSN recommends 450–750 mL/h (150–250 mL every 20 min), with 500–700 mg of sodium per litre, or about 300–600 mg/h in heat. Hyponatremia is mostly caused by drinking more than you lose. At Western States, runners who got it hadn’t taken less sodium, they had drunk too much. So HYBRD caps your fluid range at your measured sweat rate.', src: ['ultra-issn', 'ultra-hew-butler', 'ultra-hoffman-na', 'ultra-baker-sweat', 'acsm-fluid'] },
  { title: 'Caffeine: a little, and late', body: 'Caffeine improves endurance at 3–6 mg/kg, and maybe from about 2 mg/kg. Around 9 mg/kg mostly adds side effects. In ultras it’s most useful late, and in races over 24 hours, sleepiness becomes a safety problem. HYBRD suggests small doses of 1–2 mg/kg from the second half or the first night, with a total cap.', src: ['ultra-caffeine', 'ultra-issn'] },
  { title: 'Sleep: bank it before, nap smart during', body: 'Six nights of extra sleep (about 9.8 h in bed) reduced attention lapses during a night without sleep. At UTMB, runners who slept more in the nights before finished faster. Most ultrarunners have a plan for sleep before a race, but only 21% have one for during it. Micronaps were the most common choice.', src: ['ultra-arnal', 'ultra-poussel', 'ultra-martin-sleep'] },
  { title: 'Backyard ultras: what the first study saw', body: 'In the first study of a backyard ultra, 12 experienced runners completed 34 ± 17 yards. Their speed fell from about 9.0 to 7.5 km/h. Heart rate and lactate stayed flat, but perceived effort kept rising and reaction time got worse. That’s why HYBRD plans steady yards, a well-practised routine, and a sleep and caffeine plan for the nights.', src: ['ultra-depauw', 'ultra-bigs-handbook'] },
  { title: 'Backyard pacing: 45–55 min yards', body: 'Each yard is 6.7056 km (100/24 mi) and starts exactly on the hour, so 24 yards is 100 miles. Finishing early earns nothing, because the extra time is just rest. Coaches and experienced backyard runners suggest 45–55 min yards, for example 52 min plus an 8 min routine. You have to average 8:57 /km just to beat the bell.', src: ['ultra-bigs-rules', 'ultra-runmotion', 'ultra-milestogether'] },
  { title: 'Heat, cold and altitude', body: 'Heat: acclimatise with repeated exercise-heat sessions over 1–2 weeks, start well hydrated, and use cooling. Cold and night: layer up, stay dry, and protect your hands, feet and face. Altitude: above about 3,000 m, go up gradually, and know the warning signs of altitude illness.', src: ['ultra-racinais', 'ultra-acsm-cold', 'ultra-wms-altitude'] },
  { title: 'Kidneys, muscles and painkillers', body: 'Almost all reported cases of rhabdomyolysis with kidney injury in endurance sport were in ultrarunners, though markers usually returned to baseline after about 6 days. In an 80 km race trial, 52% of runners taking ibuprofen got acute kidney injury, against 34% on placebo. So: no NSAIDs during ultras, and watch for dark urine or very little urine.', src: ['ultra-rojas', 'ultra-lipman', 'ultra-scheer-health'] },
  { title: 'Who shouldn’t follow an app plan', body: 'Chest pain, fainting or unusual breathlessness, or known heart, kidney or metabolic disease, needs medical clearance before vigorous training. Race cardiac arrests are rare, at 0.54 per 100,000 marathon and half-marathon runners, and are mostly caused by underlying heart disease. Youth ultras need individual medical assessment, and pregnancy needs your obstetric care provider. HYBRD screens for all of this first.', src: ['ultra-riebe', 'ultra-kim-cardiac', 'ultra-scheer-youth', 'ultra-acog'] },
  { title: 'Under-fuelling (REDs)', body: 'Low energy availability, meaning not eating enough for your training, leads to REDs. It harms hormones, bones, immunity, mood and performance, in women and in men. Heavy ultra blocks make it easy to under-eat. Missed periods, frequent illness, stress fractures and constant fatigue are all signs to see a sports doctor or dietitian.', src: ['wl-reds', 'ultra-issn'] },
];

export interface Check { id: string; text: string; races?: ('road' | 'trail' | 'byu')[] }
export interface CheckGroup { id: string; title: string; intro?: string; items: Check[]; src: string[] }
export const GEAR: CheckGroup[] = [
  { id: 'kit', title: 'Core kit (every race)', src: ['ultra-koop'], items: [
    { id: 'shoes', text: 'Race shoes with 50–100 km in them, plus a second pair (half a size up if your feet swell)' },
    { id: 'socks', text: 'Several pairs of tested socks, and anti-chafe for feet, thighs, underarms and chest' },
    { id: 'layers', text: 'Layers: tested shirt, wind or rain jacket, warm layer, hat or buff, gloves' },
    { id: 'watch', text: 'Watch or phone charged, a power bank and cables' },
    { id: 'fuel', text: 'All your race food and drink mix, tested in long runs, plus 25% spare' },
    { id: 'meds', text: 'First aid: blister kit, tape, plasters, any personal meds (no ibuprofen during the race)' },
    { id: 'sun', text: 'Sunscreen, sunglasses, lip balm' },
  ] },
  { id: 'trail', title: 'Trail and mountain', src: ['ultra-acsm-cold', 'ultra-wms-altitude'], items: [
    { id: 'mandatory', text: 'Mandatory kit list from the race website, all packed and checked', races: ['trail'] },
    { id: 'pack', text: 'Running vest or pack with bottles or soft flasks you’ve trained with', races: ['trail'] },
    { id: 'headlamp', text: 'Headlamp plus a spare, and spare batteries', races: ['trail', 'byu'] },
    { id: 'poles', text: 'Poles, if allowed and practised', races: ['trail'] },
    { id: 'map', text: 'Course GPX loaded on your watch, and the cut-off times written down', races: ['trail'] },
    { id: 'emergency', text: 'Foil blanket, whistle, phone with the race emergency number', races: ['trail'] },
  ] },
  { id: 'byu', title: 'Backyard crew box', intro: 'Lay everything out at your tent so the between-yards routine takes 3–6 minutes. No personal aid or pacers on the loop.', src: ['ultra-bigs-handbook', 'ultra-runmotion'], items: [
    { id: 'chair', text: 'Camp chair, plus a reclining chair or mat for naps', races: ['byu'] },
    { id: 'bins', text: 'Labelled bins: food, drink, clothes, feet and first aid, night gear', races: ['byu'] },
    { id: 'cooler', text: 'Cooler with ready-made drinks, plus a flask of hot soup or broth for the nights', races: ['byu'] },
    { id: 'clock', text: 'A clock or this lap timer where you can see it: back in the corral 1 min before the bell', races: ['byu'] },
    { id: 'shoes2', text: '2–3 pairs of shoes and lots of socks (change them at night or when it’s wet)', races: ['byu'] },
    { id: 'warm', text: 'Warm jacket for the rest minutes at night, even in summer', races: ['byu'] },
    { id: 'log', text: 'A log sheet for each yard: lap time, food, drink, notes', races: ['byu'] },
  ] },
  { id: 'road', title: 'Road and track', src: ['ultra-issn'], items: [
    { id: 'belt', text: 'Handheld bottle or belt, unless the aid stations are close together', races: ['road'] },
    { id: 'special', text: 'Special-needs or drop bags labelled with your bib number, if the race allows them', races: ['road', 'trail'] },
    { id: 'shoes-road', text: 'Cushioned road shoes you’ve done your longest runs in', races: ['road'] },
  ] },
];
export const CREW: Card[] = [
  { title: 'Brief your crew', body: 'Give them a one-page sheet with your expected arrival times (A, B and C pace), what you want at each stop, and the warning signs below. Ask them to tell you how you look, and to make you eat. A crew should never let you sit for long or keep drinking only plain water.', src: ['ultra-koop', 'ultra-hew-butler'] },
  { title: 'Backyard routine (3–6 min)', body: '1) Cross the line and say your needs out loud. 2) Drink and eat while you walk to the tent: about one hour of carbs per yard. 3) Toilet, feet, clothing. 4) Sit for 1–2 min if there’s time. 5) Back in the corral at −1 min. Your crew can only help between yards. Once the bell rings, you’re on your own.', src: ['ultra-bigs-handbook', 'ultra-runmotion', 'ultra-milestogether'] },
  { title: 'Night plan', body: 'Switch to warm, savoury food (broth, potatoes, rice). Put on a warm layer the moment you stop, and change to fresh socks. Bring in caffeine (see Fuel). For naps, many backyard runners use micro-naps of about 5 min, or run a couple of faster yards to earn a 15–20 min sleep.', src: ['ultra-milestogether', 'ultra-martin-sleep', 'ultra-caffeine', 'ultra-issn'] },
];
export const ACCLIM: Card[] = [
  { title: 'Heat (race over ~25 °C / 77 °F)', body: 'In the 1–2 weeks before, do repeated sessions in the heat: run at the warmest time of day, or add extra layers or an indoor session. Start every hot run hydrated and cool off with ice, wet buffs and shade. Stop if you feel confused, dizzy or stop sweating.', src: ['ultra-racinais', 'ultra-acsm-heat'] },
  { title: 'Cold and night', body: 'Layer up and stay dry: wet clothes plus slow pace at night is how runners get very cold. Pack gloves, a hat and a dry warm layer for every stop. Shivering that won’t stop, clumsiness or confusion are hypothermia warning signs.', src: ['ultra-acsm-cold'] },
  { title: 'Altitude (above ~2,500–3,000 m)', body: 'If you can, arrive several days early and sleep low. Above about 3,000 m, go up gradually. A headache with nausea, poor balance, confusion or breathlessness at rest means go down and get help.', src: ['ultra-wms-altitude'] },
];
export const RACE_WEEK: Check[] = [
  { id: 'rw-sleep', text: 'Bank sleep: aim for 1–2 extra hours a night this week' },
  { id: 'rw-carbs', text: 'If you carb-load: about 10–12 g/kg of carbs a day for the last 36–48 h, low fibre, foods you know' },
  { id: 'rw-nothing-new', text: 'Nothing new: kit, shoes, food, drink, caffeine, all tested' },
  { id: 'rw-plan', text: 'Write your pacing and fuelling plan on a card, and send a copy to your crew' },
  { id: 'rw-weather', text: 'Check the forecast and adjust your layers, cooling and fluid plan' },
  { id: 'rw-travel', text: 'Plan your travel and race-morning breakfast (1–4 g/kg carbs, 1–4 h before)' },
  { id: 'rw-bags', text: 'Pack drop bags and crew boxes, and label everything' },
  { id: 'rw-nsaid', text: 'No ibuprofen or other NSAIDs before or during the race' },
];
export const RACE_WEEK_SRC = ['acsm2016', 'ultra-arnal', 'ultra-poussel', 'ultra-lipman', 'ultra-koop'];
export function raceDayPlan(race: RaceId, lapMin: number): Card[] {
  const byu = race === 'byu';
  return [
    { title: 'Start', body: byu ? `Run your first yards at ~${lapMin} min, even if it feels too slow. Everyone starts together every hour, so going faster earns nothing.` : 'Start slower than feels right, with conversation-easy breathing. Power-hike the climbs from the start. The first third should feel almost too easy.', src: byu ? ['ultra-bigs-handbook', 'ultra-runmotion'] : ['ultra-koop', 'ultra-giovanelli'] },
    { title: 'Eat early, eat often', body: 'Start fuelling in the first 30 min and set a 20-min reminder. Move from sweet to savoury foods as the hours pass. If your stomach turns, slow down, cool down and use smaller sips and bites instead of stopping entirely.', src: ['ultra-issn', 'ultra-costa2019'] },
    { title: 'Check yourself every hour', body: 'Ask yourself: am I eating? Is my urine pale yellow? Am I peeing? Are my hands swelling or is my head aching (too much fluid)? Do my feet have hot spots? Fix small problems right away.', src: ['ultra-hew-butler', 'ultra-wms-eah'] },
    { title: 'The low points', body: 'Lows are normal and they pass. Eat something, slow down for 10–15 min and talk to someone. They are not a reason to keep drinking plain water or take painkillers.', src: ['ultra-issn', 'ultra-lipman'] },
  ];
}
export const RECOVERY: Card[] = [
  { title: 'First 48 h', body: 'Eat and drink normally, with carbs and protein soon after the finish. Walk gently and sleep. Keep an eye on your urine: dark, cola-coloured urine or very little urine means get medical help today. Skip anti-inflammatory painkillers while your kidneys recover.', src: ['issn-timing', 'ultra-rojas', 'ultra-lipman'] },
  { title: 'Week 1', body: 'Rest, walking and easy cross-training (cycling, swimming) only. Studies show big drops in leg strength after mountain ultras that take days to come back, and muscle and kidney markers were usually back to normal after about 6 days.', src: ['ultra-millet', 'ultra-rojas'] },
  { title: 'Weeks 2–4: return to run', body: 'HYBRD guideline (coaching practice, not a study result): once stairs feel normal and nothing hurts when you walk, try 20–30 min easy every other day. Then build back toward your usual easy volume over 2–3 weeks, with no hard sessions or races yet. After a 100 mi or a long backyard, allow the longer end. Pain that changes how you run needs a physio.', src: ['ultra-koop', 'ultra-frandsen'] },
];
export interface Warn { id: string; title: string; signs: string; act: string; src: string[] }
export const WARNINGS: Warn[] = [
  { id: 'eah', title: 'Hyponatremia (low blood sodium)', signs: 'Headache, nausea or vomiting, bloating, swollen hands, weight gain, confusion, unusual behaviour, seizures.', act: 'Stop drinking plain fluids. Tell medical staff it may be hyponatremia; it needs a blood sodium test. Severe symptoms are an emergency (call your local emergency number).', src: ['ultra-hew-butler', 'ultra-wms-eah'] },
  { id: 'heat', title: 'Exertional heat stroke', signs: 'Confusion, stumbling, collapse, odd behaviour, very hot skin. Sweating may continue.', act: 'Emergency: call for help and cool first, transport second (cold-water immersion or ice and wet towels over the whole body).', src: ['ultra-acsm-heat'] },
  { id: 'rhabdo', title: 'Rhabdomyolysis or kidney injury', signs: 'Dark, cola-coloured urine, very little or no urine, severe muscle pain or swelling out of proportion to the effort.', act: 'Stop. Get medical help the same day, and don’t take NSAIDs. Drink only as advised by medical staff.', src: ['ultra-rojas', 'ultra-lipman'] },
  { id: 'cardiac', title: 'Heart warning signs', signs: 'Chest pain or pressure, fainting, a racing or irregular heartbeat, unusual breathlessness.', act: 'Stop immediately and call your local emergency number. If someone collapses, start CPR and use an AED: bystander CPR is the strongest predictor of survival.', src: ['ultra-kim-cardiac', 'ultra-riebe'] },
  { id: 'cold', title: 'Hypothermia', signs: 'Uncontrolled shivering, clumsy hands, slurred speech, confusion, apathy.', act: 'Get out of the wind, put on dry warm layers and have something warm and sugary, then get help. Don’t continue alone.', src: ['ultra-acsm-cold'] },
  { id: 'alt', title: 'Altitude illness', signs: 'Headache plus nausea, dizziness or poor sleep. Worse: poor balance, confusion, breathlessness at rest.', act: 'Don’t go higher. Go down, and get medical help for anything beyond mild symptoms.', src: ['ultra-wms-altitude'] },
];
/** Real-food options. Carbs/sodium computed from USDA SR Legacy per-100 g values × the stated portion. */
export interface Food { name: string; portion: string; carbs: number; sodium: number; when: string; fdc: number }
export const REAL_FOODS: Food[] = [
  { name: 'Banana', portion: '1 medium (118 g)', carbs: 27, sodium: 1, when: 'Early, easy on the gut', fdc: 173944 },
  { name: 'Boiled potatoes with salt', portion: '100 g', carbs: 20, sodium: 240, when: 'Savoury, great at night', fdc: 170114 },
  { name: 'White rice (onigiri-style ball)', portion: '100 g cooked', carbs: 29, sodium: 0, when: 'Add salt or miso; easy to carry', fdc: 168882 },
  { name: 'White bread + jam', portion: '2 slices (58 g) + 1 tbsp (20 g)', carbs: 42, sodium: 290, when: 'Backyard tent staple', fdc: 174924 },
  { name: 'Medjool dates', portion: '2 dates (48 g)', carbs: 36, sodium: 1, when: 'Dense carbs, small to carry', fdc: 168191 },
  { name: 'Salted potato chips', portion: '28 g', carbs: 15, sodium: 148, when: 'Salt + carbs when sweet gets old', fdc: 169677 },
  { name: 'Saltine crackers', portion: '5 crackers (15 g)', carbs: 11, sodium: 140, when: 'Settles nausea, adds salt', fdc: 172746 },
  { name: 'Fig bar', portion: '28 g', carbs: 20, sodium: 99, when: 'Between gels', fdc: 172721 },
  { name: 'Honey', portion: '1 tbsp (21 g)', carbs: 17, sodium: 1, when: 'In tea or on bread', fdc: 169640 },
  { name: 'Cola (regular)', portion: '250 mL (~260 g)', carbs: 27, sodium: 8, when: 'Late race; contains caffeine', fdc: 174852 },
  { name: 'Chicken broth (from cube)', portion: '1 cup (243 g)', carbs: 1, sodium: 792, when: 'Night warmth + sodium', fdc: 174566 },
  { name: 'Dill pickle spear', portion: 'small (35 g)', carbs: 1, sodium: 283, when: 'Salty craving', fdc: 168558 },
];
export const ULTRA_SOURCE_IDS = Array.from(new Set([
  ...ULTRA_RESEARCH.flatMap((r) => r.src), ...GEAR.flatMap((g) => g.src), ...CREW.flatMap((c) => c.src), ...ACCLIM.flatMap((c) => c.src),
  ...raceDayPlan('byu', 50).flatMap((c) => c.src), ...raceDayPlan('50k', 50).flatMap((c) => c.src), ...RECOVERY.flatMap((c) => c.src), ...WARNINGS.flatMap((w) => w.src), ...RACE_WEEK_SRC,
  'ultra-depauw', 'ultra-bigs-rules', 'ultra-bigs-handbook', 'daniels', 'tanaka2001', 'usda', 'issn-protein',
]));
