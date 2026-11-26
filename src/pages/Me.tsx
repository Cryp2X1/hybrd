import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { Page, Card, RowLink } from '../components/ui';
import { Icon } from '../components/Icon';
import { distUnit, wUnit, wu } from '../lib/calc';
import { ProfilePhotoCard, GalleryPreview } from '../components/Avatar';
import { BioCard } from '../components/BioCard';
import { prefsOf } from '../lib/privacy';
import { visibilityLabel } from '../lib/share';

// Me = your profile (photo, bio, gallery) and shortcuts. Every setting lives in Settings (/settings).
export default function Me() {
  const { profile: p } = useStore();
  const { configured, user } = useAuth();
  const loc = useLocation();
  // Old deep links (/me#units, #goals, #music) now live in Settings.
  const legacy: Record<string, string> = { '#units': '/settings/units', '#goals': '/settings/goals', '#music': '/settings/devices#music' };
  useEffect(() => { if (loc.hash && !legacy[loc.hash]) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' }); }, [loc.hash]); // eslint-disable-line react-hooks/exhaustive-deps
  const pr = prefsOf(p);
  if (legacy[loc.hash]) return <MeRedirect to={legacy[loc.hash]} />;
  return (
    <Page title="Me" kicker="Profile · bio · photos" wide actions={<Link className="btn sm" to="/settings" data-testid="me-settings"><Icon name="gear" size={18} />Settings</Link>}>
      <div className="desk-grid">
        <div>
          <ProfilePhotoCard />
          <BioCard />
          <GalleryPreview />
        </div>
        <div>
          <Card className="me-set">
            <div className="card-head"><h3>Settings</h3><Link className="link small" to="/settings">All settings →</Link></div>
            <RowLink to="/settings/privacy" icon="eye" title="Privacy" sub={`Activities: ${visibilityLabel(pr.defaultVisibility)} · ${pr.hideEnds ? 'start & end hidden' : 'full routes'}${pr.zones.length ? ` · ${pr.zones.length} zone${pr.zones.length === 1 ? '' : 's'}` : ''}`} />
            <RowLink to="/settings/safety" icon="shield" title="Safety" sub="Account status, reports, who can message you" />
            <RowLink to="/settings/units" icon="ruler" title="Units & display" sub={`${distUnit(p.units)} · ${wUnit(wu(p))}`} />
            <RowLink to="/settings/account" icon="lock" title="Account & security" sub={user ? 'Email, password, sync' : configured ? 'Sign in or create an account' : 'Local mode — how accounts turn on'} />
            <RowLink to="/settings/devices" icon="watch" title="Devices & integrations" sub="Heart-rate strap · watch files · Strava · Spotify" />
          </Card>
          <Card>
            <RowLink to="/me/gallery" icon="image" title="Gallery" sub="Progress photos & training videos · private" />
            <RowLink to="/social" icon="users" title="Friends & Stories" sub="Friends, posts, stories, invite link" />
            <RowLink to="/mind" icon="mind" title="Mind & Recovery" sub="Readiness, breathing, recovery, private journal" />
            <RowLink to="/mind/help" icon="phone" title="Get help now" sub="988 call or text · 911 · helplines worldwide" />
            <RowLink to="/coach" icon="coach" title="HYBRD Coach" sub="Your personal training & nutrition plan" />
            <RowLink to="/progress" icon="progress" title="Progress & PRs" sub="Charts, records, body weight" />
            <RowLink to="/timers" icon="timer" title="Timers" sub="Stopwatch, intervals, EMOM, AMRAP, HYROX" />
            <RowLink to="/routes" icon="map" title="Route history" sub="Every GPS activity on one map" />
            <RowLink to="/fuel/calculator" icon="fuel" title="Calorie targets" sub="TDEE calculator" />
          </Card>
          <p className="muted small">HYBRD · made for José Manuel Cruz Ortiz & friends. <Link className="link" to="/settings/about">About</Link></p>
        </div>
      </div>
    </Page>
  );
}
function MeRedirect({ to }: { to: string }) {
  const [pathname, hash] = to.split('#');
  return <NavigateTo pathname={pathname} hash={hash ? `#${hash}` : ''} />;
}
const NavigateTo = ({ pathname, hash }: { pathname: string; hash: string }) => <Navigate to={{ pathname, hash }} replace />;
