import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './components/Icon';
import { useStore } from './lib/store';
import { useAuth } from './lib/auth';
import { useRecorder } from './lib/recorder';
import { setCuePrefs } from './lib/cues';
import { newSeed } from './lib/privacy';
import Home from './pages/Home';
import { Avatar } from './components/Avatar';
import { useSocial } from './lib/socialStore';
import { useMessages } from './lib/messagesStore';
import { DmBanner, MessagesLink } from './components/Messages';
import { CallLayer } from './components/Call';
import { AccountGate } from './components/Safety';
import { useTheme, hasStoredPref, readStoredPref, setStoredPref, parsePref } from './lib/theme';

const Onboarding = lazy(() => import('./pages/Onboarding'));
const Train = lazy(() => import('./pages/Train'));
const ProgramDetail = lazy(() => import('./pages/ProgramDetail'));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'));
const Logger = lazy(() => import('./pages/Logger'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const Record = lazy(() => import('./pages/Record'));
const RoutesPage = lazy(() => import('./pages/Routes'));
const Timers = lazy(() => import('./pages/Timers'));
const Fuel = lazy(() => import('./pages/Fuel'));
const ImportPage = lazy(() => import('./pages/Import'));
const AddFood = lazy(() => import('./pages/AddFood'));
const RecipeDetail = lazy(() => import('./pages/RecipeDetail'));
const Calculator = lazy(() => import('./pages/Calculator'));
const WeightLoss = lazy(() => import('./pages/WeightLoss'));
const WeightLossSetup = lazy(() => import('./pages/WeightLossSetup'));
const Fasting = lazy(() => import('./pages/Fasting'));
const FastingSetup = lazy(() => import('./pages/FastingSetup'));
const Sleep = lazy(() => import('./pages/Sleep'));
const SleepSetup = lazy(() => import('./pages/SleepSetup'));
const Mind = lazy(() => import('./pages/Mind'));
const MindSetup = lazy(() => import('./pages/MindSetup'));
const MindHelp = lazy(() => import('./pages/MindHelp'));
const MindPlayer = lazy(() => import('./pages/MindPlayer'));
const MindProgram = lazy(() => import('./pages/MindProgram'));
const Ultra = lazy(() => import('./pages/Ultra'));
const UltraSetup = lazy(() => import('./pages/UltraSetup'));
const Progress = lazy(() => import('./pages/Progress'));
const Burn = lazy(() => import('./pages/Burn'));
const Me = lazy(() => import('./pages/Me'));
const Auth = lazy(() => import('./pages/Auth'));
const ScorePage = lazy(() => import('./pages/ScorePage'));
const Coach = lazy(() => import('./pages/Coach'));
const CoachSetup = lazy(() => import('./pages/CoachSetup'));
const Gallery = lazy(() => import('./pages/Gallery'));
const SocialFeed = lazy(() => import('./pages/Social'));
const SocialCreate = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialCreate })));
const SocialPostPage = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialPostPage })));
const SocialFriends = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialFriends })));
const SocialNotifications = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialNotifications })));
const SocialSaved = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialSaved })));
const SocialProfile = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialProfile })));
const SocialSetup = lazy(() => import('./pages/Social').then((m) => ({ default: m.SocialSetup })));
const GuidelinesPage = lazy(() => import('./pages/Safety').then((m) => ({ default: m.GuidelinesPage })));
const ReportingPage = lazy(() => import('./pages/Safety').then((m) => ({ default: m.ReportingPage })));
const TimeOffPage = lazy(() => import('./pages/Safety').then((m) => ({ default: m.TimeOffPage })));
const DeleteAccountPage = lazy(() => import('./pages/Safety').then((m) => ({ default: m.DeleteAccountPage })));
const ModerationPage = lazy(() => import('./pages/Safety').then((m) => ({ default: m.ModerationPage })));
const MessagesPage = lazy(() => import('./pages/Messages'));
const NewMessage = lazy(() => import('./pages/Messages').then((m) => ({ default: m.NewMessage })));
const InvitePage = lazy(() => import('./pages/Social').then((m) => ({ default: m.InvitePage })));
const SettingsHome = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsHome })));
const SettingsSection = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsSection })));
const LegacyRedirect = lazy(() => import('./pages/Settings').then((m) => ({ default: m.LegacyRedirect })));
const SharedActivity = lazy(() => import('./pages/SharedActivity'));

// Main navigation order (desktop sidebar): Home, then Social (Friends & Stories), then Messages, then the rest.
const NAV = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/social', icon: 'users', label: 'Social' },
  { to: '/messages', icon: 'chat', label: 'Messages' },
  { to: '/coach', icon: 'coach', label: 'Coach' },
  { to: '/train', icon: 'train', label: 'Train' },
  { to: '/record', icon: 'record', label: 'Record' },
  { to: '/timers', icon: 'timer', label: 'Timers' },
  { to: '/fuel', icon: 'fuel', label: 'Fuel' },
  { to: '/mind', icon: 'mind', label: 'Mind' },
  { to: '/burn', icon: 'fire', label: 'Burn' },
  { to: '/progress', icon: 'progress', label: 'Progress' },
];

