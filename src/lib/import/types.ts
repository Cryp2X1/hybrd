import type { Lap, RoutePoint, WorkoutType } from '../types';
export interface ParsedActivity {
  fileName: string;
  format: 'GPX' | 'TCX' | 'FIT';
  hash: string; // sha-256 of the file bytes (+ index when a file holds several activities)
  name?: string;
  type: WorkoutType;
  sportRaw?: string;
  start: number; // ms
  durationSec: number; // moving/timer time when the file has it, else elapsed
  elapsedSec: number;
  distanceM?: number;
  elevGainM?: number;
  segments: RoutePoint[][];
  hr?: { avg: number; max: number; samples: [number, number][] };
  cadence?: number; // steps (or rpm) per minute avg
  avgWatts?: number;
  maxWatts?: number;
  laps?: Lap[];
  kcal?: number; // from the device, if present
  device?: string;
  warnings: string[];
}
