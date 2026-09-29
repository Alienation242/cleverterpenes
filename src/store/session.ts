// Session runner: drives the Volcano balloon by balloon.
//
//   heating → ready (user places chamber + balloon, taps Start) → [preheat → beep] → filling
//   → [stepHeat → filling …] → inhale (the Volcano heats for the next balloon)
//   → tap "Fill balloon N" → heating → [preheat → beep] → filling … → done
//
// One tap per balloon: after an optional pre-heat the fill continues automatically — the app
// assumes the balloon is attached (a beep is the cue) and adds a short reaction allowance.
// The tap after inhaling arms the runner, so the next balloon fills as soon as its temperature
// is reached without a second confirmation.
//
// Safety rules:
// - The pump is switched with explicit on/off writes, never toggles; pump-off is retried and verified.
// - The fill clock runs in a Web Worker so background-tab throttling cannot delay pump-off.
// - Losing the connection while pumping raises a loud error telling the user to press AIR.
// - An absolute limit stops any continuous pumping that runs longer than planned.

import { create } from 'zustand';
import type { Goal } from '../science/planner';
import type { Segment } from '../science/releaseModel';
import type { BalloonRun } from '../data/types';
import { beep, keepAwake, WorkerTimer } from '../session/alerts';
import { useDevice } from './device';
import { newId, useLibrary } from './library';

export type Phase =
  | 'idle'
  | 'heating'
  | 'ready'
  | 'preheat'
  | 'filling'
  | 'stepHeat'
  | 'inhale'
  | 'paused'
  | 'done'
  | 'error';

export interface RunBalloon {
  segments: Segment[];
  preheatSeconds: number;
  predictedThcMg?: number;
  aroma?: string;
}

export interface RunPlan {
  balloons: RunBalloon[];
  strainId?: string;
  strainName: string;
  balloonName: string;
  loadMg: number;
  goal: Goal | 'custom';
  predictedThcMg?: number;
}

interface SessionState {
  plan: RunPlan | null;
  phase: Phase;
  balloonIndex: number;
  segmentIndex: number;
  phaseStartedAt: number;
  deadline?: number;
  pumpStartedAt?: number;
  reachedAt?: number;
  message?: string;
  logId?: string;
  quick: boolean;
  /** Remaining fill time (ms) of the current step after a mid-fill pause */
  partialMs?: number;
  /** Show the "attach the balloon now" cue until this time (after a pre-heat) */
  cueUntil?: number;
  /** The user already tapped for this balloon: start it as soon as the temperature is reached */
  armed?: boolean;
  start(plan: RunPlan, opts?: { quick?: boolean }): Promise<boolean>;
  confirm(): Promise<void>;
  pause(message?: string): Promise<void>;
  skip(): Promise<void>;
  stop(): Promise<void>;
  dismiss(): void;
}

/** Reaction time to attach the balloon after the pre-heat beep (max 10 % of the fill). */
const ATTACH_ALLOWANCE_S = 2;
const ACTIVE: Phase[] = ['heating', 'ready', 'preheat', 'filling', 'stepHeat', 'inhale', 'paused'];
const PUMPING: Phase[] = ['preheat', 'filling'];

export const isActivePhase = (p: Phase) => ACTIVE.includes(p);

let ticker: ReturnType<typeof setInterval> | undefined;
let timer: WorkerTimer | null = null;
let busy = false;
let rerun = false;
let lastHeaterAttempt = 0;
let lastPumpOffAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const settings = () => useLibrary.getState().settings;
const dev = () => useDevice.getState();

function getTimer() {
  timer ??= new WorkerTimer(() => void tick());
  return timer;
}

function startTicker() {
  if (!ticker) ticker = setInterval(() => void tick(), 250);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = undefined;
  timer?.cancel();
}

async function pump(on: boolean): Promise<boolean> {
  const attempts = on ? 1 : 4;
  for (let i = 0; i < attempts; i++) {
    if (await dev().run(on ? 'start the pump' : 'stop the pump', (d) => d.setPump(on))) {
      if (!on) lastPumpOffAt = Date.now();
      return true;
    }
    await sleep(300);
  }
  return false;
}

/** A pump-on write that timed out may still have reached the device — switch it off to be safe. */
async function pumpOnOrAbort(message: string): Promise<boolean> {
  if (await pump(true)) return true;
  await pump(false);
  useSession.setState({ phase: 'paused', pumpStartedAt: undefined, message });
  return false;
}

