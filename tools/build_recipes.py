# Builds src/data/recipes.json: every macro is computed from USDA FoodData Central SR Legacy values (per 100 g).
import json
D = {r[11]: r for r in json.load(open('public/data/foods-usda.json'))['foods']}
# id: (fdc_id)
I = dict(oats=173904, banana=173944, honey=169640, pb=172470, wwbread=172688, wbread=174924, rice=168878, brownrice=169704,
  chicken=171477, greek=170894, milk1=170872, chocmilk=170881, egg=171287, eggwhite=172183, blackbeans=175188, lentils=172421,
  tuna=171986, salmon=175168, potato=170030, sweetpot=168483, pasta=169737, cottage=172182, blueberry=171711, strawberry=167762,
  spinach=168462, broccoli=169967, oliveoil=171413, sugar=169655, salt=173468, oj=169099, coconut=174831, dates=168191,
  ricecake=169679, jam=169641, whey=173180, avocado=171705, tortilla=175037, cheddar=170899, turkey=171506, peas=170017,
  onion=170000, tomato=170501, curry=170924, soy=174277, mixveg=170472, lemon=167747, tartcherry=167807, bagel=174899,
  maple=169661, chia=170554, almonds=170567, raisins=168164, pretzels=167555, watermelon=167765, tofu=172475, quinoa=168917,
  water=173647, lime=168156, pinto=175201, chickpeas=173800, pepper=170108, salsa=174524, cinnamon=171320, garlic=169230, mozz=170847, beef90=171795)
for k, v in I.items(): assert v in D, (k, v)

