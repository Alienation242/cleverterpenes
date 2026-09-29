import type { CompoundId } from '../science/compounds';
import type { Goal } from '../science/planner';
import type { Amounts, ModelParams, Segment } from '../science/releaseModel';
import type { BalloonProfile } from '../science/balloon';

export type { BalloonProfile };

export type StrainSource = 'coa' | 'database' | 'registry' | 'cannlytics' | 'manual' | 'names' | 'lineage' | 'typical';

/** How a terpene profile was obtained — shown to the user as "how we got there". */
export type ProfileMethod =
  | 'lab-batch'
  | 'lab-product'
  | 'lab-strain'
  | 'combined-estimate'
  | 'names-estimate'
  | 'lineage-estimate'
  | 'typical'
  | 'manual';

export interface Provenance {
  method: ProfileMethod;
  steps: string[];
  sources: { name: string; url?: string; license?: string }[];
}
export type DataConfidence = 'batch' | 'high' | 'medium' | 'low';

export interface StrainPrefs {
  goal?: Goal;
  loadMg?: number;
  balloonCount?: number;
  balloonId?: string;
  preheatSeconds?: number;
  maxTempC?: number;
  /** Learned from ratings: shift for balloon 1 and for later balloons (°C) */
  firstOffsetC: number;
  laterOffsetC: number;
}

export interface CustomPlan {
  balloons: { segments: Segment[]; preheatSeconds: number }[];
  savedAt: string;
}

export interface StrainEntry {
  id: string;
  name: string;
  source: StrainSource;
  sourceDetail?: string;
  sourceUrl?: string;
  confidence: DataConfidence;
  /** % w/w; cannabinoids are totals (THCA already converted ×0.877) */
  percent: Amounts;
  /** Interquartile ranges from lab databases */
  ranges?: Partial<Record<CompoundId, [number, number]>>;
  producer?: string;
  batch?: string;
  testDate?: string;
  packagedDate?: string;
  notes?: string;
  dbSlug?: string;
  provenance?: Provenance;
  favorite?: boolean;
  prefs: StrainPrefs;
  customPlan?: CustomPlan;
  createdAt: string;
  updatedAt: string;
}

export interface BalloonRun {
  index: number;
  tempC: number;
  segments: Segment[];
  pumpSeconds: number;
  preheatSeconds: number;
  completedAt?: string;
}

export interface SessionRating {
  taste: number;
  smoothness: number;
  /** −1 too weak · 0 right · 1 too strong */
  strength: -1 | 0 | 1;
  notes?: string;
  adjustment?: string;
}

export interface SessionLog {
  id: string;
  startedAt: string;
  endedAt?: string;
  strainId?: string;
  strainName: string;
  balloonName: string;
  loadMg: number;
  goal: Goal | 'custom';
  runs: BalloonRun[];
  predictedThcMg?: number;
  rating?: SessionRating;
  demo?: boolean;
}

export interface AppSettings {
  unit: 'C' | 'F';
  maxPumpSeconds: number;
  defaultLoadMg: number;
  preheatSeconds: number;
  settleSeconds: number;
  minTempC: number;
  maxTempC: number;
  inhaleMinutes: number;
  heaterOffAtEnd: boolean;
  sounds: boolean;
  vibrate: boolean;
  demoSpeed: number;
  activeBalloonId?: string;
  model: ModelParams;
  /** The first-run tour was finished or skipped */
  tourDone?: boolean;
}
