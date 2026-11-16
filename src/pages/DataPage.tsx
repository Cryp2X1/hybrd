import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useSample } from '../lib/useSample';
import { Page, Card, Banner } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../lib/toast';
import { COLLECTIONS } from '../lib/types';
import { useMedia } from '../lib/gallery';
import { Link } from 'react-router-dom';

export default function DataPage() {
  const media = useMedia();
  const st = useStore();
  const sample = useSample();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const counts = COLLECTIONS.map((c) => `${st.data[c].length} ${c}`).join(' · ');
  const exp = () => {
    const blob = new Blob([JSON.stringify(st.exportJson(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hybrd-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const imp = async (f: File) => {
    try { const n = st.importJson(JSON.parse(await f.text()), mode); toast(`Imported ${n} records`); } catch (e) { toast((e as Error).message); }
  };
  return (
    <Page title="Your data" kicker={counts} back="/me">
      <Card>
        <h3 style={{ marginBottom: 8 }}>Export</h3>
        <p className="muted small">Download everything (profile and bio, workouts, GPS routes, food log, water, steps, weight, templates) as one JSON file — a backup you own.</p>
        <button className="btn y" onClick={exp}><Icon name="download" size={18} />Export JSON</button>
        <p className="muted small" style={{ marginTop: 10 }}>Photos and videos aren’t inside the JSON file (only their dates, tags and captions). To keep the files, use <Link className="link" to="/me/gallery">Gallery › Download all</Link>.</p>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Import</h3>
        <div className="chips" style={{ marginBottom: 12 }}><button className={`chip ${mode === 'merge' ? 'on' : ''}`} onClick={() => setMode('merge')}>Merge with current</button><button className={`chip ${mode === 'replace' ? 'on' : ''}`} onClick={() => setMode('replace')}>Replace everything</button></div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && imp(e.target.files[0])} />
        <button className="btn" onClick={() => file.current?.click()}><Icon name="upload" size={18} />Choose a HYBRD export…</button>
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Sample data</h3>
        <p className="muted small">Four weeks of demo workouts, GPS routes, a HYROX sim and meals so you can see every screen filled in. Every sample item is tagged and removable.</p>
        {sample.has ? <button className="btn" onClick={() => { sample.clear(); toast('Sample data removed'); }}>Remove sample data</button> : <button className="btn" onClick={() => { sample.load().then(() => toast('Sample data added')); }}>Load sample data</button>}
      </Card>
      <Card>
        <h3 style={{ marginBottom: 8 }}>Delete everything</h3>
        <p className="muted small">Removes all logs, photos and your bio from this device{st.ns !== 'local' ? ' and your account' : ''}. Export first if you want a copy.</p>
        <button className="btn danger" onClick={() => { if (confirm('Delete ALL your HYBRD data? This cannot be undone.')) { media.deletePhotos(media.items.map((i) => i.id)); media.removeAvatar(); st.wipe(); toast('All data deleted'); } }}>Delete all data</button>
      </Card>
      <Banner>On iPhone, Safari may clear a website’s storage if you don’t open it for 7 days. Adding HYBRD to the Home Screen avoids that — and an account (when enabled) keeps a copy in the cloud.</Banner>
    </Page>
  );
}
