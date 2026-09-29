import { useEffect } from 'react';
import { useDevice } from './store/device';
import { useLibrary } from './store/library';
import { isActivePhase, useSession } from './store/session';
import { go, useRoute } from './ui/route';
import { cx } from './ui/primitives';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Tour, startTour } from './ui/Tour';
import { UpdateBanner } from './ui/UpdateBanner';
import { SITE } from './site';
import { fmtTemp } from './ui/format';
import { SessionBar } from './screens/SessionRunner';
import { ControlScreen } from './screens/ControlScreen';
import { PlanScreen } from './screens/PlanScreen';
import { StrainsScreen } from './screens/StrainsScreen';
import { BalloonsScreen } from './screens/BalloonsScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { ScienceScreen } from './screens/ScienceScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { HelpScreen } from './screens/HelpScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { MoreScreen } from './screens/MoreScreen';

const NAV = [
  { key: 'control', label: 'Control', icon: '◉' },
  { key: 'plan', label: 'Session', icon: '▶' },
  { key: 'strains', label: 'Strains', icon: '✿' },
  { key: 'balloons', label: 'Balloons', icon: '◯' },
  { key: 'more', label: 'More', icon: '≡' },
] as const;

const MORE = ['history', 'science', 'settings', 'help', 'privacy'];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <path d="M4 27 L13 10 L16 14 L19 10 L28 27 Z" fill="var(--color-heat)" />
      <circle cx="16" cy="6" r="3" fill="var(--color-terp)" />
      <circle cx="10" cy="4" r="1.6" fill="var(--color-terp)" opacity=".7" />
      <circle cx="22" cy="4.5" r="2" fill="var(--color-terp)" opacity=".85" />
    </svg>
  );
}

function ConnectionPill() {
  const { status, mode, currentC, heaterOn, pumpOn } = useDevice();
  const unit = useLibrary((s) => s.settings.unit);
  const dot =
    status === 'connected' ? (pumpOn ? 'bg-air' : heaterOn ? 'bg-heat' : 'bg-good') : status === 'disconnected' ? 'bg-ink-3' : 'bg-warn animate-pulse';
  const label =
    status === 'connected'
      ? `${mode === 'demo' ? 'Demo · ' : ''}${fmtTemp(currentC, unit)}`
      : status === 'disconnected'
        ? 'Not connected'
        : status === 'connecting'
          ? 'Connecting…'
          : 'Reconnecting…';
  return (
    <button
      data-tour="status"
      onClick={() => go('control')}
      className="flex items-center gap-2 rounded-full border border-white/10 bg-card px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
    >
      <span className={cx('h-2.5 w-2.5 rounded-full', dot)} aria-hidden="true" />
      <span className="tabular">{label}</span>
    </button>
  );
}

function ErrorBanner() {
  const error = useDevice((s) => s.error);
  const status = useDevice((s) => s.status);
  const clear = useDevice((s) => s.clearError);
  if (!error) return null;
  return (
    <div className="mx-auto mb-3 flex max-w-5xl items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink-2" role="status">
      <span aria-label="Warning">⚠</span>
      <span className="min-w-0 flex-1">{error}</span>
      {status !== 'reconnecting' && (
        <button onClick={clear} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function App() {
  const route = useRoute();
  const hydrated = useLibrary((s) => s.hydrated);
  const phase = useSession((s) => s.phase);
  const top = route.path[0];
  const activeTab = MORE.includes(top) ? 'more' : top;

  // First launch: show the tour once (it can be skipped at any step and restarted from Help).
  useEffect(() => {
    if (hydrated && !useLibrary.getState().settings.tourDone && !isActivePhase(useSession.getState().phase)) startTour();
  }, [hydrated]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isActivePhase(useSession.getState().phase)) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  let screen;
  switch (top) {
    case 'plan':
      screen = <PlanScreen route={route} />;
      break;
    case 'strains':
      screen = <StrainsScreen route={route} />;
      break;
    case 'balloons':
      screen = <BalloonsScreen />;
      break;
    case 'history':
      screen = <HistoryScreen />;
      break;
    case 'science':
      screen = <ScienceScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'help':
      screen = <HelpScreen />;
      break;
    case 'privacy':
      screen = <PrivacyScreen />;
      break;
    case 'more':
      screen = <MoreScreen />;
      break;
    default:
      screen = <ControlScreen />;
  }

  return (
    <div className="min-h-dvh pb-28 lg:pb-10">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button onClick={() => go('control')} className="flex items-center gap-2" aria-label="cleverTerpenes home">
            <Logo />
            <span className="text-lg tracking-tight">
              <span className="text-ink-2">clever</span>
              <span className="font-semibold">Terpenes</span>
            </span>
          </button>
          <nav className="ml-4 hidden gap-1 lg:flex" aria-label="Main">
            {[...NAV.filter((n) => n.key !== 'more'), { key: 'history', label: 'History' }, { key: 'science', label: 'Science' }, { key: 'settings', label: 'Settings' }, { key: 'help', label: 'Help' }].map((n) => (
              <button
                key={n.key}
                onClick={() => go(n.key)}
                className={cx('rounded-lg px-3 py-1.5 text-sm', top === n.key ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink')}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <ConnectionPill />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-4">
        <UpdateBanner />
        <ErrorBanner />
        {hydrated ? <ErrorBoundary resetKey={route.path.join('/')}>{screen}</ErrorBoundary> : <div className="py-20 text-center text-ink-3">Loading your library…</div>}
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 pt-4 text-xs text-ink-3">
          {/* New tab, so a running session is never navigated away from */}
          <a href={SITE.home} target="_blank" rel="noopener" className="hover:text-ink">
            cleverTerpenes by {SITE.name}
          </a>
          <a href={SITE.imprint.url} target="_blank" rel="noopener" className="hover:text-ink">
            {SITE.imprint.label}
          </a>
          <a href="#/privacy" className="hover:text-ink">
            {SITE.privacyLabel}
          </a>
          <span>Not medical advice.</span>
        </div>
      </footer>

      {(isActivePhase(phase) || phase === 'error') && top !== 'plan' && <SessionBar />}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/95 backdrop-blur lg:hidden safe-bottom" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => go(n.key)}
              className={cx('flex flex-col items-center gap-0.5 pt-2 pb-1 text-[11px]', activeTab === n.key ? 'text-ink' : 'text-ink-3')}
              aria-current={activeTab === n.key ? 'page' : undefined}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {n.icon}
              </span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      <Tour />
    </div>
  );
}