function currentSegment(s: SessionState): Segment {
  const b = s.plan!.balloons[s.balloonIndex];
  return b.segments[Math.min(s.segmentIndex, b.segments.length - 1)];
}

function updateLog(patch: (runs: BalloonRun[]) => BalloonRun[], extra: Record<string, unknown> = {}) {
  const { logId, quick } = useSession.getState();
  if (!logId || quick) return;
  const lib = useLibrary.getState();
  const log = lib.sessions.find((x) => x.id === logId);
  if (log) lib.updateSession(logId, { runs: patch(log.runs), ...extra });
}

async function startFilling(durationMs?: number) {
  const s = useSession.getState();
  const ms = durationMs ?? currentSegment(s).seconds * 1000;
  if (!(await pumpOnOrAbort('The pump did not start. Check the connection and tap Resume.'))) return;
  const t = Date.now();
  useSession.setState({
    phase: 'filling',
    phaseStartedAt: t,
    deadline: t + ms,
    pumpStartedAt: useSession.getState().pumpStartedAt ?? t,
    reachedAt: undefined,
    message: undefined,
    partialMs: undefined,
    cueUntil: undefined,
  });
  getTimer().schedule(ms);
}

/** Starts the current balloon: the optional pre-heat (the fill follows at the beep) or the fill itself. */
async function beginBalloon() {
  const s = useSession.getState();
  const b = s.plan!.balloons[s.balloonIndex];
  useSession.setState({ armed: false });
  if (s.partialMs && s.partialMs > 300) {
    await startFilling(s.partialMs);
    return;
  }
  if (b.preheatSeconds > 0) {
    if (!(await pumpOnOrAbort('The pump did not start. Check the connection and tap Resume.'))) return;
    const started = Date.now();
    useSession.setState({ phase: 'preheat', phaseStartedAt: started, deadline: started + b.preheatSeconds * 1000, pumpStartedAt: started });
    getTimer().schedule(b.preheatSeconds * 1000);
  } else {
    await startFilling();
  }
}

async function finishSession(message?: string) {
  const s = useSession.getState();
  getTimer().cancel();
  if (!s.quick && settings().heaterOffAtEnd && dev().status === 'connected') {
    await dev().run('turn the heater off', (d) => d.setHeater(false));
  }
  updateLog((runs) => runs, { endedAt: new Date().toISOString() });
  useSession.setState({ phase: 'done', deadline: undefined, pumpStartedAt: undefined, reachedAt: undefined, armed: false, message });
  stopTicker();
  void keepAwake(false);
  dev().driver?.setFastPolling(false);
  beep('done');
}

async function finishSegment() {
  getTimer().cancel();
  if (!(await pump(false))) {
    useSession.setState({
      phase: 'error',
      message: 'Could not switch the pump off! Press AIR on the Volcano now.',
      pumpStartedAt: undefined,
    });
    beep('warn');
    return;
  }
  const s = useSession.getState();
  const plan = s.plan!;
  const balloon = plan.balloons[s.balloonIndex];
  const t = Date.now();
  if (s.segmentIndex < balloon.segments.length - 1) {
    const next = balloon.segments[s.segmentIndex + 1];
    await dev().run('set the temperature', (d) => d.setTargetTemp(next.tempC));
    useSession.setState({ phase: 'stepHeat', segmentIndex: s.segmentIndex + 1, phaseStartedAt: t, pumpStartedAt: undefined, reachedAt: undefined });
    return;
  }
  const index = s.balloonIndex;
  updateLog((runs) => runs.map((r) => (r.index === index ? { ...r, completedAt: new Date().toISOString() } : r)));
  if (s.quick) {
    await finishSession(`Balloon filled — inhale within ${settings().inhaleMinutes} minutes.`);
    return;
  }
  if (index >= plan.balloons.length - 1) {
    useSession.setState({ pumpStartedAt: undefined });
    await finishSession();
    return;
  }
  const nextTemp = plan.balloons[index + 1].segments[0].tempC;
  await dev().run('set the temperature', (d) => d.setTargetTemp(nextTemp));
  useSession.setState({
    phase: 'inhale',
    phaseStartedAt: t,
    deadline: t + settings().inhaleMinutes * 60_000,
    pumpStartedAt: undefined,
    segmentIndex: 0,
    reachedAt: undefined,
  });
  beep('done');
}

async function tick(): Promise<void> {
  if (busy) {
    rerun = true;
    return;
  }
  busy = true;
  try {
    await step();
  } finally {
    busy = false;
    if (rerun) {
      rerun = false;
      void tick();
    }
  }
}

