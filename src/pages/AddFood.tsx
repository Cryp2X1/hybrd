import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadUsda, searchUsda, searchOff, lookupBarcode, macrosFor, type FoodItem } from '../lib/foods';
import { useStore, uid } from '../lib/store';
import { todayKey } from '../lib/calc';
import { Page, Card, Segmented, Sheet, Banner, Pill } from '../components/ui';
import { Icon } from '../components/Icon';
import type { FoodEntry } from '../lib/types';
import { useToast } from '../lib/toast';

const MEALS: FoodEntry['meal'][] = ['breakfast', 'lunch', 'dinner', 'snacks'];
const guessMeal = (): FoodEntry['meal'] => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snacks'; };
const POPULAR = ['banana', 'egg whole', 'chicken breast roasted', 'rice white cooked', 'oats', 'greek yogurt', 'peanut butter', 'milk 1%', 'salmon', 'avocado', 'sweet potato', 'black beans'];

declare global { interface Window { BarcodeDetector?: new (o?: { formats: string[] }) => { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> } } }

export default function AddFood() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data, upsert } = useStore();
  const date = sp.get('date') || todayKey();
  const [meal, setMeal] = useState<FoodEntry['meal']>((sp.get('meal') as FoodEntry['meal']) || guessMeal());
  const [mode, setMode] = useState<'search' | 'online' | 'barcode' | 'quick'>('search');
  const [q, setQ] = useState('');
  const [all, setAll] = useState<FoodItem[] | null>(null);
  const [err, setErr] = useState('');
  const [online, setOnline] = useState<FoodItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<FoodItem | null>(null);
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState<'portion' | 'g'>('portion');
  const [grams, setGrams] = useState(100);
  const [code, setCode] = useState('');
  const [quick, setQuick] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => { loadUsda().then(setAll).catch(() => setErr('Could not load the food database. Check your connection once, then it works offline.')); }, []);
  const results = useMemo(() => (all && q.trim().length >= 2 ? searchUsda(all, q) : []), [all, q]);
  const recent = useMemo(() => { const seen = new Set<string>(); return [...data.foods].sort((a, b) => b.updatedAt - a.updatedAt).filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true))).slice(0, 8); }, [data.foods]);

  const open = (f: FoodItem) => { setPick(f); setQty(1); setUnit(f.portion ? 'portion' : 'g'); setGrams(f.portion?.grams || 100); };
  const g = pick ? (unit === 'portion' && pick.portion ? pick.portion.grams * qty : grams) : 0;
  const m = pick ? macrosFor(pick, g) : null;
  const add = () => {
    if (!pick || !m) return;
    upsert<FoodEntry>('foods', { id: uid(), date, meal, name: pick.brand ? `${pick.name} (${pick.brand})` : pick.name, grams: g, ...m, source: pick.source, ref: pick.key });
    toast(`Added ${m.kcal} kcal to ${meal}`); setPick(null);
  };
  const relog = (f: FoodEntry) => { upsert<FoodEntry>('foods', { ...f, id: uid(), date, meal }); toast(`Added ${Math.round(f.kcal)} kcal to ${meal}`); };
  const doOnline = async () => {
    if (!q.trim()) return; setBusy(true); setErr('');
    try { setOnline(await searchOff(q)); } catch { setErr('Open Food Facts is unreachable right now (offline?). The USDA list still works offline.'); }
    setBusy(false);
  };
  const doCode = async (c = code) => {
    if (!c.trim()) return; setBusy(true); setErr('');
    try { const f = await lookupBarcode(c.trim()); if (f) open(f); else setErr(`No product found for ${c}. Try search or Quick add.`); } catch { setErr('Lookup failed — are you online?'); }
    setBusy(false);
  };
  const scan = async () => {
    setErr('');
    if (!window.BarcodeDetector) { setErr('This browser can’t scan barcodes (iPhone Safari doesn’t support it yet). Type the number under the barcode instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setScanning(true);
      const v = videoRef.current!; v.srcObject = stream; await v.play();
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      let stop = false;
      const loop = async () => {
        if (stop) return;
        try { const r = await det.detect(v); if (r[0]?.rawValue) { stop = true; stream.getTracks().forEach((t) => t.stop()); setScanning(false); setCode(r[0].rawValue); doCode(r[0].rawValue); return; } } catch { /* frame not ready */ }
        requestAnimationFrame(loop);
      };
      loop();
      window.setTimeout(() => { if (!stop) { stop = true; stream.getTracks().forEach((t) => t.stop()); setScanning(false); } }, 20000);
    } catch { setErr('Camera permission denied or unavailable.'); setScanning(false); }
  };
  const addQuick = () => {
    const k = parseFloat(quick.kcal); if (!quick.name || !Number.isFinite(k)) { setErr('Add a name and calories.'); return; }
    upsert<FoodEntry>('foods', { id: uid(), date, meal, name: quick.name, servings: 1, kcal: k, protein: +quick.protein || 0, carbs: +quick.carbs || 0, fat: +quick.fat || 0, source: 'custom' });
    toast('Added'); setQuick({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  };

  const FoodList = ({ items }: { items: FoodItem[] }) => <>{items.map((f) => <button key={f.key} className="food-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => open(f)}><div className="fr-main"><div className="fr-name">{f.name}</div><div className="fr-sub">{f.brand ? `${f.brand} · ` : ''}{f.portion ? `${f.portion.label} (${Math.round(f.portion.grams)} g) · ` : ''}per 100 g: P {f.per100.protein} · C {f.per100.carbs} · F {f.per100.fat}</div></div><span className="fr-k">{f.per100.kcal}<small className="muted">/100g</small></span></button>)}</>;

  return (
    <Page title="Add food" kicker={`${date === todayKey() ? 'Today' : date}`} back={`/fuel?date=${date}`}>
      <div className="chips" style={{ marginBottom: 12 }}>{MEALS.map((x) => <button key={x} className={`chip ${meal === x ? 'on' : ''}`} onClick={() => setMeal(x)} style={{ textTransform: 'capitalize' }}>{x}</button>)}</div>
      <Segmented value={mode} onChange={setMode} options={[{ v: 'search', label: 'USDA (offline)' }, { v: 'online', label: 'Products' }, { v: 'barcode', label: 'Barcode' }, { v: 'quick', label: 'Quick add' }]} />
      {err && <Banner tone="warn">{err}</Banner>}

      {(mode === 'search' || mode === 'online') && <div className="search field"><Icon name="search" size={18} /><input autoFocus placeholder={mode === 'search' ? 'Search 7,283 foods — e.g. “banana”, “chicken breast”' : 'Search packaged products (Open Food Facts)'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && mode === 'online' && doOnline()} /></div>}

      {mode === 'search' && <>
        {!all && !err && <p className="muted">Loading food database…</p>}
        {q.trim().length < 2 ? <>
          {recent.length > 0 && <Card><div className="card-head"><h3>Recent</h3></div>{recent.map((f) => <div key={f.id} className="food-row"><div className="fr-main"><div className="fr-name">{f.name}</div><div className="fr-sub">{f.grams ? `${Math.round(f.grams)} g` : '1 serving'} · P {Math.round(f.protein)}</div></div><span className="fr-k">{Math.round(f.kcal)}</span><button className="btn sm" onClick={() => relog(f)}>Add</button></div>)}</Card>}
          <Card><div className="card-head"><h3>Popular</h3></div><div className="chips">{POPULAR.map((p) => <button key={p} className="chip" onClick={() => setQ(p)}>{p}</button>)}</div></Card>
        </> : <Card>{results.length ? <FoodList items={results} /> : <p className="muted">No match. Try fewer words, or search Products.</p>}</Card>}
        <p className="muted small">Source: USDA FoodData Central (SR Legacy), public domain. Values are averages per 100 g.</p>
      </>}

      {mode === 'online' && <>
        <button className="btn y block" onClick={doOnline} disabled={busy || !q.trim()} style={{ marginBottom: 12 }}>{busy ? 'Searching…' : 'Search Open Food Facts'}</button>
        {online.length > 0 && <Card><FoodList items={online} /></Card>}
        <p className="muted small">Data © Open Food Facts contributors (ODbL), crowd-sourced — double-check against the label. Needs an internet connection.</p>
      </>}

      {mode === 'barcode' && <Card>
        <button className="btn y block" onClick={scan} disabled={scanning}><Icon name="barcode" />{scanning ? 'Point at a barcode…' : 'Scan with camera'}</button>
        <video ref={videoRef} className="scan" playsInline muted hidden={!scanning} style={{ marginTop: 12 }} />
        <div className="row" style={{ marginTop: 12 }}><input className="input" inputMode="numeric" placeholder="Or type the barcode number" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doCode()} /><button className="btn" onClick={() => doCode()} disabled={busy}>Look up</button></div>
        <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>Looks the product up on Open Food Facts (free, no account). Camera scanning works in Chrome on Android; on iPhone type the number.</p>
      </Card>}

      {mode === 'quick' && <Card>
        <label className="field"><span>Name</span><input value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} placeholder="e.g. Burrito bowl" /></label>
        <div className="grid2">{(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <label key={k} className="field"><span>{k === 'kcal' ? 'Calories' : `${k} (g)`}</span><input inputMode="decimal" value={quick[k]} onChange={(e) => setQuick({ ...quick, [k]: e.target.value })} /></label>)}</div>
        <button className="btn y block" onClick={addQuick}>Add to {meal}</button>
      </Card>}

      <Sheet open={!!pick} onClose={() => setPick(null)} title="Add to log">
        {pick && m && <>
          <h3 style={{ textTransform: 'none', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 16 }}>{pick.name}</h3>
          <div className="row wrap" style={{ margin: '8px 0 14px' }}><Pill tone="yellow">{pick.source === 'usda' ? 'USDA' : 'Open Food Facts'}</Pill>{pick.category && <Pill>{pick.category}</Pill>}</div>
          {pick.portion && <Segmented small value={unit} onChange={setUnit} options={[{ v: 'portion', label: pick.portion.label }, { v: 'g', label: 'Grams' }]} />}
          {unit === 'portion' && pick.portion ? <div className="row"><button className="btn sm" onClick={() => setQty(Math.max(0.25, qty - 0.5))}>−</button><input className="input" style={{ width: 90, textAlign: 'center' }} inputMode="decimal" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} /><button className="btn sm" onClick={() => setQty(qty + 0.5)}>+</button><span className="muted">× {pick.portion.label} = {Math.round(g)} g</span></div>
            : <div className="row"><input className="input" style={{ width: 120 }} inputMode="decimal" value={grams} onChange={(e) => setGrams(parseFloat(e.target.value) || 0)} /><span className="muted">grams</span><span className="spacer" />{[50, 100, 150, 200].map((x) => <button key={x} className="btn sm" onClick={() => setGrams(x)}>{x}</button>)}</div>}
          <div className="grid4" style={{ margin: '16px 0' }}>
            <div className="stat accent"><div className="stat-v">{m.kcal}</div><div className="stat-l">kcal</div></div>
            <div className="stat"><div className="stat-v">{m.protein}</div><div className="stat-l">protein</div></div>
            <div className="stat"><div className="stat-v">{m.carbs}</div><div className="stat-l">carbs</div></div>
            <div className="stat"><div className="stat-v">{m.fat}</div><div className="stat-l">fat</div></div>
          </div>
          <button className="btn y block" onClick={add}>Add to {meal}</button>
        </>}
      </Sheet>
      <button className="btn block ghost" onClick={() => nav(`/fuel?date=${date}`)}>Done</button>
    </Page>
  );
}
