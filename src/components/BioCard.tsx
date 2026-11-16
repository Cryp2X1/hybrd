import { useEffect, useRef, useState } from 'react';
import { Card } from './ui';
import { Icon } from './Icon';
import { useStore } from '../lib/store';
import { useToast } from '../lib/toast';
import { BIO_MAX, normalizeBio, bioParts, isSafeUrl, collapseBio } from '../lib/bio';

function BioView({ text }: { text: string }) {
  return (
    <p className="bio-text" data-testid="bio-text">
      {bioParts(text).map((p, i) => (
        p.t === 'url' && isSafeUrl(p.v)
          ? <a key={i} href={p.v} target="_blank" rel="noopener noreferrer nofollow">{p.v}</a>
          : <span key={i}>{p.v}</span>
      ))}
    </p>
  );
}

/** Me: free-form bio under the profile header. Private to the user — there is no public profile. */
export function BioCard() {
  const { profile, setProfile } = useStore();
  const toast = useToast();
  const saved = normalizeBio(profile.bio);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [expanded, setExpanded] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) area.current?.focus(); }, [editing]);

  const startEdit = () => { setDraft(saved); setEditing(true); setExpanded(false); };
  const cancel = () => { setDraft(saved); setEditing(false); };
  const save = () => {
    const next = normalizeBio(draft);
    setProfile({ bio: next });
    setEditing(false);
    toast(next ? 'Bio saved' : 'Bio cleared');
  };

  const { preview, collapsed } = collapseBio(saved);
  const shown = !expanded && collapsed ? preview : saved;

  return (
    <Card className="bio-card" data-testid="bio-card">
      <div className="card-head">
        <h3>Bio</h3>
        {!editing && (
          <button className="link" onClick={startEdit} data-testid="bio-edit">
            {saved ? 'Edit' : 'Write'}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            ref={area}
            data-testid="bio-input"
            value={draft}
            maxLength={BIO_MAX}
            rows={6}
            placeholder="Tell your story: goals, sports, why you train..."
            aria-label="Bio"
            onChange={(e) => setDraft(e.target.value.slice(0, BIO_MAX))}
          />
          <div className="bio-meta">
            <span className={`muted small${draft.length >= BIO_MAX ? ' bio-max' : ''}`} data-testid="bio-count">
              {draft.length} / {BIO_MAX}
            </span>
          </div>
          <div className="row">
            <button className="btn ghost" type="button" onClick={cancel} data-testid="bio-cancel">Cancel</button>
            <button className="btn y" type="button" style={{ flex: 1 }} onClick={save} data-testid="bio-save">
              <Icon name="check" size={18} />Save
            </button>
          </div>
        </>
      ) : saved ? (
        <>
          <BioView text={shown} />
          {collapsed && (
            <button className="link bio-more" type="button" onClick={() => setExpanded((v) => !v)} data-testid="bio-more">
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
          <p className="muted small bio-privacy">Only you can see this.</p>
        </>
      ) : (
        <>
          <button className="bio-empty" type="button" onClick={startEdit} data-testid="bio-empty">
            Tell your story: goals, sports, why you train...
          </button>
          <p className="muted small bio-privacy">Only you can see this.</p>
        </>
      )}
    </Card>
  );
}
