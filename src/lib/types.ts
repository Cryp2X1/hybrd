export type Units = 'metric' | 'imperial';
export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Discipline = 'calisthenics' | 'strength' | 'running' | 'walking' | 'cycling' | 'cardio' | 'hyrox' | 'hybrid';
export type WorkoutType = 'strength' | 'calisthenics' | 'run' | 'walk' | 'cycle' | 'indoor-cycle' | 'cardio' | 'hyrox' | 'hybrid' | 'rest';
export type BikeKind = 'indoor' | 'stationary';

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
  goal: Goal;
  units: Units; // distance system: imperial = mi, ft, mph · metric = km, m, km/h
  weightUnit?: 'lb' | 'kg'; // defaults to follow `units`
  disciplines: Discipline[];
  weeklySessions: number;
  onboarded: boolean;
  targets?: { kcal?: number; protein?: number; carbs?: number; fat?: number; waterMl?: number };
  hyroxDivision?: 'women-open' | 'men-open' | 'women-pro' | 'men-pro';
  stepGoal?: number; // default 10,000
  burnGoal?: number; // daily ACTIVE kcal goal (Burn tracker), default 500
  strideCm?: number; // user-set step length; otherwise estimated from height
  sound?: boolean;
  voice?: boolean;
  hrMax?: number; // user-set max heart rate; otherwise Tanaka 208 − 0.7 × age
  /** Recent race or time trial used for Expert running paces (Daniels VDOT). */
  runRef?: { distM: number; sec: number; date?: string };
  /** Functional threshold power in watts, for %FTP cycling targets (Coggan levels). */
  ftp?: number;
  /** Hides the first-run HYBRD Coach prompt on Home (the smaller entry card stays). */
  coachDismissed?: boolean;
  /** Fuel › Fasting: screening answers, chosen protocol and eating window (synced with the profile). */
  fasting?: import('./fasting').FastPlan;
  /** Fuel › Sleep: safety screen answers, evening-plan inputs and goal (synced with the profile). */
  sleep?: import('./sleep').SleepPlan;
  /** Mind & Recovery: safety screen, goal, focus and the journal privacy choice (synced with the profile). */
  mind?: import('./mind').MindPlan;
  /** Profile photo: the 512 px image is in IndexedDB (`avatar:<ns>`); `v` changes on every new photo; `path` = private storage path when synced. */
  avatar?: { v: number; bytes: number; path?: string };
  /** Me › Bio: free-form plain text (max 1,000 characters). Private — there is no public profile. */
  bio?: string;
  /** Date of birth (YYYY-MM-DD), asked by Friends & Stories for the 13+ age gate. Private: never shown to anyone. */
  dob?: string;
  /** Train › Ultra & Backyard: screening answers, target race and planner choices (the plan is rebuilt from these). */
  ultra?: import('./ultra').UltraSaved;
  /** Backyard distance display (mi / km / m / ft). Defaults from `units`; does not change the global mi/km setting. */
  byuDistUnit?: import('./ultra').ByuDistUnit;
  /** Settings › Privacy & safety: map visibility defaults, privacy zones, default activity visibility. */
  privacy?: Partial<import('./privacy').PrivacyPrefs>;
  /** Settings › Recording: defaults for new GPS sessions. */
  /** Appearance: Light / Dark / System. Mirrors localStorage 'hybrd:theme' so it follows you across devices. */
  theme?: 'light' | 'dark' | 'system';
  recording?: { autoPause?: boolean; keepAwake?: boolean; splitCues?: boolean };
  /** Gear you pick from when saving an activity (shoes, bikes). */
  gear?: { id: string; name: string; kind: 'shoes' | 'bike' | 'other'; retired?: boolean }[];
  updatedAt?: number;
}

export interface Rec { id: string; updatedAt: number; deleted?: boolean }

export interface SetEntry { reps?: number; weightKg?: number; timeSec?: number; distanceM?: number; done?: boolean }
export interface ExerciseEntry { exId: string; name: string; sets: SetEntry[]; note?: string }
export interface Split { label: string; sec: number; distanceM?: number }

export interface Workout extends Rec {
  date: string; // ISO datetime of start
  type: WorkoutType;
  title: string;
  durationSec: number;
  distanceM?: number;
  elevGainM?: number;
  rpe?: number; // 1-10
  exercises?: ExerciseEntry[];
  splits?: Split[];
  routeId?: string;
  kcal?: number; // estimate
  notes?: string;
  source?: string; // program id / template / gps / hyrox-sim / timer
  steps?: number;
  cadence?: number; // avg steps per minute while moving
  stepsSource?: 'sensor' | 'est';
  /** Heart rate: avg/max bpm and a downsampled series [seconds from start, bpm] */
  hr?: { avg: number; max: number; samples?: [number, number][]; from?: 'ble' | 'file' | 'strava' };
  kcalMethod?: 'met' | 'hr' | 'device' | 'power';
  /** Indoor / stationary bike variant (type === 'indoor-cycle'). */
  bikeKind?: BikeKind;
  avgWatts?: number;
  maxWatts?: number;
  /** Resistance level as shown on the bike console (unitless; bikes differ). */
  resistance?: number;
  /** Dedupe key: 'file:<sha256>' or 'strava:<id>' */
  extId?: string;
  device?: string; // e.g. "Garmin Forerunner 265" (from the file) or the BLE sensor name
  laps?: Lap[];
  /** Saved-activity extras (Record › Save, Activity › Edit). */
  description?: string;
  /** Who can see it when shared: only me (default for old activities), friends or public. */
  visibility?: import('./privacy').Visibility;
  /** Per-activity map privacy. Missing = the profile defaults at the time of sharing. */
  mapPrivacy?: import('./privacy').MapPrivacy;
  /** Gallery item ids attached as activity photos (private gallery; GPS metadata already removed). */
  photos?: string[];
  gearId?: string;
  /** Wall-clock time from start to finish, including pauses (durationSec = moving time). */
  elapsedSec?: number;
  /** Public share id (row in `shared_activities`) once published; random, not the workout id. */
  shareId?: string;
  /** Id of the HYBRD feed post made from this activity. */
  postId?: string;
}
export interface Lap { sec: number; distanceM?: number; avgHr?: number; maxHr?: number }

