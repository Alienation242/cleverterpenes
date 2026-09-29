import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type { AppSettings, BalloonProfile, SessionLog, StrainEntry, StrainPrefs } from '../data/types';
import { DEFAULT_MODEL } from '../science/releaseModel';
import { fillPlan, learnFromCalibrations, summarizeCalibrations, type FillPlan } from '../science/balloon';

/** Storage key used before the app was named cleverTerpenes; read once as a fallback. */
const LEGACY_KEY = 'terpstep-library';

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? (await get<string>(LEGACY_KEY)) ?? null,
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const now = () => new Date().toISOString();

export const DEFAULT_SETTINGS: AppSettings = {
  unit: 'C',
  maxPumpSeconds: 90,
  defaultLoadMg: 200,
  preheatSeconds: 0,
  settleSeconds: 5,
  minTempC: 160,
  maxTempC: 230,
  inhaleMinutes: 10,
  heaterOffAtEnd: true,
  sounds: true,
  vibrate: true,
  demoSpeed: 1,
  model: DEFAULT_MODEL,
};

export const DEFAULT_PREFS: StrainPrefs = { firstOffsetC: 0, laterOffsetC: 0 };

const starterBalloon = (): BalloonProfile => ({
  id: newId(),
  name: 'Easy Valve (standard)',
  kind: 'easyValve',
  calibrations: [],
  fillPercent: 80,
  createdAt: now(),
});

export interface ExportFile {
  app: 'cleverterpenes' | 'terpstep';
  version: 1;
  exportedAt: string;
  strains: StrainEntry[];
  balloons: BalloonProfile[];
  sessions: SessionLog[];
  settings: AppSettings;
}

interface LibraryState {
  strains: StrainEntry[];
  balloons: BalloonProfile[];
  sessions: SessionLog[];
  settings: AppSettings;
  hydrated: boolean;
  addStrain(entry: Omit<StrainEntry, 'id' | 'createdAt' | 'updatedAt' | 'prefs'> & { prefs?: Partial<StrainPrefs> }): string;
  updateStrain(id: string, patch: Partial<StrainEntry>): void;
  updateStrainPrefs(id: string, patch: Partial<StrainPrefs>): void;
  deleteStrain(id: string): void;
  addBalloon(b: Omit<BalloonProfile, 'id' | 'createdAt' | 'calibrations'>): string;
  updateBalloon(id: string, patch: Partial<BalloonProfile>): void;
  deleteBalloon(id: string): void;
  addCalibration(id: string, seconds: number): { drift?: string };
  clearCalibrations(id: string): void;
  logSession(s: SessionLog): void;
  updateSession(id: string, patch: Partial<SessionLog>): void;
  deleteSession(id: string): void;
  updateSettings(patch: Partial<AppSettings>): void;
  exportAll(): ExportFile;
  importAll(data: ExportFile, mode: 'merge' | 'replace'): void;
}

const mergeById = <T extends { id: string }>(a: T[], b: T[]) => {
  const map = new Map(a.map((x) => [x.id, x]));
  b.forEach((x) => map.set(x.id, x));
  return [...map.values()];
};