async function step() {
  const s = useSession.getState();
  if (!s.plan || !isActivePhase(s.phase)) return;
  const d = dev();
  const t = Date.now();

  if (d.status !== 'connected') {
    if (PUMPING.includes(s.phase)) {
      getTimer().cancel();
      useSession.setState({
        phase: 'error',
        pumpStartedAt: undefined,
        partialMs: s.phase === 'filling' && s.deadline ? Math.max(0, s.deadline - t) : undefined,
        message: 'Connection lost while the pump was running. If the Volcano is still pumping, press AIR on the device.',
      });
      beep('warn');
    } else if (s.phase !== 'paused' && s.phase !== 'inhale') {
      useSession.setState({ phase: 'paused', message: 'Waiting for the Volcano connection…' });
    }
    return;
  }

  // Absolute safety net for continuous pumping.
  if (s.pumpStartedAt) {
    const b = s.plan.balloons[s.balloonIndex];
    const limit = (b.preheatSeconds + ATTACH_ALLOWANCE_S + settings().maxPumpSeconds + 10) * 1000;
    if (t - s.pumpStartedAt > limit) {
      await pump(false);
      useSession.setState({ phase: 'paused', pumpStartedAt: undefined, message: 'Pump safety limit reached — pump stopped.' });
      beep('warn');
      return;
    }
  }

  // Verify a runner-initiated pump-off actually took effect (notifications can be lost).
  if (!PUMPING.includes(s.phase) && d.pumpOn && lastPumpOffAt && t - lastPumpOffAt > 1500 && t - lastPumpOffAt < 8000) {
    lastPumpOffAt = 0;
    await pump(false);
    return;
  }

  switch (s.phase) {
    case 'ready':
      // Device auto-off (or someone at the device) switched the heater off while waiting.
      if (!d.heaterOn) useSession.setState({ phase: 'heating', reachedAt: undefined });
      return;
    case 'heating':
    case 'stepHeat': {
      const target = currentSegment(s).tempC;
      if (!d.heaterOn) {
        if (t - lastHeaterAttempt > 4000) {
          lastHeaterAttempt = t;
          await d.run('turn the heater on', (x) => x.setHeater(true));
        }
        return;
      }
      if (d.targetC !== undefined && d.targetC !== target && t - lastHeaterAttempt > 3000) {
        lastHeaterAttempt = t;
        await d.run('set the temperature', (x) => x.setTargetTemp(target));
        return;
      }
      // Within −1…+4 °C of the step: also waits for cooling when a custom plan steps down.
      const reached = d.currentC !== undefined && d.currentC >= target - 1 && d.currentC <= target + 4;
      if (!reached) {
        if (s.reachedAt) useSession.setState({ reachedAt: undefined });
        return;
      }
      if (!s.reachedAt) {
        useSession.setState({ reachedAt: t });
        return;
      }
      const settleMs = (s.phase === 'stepHeat' || s.quick || s.armed ? 1 : settings().settleSeconds) * 1000;
      if (t - s.reachedAt < settleMs) return;
      if (s.phase === 'stepHeat') {
        await startFilling();
      } else if (s.quick) {
        await startFilling();
      } else if (s.armed) {
        await beginBalloon();
      } else {
        useSession.setState({ phase: 'ready', phaseStartedAt: t, reachedAt: undefined, message: undefined });
        beep('ready');
      }
      return;
    }
    case 'preheat':
      if (s.deadline && t >= s.deadline) {
        // The pump keeps running: attach the balloon at the beep, the fill clock starts right away.
        const seg = currentSegment(s);
        const ms = seg.seconds * 1000 + Math.min(ATTACH_ALLOWANCE_S * 1000, seg.seconds * 100);
        useSession.setState({ phase: 'filling', phaseStartedAt: t, deadline: t + ms, cueUntil: t + 5000 });
        getTimer().schedule(ms);
        beep('attach');
      }
      return;
    case 'filling':
      if (s.deadline && t >= s.deadline) await finishSegment();
      return;
    default:
      return;
  }
}

