# Builds src/data/plan-foods.json for the Weight-loss programs meal planner.
# Every macro is computed from USDA FoodData Central SR Legacy values (per 100 g) in public/data/foods-usda.json.
#  - recipes: extra weight-loss-friendly breakfasts, mains and snacks (same shape as recipes.json + planner fields)
#  - meta:    planner fields (slots, contains, lowcarb, med, budget) for the existing recipes in recipes.json
#  - sides:   single USDA foods the planner can add in set portions to hit protein / calories
# Allergen and diet flags are derived from the ingredients (INGREDIENT_FLAGS), never typed per recipe.
import json
D = {r[11]: r for r in json.load(open('public/data/foods-usda.json'))['foods']}
OLD = json.load(open('src/data/recipes.json'))

I = dict(oats=173904, banana=173944, honey=169640, pb=172470, wwbread=172688, rice=168878, brownrice=169704,
  chicken=171477, greek=170894, milk1=170872, egg=171287, eggwhite=172183, hardegg=173424, blackbeans=175188, lentils=172421,
  tuna=171986, salmon=175168, potato=170030, bakedpot=170093, sweetpot=168483, pasta=169737, wwpasta=168910, cottage=172182,
  blueberry=171711, frozblue=173950, strawberry=167762, spinach=168462, broccoli=169967, oliveoil=171413, salt=173468,
  avocado=171705, tortilla=175037, corntort=175036, cheddar=170899, feta=173420, mozz=170847, parm=171247, turkey93=172851,
  beef90=171794, onion=170000, tomato=170501, tomraw=170457, curry=170924, soy=174277, mixveg=170472, lemon=167747, lime=168156,
  chia=170554, almonds=170567, walnuts=170187, peanuts=173806, tofu=172475, tempeh=174272, edamame=168411, soymilk=172456,
  quinoa=168917, couscous=169700, bulgur=170287, wwpita=174916, pepper=170108, salsa=174524, cinnamon=171320, garlic=169230,
  chickpeas=173800, kidney=174285, whitebeans=175204, shrimp=175180, cod=171956, lox=173687, greenbeans=169141, zucchini=169291,
  carrot=170393, hummus=174289, apple=171688, orange=169097, pear=169118, grapes=174683, pumpseed=170556, hemp=170148,
  marinara=171192, romaine=169247, mushroom=169251, cauli=169986, kale=168421, olives=169094, corn=168399, cabbage=169975,
  tahini=170189, asparagus=168389, vwg=168147, soyprot=173181, broth=171583, popcorn=167959, maple=169661, whey=173180, water=173647, cucumber=169225)
for k, v in I.items(): assert v in D, (k, v)

# fdcId -> flags. meat = poultry/red meat; 'pork' never appears (no pork in the planner, so every recipe is halal/kosher-friendly on that point).
F = {}
def flag(ids, *fl):
    for i in ids: F.setdefault(I[i] if isinstance(i, str) else i, set()).update(fl)
flag(['chicken', 'turkey93', 171506], 'meat', 'poultry')
flag(['beef90', 171795], 'meat', 'beef')
flag(['tuna', 'salmon', 'cod', 'lox'], 'fish')
flag(['shrimp'], 'shellfish')
flag(['milk1', 170881, 'greek', 'cottage', 'cheddar', 'feta', 'mozz', 'parm', 'whey'], 'dairy')
flag(['egg', 'eggwhite', 'hardegg'], 'egg')
flag(['honey'], 'honey')
# Gluten: wheat products, soy sauce made with wheat, and regular oats (cross-contact is common; only certified gluten-free oats are safe for coeliac disease)
flag(['wwbread', 174924, 'pasta', 'wwpasta', 'tortilla', 174899, 167555, 'soy', 'oats', 'couscous', 'bulgur', 'wwpita'], 'gluten')
flag(['pb', 'almonds', 'walnuts', 'peanuts'], 'nuts')
flag(['soy', 'tofu', 'tempeh', 'edamame', 'soymilk', 'soyprot'], 'soy')
flag(['vwg'], 'gluten')
flag(['hummus', 'tahini'], 'sesame')

