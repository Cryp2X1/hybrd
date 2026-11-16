import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './components/Icon';
import { useStore } from './lib/store';
import { useAuth } from './lib/auth';
import { useRecorder } from './lib/recorder';
import { setCuePrefs } from './lib/cues';
import Home from './pages/Home';
import { Avatar } from './components/Avatar';

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
const Devices = lazy(() => import('./pages/Devices'));
const ImportPage = lazy(() => import('./pages/Import'));
const AddFood = lazy(() => import('./pages/AddFood'));
const RecipeDetail = lazy(() => import('./pages/RecipeDetail'));
const Calculator = lazy(() => import('./pages/Calculator'));
const WeightLoss = lazy(() => import('./pages/WeightLoss'));
const WeightLossSetup = lazy(() => import('./pages/WeightLossSetup'));
const Fasting = lazy(() => import('./pages/Fasting'));
const FastingSetup = lazy(() => import('./pages/FastingSetup'));
const Ultra = lazy(() => import('./pages/Ultra'));
const UltraSetup = lazy(() => import('./pages/UltraSetup'));
const Progress = lazy(() => import('./pages/Progress'));
const Burn = lazy(() => import('./pages/Burn'));
const Me = lazy(() => import('./pages/Me'));
const Auth = lazy(() => import('./pages/Auth'));
const Account = lazy(() => import('./pages/Account'));
const DataPage = lazy(() => import('./pages/DataPage'));
const Help = lazy(() => import('./pages/Help'));
const ScorePage = lazy(() => import('./pages/ScorePage'));
const Coach = lazy(() => import('./pages/Coach'));
const CoachSetup = lazy(() => import('./pages/CoachSetup'));
const Gallery = lazy(() => import('./pages/Gallery'));

const NAV = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/coach', icon: 'coach', label: 'Coach' },
  { to: '/train', icon: 'train', label: 'Train' },
  { to: '/record', icon: 'record', label: 'Record' },
  { to: '/timers', icon: 'timer', label: 'Timers' },
  { to: '/fuel', icon: 'fuel', label: 'Fuel' },
  { to: '/burn', icon: 'fire', label: 'Burn' },
  { to: '/progress', icon: 'progress', label: 'Progress' },
];

export function ModeChip() {
  const { configured, user } = useAuth();
  const { syncStatus } = useStore();
  if (!configured) return <NavLink to="/me/account" className="mode-chip"><span className="dot" />Local mode</NavLink>;
  if (!user) return <NavLink to="/sign-in" className="mode-chip"><span className="dot" />Sign in to sync</NavLink>;
  return <NavLink to="/me/account" className={`mode-chip ${syncStatus === 'error' ? 'err' : 'on'}`}><span className="dot" />{syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync error' : syncStatus === 'offline' ? 'Offline' : 'Synced'}</NavLink>;
}

export function App() {
  const { ready, profile } = useStore();
  const { session } = useAuth();
  const { s: rec } = useRecorder();
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => { setCuePrefs(profile.sound !== false, !!profile.voice); }, [profile.sound, profile.voice]);
  // Auth email landings: /?next=reset-password | account
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    const next = q.get('next');
    if (next && (session || !q.get('code'))) nav(next === 'reset-password' ? '/reset-password' : next === 'account' ? '/me/account' : '/', { replace: true });
  }, [loc.search, session, nav]);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  if (!ready) return <div className="onb"><div className="onb-hero"><div className="brand"><span className="brand-mark">H</span>HYBRD</div></div></div>;
  const authPaths = ['/sign-in', '/sign-up', '/forgot', '/reset-password'];
  if (!profile.onboarded && !authPaths.includes(loc.pathname) && !new URLSearchParams(loc.search).get('next')) {
    return <Suspense fallback={null}><Onboarding /></Suspense>;
  }
  const live = rec.status !== 'idle';
  return (
    <div className={`shell ${live && loc.pathname === '/record' ? 'focus' : ''}`}>
      <nav className="side-nav" aria-label="Main">
        <div className="brand"><span className="brand-mark">H</span>HYBRD</div>
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}{n.to === '/record' && live && <span className="live-dot" style={{ marginLeft: 'auto' }} />}</NavLink>)}
        <NavLink to="/me" className="side-me" data-testid="side-me"><Avatar size={26} /><span className="side-me-n">{profile.name ? profile.name.split(' ')[0] : 'Me'}</span></NavLink>
        <NavLink to="/train/log" className="side-cta">Log a workout</NavLink>
        <div className="side-foot"><ModeChip /><div style={{ marginTop: 10 }}>Train · Track · Fuel</div></div>
      </nav>
      <main className="main">
        <div className="topbar"><div className="brand"><span className="brand-mark">H</span>HYBRD</div><div className="spacer" /><NavLink to="/coach" className="top-coach" aria-label="HYBRD Coach"><Icon name="coach" size={18} />Coach</NavLink><ModeChip /><NavLink to="/me" className="top-av" aria-label="Me"><Avatar size={32} /></NavLink></div>
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
            <Route path="/progress" element={<Progress />} />
            <Route path="/burn" element={<Burn />} />
            <Route path="/me" element={<Me />} />
            <Route path="/me/gallery" element={<Gallery />} />
            <Route path="/me/account" element={<Account />} />
            <Route path="/me/data" element={<DataPage />} />
            <Route path="/me/help" element={<Help />} />
            <Route path="/me/devices" element={<Devices />} />
            <Route path="/me/import" element={<ImportPage />} />
            <Route path="/sign-in" element={<Auth mode="sign-in" />} />
            <Route path="/sign-up" element={<Auth mode="sign-up" />} />
            <Route path="/forgot" element={<Auth mode="forgot" />} />
            <Route path="/reset-password" element={<Auth mode="reset" />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end><Icon name="home" /><span>Home</span></NavLink>
        <NavLink to="/train"><Icon name="train" /><span>Train</span></NavLink>
        <NavLink to="/record" className={`rec ${live ? 'live' : ''}`}><span className="rec-btn"><Icon name="record" size={26} /></span><span>{live ? 'Live' : 'Record'}</span></NavLink>
        <NavLink to="/fuel"><Icon name="fuel" /><span>Fuel</span></NavLink>
        <NavLink to="/me" className="bn-me"><Avatar size={24} /><span>Me</span></NavLink>
      </nav>
    </div>
  );
}
