// First-run tour: a few highlighted stops through the app. Always skippable (button or Escape),
// shown once, and restartable from Help or Settings.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { useLibrary } from '../store/library';
import { Button, cx } from './primitives';
import { go } from './route';

interface Step {
  /** Screen shown for this step */
  route?: string;
  /** data-tour anchors to highlight; the first visible one wins */
  targets?: string[];
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    route: 'control',
    title: 'Welcome to cleverTerpenes',
    body: (
      <>
        <p>
          Your Volcano Hybrid, tuned to your strain: cleverTerpenes picks the temperature and pump time for every balloon from the
          strain’s terpenes — and runs the Volcano for you.
        </p>
        <p>A quick look around takes about a minute. Skip whenever you like.</p>
      </>
    ),
  },
  {
    route: 'control',
    targets: ['connect', 'status'],
    title: 'Connect — or just try it',
    body: 'Switch the Volcano on and tap Connect Volcano. Works in Chrome and Edge on computers and Android; on iPhone use the free Bluefy browser. No Volcano at hand? Demo mode simulates one.',
  },
  {
    route: 'balloons',
    targets: ['balloon'],
    title: 'Teach it your balloon',
    body: 'Self-made balloons differ a lot. Enter width and length, then calibrate once: the pump runs and you tap “Full!” when the balloon is taut. From then on every fill is timed to your balloon.',
  },
  {
    route: 'strains?add=1',
    targets: ['strain-search'],
    title: 'Find your strain',
    body: 'Type the name from the jar — brand and strain are enough. You get lab data when it exists, otherwise an estimate from the terpenes on the label or from the parent strains. It always shows how the profile was made.',
  },
  {
    route: 'plan',
    targets: ['plan'],
    title: 'One tap per balloon',
    body: 'Pick strain, herb weight and goal — every balloon gets its own temperature and pump time. Start the session and the Volcano heats up and beeps when it’s ready. Then it’s one tap per balloon: the pump fills and stops by itself.',
  },
  {
    title: 'It learns from you',
    body: (
      <>
        <p>Rate a session and the next plan for that strain shifts by a few degrees. Everything you save stays in this browser — no account, no tracking.</p>
        <p className="text-ink-3">Doses are model estimates, not medical advice. Start low, go slow.</p>
      </>
    ),
  },
];

const useTour = create<{ open: boolean; step: number; returnTo: string }>(() => ({ open: false, step: 0, returnTo: 'control' }));

const currentPath = () => window.location.hash.replace(/^#\/?/, '') || 'control';

export function startTour() {
  useTour.setState({ open: true, step: 0, returnTo: currentPath() });
}

function endTour() {
  const { returnTo } = useTour.getState();
  useTour.setState({ open: false, step: 0 });
  useLibrary.getState().updateSettings({ tourDone: true });
  if (currentPath() !== returnTo) go(returnTo);
}

const moveTour = (delta: number) => useTour.setState((s) => ({ step: Math.max(0, Math.min(STEPS.length - 1, s.step + delta)) }));

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

function findTarget(keys: string[] = []): HTMLElement | null {
  for (const key of keys) {
    const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)).find((x) => x.getClientRects().length > 0);
    if (el) return el;
  }
  return null;
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Scrolls the target into the upper part of the screen, leaving room for the tour card below. */
function bringIntoView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const top = 72; // below the sticky header
  if (r.top >= top && r.bottom <= window.innerHeight * 0.55) return;
  window.scrollBy({ top: r.top - top, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

export function Tour() {
  const { open, step } = useTour();
  const [box, setBox] = useState<Box | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Show the step's screen and keep the highlight on its target while it loads, scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const { route, targets } = STEPS[step];
    const focusPrimary = () => dialog.current?.querySelector<HTMLElement>('[data-primary]')?.focus({ preventScroll: true });
    if (route && currentPath() !== route) go(route);
    setBox(null);
    focusPrimary();
    let found = false;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = findTarget(targets);
        if (el && !found) {
          found = true;
          bringIntoView(el);
          focusPrimary(); // take focus back from fields that focus themselves
        }
        const r = el?.getBoundingClientRect();
        const next = r ? { top: r.top - PAD, left: r.left - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD } : null;
        setBox((prev) => (sameBox(prev, next) ? prev : next));
      });
    };
    measure();
    const poll = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(poll);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endTour();
      } else if (e.key === 'ArrowRight') moveTour(1);
      else if (e.key === 'ArrowLeft') moveTour(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const placement = !box ? 'center' : box.top + box.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom';

  // Keep keyboard focus inside the card.
  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Blocks the app underneath — every control of the tour is on the card. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {box ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl motion-safe:transition-all motion-safe:duration-300"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: '0 0 0 2px var(--color-air), 0 0 0 9999px rgba(0, 0, 0, 0.62)',
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      )}
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={trapTab}
        className={cx(
          'fixed inset-x-4 mx-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-card p-5 shadow-2xl',
          placement === 'center' && 'top-1/2 -translate-y-1/2',
        )}
        style={
          placement === 'top'
            ? { top: 'max(1rem, env(safe-area-inset-top))' }
            : placement === 'bottom'
              ? { bottom: 'max(1rem, env(safe-area-inset-bottom))' }
              : undefined
        }
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium tabular text-ink-3">
            {step + 1} of {STEPS.length}
          </span>
          <button type="button" onClick={endTour} className="-mr-2 rounded-lg px-3 py-2 text-sm text-ink-3 hover:bg-raised hover:text-ink">
            Skip tour
          </button>
        </div>
        <h2 id="tour-title" className="text-lg font-semibold tracking-tight">
          {s.title}
        </h2>
        <div id="tour-body" className="mt-2 space-y-2 text-sm leading-relaxed text-ink-2">
          {typeof s.body === 'string' ? <p>{s.body}</p> : s.body}
        </div>
        <div className="mt-5 flex items-center gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={cx('h-1.5 rounded-full motion-safe:transition-all', i === step ? 'w-4 bg-ink' : 'w-1.5 bg-ink-3/50')} />
            ))}
          </div>
          <div className="flex-1" />
          {step > 0 && (
            <Button variant="ghost" onClick={() => moveTour(-1)}>
              Back
            </Button>
          )}
          <Button variant="primary" data-primary onClick={() => (last ? endTour() : moveTour(1))}>
            {step === 0 ? 'Show me around' : last ? 'Let’s go' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