# Weight-loss recipes. (id, name, slots, tags, serves, minutes, [(key, grams, label)], steps, why, sources)
R = [
 # ---------- breakfasts ----------
 ('wl-egg-white-omelette', 'Veggie Egg-White Omelette & Toast', ['breakfast'], ['high-protein', 'quick', 'vegetarian'], 1, 12,
  [('eggwhite', 165, '5 egg whites (or ⅔ cup carton whites)'), ('egg', 50, '1 whole egg'), ('spinach', 30, '1 cup spinach'), ('mushroom', 50, '½ cup sliced mushrooms'), ('tomraw', 60, '6 cherry tomatoes'), ('oliveoil', 3, '½ tsp olive oil'), ('wwbread', 32, '1 slice whole-wheat toast')],
  ['Sauté mushrooms and spinach in the oil for 3 min.', 'Pour in the whisked eggs and whites, cook until set and fold.', 'Serve with tomatoes and toast.'],
  'Mostly protein for few calories, with vegetables for volume — protein and fibre both help with fullness while dieting.', ['wl-wycherley', 'wl-dga']),
 ('wl-yogurt-berry-oats', 'Greek Yogurt, Berries & Oats', ['breakfast', 'snack'], ['high-protein', 'quick', 'vegetarian', 'budget'], 1, 4,
  [('greek', 200, '¾ cup nonfat Greek yogurt'), ('frozblue', 100, '⅔ cup frozen blueberries'), ('oats', 30, '⅓ cup rolled oats'), ('chia', 8, '2 tsp chia seeds'), ('cinnamon', 1, 'pinch cinnamon')],
  ['Stir oats and chia into the yogurt (or leave overnight).', 'Top with thawed berries and cinnamon.'],
  'About 25 g protein and 8 g fibre — a high-protein, high-fibre start that is easy to scale.', ['wl-wycherley', 'wl-fiber']),
 ('wl-soy-oats', 'Soy-Milk Berry Oats', ['breakfast'], ['vegan', 'budget', 'high-fibre'], 1, 6,
  [('oats', 50, '½ cup rolled oats'), ('soymilk', 240, '1 cup soy milk'), ('frozblue', 80, '½ cup blueberries'), ('pumpseed', 15, '1 tbsp pumpkin seeds'), ('cinnamon', 1, 'pinch cinnamon')],
  ['Simmer oats in soy milk 4–5 min (or microwave 2 min).', 'Top with berries, pumpkin seeds and cinnamon.'],
  'Plant protein from soy milk and seeds plus oat fibre.', ['wl-turner', 'wl-fiber']),
 ('wl-quinoa-apple-bowl', 'Warm Quinoa Apple Bowl', ['breakfast'], ['vegan', 'high-fibre'], 1, 8,
  [('quinoa', 150, '¾ cup cooked quinoa'), ('apple', 100, '½ apple, diced'), ('pumpseed', 15, '1 tbsp pumpkin seeds'), ('hemp', 15, '1½ tbsp hemp seeds'), ('maple', 7, '1 tsp maple syrup'), ('cinnamon', 1, 'pinch cinnamon')],
  ['Warm the quinoa with a splash of water and the apple for 3 min.', 'Top with seeds, cinnamon and maple.'],
  'Free of gluten, dairy, eggs, soy and nuts — seeds supply protein and healthy fats.', ['wl-turner']),
 ('wl-lox-toast', 'Smoked Salmon Yogurt Toast', ['breakfast'], ['high-protein', 'quick', 'omega-3'], 1, 5,
  [('wwbread', 64, '2 slices whole-wheat toast'), ('greek', 60, '¼ cup Greek yogurt (as spread)'), ('lox', 60, '2 oz smoked salmon'), ('cucumber', 50, '⅓ cucumber, sliced'), ('lemon', 5, 'squeeze of lemon')],
  ['Spread yogurt on the toast, add cucumber and salmon, finish with lemon and pepper.'],
  'Fish protein and omega-3 fats; smoked salmon is salty, so balance with lower-salt meals.', ['wl-shai']),
 ('wl-eggs-avocado-plate', 'Eggs, Spinach & Avocado Plate', ['breakfast'], ['lower-carb', 'vegetarian', 'quick'], 1, 10,
  [('egg', 100, '2 eggs'), ('eggwhite', 66, '2 egg whites'), ('spinach', 60, '2 cups spinach'), ('avocado', 50, '⅓ avocado'), ('tomraw', 80, '8 cherry tomatoes'), ('oliveoil', 3, '½ tsp olive oil')],
  ['Wilt spinach in the oil, then scramble eggs and whites.', 'Serve with avocado and tomatoes.'],
  'A lower-carb breakfast: protein and fat with vegetables.', ['wl-dietfits']),
 ('wl-tofu-potato-hash', 'Tofu & Potato Breakfast Hash', ['breakfast', 'lunch'], ['vegan', 'high-protein'], 1, 18,
  [('tofu', 180, '180 g firm tofu'), ('bakedpot', 150, '1 small baked potato, diced'), ('pepper', 75, '½ bell pepper'), ('spinach', 40, '1⅓ cups spinach'), ('oliveoil', 5, '1 tsp olive oil')],
  ['Brown the diced potato in the oil 6–8 min.', 'Crumble in the tofu with the pepper, cook 5 min, fold in spinach. Season with turmeric, salt and pepper.'],
  'Gluten-free vegan protein and potato for training mornings.', ['wl-turner']),
 ('wl-oat-pancakes', 'Banana Oat Protein Pancakes', ['breakfast'], ['high-protein', 'vegetarian'], 1, 15,
  [('oats', 40, '½ cup oats, blended'), ('egg', 50, '1 egg'), ('eggwhite', 99, '3 egg whites'), ('banana', 60, '½ banana'), ('greek', 100, '⅓ cup Greek yogurt (topping)'), ('frozblue', 50, '⅓ cup berries')],
  ['Blend oats, egg, whites and banana; rest 2 min.', 'Cook small pancakes 2 min per side in a non-stick pan.', 'Top with yogurt and berries.'],
  'Pancakes rebuilt around egg whites and yogurt for ~35 g protein.', ['wl-wycherley']),
 ('wl-cottage-pear-bowl', 'Cottage Cheese, Pear & Seeds', ['breakfast', 'snack'], ['high-protein', 'quick', 'vegetarian'], 1, 3,
  [('cottage', 200, '¾ cup 2% cottage cheese'), ('pear', 140, '1 small pear, sliced'), ('pumpseed', 10, '2 tsp pumpkin seeds'), ('cinnamon', 1, 'pinch cinnamon')],
  ['Top cottage cheese with pear, seeds and cinnamon.'],
  'Casein-rich and filling; no cooking and no gluten.', ['wl-wycherley']),
 ('wl-egg-muffins', 'Turkey & Veggie Egg Muffins', ['breakfast', 'snack'], ['high-protein', 'meal-prep', 'lower-carb'], 1, 25,
  [('egg', 150, '3 eggs'), ('turkey93', 60, '2 oz cooked 93% lean ground turkey'), ('spinach', 40, '1⅓ cups spinach'), ('pepper', 50, '⅓ bell pepper'), ('cheddar', 15, '2 tbsp shredded cheddar')],
  ['Whisk eggs, stir in turkey, chopped spinach and pepper.', 'Pour into 4 muffin cups, top with cheese, bake 18–20 min at 180 °C / 350 °F. Keeps 4 days.'],
  'Batch-cooked protein for busy mornings.', ['wl-wycherley']),
 # ---------- mains ----------
 ('wl-med-chicken-quinoa', 'Mediterranean Chicken Quinoa Bowl', ['lunch', 'dinner'], ['mediterranean', 'high-protein', 'meal-prep'], 1, 25,
  [('chicken', 120, '120 g cooked chicken breast'), ('quinoa', 150, '¾ cup cooked quinoa'), ('cucumber', 80, '½ cucumber'), ('tomraw', 80, '8 cherry tomatoes'), ('chickpeas', 60, '⅓ cup chickpeas'), ('feta', 20, '2 tbsp feta'), ('oliveoil', 7, '1½ tsp olive oil'), ('lemon', 15, '1 tbsp lemon juice')],
  ['Cook quinoa; grill or roast the chicken.', 'Toss vegetables and chickpeas with oil and lemon, top with chicken and feta.'],
  'Olive oil, legumes, vegetables and whole grains — the core of a Mediterranean pattern, which performed well for weight loss in the DIRECT trial.', ['wl-shai']),
 ('wl-turkey-chili', 'Turkey & Bean Chili', ['lunch', 'dinner'], ['high-protein', 'meal-prep', 'budget', 'high-fibre'], 1, 35,
  [('turkey93', 110, '110 g 93% lean ground turkey (cooked)'), ('kidney', 130, '½ cup kidney beans'), ('tomato', 200, '¾ cup crushed tomatoes'), ('onion', 60, '½ small onion'), ('pepper', 75, '½ bell pepper'), ('oliveoil', 5, '1 tsp oil')],
  ['Brown turkey with onion and pepper in the oil.', 'Add tomatoes, beans and chili spices; simmer 20 min. Freezes well.'],
  'High protein and high fibre in one pot — a cheap, filling batch meal.', ['wl-fiber', 'wl-wycherley']),
 ('wl-salmon-potato-beans', 'Salmon, Potatoes & Green Beans', ['lunch', 'dinner'], ['mediterranean', 'omega-3'], 1, 25,
  [('salmon', 120, '120 g salmon fillet'), ('bakedpot', 200, '1 medium potato'), ('greenbeans', 125, '1 cup green beans'), ('oliveoil', 5, '1 tsp olive oil'), ('lemon', 10, 'squeeze of lemon')],
  ['Roast potato wedges 25 min at 220 °C / 425 °F.', 'Add salmon for the last 12 min; steam the beans.', 'Finish with oil and lemon.'],
  'Fish twice a week fits Mediterranean-style eating; potatoes are a filling carbohydrate.', ['wl-shai']),
 ('wl-shrimp-stir-fry', 'Shrimp Veggie Stir-Fry', ['lunch', 'dinner'], ['high-protein', 'quick'], 1, 15,
  [('shrimp', 130, '130 g cooked shrimp'), ('rice', 150, '¾ cup cooked rice'), ('mixveg', 150, '1 cup stir-fry vegetables'), ('soy', 16, '1 tbsp soy sauce'), ('garlic', 5, '1 clove garlic'), ('oliveoil', 5, '1 tsp oil')],
  ['Stir-fry garlic and vegetables 4 min in the oil.', 'Add shrimp and soy sauce for 2 min, serve over rice.'],
  'Shrimp is very lean protein; vegetables add volume for few calories.', ['wl-wycherley']),
 ('wl-lentil-soup', 'Lentil & Vegetable Soup', ['lunch', 'dinner'], ['vegan', 'budget', 'meal-prep', 'high-fibre'], 1, 30,
  [('lentils', 200, '1 cup cooked lentils'), ('carrot', 60, '1 carrot'), ('onion', 60, '½ small onion'), ('tomato', 120, '½ cup crushed tomatoes'), ('spinach', 30, '1 cup spinach'), ('broth', 300, '1¼ cups vegetable broth'), ('oliveoil', 5, '1 tsp olive oil')],
  ['Soften onion and carrot in the oil.', 'Add broth, tomatoes and lentils; simmer 15 min, stir in spinach.'],
  'Very high in fibre and low in energy density — soups and legumes help meals feel bigger.', ['wl-fiber', 'wl-huang']),
 ('wl-tofu-veg-rice', 'Tofu, Broccoli & Brown Rice', ['lunch', 'dinner'], ['vegan', 'high-protein'], 1, 20,
  [('tofu', 180, '180 g firm tofu'), ('brownrice', 150, '¾ cup cooked brown rice'), ('broccoli', 100, '1 cup broccoli'), ('pepper', 60, '⅓ bell pepper'), ('soy', 16, '1 tbsp soy sauce'), ('oliveoil', 5, '1 tsp oil')],
  ['Press and cube tofu, pan-fry in the oil until golden.', 'Add broccoli, pepper and soy sauce; serve over rice.'],
  'Soy protein with whole grains and vegetables.', ['wl-turner']),
 ('wl-bean-sweet-potato-bowl', 'Black Bean & Sweet Potato Bowl', ['lunch', 'dinner'], ['vegan', 'high-fibre', 'budget'], 1, 15,
  [('blackbeans', 130, '½ cup black beans'), ('sweetpot', 150, '1 medium sweet potato'), ('corn', 60, '⅓ cup corn'), ('salsa', 60, '¼ cup salsa'), ('romaine', 50, '1 cup romaine'), ('avocado', 30, '¼ avocado'), ('lime', 10, 'squeeze of lime')],
  ['Microwave the sweet potato 6–8 min and dice.', 'Warm beans and corn; assemble on romaine with salsa, avocado and lime.'],
  'Plant-based, gluten-free and high in fibre.', ['wl-huang', 'wl-fiber']),
 ('wl-beef-broccoli', 'Lean Beef & Broccoli Rice Bowl', ['lunch', 'dinner'], ['high-protein', 'quick'], 1, 15,
  [('beef90', 100, '100 g 90% lean ground beef (cooked)'), ('rice', 150, '¾ cup cooked rice'), ('broccoli', 150, '1½ cups broccoli'), ('soy', 16, '1 tbsp soy sauce'), ('garlic', 5, '1 clove garlic'), ('oliveoil', 3, '½ tsp oil')],
  ['Brown beef with garlic; add broccoli and soy sauce for 3 min.', 'Serve over rice.'],
  'Lean red meat for protein and iron, balanced with a big portion of vegetables.', ['wl-wycherley']),
 ('wl-chicken-fajita-bowl', 'Chicken Fajita Rice Bowl', ['lunch', 'dinner'], ['high-protein', 'meal-prep'], 1, 20,
  [('chicken', 130, '130 g cooked chicken breast'), ('rice', 120, '⅔ cup cooked rice'), ('pepper', 100, '⅔ bell pepper'), ('onion', 60, '½ small onion'), ('salsa', 60, '¼ cup salsa'), ('romaine', 40, '1 cup romaine'), ('lime', 10, 'squeeze of lime'), ('oliveoil', 5, '1 tsp oil')],
  ['Sear sliced pepper and onion in the oil with fajita spices.', 'Add sliced chicken; serve over rice and romaine with salsa and lime.'],
  'Gluten-free and high in protein; double the batch for lunches.', ['wl-wycherley']),
 ('wl-tuna-bean-salad', 'Tuna & White Bean Salad', ['lunch', 'dinner'], ['mediterranean', 'high-protein', 'quick', 'budget'], 1, 8,
  [('tuna', 120, '1 can tuna (drained)'), ('whitebeans', 100, '½ cup white beans'), ('romaine', 80, '2 cups romaine'), ('tomraw', 80, '8 cherry tomatoes'), ('cucumber', 60, '⅓ cucumber'), ('olives', 15, '5 olives'), ('oliveoil', 7, '1½ tsp olive oil'), ('lemon', 15, '1 tbsp lemon juice')],
  ['Toss everything together; season with pepper and oregano.'],
  'Pantry protein plus legumes and olive oil — Mediterranean and budget-friendly.', ['wl-shai']),
 ('wl-cod-couscous', 'Lemon Cod, Zucchini & Couscous', ['lunch', 'dinner'], ['mediterranean', 'high-protein'], 1, 20,
  [('cod', 150, '150 g cod fillet'), ('couscous', 150, '1 cup cooked couscous'), ('zucchini', 120, '1 small zucchini'), ('tomraw', 80, '8 cherry tomatoes'), ('oliveoil', 7, '1½ tsp olive oil'), ('lemon', 10, 'squeeze of lemon')],
  ['Roast zucchini and tomatoes 15 min with half the oil.', 'Bake cod 10–12 min with lemon and the rest of the oil; serve on couscous.'],
  'White fish is one of the leanest proteins available.', ['wl-shai']),
 ('wl-chicken-avocado-salad', 'Chicken Avocado Salad', ['lunch', 'dinner'], ['lower-carb', 'high-protein', 'quick'], 1, 10,
  [('chicken', 130, '130 g cooked chicken breast'), ('romaine', 100, '2 cups romaine'), ('avocado', 50, '⅓ avocado'), ('tomraw', 80, '8 cherry tomatoes'), ('cucumber', 60, '⅓ cucumber'), ('oliveoil', 7, '1½ tsp olive oil'), ('lemon', 10, 'squeeze of lemon')],
  ['Slice chicken and avocado over the greens and vegetables; dress with oil and lemon.'],
  'Lower-carb: protein, healthy fats and vegetables.', ['wl-dietfits']),
 ('wl-veggie-frittata', 'Zucchini & Feta Frittata', ['lunch', 'dinner', 'breakfast'], ['lower-carb', 'vegetarian', 'meal-prep'], 1, 25,
  [('egg', 150, '3 eggs'), ('eggwhite', 99, '3 egg whites'), ('zucchini', 80, '½ zucchini'), ('spinach', 40, '1⅓ cups spinach'), ('pepper', 50, '⅓ bell pepper'), ('feta', 20, '2 tbsp feta'), ('oliveoil', 3, '½ tsp olive oil'), ('romaine', 60, 'side salad')],
  ['Sauté vegetables in an oven-safe pan, pour over the whisked eggs and whites, add feta.', 'Bake 12–15 min at 190 °C / 375 °F. Serve with salad.'],
  'Vegetarian, gluten-free and lower in carbohydrate.', ['wl-dietfits']),
 ('wl-turkey-meatball-pasta', 'Turkey Meatballs & Whole-Wheat Pasta', ['lunch', 'dinner'], ['high-protein', 'meal-prep'], 1, 30,
  [('turkey93', 110, '110 g lean turkey, rolled into meatballs'), ('wwpasta', 150, '1¼ cups cooked whole-wheat pasta'), ('marinara', 125, '½ cup marinara'), ('spinach', 30, '1 cup spinach'), ('parm', 5, '1 tbsp parmesan')],
  ['Bake meatballs 15 min at 200 °C / 400 °F.', 'Simmer in marinara with spinach; serve over pasta with parmesan.'],
  'A comfort meal kept lean, with whole-grain pasta for fibre.', ['wl-fiber']),
 ('wl-tempeh-bulgur-bowl', 'Tempeh Tahini Bulgur Bowl', ['lunch', 'dinner'], ['vegan', 'high-protein', 'high-fibre'], 1, 20,
  [('tempeh', 100, '100 g tempeh'), ('bulgur', 150, '¾ cup cooked bulgur'), ('kale', 40, '2 cups kale'), ('carrot', 50, '1 small carrot, grated'), ('tahini', 10, '2 tsp tahini'), ('lemon', 10, 'squeeze of lemon')],
  ['Pan-fry sliced tempeh until golden.', 'Massage kale with lemon; assemble with bulgur and carrot, drizzle tahini.'],
  'Fermented soy protein plus whole-grain bulgur.', ['wl-turner']),
 ('wl-chickpea-pita', 'Hummus & Chickpea Pita', ['lunch'], ['vegan', 'mediterranean', 'quick', 'budget'], 1, 5,
  [('wwpita', 64, '1 large whole-wheat pita'), ('hummus', 30, '2 tbsp hummus'), ('chickpeas', 80, '½ cup chickpeas'), ('cucumber', 60, '⅓ cucumber'), ('tomraw', 60, '6 cherry tomatoes'), ('romaine', 30, 'handful of romaine')],
  ['Spread hummus inside the pita, fill with chickpeas and vegetables.'],
  'Legumes and whole grains — a quick plant-based lunch.', ['wl-huang']),
 ('wl-shrimp-zoodles', 'Shrimp Marinara Zoodles', ['lunch', 'dinner'], ['lower-carb', 'high-protein', 'quick'], 1, 15,
  [('shrimp', 150, '150 g cooked shrimp'), ('zucchini', 250, '2 zucchini, spiralized'), ('marinara', 125, '½ cup marinara'), ('garlic', 5, '1 clove garlic'), ('oliveoil', 7, '1½ tsp olive oil'), ('parm', 5, '1 tbsp parmesan')],
  ['Sauté garlic in the oil, add zucchini noodles for 2–3 min.', 'Add marinara and shrimp until hot; top with parmesan.'],
  'Swapping pasta for zucchini cuts calories and carbohydrate while keeping the volume.', ['wl-dietfits']),
 ('wl-beef-cauli-rice', 'Beef Burrito Bowl with Cauliflower Rice', ['lunch', 'dinner'], ['lower-carb', 'high-protein'], 1, 20,
  [('beef90', 110, '110 g 90% lean ground beef (cooked)'), ('cauli', 200, '2 cups riced cauliflower'), ('pepper', 60, '⅓ bell pepper'), ('onion', 40, '¼ onion'), ('oliveoil', 5, '1 tsp oil'), ('salsa', 60, '¼ cup salsa')],
  ['Brown beef with onion, pepper and taco spices.', 'Stir-fry cauliflower rice 5 min in the oil; top with beef and salsa.'],
  'A lower-carb take on a burrito bowl.', ['wl-dietfits']),
 ('wl-salmon-quinoa-asparagus', 'Salmon, Quinoa & Asparagus', ['lunch', 'dinner'], ['mediterranean', 'omega-3'], 1, 20,
  [('salmon', 110, '110 g salmon fillet'), ('quinoa', 120, '⅔ cup cooked quinoa'), ('asparagus', 120, '8 asparagus spears'), ('oliveoil', 3, '½ tsp olive oil'), ('lemon', 10, 'squeeze of lemon')],
  ['Roast salmon and asparagus 12 min at 200 °C / 400 °F with the oil.', 'Serve on quinoa with lemon.'],
  'Gluten-free, with omega-3 fats from salmon.', ['wl-shai']),
 ('wl-lentil-bolognese', 'Lentil Mushroom Bolognese', ['lunch', 'dinner'], ['vegan', 'budget', 'high-fibre', 'meal-prep'], 1, 25,
  [('lentils', 150, '¾ cup cooked lentils'), ('wwpasta', 140, '1 cup cooked whole-wheat pasta'), ('marinara', 150, '⅔ cup marinara'), ('mushroom', 70, '1 cup chopped mushrooms'), ('oliveoil', 5, '1 tsp olive oil')],
  ['Brown mushrooms in the oil, add lentils and marinara; simmer 10 min.', 'Serve over pasta.'],
  'Lentils replace minced meat: more fibre, less fat, lower cost.', ['wl-huang', 'wl-fiber']),
 ('wl-black-bean-tacos', 'Black Bean Corn Tacos', ['lunch', 'dinner'], ['vegan', 'budget', 'quick'], 1, 12,
  [('corntort', 52, '2 corn tortillas'), ('blackbeans', 130, '½ cup black beans'), ('cabbage', 50, '½ cup shredded cabbage'), ('salsa', 50, '3 tbsp salsa'), ('avocado', 30, '¼ avocado'), ('lime', 10, 'squeeze of lime')],
  ['Warm the tortillas and beans; fill with cabbage, salsa, avocado and lime.'],
  'Gluten-free (corn tortillas) and plant-based.', ['wl-huang']),
 ('wl-chicken-traybake', 'Chicken & Veg Traybake', ['lunch', 'dinner'], ['high-protein', 'budget', 'meal-prep'], 1, 35,
  [('chicken', 130, '130 g chicken breast'), ('potato', 200, '1 medium potato'), ('carrot', 80, '1 large carrot'), ('broccoli', 100, '1 cup broccoli'), ('oliveoil', 7, '1½ tsp olive oil')],
  ['Toss potato and carrot chunks in the oil, roast 15 min at 220 °C / 425 °F.', 'Add chicken and broccoli, roast 18–20 min more.'],
  'One tray, simple ingredients, easy to batch for the week.', ['wl-wycherley']),
 ('wl-seitan-stir-fry', 'Seitan Pepper Stir-Fry', ['lunch', 'dinner'], ['vegan', 'high-protein'], 1, 25,
  [('vwg', 50, '50 g vital wheat gluten (made into seitan)'), ('broth', 60, '¼ cup vegetable broth'), ('soy', 16, '1 tbsp soy sauce'), ('pepper', 100, '⅔ bell pepper'), ('broccoli', 100, '1 cup broccoli'), ('rice', 120, '⅔ cup cooked rice'), ('oliveoil', 5, '1 tsp oil')],
  ['Knead vital wheat gluten with broth and half the soy sauce; simmer the pieces in salted water 15 min (or buy ready seitan).', 'Stir-fry with the vegetables and the rest of the soy sauce; serve over rice.'],
  'Seitan is wheat protein — one of the most protein-dense vegan foods (not for gluten-free diets).', ['wl-turner']),
 ('wl-lentil-shakshuka', 'Lentil Shakshuka', ['breakfast', 'lunch', 'dinner'], ['vegetarian', 'high-protein', 'high-fibre', 'budget'], 1, 25,
  [('egg', 100, '2 eggs'), ('eggwhite', 99, '3 egg whites'), ('lentils', 100, '½ cup cooked lentils'), ('tomato', 200, '¾ cup crushed tomatoes'), ('onion', 50, '½ small onion'), ('pepper', 60, '⅓ bell pepper'), ('oliveoil', 5, '1 tsp olive oil')],
  ['Soften onion and pepper in the oil; add tomatoes, lentils, cumin and paprika and simmer 8 min.', 'Make wells, add eggs and whites, cover and cook 6–8 min.'],
  'Eggs plus lentils: protein and fibre without dairy or gluten.', ['wl-fiber', 'wl-wycherley']),
 # ---------- snacks ----------
 ('wl-apple-pb', 'Apple & Peanut Butter', ['snack'], ['vegan', 'quick', 'budget'], 1, 2,
  [('apple', 180, '1 medium apple'), ('pb', 16, '1 tbsp peanut butter')], ['Slice the apple and dip.'], 'Fibre plus a little fat and protein.', ['wl-fiber']),
 ('wl-hummus-veg', 'Hummus & Crunchy Veg', ['snack'], ['vegan', 'quick'], 1, 5,
  [('hummus', 45, '3 tbsp hummus'), ('carrot', 80, '1 carrot, sticks'), ('cucumber', 80, '½ cucumber'), ('pepper', 60, '⅓ bell pepper')], ['Cut vegetables into sticks and dip.'], 'High-volume, low-energy-density snack.', ['wl-fiber']),
 ('wl-edamame', 'Salted Edamame', ['snack'], ['vegan', 'high-protein', 'quick'], 1, 5,
  [('edamame', 155, '1 cup shelled edamame'), ('salt', 0.5, 'pinch of salt')], ['Microwave frozen edamame 3–4 min, salt lightly.'], 'About 18 g plant protein per cup.', ['wl-turner']),
 ('wl-eggs-orange', 'Hard-Boiled Eggs & Orange', ['snack'], ['vegetarian', 'quick', 'budget'], 1, 2,
  [('hardegg', 100, '2 hard-boiled eggs'), ('orange', 140, '1 orange')], ['Boil a batch on Sunday; peel and go.'], 'Portable protein and fruit.', ['wl-wycherley']),
 ('wl-yogurt-cup', 'Greek Yogurt Cup', ['snack'], ['vegetarian', 'high-protein', 'quick'], 1, 1,
  [('greek', 170, '1 container nonfat Greek yogurt'), ('frozblue', 75, '½ cup berries'), ('honey', 7, '1 tsp honey')], ['Top yogurt with berries and honey.'], '~18 g protein for under 150 kcal.', ['wl-wycherley']),
 ('wl-popcorn-seeds', 'Popcorn & Pumpkin Seeds', ['snack'], ['vegan', 'budget', 'high-fibre'], 1, 5,
  [('popcorn', 24, '3 cups air-popped popcorn'), ('pumpseed', 15, '1 tbsp pumpkin seeds')], ['Air-pop the corn, toss with seeds and a pinch of salt.'], 'Whole-grain, high-volume and free of the common allergens.', ['wl-fiber']),
 ('wl-mozz-grapes', 'Mozzarella Stick & Grapes', ['snack'], ['vegetarian', 'quick'], 1, 1,
  [('mozz', 28, '1 part-skim mozzarella stick'), ('grapes', 120, '¾ cup grapes')], ['Pack together.'], 'Protein plus fruit, no prep.', ['wl-wycherley']),
 ('wl-whey-shake', 'Whey Protein Shake', ['snack'], ['high-protein', 'quick'], 1, 2,
  [('whey', 30, '1 scoop whey protein'), ('water', 300, '1¼ cups water'), ('banana', 60, '½ banana')], ['Shake or blend with ice.'], 'A convenient 25 g protein top-up when meals fall short.', ['issn-protein']),
 ('wl-roasted-chickpeas', 'Crispy Roasted Chickpeas', ['snack'], ['vegan', 'budget', 'meal-prep'], 1, 30,
  [('chickpeas', 100, '½ cup chickpeas'), ('oliveoil', 3, '½ tsp olive oil'), ('curry', 1, 'pinch of curry powder or paprika')], ['Pat dry, toss with oil and spice, roast 25 min at 200 °C / 400 °F.'], 'Crunchy legume snack with fibre and plant protein.', ['wl-fiber']),
]

