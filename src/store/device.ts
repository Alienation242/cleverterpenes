import { create } from 'zustand';
import { VolcanoBleDriver, type ConnectOptions } from '../ble/volcanoBle';
import { VolcanoSimulator } from '../ble/simulator';
import { INITIAL_STATE, type VolcanoDriver, type VolcanoState } from '../ble/types';

interface DeviceStore extends VolcanoState {
  driver: VolcanoDriver | null;
  connectBle(options?: ConnectOptions): Promise<void>;
  connectDemo(speed?: number): Promise<void>;
  disconnect(): Promise<void>;
  run(label: string, fn: (d: VolcanoDriver) => Promise<void>): Promise<boolean>;
  clearError(): void;
}

function describeError(err: unknown): string | undefined {
  if (err instanceof DOMException && err.name === 'NotFoundError') return undefined; // chooser cancelled
  if (err instanceof DOMException && err.name === 'SecurityError') {
    return 'The browser blocked Bluetooth (needs a click, HTTPS or localhost).';
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export const useDevice = create<DeviceStore>()((set, get) => ({
  ...INITIAL_STATE,
  driver: null,

  async connectBle(options) {
    await get().driver?.disconnect().catch(() => undefined);
    const driver = new VolcanoBleDriver();
    set({ ...INITIAL_STATE, driver, status: 'connecting', mode: 'ble' });
    try {
      await driver.connect((patch) => set(patch), options);
    } catch (err) {
      set({ ...INITIAL_STATE, driver: null, error: describeError(err) });
    }
  },

  async connectDemo(speed = 1) {
    await get().driver?.disconnect().catch(() => undefined);
    const driver = new VolcanoSimulator(speed);
    set({ ...INITIAL_STATE, driver, status: 'connecting', mode: 'demo' });
    await driver.connect((patch) => set(patch));
  },

  async disconnect() {
    const d = get().driver;
    if (d) await d.disconnect().catch(() => undefined);
    set({ ...INITIAL_STATE, driver: null });
  },

  async run(label, fn) {
    const d = get().driver;
    if (!d || get().status !== 'connected') {
      set({ error: `Not connected — cannot ${label}.` });
      return false;
    }
    try {
      await fn(d);
      return true;
    } catch (err) {
      set({ error: `Could not ${label}: ${describeError(err) ?? 'cancelled'}` });
      return false;
    }
  },

  clearError() {
    set({ error: undefined });
  },
}));

export const isConnected = () => useDevice.getState().status === 'connected';
