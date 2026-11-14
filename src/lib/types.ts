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
  strideCm?: number; // user-set step length; otherwise estimated from height
  sound?: boolean;
  voice?: boolean;
  hrMax?: number; // user-set max heart rate; otherwise Tanaka 208 − 0.7 × age
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
export interface Template extends Rec { name: string; type: WorkoutType; exercises: ExerciseEntry[]; notes?: string }

export interface DataState {
  workouts: Workout[];
  routes: GpsRoute[];
  foods: FoodEntry[];
  water: WaterDay[];
  body: BodyLog[];
  templates: Template[];
  steps: StepDay[];
}
export type Collection = keyof DataState;
export const COLLECTIONS: Collection[] = ['workouts', 'routes', 'foods', 'water', 'body', 'templates', 'steps'];