# Planner fields for the existing recipes (recipes.json). Endurance fuel and electrolyte drinks are kept out of the plan (they're for during training).
OLD_SLOTS = {
  'pre-oats': ['breakfast'], 'pre-toast': ['breakfast', 'snack'], 'pre-ricecakes': ['snack'], 'pre-bagel': ['breakfast'],
  'post-chicken-bowl': ['lunch', 'dinner'], 'post-salmon': ['lunch', 'dinner'], 'post-tuna-pasta': ['lunch', 'dinner'], 'post-eggs': ['breakfast'],
  'post-burrito': ['lunch', 'dinner'], 'budget-beans-rice': ['lunch', 'dinner'], 'budget-lentil-curry': ['lunch', 'dinner'], 'budget-fried-rice': ['lunch', 'dinner'],
  'budget-potato-eggs': ['breakfast', 'lunch'], 'protein-yogurt': ['breakfast', 'snack'], 'protein-cottage': ['snack'], 'protein-overnight-oats': ['breakfast'],
  'protein-tofu-scramble': ['breakfast'], 'drink-recovery-shake': ['snack'], 'drink-choc-milk': ['snack'],
}

def contains(ings):
    s = set()
    for fid in ings: s |= F.get(fid, set())
    return s

def plan_fields(tags, per, fids, minutes):
    c = contains(fids)
    carb_share = per['carbs'] * 4 / max(1, per['kcal'])
    return dict(
        contains=sorted(c),
        lowcarb=carb_share <= 0.30,
        med='mediterranean' in tags,
        budget='budget' in tags,
        mealPrep='meal-prep' in tags,
        minutes=minutes,
        carbShare=round(carb_share, 2),
    )