export type LatLng = [number, number];
/** e = active (moving-clock) ms since start, d = cumulative metres — lets splits be recomputed for any unit */
export interface RoutePoint { lat: number; lng: number; alt?: number | null; t: number; acc?: number; e?: number; d?: number }
export interface GpsRoute extends Rec { workoutId: string; segments: RoutePoint[][]; }

export interface FoodEntry extends Rec {
  date: string; // YYYY-MM-DD
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks';
  name: string;
  grams?: number;
  servings?: number;
  kcal: number; protein: number; carbs: number; fat: number;
  source: 'usda' | 'off' | 'recipe' | 'custom';
  ref?: string;
}

export interface WaterDay extends Rec { date: string; ml: number; sample?: boolean }
export interface BodyLog extends Rec { date: string; weightKg: number }
/** Steps typed in for a day. mode 'add' = on top of in-app activity steps; 'set' = the full-day total (e.g. from the phone's Health app). */
export interface StepDay extends Rec { date: string; steps: number; mode: 'add' | 'set'; sample?: boolean }
/** Calories burned typed in by hand for an activity HYBRD didn't record (Burn tracker). Not a workout: it doesn't touch the Hybrid Score. */
export interface BurnEntry extends Rec {
  date: string; // YYYY-MM-DD (local day)
  activity: string; // key in BURN_ACTIVITIES, or 'other'
  label: string; // shown name, e.g. "Swimming" or the user's own text
  minutes: number;
  kcal: number; // what counts (the MET estimate or the user's override)
  met?: number; // MET used for the estimate
  method: 'met' | 'manual';
  sample?: boolean;
}
export type { WLPlan } from './wl';
export type { CoachPlan } from './coach';
export interface Template extends Rec { name: string; type: WorkoutType; exercises: ExerciseEntry[]; notes?: string }

export interface DataState {
  workouts: Workout[];
  routes: GpsRoute[];
  foods: FoodEntry[];
  water: WaterDay[];
  body: BodyLog[];
  templates: Template[];
  steps: StepDay[];
  burns: BurnEntry[];
  /** Weight-loss programs (Fuel › Weight loss). The newest non-deleted record is the active plan. */
  wlplans: import('./wl').WLPlan[];
  /** HYBRD Coach plans (rule-based training + nutrition plan). The newest non-deleted record is the active plan. */
  coachplans: import('./coach').CoachPlan[];
  /** Fasting timer log (Fuel › Fasting): timed fasts and low-calorie days. Synced to `fasting_logs`. */
  fasts: import('./fasting').FastLog[];
  /** Sleep & fuel log (Fuel › Sleep): one row per night, keyed by the morning you woke. Synced to `sleep_logs`. */
  sleeps: import('./sleep').SleepLog[];
  /** Caffeine tracker entries (Fuel › Sleep › Caffeine). Synced to `caffeine_logs`. */
  caffeine: import('./sleep').CaffeineLog[];
  /** Me › Gallery photo metadata (the image blobs live in IndexedDB `hybrd-media`, and in the private `user-media` bucket when signed in). Synced to `gallery_items`. */
  gallery: import('./media').GalleryItem[];
  /** Mind & Recovery daily check-ins (mood, stress, energy, soreness, sleep → readiness). Synced to `mind_checkins`. */
  checkins: import('./mind').CheckIn[];
  /** Mind & Recovery private journal. Entries with localOnly never leave the device. Synced to `journal_entries`. */
  journal: import('./mind').JournalEntry[];
  /** Completed breathing sessions, program days and recovery routines. Synced to `mind_sessions`. */
  mindsessions: import('./mind').MindSession[];
  /** HYBRD Pulse weekly check-ins (+ optional PHQ-2/GAD-2; older retired-format entries kept as-is). localOnly entries never sync. Synced to `mind_screens`. */
  screens: import('./mind').ScreenResult[];
}
export type Collection = keyof DataState;
export const COLLECTIONS: Collection[] = ['workouts', 'routes', 'foods', 'water', 'body', 'templates', 'steps', 'burns', 'wlplans', 'coachplans', 'fasts', 'sleeps', 'caffeine', 'gallery', 'checkins', 'journal', 'mindsessions', 'screens'];