export function ModeChip() {
  const { configured, user } = useAuth();
  const { syncStatus } = useStore();
  if (!configured) return <NavLink to="/settings/account" className="mode-chip" title="Local mode" aria-label="Local mode"><span className="dot" /><span className="mode-chip-t">Local mode</span></NavLink>;
  if (!user) return <NavLink to="/sign-in" className="mode-chip" title="Sign in to sync" aria-label="Sign in to sync"><span className="dot" /><span className="mode-chip-t">Sign in to sync</span></NavLink>;
  const label = syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync error' : syncStatus === 'offline' ? 'Offline' : 'Synced';
  return <NavLink to="/settings/account" className={`mode-chip ${syncStatus === 'error' ? 'err' : 'on'}`} title={label} aria-label={label}><span className="dot" /><span className="mode-chip-t">{label}</span></NavLink>;
}

export function App() {
  const { ready, profile, setProfile } = useStore();
  const { session } = useAuth();
  const { s: rec } = useRecorder();
  const { badge } = useSocial();
  const { badge: dmBadge } = useMessages();
  const loc = useLocation();
  const nav = useNavigate();

  // Appearance: applies the saved theme (and follows the device for "System"); keeps localStorage and the profile in step.
  const { pref: themePref } = useTheme();
  useEffect(() => {
    if (!ready) return;
    if (profile.theme) { if (parsePref(profile.theme) !== themePref) setStoredPref(parsePref(profile.theme)); }
    else if (hasStoredPref()) setProfile({ theme: readStoredPref() });
  }, [ready, profile.theme, themePref]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCuePrefs(profile.sound !== false, !!profile.voice); }, [profile.sound, profile.voice]);
  // Auth email landings: /?next=reset-password | account
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    const next = q.get('next');
    if (next && (session || !q.get('code'))) nav(next === 'reset-password' ? '/reset-password' : next === 'account' ? '/settings/account' : '/', { replace: true });
  }, [loc.search, session, nav]);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // Map privacy: every person gets a secret random seed for the start/end and zone offsets (synced privately).
  useEffect(() => { if (ready && profile.onboarded && !profile.privacy?.seed) setProfile({ privacy: { ...(profile.privacy || {}), seed: newSeed() } }); }, [ready, profile.onboarded, profile.privacy?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="onb"><div className="onb-hero"><div className="brand"><span className="brand-mark">H</span>HYBRD</div></div></div>;
  const authPaths = ['/sign-in', '/sign-up', '/forgot', '/reset-password'];
  // Shared activity links open for anyone — no onboarding, no app chrome — when this browser hasn't used HYBRD.
  if (loc.pathname === '/a' && !profile.onboarded) return <Suspense fallback={null}><SharedActivity /></Suspense>;
  if (!profile.onboarded && !authPaths.includes(loc.pathname) && !new URLSearchParams(loc.search).get('next')) {
    return <Suspense fallback={null}><Onboarding /></Suspense>;
  }
  const live = rec.status !== 'idle';
  const dmChat = loc.pathname === '/messages/chat';
  return (
    <div className={`shell ${live && loc.pathname === '/record' ? 'focus' : ''} ${loc.pathname.startsWith('/messages') ? 'dm-route' : ''} ${dmChat ? 'dm-chat-open' : ''}`}>
      <nav className="side-nav" aria-label="Main">
        <div className="brand"><span className="brand-mark">H</span>HYBRD</div>
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}{n.to === '/record' && live && <span className="live-dot" style={{ marginLeft: 'auto' }} />}{n.to === '/social' && badge > 0 && <span className="s-badge" style={{ marginLeft: 'auto' }} data-testid="side-social-badge">{badge}</span>}{n.to === '/messages' && dmBadge > 0 && <span className="s-badge" style={{ marginLeft: 'auto' }} data-testid="side-dm-badge">{dmBadge}</span>}</NavLink>)}
        <NavLink to="/settings" className="side-set" data-testid="side-settings"><Icon name="gear" />Settings</NavLink>
        <NavLink to="/me" className="side-me" data-testid="side-me"><Avatar size={26} /><span className="side-me-n">{profile.name ? profile.name.split(' ')[0] : 'Me'}</span></NavLink>
        <NavLink to="/train/log" className="side-cta">Log a workout</NavLink>
        <div className="side-foot"><ModeChip /><div style={{ marginTop: 10 }}>Train · Track · Fuel</div></div>
      </nav>
      <main className="main">
        <div className="desk-bar"><MessagesLink className="desk-dm" size={20} testid="desk-messages"><span>Messages</span></MessagesLink></div>
        <div className="topbar"><div className="brand"><span className="brand-mark">H</span>HYBRD</div><div className="spacer" /><MessagesLink /><NavLink to="/coach" className="top-coach" aria-label="HYBRD Coach"><Icon name="coach" size={18} /><span className="top-coach-label">Coach</span></NavLink><ModeChip /><NavLink to="/settings" className="top-set" aria-label="Settings" data-testid="top-settings"><Icon name="gear" size={20} /></NavLink><NavLink to="/me" className="top-av" aria-label="Me"><Avatar size={32} /></NavLink></div>
        <Suspense fallback={<div className="muted" style={{ padding: 30 }}>Loading…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/score" element={<ScorePage />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/coach/start" element={<CoachSetup />} />
            <Route path="/train" element={<Train />} />
            <Route path="/train/program/:id" element={<ProgramDetail />} />
            <Route path="/train/exercise/:id" element={<ExerciseDetail />} />
            <Route path="/train/log" element={<Logger />} />
            <Route path="/train/workout/:id" element={<WorkoutDetail />} />
            <Route path="/record" element={<Record />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/timers" element={<Timers />} />
            <Route path="/fuel" element={<Fuel />} />
            <Route path="/fuel/add" element={<AddFood />} />
            <Route path="/fuel/recipe/:id" element={<RecipeDetail />} />
            <Route path="/fuel/calculator" element={<Calculator />} />
            <Route path="/fuel/weight-loss" element={<WeightLoss />} />
            <Route path="/fuel/weight-loss/setup" element={<WeightLossSetup />} />
            <Route path="/train/ultra" element={<Ultra />} />
            <Route path="/train/ultra/setup" element={<UltraSetup />} />
            <Route path="/fuel/fasting" element={<Fasting />} />
            <Route path="/fuel/fasting/setup" element={<FastingSetup />} />
            <Route path="/fuel/sleep" element={<Sleep />} />
            <Route path="/fuel/sleep/setup" element={<SleepSetup />} />
            <Route path="/mind" element={<Mind />} />
            <Route path="/mind/setup" element={<MindSetup />} />
            <Route path="/mind/help" element={<MindHelp />} />
            <Route path="/mind/breathe/:id" element={<MindPlayer kind="breathe" />} />
            <Route path="/mind/routine/:id" element={<MindPlayer kind="routine" />} />
            <Route path="/mind/program/:id" element={<MindProgram />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/burn" element={<Burn />} />
            <Route path="/me" element={<Me />} />
            <Route path="/me/gallery" element={<Gallery />} />
            <Route path="/me/account" element={<LegacyRedirect from="/me/account" />} />
            <Route path="/me/data" element={<LegacyRedirect from="/me/data" />} />
            <Route path="/me/help" element={<LegacyRedirect from="/me/help" />} />
            <Route path="/me/devices" element={<LegacyRedirect from="/me/devices" />} />
            <Route path="/settings" element={<SettingsHome />} />
            <Route path="/settings/:section" element={<SettingsSection />} />
            <Route path="/a" element={<SharedActivity />} />
            <Route path="/me/import" element={<ImportPage />} />
            <Route path="/social" element={<SocialFeed />} />
            <Route path="/social/new" element={<SocialCreate />} />
            <Route path="/social/post" element={<SocialPostPage />} />
            <Route path="/social/friends" element={<SocialFriends />} />
            <Route path="/social/notifications" element={<SocialNotifications />} />
            <Route path="/social/saved" element={<SocialSaved />} />
            <Route path="/social/profile" element={<SocialProfile />} />
            <Route path="/social/setup" element={<SocialSetup />} />
            <Route path="/social/rules" element={<GuidelinesPage />} />
            <Route path="/safety/guidelines" element={<GuidelinesPage />} />
            <Route path="/safety/reporting" element={<ReportingPage />} />
            <Route path="/safety/time-off" element={<TimeOffPage />} />
            <Route path="/safety/delete" element={<DeleteAccountPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/chat" element={<MessagesPage />} />
            <Route path="/messages/new" element={<NewMessage />} />
            <Route path="/messages/settings" element={<LegacyRedirect from="/messages/settings" />} />
            <Route path="/invite" element={<InvitePage />} />
            <Route path="/sign-in" element={<Auth mode="sign-in" />} />
            <Route path="/sign-up" element={<Auth mode="sign-up" />} />
            <Route path="/forgot" element={<Auth mode="forgot" />} />
            <Route path="/reset-password" element={<Auth mode="reset" />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </main>
      <DmBanner />
      <CallLayer />
      <AccountGate />
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end><Icon name="home" /><span>Home</span></NavLink>
        <NavLink to="/social" className="bn-social" data-testid="nav-social" aria-label={`Social, friends and stories${badge ? `, ${badge} new` : ''}`}><span className="bn-ic"><Icon name="users" />{badge > 0 && <span className="s-badge" data-testid="nav-social-badge">{badge > 9 ? '9+' : badge}</span>}</span><span>Social</span></NavLink>
        <NavLink to="/record" className={`rec ${live ? 'live' : ''}`}><span className="rec-btn"><Icon name="record" size={26} /></span><span>{live ? 'Live' : 'Record'}</span></NavLink>
        <NavLink to="/train"><Icon name="train" /><span>Train</span></NavLink>
        <NavLink to="/fuel"><Icon name="fuel" /><span>Fuel</span></NavLink>
      </nav>
    </div>
  );
}