out = []
for (rid, name, slots, tags, serves, mins, ings, steps, why, src) in R:
    tot = dict(kcal=0, protein=0, carbs=0, fat=0, fiber=0, sodium=0)
    rows = []
    for key, g, label in ings:
        fid = I[key]; f = D[fid]; m = g / 100
        tot['kcal'] += f[2]*m; tot['protein'] += f[3]*m; tot['carbs'] += f[4]*m; tot['fat'] += f[5]*m; tot['fiber'] += f[6]*m; tot['sodium'] += f[8]*m
        rows.append({'label': label, 'grams': g, 'fdcId': fid, 'usda': f[0]})
    per = {k: round(v / serves, 1) if k not in ('kcal', 'sodium') else round(v / serves) for k, v in tot.items()}
    rec = dict(id=rid, name=name, cat='plan', tags=tags, serves=serves, minutes=mins, ingredients=rows, steps=steps, why=why, sources=src, perServing=per)
    rec['plan'] = dict(slots=slots, **plan_fields(tags, per, [r['fdcId'] for r in rows], mins))
    out.append(rec)

meta = {}
for r in OLD:
    if r['id'] not in OLD_SLOTS: continue
    meta[r['id']] = dict(slots=OLD_SLOTS[r['id']], **plan_fields(r['tags'], r['perServing'], [i['fdcId'] for i in r['ingredients']], r['minutes']))
    # existing recipes don't carry a 'mediterranean' tag; mark the ones that fit the pattern
    if r['id'] in ('post-salmon', 'budget-lentil-curry', 'post-tuna-pasta'): meta[r['id']]['med'] = True

