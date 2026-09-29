import { create } from 'zustand';
import { useSession } from '../store/session';
import { Button } from './primitives';

/** Set by the service worker registration (main.tsx) when a new version is waiting. */
export const useUpdate = create<{ apply: (() => void) | null }>(() => ({ apply: null }));

/**
 * Offers the new version only while no session is on screen — reloading mid-fill would drop the
 * Bluetooth link while the pump runs. If nobody taps, the update applies on the next fresh start.
 */
export function UpdateBanner() {
  const apply = useUpdate((s) => s.apply);
  const phase = useSession((s) => s.phase);
  if (!apply || phase !== 'idle') return null;
  return (
    <div className="mx-auto mb-3 flex max-w-5xl items-center gap-3 rounded-xl border border-air/40 bg-air/10 px-4 py-2 text-sm text-ink-2" role="status">
      <span className="min-w-0 flex-1">A new version of cleverTerpenes is ready.</span>
      <Button size="sm" variant="air" onClick={apply}>
        Reload
      </Button>
    </div>
  );
}
