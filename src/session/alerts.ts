import { useLibrary } from '../store/library';

let ctx: AudioContext | null = null;

/** Short beeps for phase changes (ready, attach balloon, done). */
export function beep(pattern: 'ready' | 'attach' | 'done' | 'warn' = 'ready') {
  const { sounds, vibrate } = useLibrary.getState().settings;
  if (vibrate && 'vibrate' in navigator) {
    navigator.vibrate(pattern === 'attach' ? [120, 80, 120, 80, 120] : pattern === 'warn' ? [400] : [150, 100, 150]);
  }
  if (!sounds) return;
  try {
    ctx ??= new AudioContext();
    const tones = { ready: [880, 1175], attach: [988, 988, 988], done: [1175, 880, 660], warn: [330, 262] }[pattern];
    let t = ctx.currentTime + 0.02;
    for (const f of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
      t += 0.22;
    }
  } catch {
    // Audio is optional.
  }
}

let wakeLock: WakeLockSentinel | null = null;

export async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    // Wake lock is best effort (denied on battery saver, unsupported browsers).
  }
}

/**
 * Precise timer in a Web Worker: main-thread timers are throttled in background tabs,
 * which must never delay switching the pump off.
 */
export class WorkerTimer {
  private worker: Worker | null = null;
  private fallback?: ReturnType<typeof setTimeout>;

  constructor(private readonly onFire: () => void) {
    try {
      const src = 'let t;onmessage=(e)=>{clearTimeout(t);if(e.data>0)t=setTimeout(()=>postMessage(1),e.data)}';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.onFire();
    } catch {
      this.worker = null;
    }
  }

  schedule(ms: number) {
    this.cancel();
    if (this.worker) this.worker.postMessage(Math.max(1, ms));
    else this.fallback = setTimeout(this.onFire, Math.max(1, ms));
  }

  cancel() {
    this.worker?.postMessage(0);
    if (this.fallback) clearTimeout(this.fallback);
    this.fallback = undefined;
  }
}