# Sides: (id, label, key, grams per portion, role)
S = [
  ('side-greek', 'Greek yogurt, nonfat', 'greek', 170, 'protein'), ('side-cottage', 'Cottage cheese, 2%', 'cottage', 113, 'protein'),
  ('side-eggwhite', 'Egg whites', 'eggwhite', 99, 'protein'), ('side-whey', 'Whey protein (in water)', 'whey', 30, 'protein'),
  ('side-tofu', 'Firm tofu', 'tofu', 100, 'protein'), ('side-edamame', 'Edamame', 'edamame', 80, 'protein'),
  ('side-chicken', 'Chicken breast, cooked', 'chicken', 85, 'protein'), ('side-tuna', 'Tuna, canned in water', 'tuna', 85, 'protein'),
  ('side-lentils', 'Lentils, cooked', 'lentils', 100, 'protein'), ('side-hemp', 'Hemp seeds', 'hemp', 20, 'protein'),
  ('side-soyprot', 'Soy protein powder (in water)', 'soyprot', 30, 'protein'),
  ('side-apple', 'Apple', 'apple', 180, 'carb'), ('side-banana', 'Banana', 'banana', 118, 'carb'), ('side-berries', 'Blueberries', 'frozblue', 100, 'carb'),
  ('side-rice', 'Rice, cooked', 'rice', 100, 'carb'), ('side-potato', 'Baked potato', 'bakedpot', 150, 'carb'), ('side-orange', 'Orange', 'orange', 140, 'carb'),
  ('side-avocado', 'Avocado', 'avocado', 50, 'fat'), ('side-oil', 'Olive oil drizzle', 'oliveoil', 5, 'fat'), ('side-almonds', 'Almonds', 'almonds', 14, 'fat'),
  ('side-pumpseed', 'Pumpkin seeds', 'pumpseed', 15, 'fat'),
]
sides = []
for sid, label, key, g, role in S:
    f = D[I[key]]; m = g / 100
    sides.append(dict(id=sid, label=label, grams=g, fdcId=I[key], usda=f[0], role=role, contains=sorted(F.get(I[key], set())),
      per=dict(kcal=round(f[2]*m), protein=round(f[3]*m, 1), carbs=round(f[4]*m, 1), fat=round(f[5]*m, 1), fiber=round(f[6]*m, 1))))