export const useLibrary = create<LibraryState>()(
  persist(
    (setState, getState) => ({
      strains: [],
      balloons: [starterBalloon()],
      sessions: [],
      settings: DEFAULT_SETTINGS,
      hydrated: false,

      addStrain(entry) {
        const id = newId();
        const t = now();
        setState((s) => ({
          strains: [{ ...entry, id, createdAt: t, updatedAt: t, prefs: { ...DEFAULT_PREFS, ...entry.prefs } }, ...s.strains],
        }));
        return id;
      },
      updateStrain(id, patch) {
        setState((s) => ({ strains: s.strains.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: now() } : x)) }));
      },
      updateStrainPrefs(id, patch) {
        setState((s) => ({
          strains: s.strains.map((x) => (x.id === id ? { ...x, prefs: { ...x.prefs, ...patch }, updatedAt: now() } : x)),
        }));
      },
      deleteStrain(id) {
        setState((s) => ({ strains: s.strains.filter((x) => x.id !== id) }));
      },

      addBalloon(b) {
        const id = newId();
        setState((s) => ({ balloons: [...s.balloons, { ...b, id, calibrations: [], createdAt: now() }] }));
        return id;
      },
      updateBalloon(id, patch) {
        setState((s) => ({ balloons: s.balloons.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      deleteBalloon(id) {
        setState((s) => ({
          balloons: s.balloons.filter((x) => x.id !== id),
          settings: s.settings.activeBalloonId === id ? { ...s.settings, activeBalloonId: undefined } : s.settings,
        }));
      },
      addCalibration(id, seconds) {
        const b = getState().balloons.find((x) => x.id === id);
        if (!b) return {};
        const calibrations = [...b.calibrations, { at: now(), seconds: Math.round(seconds * 10) / 10 }];
        const summary = summarizeCalibrations(calibrations);
        getState().updateBalloon(id, { calibrations, fullTimeS: summary.fullTimeS });
        return { drift: summary.drift };
      },
      clearCalibrations(id) {
        getState().updateBalloon(id, { calibrations: [], fullTimeS: undefined });
      },

      logSession(s) {
        setState((st) => ({ sessions: [s, ...st.sessions].slice(0, 500) }));
      },
      updateSession(id, patch) {
        setState((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      deleteSession(id) {
        setState((st) => ({ sessions: st.sessions.filter((x) => x.id !== id) }));
      },

      updateSettings(patch) {
        setState((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      exportAll() {
        const { strains, balloons, sessions, settings } = getState();
        return { app: 'cleverterpenes', version: 1, exportedAt: now(), strains, balloons, sessions, settings };
      },
      importAll(data, mode) {
        if (data?.app !== 'cleverterpenes' && data?.app !== 'terpstep') throw new Error('This is not a cleverTerpenes backup file.');
        setState((s) =>
          mode === 'replace'
            ? {
                strains: data.strains ?? [],
                balloons: data.balloons?.length ? data.balloons : [starterBalloon()],
                sessions: data.sessions ?? [],
                settings: { ...DEFAULT_SETTINGS, ...data.settings, model: { ...DEFAULT_MODEL, ...data.settings?.model } },
              }
            : {
                strains: mergeById(s.strains, data.strains ?? []),
                balloons: mergeById(s.balloons, data.balloons ?? []),
                sessions: mergeById(s.sessions, data.sessions ?? []),
              },
        );
      },
    }),
    {
      name: 'cleverterpenes-library',
      version: 2,
      // v2: the "balloon attached" confirmation is gone, so pre-heat defaults to 0 (attach the balloon before Start).
      migrate: (persisted, version) => {
        const p = persisted as Partial<LibraryState> | undefined;
        if (version < 2 && p?.settings?.preheatSeconds === 5) p.settings.preheatSeconds = 0;
        return p as LibraryState;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ strains, balloons, sessions, settings }) => ({ strains, balloons, sessions, settings }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LibraryState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...p.settings, model: { ...DEFAULT_MODEL, ...p.settings?.model } },
          balloons: p.balloons?.length ? p.balloons : current.balloons,
        };
      },
      onRehydrateStorage: () => () => {
        useLibrary.setState({ hydrated: true });
      },
    },
  ),
);

export function activeBalloon(state: Pick<LibraryState, 'balloons' | 'settings'>): BalloonProfile | undefined {
  return state.balloons.find((b) => b.id === state.settings.activeBalloonId) ?? state.balloons[0];
}

/** What the user's calibrated balloons teach the geometry model (null until one is calibrated). */
export function learningOf(state: Pick<LibraryState, 'balloons' | 'settings'>) {
  return learnFromCalibrations(state.balloons, state.settings.model.flowLpm);
}

/** Fill plan for a balloon using flow, pump limit and everything learned from calibrations. */
export function fillPlanFor(state: Pick<LibraryState, 'balloons' | 'settings'>, balloon: BalloonProfile): FillPlan {
  return fillPlan(balloon, state.settings.model.flowLpm, state.settings.maxPumpSeconds, learningOf(state));
}
