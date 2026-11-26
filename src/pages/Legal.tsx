// /legal hub and /legal/:doc pages. The documents are Markdown in src/legal/ (exported to /workspace/hybrd-legal/ by
// tools/export-legal.mjs); [[PLACEHOLDER]] tokens are filled from config.js and shown highlighted when missing.
// These pages also open without onboarding (public URLs for app stores and the MHMDA homepage link).
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page, Card, RowLink } from '../components/ui';
import { Markdown, LegalLinks, useLegal, DataConsentsCard } from '../components/Legal';
import { appUrl } from '../lib/config';
import { fillPlaceholders, isLegalDocId, LEGAL_DOCS, legalValues, minAge, type LegalDocId } from '../lib/legal';
import { toc, parse } from '../lib/markdown';
import { useStore } from '../lib/store';
import terms from '../legal/terms.md?raw';
import privacy from '../legal/privacy.md?raw';
import healthData from '../legal/health-data.md?raw';
import disclaimer from '../legal/disclaimer.md?raw';
import dmca from '../legal/dmca.md?raw';
import deleteAccount from '../legal/delete-account.md?raw';

export const LEGAL_MD: Record<LegalDocId, string> = { terms, privacy, 'health-data': healthData, disclaimer, dmca, 'delete-account': deleteAccount };
const values = () => legalValues(window.HYBRD_CONFIG, appUrl());
export const legalText = (id: LegalDocId) => fillPlaceholders(LEGAL_MD[id], values());

/** Brand bar for people who open a legal page before using the app. */
function Standalone({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg-standalone">
      <div className="lg-sa-bar"><Link to="/" className="brand"><span className="brand-mark">H</span>HYBRD</Link><div className="spacer" /><Link className="btn sm" to="/">Open HYBRD</Link></div>
      {children}
    </div>
  );
}

export function LegalHub() {
  const { profile } = useStore();
  const lg = useLegal();
  const v = values();
  const body = (
    <Page title="Legal & privacy" kicker="HYBRD" back={profile.onboarded ? true : undefined}>
      <div data-testid="legal-hub">
        <Card>
          <div className="card-head"><h3>Documents</h3></div>
          <div className="stack">{LEGAL_DOCS.map((d) => <RowLink key={d.id} to={`/legal/${d.id}`} icon={d.icon} title={d.title} sub={d.blurb} />)}</div>
        </Card>
        <Card>
          <div className="card-head"><h3>Community</h3></div>
          <div className="stack">
            <RowLink to="/safety/guidelines" icon="shield" title="Community Guidelines" sub="What’s allowed on HYBRD" />
            <RowLink to="/safety/reporting" icon="flag" title="How reporting works" sub="Reports, appeals, restrict and block" />
          </div>
        </Card>
        <Card>
          <div className="card-head"><h3>Contact & support</h3></div>
          <p className="muted small" style={{ margin: 0 }}>Support, privacy and deletion requests, copyright (DMCA) notices and all legal notices, including arbitration opt-outs, go by email to {v.CONTACT_EMAIL ? <a className="link" href={`mailto:${v.CONTACT_EMAIL}`} data-testid="legal-contact">{v.CONTACT_EMAIL}</a> : <mark className="lg-ph" data-testid="legal-contact">[Contact email]</mark>}. In an emergency call 911; in the US call or text 988 for a mental-health crisis.</p>
        </Card>
        {profile.onboarded && <DataConsentsCard />}
        {profile.onboarded && lg.rec?.acceptedAt && <p className="muted small" data-testid="legal-accepted">Accepted: Terms & Privacy version {lg.rec.terms} on {new Date(lg.rec.acceptedAt).toLocaleString()} (minimum age {lg.rec.ageConfirmed ?? minAge()}).</p>}
      </div>
    </Page>
  );
  return profile.onboarded ? body : <Standalone>{body}</Standalone>;
}

export function LegalDocPage() {
  const { doc } = useParams();
  const { profile } = useStore();
  const id: LegalDocId = isLegalDocId(doc) ? doc : 'terms';
  const meta = LEGAL_DOCS.find((d) => d.id === id)!;
  const md = useMemo(() => legalText(id), [id]);
  const contents = useMemo(() => toc(parse(md)), [md]);
  const body = (
    <Page title={meta.title} kicker="Legal" back="/legal" wide>
      <article className="lg-article" data-testid={`legal-doc-${id}`}>
        {contents.length > 5 && (
          <details className="lg-toc card">
            <summary><b>Contents</b> <span className="muted small">({contents.length} sections)</span></summary>
            <ol>{contents.map((c) => <li key={c.id}><a className="link" href={`#${c.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{c.text}</a></li>)}</ol>
          </details>
        )}
        <Card className="lg-card"><Markdown md={md} skipTitle /></Card>
        <p className="muted small">Not legal advice. Questions: see <Link className="link" to="/legal">Contact & support</Link>.</p>
        <LegalLinks />
      </article>
    </Page>
  );
  return profile.onboarded ? body : <Standalone>{body}</Standalone>;
}