# Grocery aisles by fdcId (for the shopping list)
AISLE = {}
def aisle(name, *keys):
    for k in keys: AISLE[I[k]] = name
aisle('Produce', 'banana', 'blueberry', 'strawberry', 'spinach', 'broccoli', 'avocado', 'onion', 'lemon', 'lime', 'pepper', 'garlic', 'cucumber', 'tomraw', 'zucchini', 'carrot', 'apple', 'orange', 'pear', 'grapes', 'romaine', 'mushroom', 'cauli', 'kale', 'cabbage', 'asparagus', 'potato', 'bakedpot', 'sweetpot', 'greenbeans')
aisle('Meat & fish', 'chicken', 'turkey93', 'beef90', 'tuna', 'salmon', 'cod', 'lox', 'shrimp')
aisle('Dairy & eggs', 'greek', 'milk1', 'cottage', 'cheddar', 'feta', 'mozz', 'parm', 'egg', 'eggwhite', 'hardegg')
aisle('Plant protein', 'tofu', 'tempeh', 'edamame', 'soymilk')
aisle('Grains & bread', 'oats', 'wwbread', 'rice', 'brownrice', 'pasta', 'wwpasta', 'quinoa', 'couscous', 'bulgur', 'wwpita', 'tortilla', 'corntort', 'popcorn')
aisle('Cans & jars', 'blackbeans', 'kidney', 'whitebeans', 'chickpeas', 'lentils', 'tomato', 'marinara', 'salsa', 'olives', 'broth', 'hummus', 'tahini', 'soy')
aisle('Frozen', 'frozblue', 'mixveg', 'corn')
aisle('Other', 'water')
aisle('Nuts, seeds & pantry', 'vwg', 'soyprot', 'pb', 'almonds', 'walnuts', 'peanuts', 'chia', 'pumpseed', 'hemp', 'oliveoil', 'honey', 'maple', 'cinnamon', 'curry', 'salt', 'whey')

