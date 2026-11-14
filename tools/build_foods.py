import csv, json, os, re
D=[d for d in os.listdir('usda') if d.startswith('FoodData')][0]; D='usda/'+D
EXCL={'3','24','26','27'}  # baby foods, AI/AN, branded, QC
cat={r['id']:r['description'] for r in csv.DictReader(open(D+'/food_category.csv'))}
foods={}
for r in csv.DictReader(open(D+'/food.csv')):
    if r['food_category_id'] in EXCL: continue
    foods[r['fdc_id']]={'id':int(r['fdc_id']),'n':r['description'],'c':cat.get(r['food_category_id'],'')}
NUT={'1008':'k','2047':'k2','1003':'p','1005':'cb','1004':'f','1079':'fi','2000':'s','1093':'na'}
for r in csv.DictReader(open(D+'/food_nutrient.csv')):
    f=foods.get(r['fdc_id']); k=NUT.get(r['nutrient_id'])
    if f is not None and k: f[k]=round(float(r['amount']),1)
units={r['id']:r['name'] for r in csv.DictReader(open(D+'/measure_unit.csv'))}
for r in csv.DictReader(open(D+'/food_portion.csv')):
    f=foods.get(r['fdc_id'])
    if f is None or 'u' in f: continue
    try: g=float(r['gram_weight'])
    except: continue
    unit=units.get(r['measure_unit_id'],'')
    unit='' if unit=='undetermined' else unit
    desc=' '.join(x for x in [r['amount'] if unit else (r['amount'] if r['amount'] not in('','1') else ''),unit,r['portion_description'],r['modifier']] if x and x!='undetermined').strip()
    desc=re.sub(r'\s+',' ',desc)
    if not desc: continue
    f['u']=desc[:40]; f['g']=round(g,1)
out=[]
for f in foods.values():
    if 'k' not in f:
        if 'k2' in f: f['k']=f['k2']
        else: continue
    f.pop('k2',None)
    row=[f['n'],f['c'],round(f['k']),f.get('p',0),f.get('cb',0),f.get('f',0),f.get('fi',0),f.get('s',0),round(f.get('na',0)),f.get('u',''),f.get('g',0),f['id']]
    out.append(row)
out.sort(key=lambda r:r[0])
json.dump({'source':'USDA FoodData Central, SR Legacy (April 2018). Public domain (CC0). https://fdc.nal.usda.gov/','fields':['name','category','kcal','protein','carbs','fat','fiber','sugar','sodium_mg','portion','portion_g','fdc_id'],'per':'100 g','foods':out},open('../public/data/foods-usda.json','w'),separators=(',',':'))
print(len(out))
