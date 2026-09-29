import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDevice } from './device';
import { useLibrary } from './library';
import { useSession, type Phase, type RunPlan } from './session';

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Runs a store action while fake time advances (simulated BLE writes resolve after ~60 ms). */
async function act<T>(promise: Promise<T>, ms = 300): Promise<T> {
  await advance(ms);
  return promise;
}

async function until(pred: () => boolean, maxMs = 120_000, stepMs = 250) {
  for (let t = 0; t < maxMs; t += stepMs) {
    if (pred()) return;
    await advance(stepMs);
  }
  throw new Error(`condition not met; phase=${useSession.getState().phase}`);
}

const phase = () => useSession.getState().phase;
const pumpOn = () => useDevice.getState().pumpOn;
const heaterOn = () => useDevice.getState().heaterOn;
const waitPhase = (p: Phase, maxMs?: number) => until(() => phase() === p, maxMs);

describe('session runner with the simulated Volcano', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    useLibrary.setState((s) => ({ settings: { ...s.settings, settleSeconds: 2, heaterOffAtEnd: true, maxPumpSeconds: 90 } }));
    const connecting = useDevice.getState().connectDemo(10);
    await advance(600);
    await connecting;
    expect(useDevice.getState().status).toBe('connected');
  });

  afterEach(async () => {
    useSession.getState().dismiss();
    await act(useDevice.getState().disconnect(), 100);
    vi.useRealTimers();
  }, 30_000);

  it('one tap per balloon: pre-heat flows straight into a timed fill, then a two-step balloon, then everything off', async () => {
    const plan: RunPlan = {
      balloons: [
        { segments: [{ tempC: 180, seconds: 10 }], preheatSeconds: 2 },
        { segments: [{ tempC: 190, seconds: 8 }, { tempC: 200, seconds: 4 }], preheatSeconds: 0 },
      ],
      strainName: 'Test',
      balloonName: 'Test balloon',
      loadMg: 200,
      goal: 'custom',
    };
    expect(await act(useSession.getState().start(plan))).toBe(true);
    expect(heaterOn()).toBe(true);
    await waitPhase('ready');
    expect(useDevice.getState().currentC).toBeGreaterThanOrEqual(179);

    await act(useSession.getState().confirm(), 100); // the only tap: pre-heat starts
    expect(phase()).toBe('preheat');
    expect(pumpOn()).toBe(true);
    await waitPhase('filling', 5000); // no confirmation needed — the fill starts at the beep
    expect(pumpOn()).toBe(true);
    expect(useSession.getState().cueUntil).toBeGreaterThan(Date.now());
    // 10 s fill + 1 s reaction allowance (2 s, capped at 10 % of the fill)
    await advance(10_600);
    expect(phase()).toBe('filling');
    expect(pumpOn()).toBe(true);
    await advance(800);
    expect(phase()).toBe('inhale');
    expect(pumpOn()).toBe(false);
    expect(useDevice.getState().targetC).toBe(190); // next balloon pre-heats during the inhale countdown

    await act(useSession.getState().confirm(), 100); // the only tap for balloon 2
    expect(phase()).toBe('heating');
    expect(useSession.getState().armed).toBe(true);
    const seen = new Set<Phase>();
    await until(() => {
      seen.add(phase());
      return phase() === 'filling';
    }, 60_000);
    expect(seen.has('ready')).toBe(false); // fills as soon as 190 °C is reached — no second tap
    expect(useSession.getState().armed).toBe(false);
    expect(pumpOn()).toBe(true);
    await waitPhase('stepHeat', 10_000);
    expect(pumpOn()).toBe(false); // pump pauses while heating to the next step
    expect(useDevice.getState().targetC).toBe(200);
    await waitPhase('filling', 60_000);
    expect(pumpOn()).toBe(true);
    await waitPhase('done', 10_000);
    expect(pumpOn()).toBe(false);
    expect(heaterOn()).toBe(false);

    const log = useLibrary.getState().sessions.find((x) => x.id === useSession.getState().logId);
    expect(log?.runs.every((r) => r.completedAt)).toBe(true);
    expect(log?.endedAt).toBeTruthy();
  }, 30_000);

  it('a later balloon with pre-heat also needs just the one tap', async () => {
    await act(
      useSession.getState().start({
        balloons: [
          { segments: [{ tempC: 180, seconds: 4 }], preheatSeconds: 0 },
          { segments: [{ tempC: 186, seconds: 4 }], preheatSeconds: 2 },
        ],
        strainName: 'T',
        balloonName: 'B',
        loadMg: 100,
        goal: 'custom',
      }),
    );
    await waitPhase('ready');
    await act(useSession.getState().confirm(), 100);
    await waitPhase('inhale', 20_000);
    await act(useSession.getState().confirm(), 100);
    await waitPhase('preheat', 60_000);
    expect(pumpOn()).toBe(true);
    await waitPhase('filling', 5_000);
    await waitPhase('done', 20_000);
    expect(pumpOn()).toBe(false);
  }, 30_000);

  it('continuous pumping never exceeds pre-heat + fill + allowance', async () => {
    await act(
      useSession.getState().start({
        balloons: [{ segments: [{ tempC: 175, seconds: 20 }], preheatSeconds: 3 }],
        strainName: 'T',
        balloonName: 'B',
        loadMg: 100,
        goal: 'custom',
      }),
    );
    await waitPhase('ready');
    const started = Date.now();
    await act(useSession.getState().confirm(), 100);
    await until(() => !pumpOn() && phase() === 'done', 40_000);
    const pumped = Date.now() - started;
    expect(pumped).toBeGreaterThan(3_000 + 20_000);
    expect(pumped).toBeLessThan(3_000 + 20_000 + 2_000 + 800);
  }, 30_000);

  it('resumes an interrupted fill with only the remaining seconds (no over-filling)', async () => {
    await act(
      useSession.getState().start({
        balloons: [{ segments: [{ tempC: 185, seconds: 12 }], preheatSeconds: 0 }],
        strainName: 'T',
        balloonName: 'B',
        loadMg: 100,
        goal: 'custom',
      }),
    );
    await waitPhase('ready');
    await act(useSession.getState().confirm(), 100);
    await advance(3_900);
    await act(useSession.getState().pause(), 100);
    expect(pumpOn()).toBe(false);
    const left = useSession.getState().partialMs ?? 0;
    expect(left).toBeGreaterThan(7_500);
    expect(left).toBeLessThan(8_500);

    await act(useSession.getState().confirm(), 100); // resume → heating → ready
    await waitPhase('ready');
    const started = Date.now();
    await act(useSession.getState().confirm(), 100); // continue filling
    expect(phase()).toBe('filling');
    await waitPhase('done', 20_000);
    expect(Date.now() - started).toBeLessThan(left + 600);
    expect(pumpOn()).toBe(false);
  }, 30_000);

  it('quick fill keeps the heater on afterwards', async () => {
    await act(
      useSession.getState().start(
        { balloons: [{ segments: [{ tempC: 180, seconds: 5 }], preheatSeconds: 0 }], strainName: 'Quick', balloonName: 'B', loadMg: 0, goal: 'custom' },
        { quick: true },
      ),
    );
    await waitPhase('done', 60_000);
    expect(pumpOn()).toBe(false);
    expect(heaterOn()).toBe(true);
  }, 30_000);
});