# Friendly shopping-list names (and grams per piece, for items bought by count)
EXTRA = dict(wbread=174924, pineapple=169124, pretzels=167555, bagel=174899, jam=169641, sugar=169655, raisins=168164, tartcherry=167807,
  oj=169099, coconut=174831, chocmilk=170881, ricecake=169679, dates=168191, turkeyc=171506, strawberry=167762)
N = dict(oats='Rolled oats', banana='Bananas', honey='Honey', pb='Peanut butter', wwbread='Whole-wheat bread', rice='White rice (cooked weight)', brownrice='Brown rice (cooked weight)',
  chicken='Chicken breast (cooked weight)', greek='Nonfat Greek yogurt', milk1='1% milk', egg='Eggs', eggwhite='Egg whites', hardegg='Eggs (to hard-boil)', blackbeans='Black beans, canned', lentils='Lentils (cooked weight)',
  tuna='Tuna, canned in water', salmon='Salmon fillet', potato='Potatoes', bakedpot='Potatoes', sweetpot='Sweet potatoes', pasta='Pasta (cooked weight)', wwpasta='Whole-wheat pasta (cooked weight)', cottage='Cottage cheese, 2%',
  blueberry='Blueberries', frozblue='Frozen blueberries', strawberry='Strawberries', spinach='Spinach', broccoli='Broccoli', oliveoil='Olive oil', salt='Salt',
  avocado='Avocados', tortilla='Flour tortillas', corntort='Corn tortillas', cheddar='Cheddar', feta='Feta', mozz='Mozzarella sticks', parm='Parmesan', turkey93='93% lean ground turkey (cooked weight)',
  beef90='90% lean ground beef (cooked weight)', onion='Onions', tomato='Crushed tomatoes, canned', tomraw='Cherry tomatoes', curry='Curry powder / paprika', soy='Soy sauce', mixveg='Frozen mixed vegetables', lemon='Lemons (juice)', lime='Limes (juice)',
  chia='Chia seeds', almonds='Almonds', walnuts='Walnuts', peanuts='Peanuts', tofu='Firm tofu', tempeh='Tempeh', edamame='Frozen shelled edamame', soymilk='Soy milk',
  quinoa='Quinoa (cooked weight)', couscous='Couscous (cooked weight)', bulgur='Bulgur (cooked weight)', wwpita='Whole-wheat pitas', pepper='Bell peppers', salsa='Salsa', cinnamon='Cinnamon', garlic='Garlic',
  chickpeas='Chickpeas, canned', kidney='Kidney beans, canned', whitebeans='White beans, canned', shrimp='Shrimp, cooked', cod='Cod fillet', lox='Smoked salmon', greenbeans='Green beans', zucchini='Zucchini',
  carrot='Carrots', hummus='Hummus', apple='Apples', orange='Oranges', pear='Pears', grapes='Grapes', pumpseed='Pumpkin seeds', hemp='Hemp seeds',
  marinara='Marinara sauce', romaine='Romaine lettuce', mushroom='Mushrooms', cauli='Cauliflower (or riced)', kale='Kale', olives='Olives', corn='Frozen corn', cabbage='Cabbage',
  tahini='Tahini', vwg='Vital wheat gluten', soyprot='Soy protein powder', asparagus='Asparagus', broth='Vegetable broth', popcorn='Popcorn kernels', maple='Maple syrup', whey='Whey protein powder', water='Water', cucumber='Cucumbers',
  wbread='White bread', pineapple='Pineapple', pretzels='Pretzels', bagel='Bagels', jam='Jam', sugar='Sugar', raisins='Raisins', tartcherry='Tart cherry juice', oj='Orange juice',
  coconut='Coconut water', chocmilk='Low-fat chocolate milk', ricecake='Rice cakes', dates='Medjool dates', turkeyc='Ground turkey (cooked weight)')
