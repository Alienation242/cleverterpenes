import { useEffect, useState, type ReactNode } from 'react';
import { useDevice } from '../store/device';
import { useLibrary } from '../store/library';
import { isActivePhase, useSession, type Phase } from '../store/session';
import { adjustmentFromRating, applyAdjustment } from '../session/feedback';
import { balloonRetention } from '../science/releaseModel';
import { Button, Callout, ProgressBar, Segmented, cx } from '../ui/primitives';
import { fmtClock, fmtTemp } from '../ui/format';
import { go } from '../ui/route';

function useNow(active: boolean, ms = 200) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Idle',
  heating: 'Heating',
  ready: 'Ready',
  preheat: 'Pre-heating',
  filling: 'Filling',
  stepHeat: 'Next step heating',
  inhale: 'Enjoy',
  paused: 'Paused',
  done: 'Done',
  error: 'Attention',
};

function RatingForm() {
  const { logId, plan } = useSession();
  const lib = useLibrary();
  const [taste, setTaste] = useState(3);
  const [smooth, setSmooth] = useState(3);
  const [strength, setStrength] = useState<'-1' | '0' | '1'>('0');
  const [saved, setSaved] = useState<string | null>(null);
  const log = lib.sessions.find((s) => s.id === logId);
  if (!log || !plan) return null;
  if (log.rating || saved) {
    return <Callout tone="good">Rating saved. {saved ?? log.rating?.adjustment}</Callout>;
  }
  const Scale = ({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) => (
    <div>
      <div className="mb-1 text-xs text-ink-3">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-label={`${label} ${n} of 5`}
            className={cx('h-10 flex-1 rounded-lg text-sm font-medium', n <= value ? 'bg-ink text-black' : 'bg-field text-ink-3')}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
  const save = () => {
    const rating = { taste, smoothness: smooth, strength: Number(strength) as -1 | 0 | 1 };
    const adj = adjustmentFromRating(rating);
    lib.updateSession(log.id, { rating: { ...rating, adjustment: adj.text } });
    const strain = lib.strains.find((s) => s.id === plan.strainId);
    if (strain && (adj.firstC || adj.laterC)) {
      lib.updateStrainPrefs(strain.id, applyAdjustment(strain.prefs, adj));
      setSaved(`Next plan for ${strain.name}: ${adj.text}.`);
    } else setSaved(adj.text);
  };
  return (
    <div className="space-y-3 rounded-xl bg-raised p-4">
      <div className="font-semibold">How was it?</div>
      <Scale label="Taste / flavour" value={taste} onChange={setTaste} />
      <Scale label="Smoothness (1 = harsh)" value={smooth} onChange={setSmooth} />
      <div>
        <div className="mb-1 text-xs text-ink-3">Strength</div>
        <Segmented
          value={strength}
          onChange={setStrength}
          options={[
            { value: '-1', label: 'Too weak' },
            { value: '0', label: 'Just right' },
            { value: '1', label: 'Too strong' },
          ]}
        />
      </div>
      <Button variant="primary" onClick={save}>
        Save rating
      </Button>
      <p className="text-xs text-ink-3">Your ratings nudge the next plan for this strain by a few degrees.</p>
    </div>
  );
}

export function SessionRunner({ compact = false }: { compact?: boolean }) {
  const s = useSession();
  const dev = useDevice();
  const settings = useLibrary((x) => x.settings);
  const active = isActivePhase(s.phase);
  const now = useNow(active || s.phase === 'done');
  if (!s.plan) return null;
  const unit = settings.unit;
  const plan = s.plan;
  const b = plan.balloons[Math.min(s.balloonIndex, plan.balloons.length - 1)];
  const seg = b.segments[Math.min(s.segmentIndex, b.segments.length - 1)];
  const remaining = s.deadline ? s.deadline - now : 0;
  const total = plan.balloons.length;
  const target = seg.tempC;
  const heatProgress = dev.currentC !== undefined ? Math.min(1, Math.max(0, (dev.currentC - 25) / (target - 25))) : 0;
  const nextBalloon = plan.balloons[s.balloonIndex + 1];
  const cue = s.phase === 'filling' && !!s.cueUntil && now < s.cueUntil;

  let body: ReactNode = null;
  switch (s.phase) {
    case 'heating':
      body = (
        <>
          <div className="text-2xl font-semibold">
            {dev.currentC !== undefined && dev.currentC > target + 4 ? 'Cooling to' : 'Heating to'} {fmtTemp(target, unit)}
          </div>
          <div className="text-sm text-ink-2">
            Now {fmtTemp(dev.currentC, unit)}
            {s.reachedAt ? ' · settling…' : ''}.{' '}
            {s.armed
              ? b.preheatSeconds > 0
                ? `Then the pump pre-heats for ${b.preheatSeconds} s — put the balloon on when it beeps.`
                : 'Then the balloon fills by itself — keep it on.'
              : s.balloonIndex === 0
                ? 'Grind and load the filling chamber meanwhile.'
                : 'Stir the herb in the chamber if you like.'}
          </div>
          <ProgressBar value={heatProgress} tone="heat" className="mt-3" />
        </>
      );
      break;
    case 'ready':
      body = s.partialMs ? (
        <>
          <div className="text-2xl font-semibold">Continue filling at {fmtTemp(target, unit)}</div>
          <div className="text-sm text-ink-2">
            The fill was interrupted with {(s.partialMs / 1000).toFixed(1)} s left. Keep the same balloon on and tap Continue — only the rest is
            pumped.
          </div>
          <Button variant="heat" size="lg" className="mt-4 w-full" onClick={() => void s.confirm()}>
            Continue ({(s.partialMs / 1000).toFixed(1)} s)
          </Button>
        </>
      ) : (
        <>
          <div className="text-2xl font-semibold">{fmtTemp(target, unit)} reached</div>
          <div className="text-sm text-ink-2">
            {b.preheatSeconds > 0
              ? `Put the filling chamber on the Volcano, keep the balloon in your hand and tap Start. The pump pre-heats for ${b.preheatSeconds} s — when it beeps, put the balloon on. Filling continues by itself.`
              : 'Put the balloon on the filling chamber, place both on the Volcano and tap Start. The pump fills and stops by itself.'}
          </div>
          <Button variant="heat" size="lg" className="mt-4 w-full" onClick={() => void s.confirm()}>
            Start balloon {s.balloonIndex + 1}
          </Button>
        </>
      );
      break;
    case 'preheat':
      body = (
        <>
          <div className="text-2xl font-semibold">Pre-heating… {Math.ceil(remaining / 1000)} s</div>
          <div className="text-sm text-ink-2">Have the balloon ready — put it on when it beeps. No need to tap anything.</div>
          <ProgressBar value={1 - remaining / (b.preheatSeconds * 1000)} tone="air" className="mt-3" />
        </>
      );
      break;
    case 'filling': {
      const segTotal = seg.seconds * 1000;
      body = (
        <>
          {cue && <div className="mb-1 animate-pulse text-2xl font-bold text-air">Put the balloon on now</div>}
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-2xl font-semibold">Filling · {fmtTemp(target, unit)}</div>
            <div className="text-4xl font-bold tabular text-air">{Math.max(0, remaining / 1000).toFixed(1)}</div>
          </div>
          <div className="text-sm text-ink-2">
            {b.segments.length > 1 ? `Step ${s.segmentIndex + 1} of ${b.segments.length}. ` : ''}The pump stops by itself — keep the balloon on.
          </div>
          <ProgressBar value={1 - remaining / segTotal} tone="air" className="mt-3" />
        </>
      );
      break;
    }
    case 'stepHeat':
      body = (
        <>
          <div className="text-2xl font-semibold">Raising to {fmtTemp(target, unit)}</div>
          <div className="text-sm text-ink-2">Leave the balloon on — the next step fills automatically once the temperature is reached.</div>
          <ProgressBar value={heatProgress} tone="heat" className="mt-3" />
        </>
      );
      break;
    case 'inhale': {
      const minutesOld = (now - s.phaseStartedAt) / 60000;
      const loss = Math.round((1 - balloonRetention(minutesOld)) * 100);
      body = (
        <>
          <div className="text-2xl font-semibold">Balloon {s.balloonIndex + 1} ready — enjoy</div>
          <div className="text-sm text-ink-2">
            Inhale within <b className="tabular text-ink">{fmtClock(Math.max(0, remaining))}</b>
            {remaining < 0 ? ` (older than ${settings.inhaleMinutes} min — ~${loss} % of the THC already condensed)` : ''}. Pausing 5–15 min between balloons
            helps you judge the effect.
          </div>
          {nextBalloon && (
            <div className="mt-2 text-sm text-ink-3">
              Next: balloon {s.balloonIndex + 2} at {fmtTemp(nextBalloon.segments[0].tempC, unit)} — the Volcano is already heating.{' '}
              {nextBalloon.preheatSeconds > 0
                ? 'When you’re ready, put the filling chamber back on the Volcano, keep the balloon in your hand and tap below — it beeps when to put the balloon on.'
                : 'When you’re ready, put the balloon back on the filling chamber, place both on the Volcano and tap below — it fills by itself.'}
            </div>
          )}
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => void s.confirm()}>
            Fill balloon {s.balloonIndex + 2}
          </Button>
        </>
      );
      break;
    }
    case 'paused':
      body = (
        <>
          <div className="text-2xl font-semibold">Paused</div>
          {s.message && <div className="text-sm text-ink-2">{s.message}</div>}
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => void s.confirm()} disabled={dev.status !== 'connected'}>
            {s.partialMs ? `Resume (${(s.partialMs / 1000).toFixed(1)} s left)` : `Resume balloon ${s.balloonIndex + 1}`}
          </Button>
        </>
      );
      break;
    case 'error':
      body = (
        <>
          <Callout tone="critical" title="Check the Volcano">
            {s.message}
          </Callout>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void dev.run('stop the pump', (d) => d.setPump(false))}>
              Pump off
            </Button>
            {dev.status === 'connected' && (
              <Button variant="primary" onClick={() => void s.confirm()}>
                {s.partialMs ? `Resume (${(s.partialMs / 1000).toFixed(1)} s left)` : 'Resume'}
              </Button>
            )}
            <Button onClick={() => void s.stop()}>End session</Button>
          </div>
        </>
      );
      break;
    case 'done':
      body = (
        <>
          <div className="text-2xl font-semibold">{s.quick ? 'Balloon filled' : 'Session complete'}</div>
          {s.message && <div className="text-sm text-ink-2">{s.message}</div>}
          {!s.quick && !compact && (
            <div className="mt-3">
              <RatingForm />
            </div>
          )}
          <Button className="mt-3" onClick={() => s.dismiss()}>
            Close
          </Button>
        </>
      );
      break;
    default:
      body = null;
  }

  return (
    <div>
      {!s.quick && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-ink-2">
            <span className="font-semibold text-ink">{plan.strainName}</span> · balloon {Math.min(s.balloonIndex + 1, total)} of {total} ·{' '}
            {PHASE_LABEL[s.phase]}
          </div>
          <div className="text-xs text-ink-3">{plan.balloonName}</div>
        </div>
      )}
      <div className={cx('rounded-2xl border p-4', cue ? 'border-air bg-air/10' : 'border-white/10 bg-raised/60')}>{body}</div>
      {!s.quick && total > 1 && (
        <ol className="mt-3 flex flex-wrap gap-2" aria-label="Balloons">
          {plan.balloons.map((pb, i) => {
            const done = i < s.balloonIndex || (i === s.balloonIndex && (s.phase === 'inhale' || s.phase === 'done'));
            const current = i === s.balloonIndex && !done;
            return (
              <li
                key={i}
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-xs tabular',
                  done ? 'border-good/40 text-ink-2' : current ? 'border-heat bg-heat/15 text-ink' : 'border-line text-ink-3',
                )}
              >
                {done ? '✓ ' : ''}
                {fmtTemp(Math.max(...pb.segments.map((x) => x.tempC)), unit)} · {Math.round(pb.segments.reduce((a, x) => a + x.seconds, 0))} s
              </li>
            );
          })}
        </ol>
      )}
      {active && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.phase !== 'paused' && (
            <Button size="sm" onClick={() => void s.pause()}>
              Pause
            </Button>
          )}
          {!s.quick && total > 1 && (
            <Button size="sm" variant="ghost" onClick={() => void s.skip()}>
              Skip balloon
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => void s.stop()}>
            {s.quick ? 'Stop' : 'End session'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Compact bar shown on other tabs while a session runs. */
export function SessionBar() {
  const s = useSession();
  const now = useNow(true, 250);
  const unit = useLibrary((x) => x.settings.unit);
  if (!s.plan) return null;
  const b = s.plan.balloons[s.balloonIndex];
  const seg = b?.segments[Math.min(s.segmentIndex, b.segments.length - 1)];
  const remaining = s.deadline ? Math.max(0, s.deadline - now) : 0;
  const actionable = s.phase === 'ready' || s.phase === 'inhale' || s.phase === 'paused';
  const cue = s.phase === 'filling' && !!s.cueUntil && now < s.cueUntil;
  return (
    <div className="fixed inset-x-0 bottom-[68px] z-30 px-3 lg:bottom-4">
      <div
        className={cx(
          'mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl',
          cue ? 'border-air bg-[#0b2533]' : s.phase === 'error' ? 'border-critical bg-[#2a1212]' : 'border-white/10 bg-raised',
        )}
      >
        <button className="min-w-0 flex-1 text-left" onClick={() => go('plan')}>
          <div className="truncate text-sm font-semibold">
            {PHASE_LABEL[s.phase]}
            {seg ? ` · ${fmtTemp(seg.tempC, unit)}` : ''}
            {cue ? ' · put the balloon on' : ''}
            {s.phase === 'filling' || s.phase === 'preheat' ? ` · ${Math.ceil(remaining / 1000)} s` : ''}
            {s.phase === 'inhale' ? ` · ${fmtClock(remaining)}` : ''}
          </div>
          <div className="truncate text-xs text-ink-3">
            {s.quick ? 'Quick fill' : `${s.plan.strainName} · balloon ${s.balloonIndex + 1}/${s.plan.balloons.length}`}
          </div>
        </button>
        {actionable ? (
          <Button size="sm" variant="primary" onClick={() => void s.confirm()}>
            {s.phase === 'ready' ? 'Start' : s.phase === 'inhale' ? 'Fill next' : 'Resume'}
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={() => void s.stop()}>
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}