export const useSession = create<SessionState>()((set, get) => ({
  plan: null,
  phase: 'idle',
  balloonIndex: 0,
  segmentIndex: 0,
  phaseStartedAt: 0,
  quick: false,

  async start(plan, opts = {}) {
    if (isActivePhase(get().phase)) return false;
    if (dev().status !== 'connected' || !plan.balloons.length) return false;
    const quick = !!opts.quick;
    let logId: string | undefined;
    if (!quick) {
      logId = newId();
      useLibrary.getState().logSession({
        id: logId,
        startedAt: new Date().toISOString(),
        strainId: plan.strainId,
        strainName: plan.strainName,
        balloonName: plan.balloonName,
        loadMg: plan.loadMg,
        goal: plan.goal,
        predictedThcMg: plan.predictedThcMg,
        demo: dev().mode === 'demo',
        runs: plan.balloons.map((b, index) => ({
          index,
          tempC: Math.max(...b.segments.map((x) => x.tempC)),
          segments: b.segments,
          pumpSeconds: b.segments.reduce((a, x) => a + x.seconds, 0),
          preheatSeconds: b.preheatSeconds,
        })),
      });
    }
    set({
      plan,
      phase: 'heating',
      balloonIndex: 0,
      segmentIndex: 0,
      phaseStartedAt: Date.now(),
      deadline: undefined,
      pumpStartedAt: undefined,
      reachedAt: undefined,
      message: undefined,
      logId,
      quick,
      partialMs: undefined,
      armed: false,
    });
    const first = plan.balloons[0].segments[0].tempC;
    await dev().run('set the temperature', (d) => d.setTargetTemp(first));
    await dev().run('turn the heater on', (d) => d.setHeater(true));
    lastHeaterAttempt = Date.now();
    dev().driver?.setFastPolling(true);
    void keepAwake(true);
    startTicker();
    return true;
  },

  async confirm() {
    const s = get();
    if (!s.plan) return;
    const t = Date.now();
    switch (s.phase) {
      case 'ready':
        await beginBalloon();
        return;
      case 'inhale':
        // The balloon is back on: fill as soon as the next temperature is reached — no second tap.
        set({ balloonIndex: s.balloonIndex + 1, segmentIndex: 0, phase: 'heating', phaseStartedAt: t, deadline: undefined, reachedAt: undefined, armed: true });
        return;
      case 'paused':
      case 'error':
        if (dev().status !== 'connected') return;
        // After a mid-fill pause keep the step (and its remaining time); otherwise restart the balloon.
        // Either way the user confirms again with Start once the temperature is back.
        set({
          phase: 'heating',
          segmentIndex: s.partialMs ? s.segmentIndex : 0,
          phaseStartedAt: t,
          message: undefined,
          reachedAt: undefined,
          deadline: undefined,
          armed: false,
        });
        startTicker();
        return;
      default:
        return;
    }
  },

  async pause(message = 'Paused.') {
    const s = get();
    if (!isActivePhase(s.phase)) return;
    getTimer().cancel();
    const partialMs = s.phase === 'filling' && s.deadline ? Math.max(0, s.deadline - Date.now()) : undefined;
    if (PUMPING.includes(s.phase)) await pump(false);
    set({ phase: 'paused', pumpStartedAt: undefined, deadline: undefined, message, partialMs, armed: false });
  },

  async skip() {
    const s = get();
    if (!s.plan || !isActivePhase(s.phase)) return;
    getTimer().cancel();
    if (PUMPING.includes(s.phase)) await pump(false);
    // While enjoying balloon N the current balloon is already done, so "skip" drops the next one.
    const target = s.balloonIndex + (s.phase === 'inhale' ? 2 : 1);
    if (target > s.plan.balloons.length - 1) {
      await finishSession('Session ended early.');
      return;
    }
    const next = s.plan.balloons[target].segments[0].tempC;
    await dev().run('set the temperature', (d) => d.setTargetTemp(next));
    set({ balloonIndex: target, segmentIndex: 0, phase: 'heating', phaseStartedAt: Date.now(), pumpStartedAt: undefined, deadline: undefined, reachedAt: undefined, partialMs: undefined, armed: false });
  },

  async stop() {
    const s = get();
    getTimer().cancel();
    if (dev().status === 'connected') await pump(false);
    if (s.plan && isActivePhase(s.phase)) {
      await finishSession('Session stopped.');
    } else {
      stopTicker();
      set({ phase: 'idle', plan: null });
    }
  },

  dismiss() {
    stopTicker();
    void keepAwake(false);
    set({ phase: 'idle', plan: null, message: undefined, deadline: undefined, pumpStartedAt: undefined, reachedAt: undefined, partialMs: undefined, armed: false });
  },
}));

// Best effort: stop the pump if the page is closed mid-fill.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const s = useSession.getState();
    if (PUMPING.includes(s.phase)) void dev().driver?.setPump(false);
  });
}