R = [
 # id, name, category, tags, serves, minutes, ingredients[(key, grams, label)], steps, why, sources
 ('pre-oats', 'Banana Honey Oats', 'pre', ['pre-workout','budget','vegetarian'], 1, 8,
  [('oats',60,'⅔ cup rolled oats'),('milk1',240,'1 cup 1% milk'),('banana',118,'1 medium banana'),('honey',21,'1 tbsp honey'),('cinnamon',1,'pinch cinnamon')],
  ['Simmer oats in milk 4–5 min (or microwave 2 min).','Top with sliced banana, honey and cinnamon.'],
  'Mostly carbohydrate with some protein and little fat or fibre overload — a common choice 2–4 h before training, when the position stands suggest carbohydrate-focused meals.', ['acsm2016','issn-timing']),
 ('pre-toast', 'PB Banana Toast', 'pre', ['pre-workout','budget','vegetarian','quick'], 1, 5,
  [('wbread',56,'2 slices white bread'),('pb',16,'1 tbsp peanut butter'),('banana',118,'1 medium banana'),('honey',7,'1 tsp honey')],
  ['Toast bread, spread peanut butter, top with banana and a drizzle of honey.'],
  'Quick-digesting carbs for 1–2 h before a session; white bread keeps fibre lower for sensitive stomachs.', ['acsm2016']),
 ('pre-ricecakes', 'Rice Cakes + Jam (30-min snack)', 'pre', ['pre-workout','quick','vegan','budget'], 1, 2,
  [('ricecake',27,'3 rice cakes'),('jam',20,'1 tbsp jam'),('banana',60,'½ banana')],
  ['Spread jam on rice cakes, add banana slices.'],
  'Very low fat and fibre — a light top-up 30–60 min before hard intervals or a HYROX session.', ['acsm2016']),
 ('pre-bagel', 'Race-Morning Bagel', 'pre', ['pre-workout','endurance','vegetarian'], 1, 5,
  [('bagel',105,'1 plain bagel'),('pb',16,'1 tbsp peanut butter'),('honey',14,'2 tsp honey'),('banana',118,'1 medium banana')],
  ['Toast bagel, add peanut butter and honey; eat banana alongside.'],
  'About 1–1.5 g carbohydrate per kg for a 70 kg athlete, 2–3 h before a long run, ride or race (ACSM: 1–4 g/kg 1–4 h before).', ['acsm2016']),
 ('post-chicken-bowl', 'Chicken Rice Power Bowl', 'post', ['post-workout','high-protein','meal-prep'], 1, 25,
  [('chicken',150,'150 g cooked chicken breast'),('rice',200,'1 cup cooked white rice'),('broccoli',90,'1 cup broccoli'),('avocado',50,'⅓ avocado'),('soy',16,'1 tbsp soy sauce'),('lime',10,'squeeze of lime')],
  ['Cook rice; roast or pan-cook chicken; steam broccoli.','Assemble with avocado, soy sauce and lime.'],
  '~55 g protein plus plenty of carbohydrate to start glycogen recovery — above the 20–40 g per-meal range, so it also covers bigger athletes.', ['issn-protein','issn-timing']),
 ('post-salmon', 'Salmon, Sweet Potato & Greens', 'post', ['post-workout','omega-3'], 1, 30,
  [('salmon',140,'140 g salmon fillet'),('sweetpot',200,'1 large sweet potato'),('spinach',60,'2 cups spinach'),('oliveoil',5,'1 tsp olive oil'),('lemon',15,'1 tbsp lemon juice')],
  ['Bake sweet potato 40 min at 200 °C / 400 °F (or microwave 8 min).','Bake salmon 12–15 min.','Wilt spinach in oil, finish with lemon.'],
  'Quality protein, starchy carbohydrate and vegetables in one plate.', ['issn-protein','acsm2016']),
 ('post-tuna-pasta', 'Tuna Tomato Pasta', 'post', ['post-workout','budget','high-protein'], 1, 15,
  [('pasta',220,'1½ cups cooked pasta'),('tuna',140,'1 can tuna (drained)'),('tomato',120,'½ cup crushed tomatoes'),('garlic',5,'1 clove garlic'),('oliveoil',5,'1 tsp olive oil'),('spinach',30,'1 cup spinach')],
  ['Boil pasta. Sauté garlic in oil, add tomatoes and simmer 5 min.','Stir in tuna and spinach, toss with pasta.'],
  'Cheap pantry protein + carbs. Canned tuna is one of the lowest-cost protein sources per gram.', ['issn-protein']),
 ('post-eggs', 'Eggs, Toast & Fruit', 'post', ['post-workout','budget','vegetarian','breakfast'], 1, 10,
  [('egg',150,'3 large eggs'),('wwbread',64,'2 slices whole-wheat toast'),('strawberry',150,'1 cup strawberries'),('spinach',30,'1 cup spinach')],
  ['Scramble eggs with spinach, serve with toast and berries.'],
  'Whole eggs give ~19 g high-quality protein with leucine; toast and fruit add carbohydrate.', ['issn-protein']),
 ('post-burrito', 'Turkey & Bean Burrito', 'post', ['post-workout','meal-prep'], 1, 15,
  [('tortilla',70,'1 large flour tortilla'),('turkey',100,'100 g cooked ground turkey'),('blackbeans',90,'½ cup black beans'),('rice',80,'⅓ cup cooked rice'),('salsa',60,'¼ cup salsa'),('cheddar',14,'2 tbsp cheddar')],
  ['Warm everything, roll it up. Make 5 at once and freeze.'],
  'Portable recovery meal combining protein and carbohydrate.', ['issn-timing']),
 ('budget-beans-rice', 'Black Beans & Rice', 'budget', ['budget','vegan','meal-prep'], 2, 20,
  [('blackbeans',260,'1 can black beans (with liquid)'),('rice',400,'2 cups cooked rice'),('onion',80,'½ onion'),('pepper',75,'½ bell pepper'),('oliveoil',9,'2 tsp olive oil'),('salsa',60,'¼ cup salsa')],
  ['Sauté onion and pepper in oil, add beans and simmer 5 min.','Serve over rice with salsa.'],
  'Plant protein plus carbohydrate for well under the cost of a takeaway; add eggs or cheese to raise protein.', ['acsm2016']),
 ('budget-lentil-curry', 'Lentil Spinach Curry', 'budget', ['budget','vegan','meal-prep','high-fibre'], 3, 35,
  [('lentils',600,'3 cups cooked lentils'),('tomato',240,'1 cup crushed tomatoes'),('onion',110,'1 onion'),('garlic',9,'3 cloves garlic'),('curry',6,'2 tsp curry powder'),('oliveoil',14,'1 tbsp oil'),('spinach',90,'3 cups spinach'),('rice',600,'3 cups cooked rice')],
  ['Sauté onion, garlic and curry powder in oil.','Add tomatoes and lentils, simmer 15 min, stir in spinach.','Serve over rice. Keeps 4 days in the fridge.'],
  'High-fibre, high-carb batch meal; lentils add ~18 g protein per cooked cup.', ['acsm2016']),
 ('budget-fried-rice', 'Egg Fried Rice', 'budget', ['budget','vegetarian','quick'], 1, 12,
  [('rice',250,'1¼ cups cooked rice (day-old)'),('egg',100,'2 eggs'),('mixveg',100,'¾ cup frozen mixed vegetables'),('soy',16,'1 tbsp soy sauce'),('oliveoil',5,'1 tsp oil')],
  ['Scramble eggs in a hot pan, add vegetables and rice.','Stir-fry 4 min, season with soy sauce.'],
  'Uses leftover rice and frozen veg — fast carbohydrate refuel after a long session.', ['acsm2016']),
 ('budget-potato-eggs', 'Potato & Egg Hash', 'budget', ['budget','vegetarian'], 1, 20,
  [('potato',250,'1 large potato'),('egg',100,'2 eggs'),('onion',40,'¼ onion'),('pepper',50,'⅓ pepper'),('oliveoil',9,'2 tsp oil')],
  ['Dice and pan-fry potato 12 min, add onion and pepper.','Make wells and cook the eggs on top.'],
  'Potatoes are one of the cheapest carbohydrate sources and provide potassium.', ['acsm2016']),
 ('protein-yogurt', 'Greek Yogurt Berry Bowl', 'protein', ['high-protein','quick','vegetarian','breakfast'], 1, 3,
  [('greek',250,'1 cup nonfat Greek yogurt'),('blueberry',75,'½ cup blueberries'),('honey',14,'2 tsp honey'),('almonds',14,'10 almonds'),('chia',10,'1 tbsp chia')],
  ['Layer yogurt, berries, nuts and chia; drizzle honey.'],
  '~30 g protein — a convenient dose in the ISSN 20–40 g range.', ['issn-protein']),
 ('protein-cottage', 'Cottage Cheese & Pineapple', 'protein', ['high-protein','quick','vegetarian','bedtime'], 1, 2,
  [('cottage',226,'1 cup 2% cottage cheese'),('watermelon',0,''),('dates',0,''),('banana',0,''),('honey',0,''),('almonds',0,''),('cinnamon',1,'pinch cinnamon')],
  ['Top cottage cheese with fruit and cinnamon.'],
  'Casein-rich protein; the ISSN notes pre-sleep casein (30–40 g) can support overnight muscle protein synthesis.', ['issn-protein']),
 ('protein-overnight-oats', 'Overnight Protein Oats', 'protein', ['high-protein','meal-prep','breakfast'], 1, 5,
  [('oats',50,'½ cup oats'),('milk1',200,'¾ cup 1% milk'),('whey',30,'1 scoop whey protein'),('chia',10,'1 tbsp chia'),('blueberry',75,'½ cup berries')],
  ['Stir everything in a jar, refrigerate overnight.'],
  'Make-ahead breakfast with ~39 g protein and slow carbs.', ['issn-protein']),
 ('protein-tofu-scramble', 'Tofu Scramble', 'protein', ['high-protein','vegan'], 1, 12,
  [('tofu',200,'200 g firm tofu'),('spinach',60,'2 cups spinach'),('pepper',75,'½ bell pepper'),('oliveoil',5,'1 tsp oil'),('wwbread',32,'1 slice whole-wheat toast')],
  ['Crumble tofu into a hot oiled pan with pepper; cook 6 min.','Add spinach and season (turmeric, salt, pepper).'],
  'Plant protein option; combine with other protein foods across the day.', ['issn-protein']),
 ('drink-choc-milk', 'Chocolate Milk Recovery', 'drink', ['post-workout','drink','budget','quick'], 1, 1,
  [('chocmilk',480,'2 cups low-fat chocolate milk')],
  ['Chill and drink within ~1–2 h after training.'],
  'Provides carbohydrate and protein together (≈3:1), the ISSN recovery option of carbohydrate + protein when the next session is soon.', ['issn-timing']),
 ('drink-recovery-shake', 'Banana Berry Recovery Shake', 'drink', ['post-workout','drink','high-protein'], 1, 3,
  [('whey',30,'1 scoop whey protein'),('milk1',300,'1¼ cups 1% milk'),('banana',118,'1 banana'),('strawberry',100,'⅔ cup strawberries'),('oats',20,'2 tbsp oats')],
  ['Blend until smooth.'],
  '~40 g protein + ~60 g carbohydrate in a glass.', ['issn-timing','issn-protein']),
 ('drink-diy-electrolyte', 'DIY Sports Drink (≈6% carbs)', 'drink', ['hydration','endurance','budget','electrolytes'], 1, 2,
  [('water',440,'≈ 1¾ cups water'),('oj',120,'½ cup orange juice'),('sugar',20,'4 tsp sugar'),('salt',1.2,'¼ tsp salt (scant)')],
  ['Stir until dissolved. Makes ~560 ml (≈ 19 oz).','Sip ~150–350 ml every 15–20 min during long sessions.'],
  'Around 6% carbohydrate with ~490 mg sodium per bottle — in line with the 6–8% carbohydrate-electrolyte solutions in the ISSN and ACSM position stands.', ['issn-timing','acsm-fluid']),
 ('drink-coconut-lime', 'Coconut Water Lime Cooler', 'drink', ['hydration','electrolytes','light'], 1, 2,
  [('coconut',330,'1 can coconut water'),('lime',15,'juice of ½ lime'),('salt',0.6,'pinch of salt')],
  ['Mix and serve over ice.'],
  'Natural potassium; the pinch of salt adds sodium, the main electrolyte lost in sweat. Lower in carbohydrate than a sports drink.', ['acsm-fluid']),
 ('drink-tart-cherry', 'Tart Cherry Spritzer', 'drink', ['drink','recovery'], 1, 1,
  [('tartcherry',240,'1 cup tart cherry juice'),('water',120,'½ cup sparkling water')],
  ['Mix juice with sparkling water.'],
  'A carbohydrate-containing recovery drink; evidence for tart cherry and muscle soreness is mixed — enjoy it as a drink, not a cure.', ['acsm2016']),
 ('fuel-dates', 'Mid-Run Dates', 'fuel', ['endurance','during','vegan','budget'], 1, 0,
  [('dates',48,'2 medjool dates'),('salt',0.3,'tiny pinch of salt')],
  ['Pit and carry in a small bag; eat one every ~20–30 min on long efforts.'],
  '~36 g carbohydrate — roughly one hour’s worth at the 30–60 g/h rate for 1–2.5 h efforts.', ['acsm2016','issn-timing']),
 ('fuel-rice-balls', 'Salted Rice Balls', 'fuel', ['endurance','during','budget','vegan'], 4, 15,
  [('rice',400,'2 cups cooked white rice'),('jam',40,'2 tbsp jam or honey'),('salt',1.5,'¼ tsp salt')],
  ['Mix warm rice with salt; form 4 balls around a little jam.','Wrap in foil for rides.'],
  'Real-food fuel for long rides: ~35 g carbohydrate per ball, with some sodium.', ['acsm2016']),
 ('fuel-pretzel-raisin', 'Pretzel & Raisin Mix', 'fuel', ['endurance','during','vegan','budget'], 1, 1,
  [('pretzels',30,'1 oz pretzels'),('raisins',40,'¼ cup raisins')],
  ['Mix in a zip bag.'],
  'Salty + sweet carbohydrate (~55 g) that’s easy to carry on long hikes and rides.', ['acsm2016']),
]
out = []
for (rid, name, cat, tags, serves, mins, ings, steps, why, src) in R:
    ings = [x for x in ings if x[1] > 0]
    if rid == 'protein-cottage':
        ings.insert(1, ('watermelon', 0, ''))  # placeholder removed below
        ings = [x for x in ings if x[1] > 0] + [('pineapple', 165, '1 cup pineapple')]
    tot = dict(kcal=0, protein=0, carbs=0, fat=0, fiber=0, sodium=0)
    rows = []
    for key, g, label in ings:
        fid = I.get(key, 169124 if key == 'pineapple' else None)
        f = D[fid]
        m = g / 100
        tot['kcal'] += f[2]*m; tot['protein'] += f[3]*m; tot['carbs'] += f[4]*m; tot['fat'] += f[5]*m; tot['fiber'] += f[6]*m; tot['sodium'] += f[8]*m
        rows.append({'label': label, 'grams': g, 'fdcId': fid, 'usda': f[0]})
    per = {k: round(v / serves, 1) if k not in ('kcal', 'sodium') else round(v / serves) for k, v in tot.items()}
    out.append(dict(id=rid, name=name, cat=cat, tags=tags, serves=serves, minutes=mins, ingredients=rows, steps=steps, why=why, sources=src, perServing=per))
json.dump(out, open('src/data/recipes.json', 'w'), indent=1, ensure_ascii=False)
for r in out: print(r['id'], r['perServing'])