PIECE = dict(egg=50, hardegg=50, banana=118, apple=180, orange=140, pear=140, avocado=150, wwpita=64, bagel=105, lemon=48, lime=44, pepper=150, onion=110, cucumber=300, sweetpot=150, bakedpot=200, potato=200, zucchini=200, carrot=60, mozz=28)
ALL = {**I, **EXTRA}
for k, v in EXTRA.items(): assert v in D, (k, v)
names = {str(ALL[k]): v for k, v in N.items()}
pieces = {str(ALL[k]): v for k, v in PIECE.items()}
for k in ('wbread', 'pineapple', 'pretzels', 'bagel', 'jam', 'sugar', 'raisins', 'tartcherry', 'oj', 'coconut', 'chocmilk', 'ricecake', 'dates', 'turkeyc', 'strawberry'):
    AISLE.setdefault(ALL[k], 'Produce' if k in ('pineapple', 'strawberry') else 'Dairy & eggs' if k == 'chocmilk' else 'Meat & fish' if k == 'turkeyc' else 'Nuts, seeds & pantry')
AISLE[174924] = AISLE[174899] = 'Grains & bread'
missing = [i['fdcId'] for r in OLD + out for i in r['ingredients'] if str(i['fdcId']) not in names]
assert not missing, missing

json.dump(dict(source='USDA FoodData Central SR Legacy (April 2018), per 100 g; computed by tools/build_plan_foods.py', recipes=out, meta=meta, sides=sides, aisles={str(k): v for k, v in AISLE.items()}, names=names, pieces=pieces),
  open('src/data/plan-foods.json', 'w'), indent=1, ensure_ascii=False)
for r in out: print(f"{r['id']:30s} {r['perServing']['kcal']:4d} kcal P{r['perServing']['protein']:5.1f} C{r['perServing']['carbs']:5.1f} F{r['perServing']['fat']:5.1f} fib{r['perServing']['fiber']:4.1f} {r['plan']['contains']} lowcarb={r['plan']['lowcarb']}")
print('meta', len(meta), 'sides', len(sides))
for k, v in meta.items(): print(' ', k, v['contains'], v['lowcarb'])
