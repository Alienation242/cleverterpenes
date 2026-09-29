import { GattQueue, withTimeout } from './gattQueue';
import {
  CHAR,
  COMMAND,
  CONTROL_CHARS,
  REQUIRED_CHARS,
  SERVICE_CONTROL,
  SERVICE_STATE,
  STATE_CHARS,
  STAT2,
  STAT3,
  decodeStat1,
  decodeStat2,
  decodeStat3,
  decodeString,
  decodeTemp,
  describeFaults,
  encodeRegister,
  encodeTarget,
  encodeU16,
  readU16,
  type CharKey,
} from './protocol';
import type { StatePatch, VolcanoDriver } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NOTIFY: CharKey[] = ['currentTemp', 'targetTemp', 'stat1', 'stat2', 'autoOffRemaining', 'heatHours', 'heatMinutes'];
const INITIAL_READS: CharKey[] = [
  'currentTemp',
  'targetTemp',
  'stat1',
  'stat2',
  'stat3',
  'brightness',
  'autoOffSetting',
  'autoOffRemaining',
  'heatHours',
  'heatMinutes',
  'serial',
  'firmware',
  'bleFirmware',
  'appFirmware',
];

export interface ConnectOptions {
  /** Show every nearby Bluetooth device in the chooser (troubleshooting). */
  acceptAllDevices?: boolean;
}

export function webBluetoothStatus(): { supported: boolean; reason?: string } {
  if (typeof window === 'undefined') return { supported: false, reason: 'No browser environment.' };
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Web Bluetooth needs HTTPS or http://localhost. Open the app from a secure address.' };
  }
  const nav = navigator as Omit<Navigator, 'bluetooth'> & { bluetooth?: Bluetooth };
  if (!nav.bluetooth) {
    const ios = /iPhone|iPad|iPod/.test(nav.userAgent);
    return {
      supported: false,
      reason: ios
        ? 'Safari on iPhone/iPad has no Web Bluetooth. Open this page in the Bluefy browser (App Store).'
        : 'This browser has no Web Bluetooth. Use Chrome or Edge (Windows, macOS, Android, ChromeOS).',
    };
  }
  return { supported: true };
}

export class VolcanoBleDriver implements VolcanoDriver {
  readonly kind = 'ble' as const;
  private device?: BluetoothDevice;
  private chars = new Map<CharKey, BluetoothRemoteGATTCharacteristic>();
  private cleanups: Array<() => void> = [];
  private queue = new GattQueue((reason) => this.handleUnhealthy(reason));
  private onPatch: (p: StatePatch) => void = () => {};
  private userDisconnect = false;
  private reconnecting = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private fast = false;
  private err1 = 0;
  private err2 = 0;

  async connect(onPatch: (p: StatePatch) => void, options: ConnectOptions = {}): Promise<void> {
    this.onPatch = onPatch;
    const support = webBluetoothStatus();
    if (!support.supported) throw new Error(support.reason);
    this.userDisconnect = false;
    const optionalServices = [SERVICE_STATE, SERVICE_CONTROL];
    const device = await navigator.bluetooth.requestDevice(
      options.acceptAllDevices
        ? { acceptAllDevices: true, optionalServices }
        : { filters: [{ namePrefix: 'S&B VOLCANO' }], optionalServices },
    );
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    onPatch({ status: 'connecting', mode: 'ble', deviceName: device.name ?? 'Volcano', error: undefined });
    try {
      await this.openGatt();
    } catch (err) {
      this.userDisconnect = true;
      device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
      if (device.gatt?.connected) device.gatt.disconnect();
      throw err;
    }
  }

  private async openGatt(): Promise<void> {
    const gatt = this.device?.gatt;
    if (!gatt) throw new Error('This Bluetooth device has no GATT server.');
    const server = await withTimeout(gatt.connect(), 20000, 'connect');
    this.queue.reset();
    this.chars.clear();
    this.clearListeners();

    const control = await this.queue.run('control service', () => server.getPrimaryService(SERVICE_CONTROL), 8000);
    const state = await this.queue.run('state service', () => server.getPrimaryService(SERVICE_STATE), 8000);
    for (const key of CONTROL_CHARS) await this.tryGet(control, key);
    for (const key of STATE_CHARS) await this.tryGet(state, key);
    const missing = REQUIRED_CHARS.filter((k) => !this.chars.has(k));
    if (missing.length) {
      throw new Error(`This does not look like a Volcano Hybrid (missing: ${missing.join(', ')}).`);
    }

    // Subscribe first, then read, so no change slips through between the two.
    for (const key of NOTIFY) await this.subscribe(key);
    for (const key of INITIAL_READS) await this.readInto(key).catch(() => undefined);
    this.onPatch({ status: 'connected', error: undefined });
    this.startPolling();
  }

  private async tryGet(service: BluetoothRemoteGATTService, key: CharKey) {
    try {
      const ch = await this.queue.run(`get ${key}`, () => service.getCharacteristic(CHAR[key]), 5000);
      this.chars.set(key, ch);
    } catch {
      // Optional characteristic missing on this firmware — tolerated.
    }
  }

  private async subscribe(key: CharKey) {
    const ch = this.chars.get(key);
    if (!ch || !ch.properties.notify) return;
    const handler = (ev: Event) => {
      const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
      if (value) this.apply(key, value);
    };
    ch.addEventListener('characteristicvaluechanged', handler);
    this.cleanups.push(() => ch.removeEventListener('characteristicvaluechanged', handler));
    try {
      await this.queue.run(`notify ${key}`, () => ch.startNotifications(), 5000);
    } catch (err) {
      console.warn(`[volcano] notifications for ${key} unavailable`, err);
    }
  }

  private async readInto(key: CharKey) {
    const ch = this.chars.get(key);
    if (!ch) return;
    const value = await this.queue.run(`read ${key}`, () => ch.readValue());
    this.apply(key, value);
  }

  private apply(key: CharKey, v: DataView) {
    const patch: StatePatch = { lastSeen: Date.now() };
    switch (key) {
      case 'currentTemp':
        patch.currentC = decodeTemp(v);
        break;
      case 'targetTemp':
        patch.targetC = decodeTemp(v);
        break;
      case 'stat1': {
        const s = decodeStat1(readU16(v));
        this.err1 = s.error;
        Object.assign(patch, { heaterOn: s.heaterOn, pumpOn: s.pumpOn, ready: s.ready, faults: describeFaults(this.err1, this.err2) });
        break;
      }
      case 'stat2': {
        const s = decodeStat2(readU16(v));
        this.err2 = s.error;
        Object.assign(patch, { deviceFahrenheit: s.fahrenheit, displayOnCooling: s.displayOnCooling, faults: describeFaults(this.err1, this.err2) });
        break;
      }
      case 'stat3':
        patch.vibration = decodeStat3(readU16(v)).vibration;
        break;
      case 'brightness':
        patch.brightness = readU16(v);
        break;
      case 'autoOffSetting':
        patch.autoOffSec = readU16(v);
        break;
      case 'autoOffRemaining':
        patch.autoOffRemainingSec = readU16(v);
        break;
      case 'heatHours':
        patch.heatHours = readU16(v);
        break;
      case 'heatMinutes':
        patch.heatMinutes = readU16(v);
        break;
      case 'serial':
        patch.serial = decodeString(v);
        break;
      case 'firmware':
        patch.firmware = decodeString(v);
        break;
      case 'bleFirmware':
        patch.bleFirmware = decodeString(v);
        break;
      case 'appFirmware':
        patch.appFirmware = decodeString(v);
        break;
      default:
        return;
    }
    this.onPatch(patch);
  }

  private async write(key: CharKey, data: Uint8Array) {
    const ch = this.chars.get(key);
    if (!ch) throw new Error(`The Volcano did not expose "${key}".`);
    const payload = data as Uint8Array<ArrayBuffer>;
    await this.queue.run(`write ${key}`, () =>
      typeof ch.writeValueWithResponse === 'function' ? ch.writeValueWithResponse(payload) : ch.writeValue(payload),
    );
  }

  private confirmSoon(key: CharKey, ms = 700) {
    setTimeout(() => void this.readInto(key).catch(() => undefined), ms);
  }

  async setTargetTemp(celsius: number) {
    await this.write('targetTemp', encodeTarget(celsius));
    this.onPatch({ targetC: Math.max(40, Math.min(230, Math.round(celsius))) });
    this.confirmSoon('targetTemp');
  }

  async setHeater(on: boolean) {
    await this.write(on ? 'heaterOn' : 'heaterOff', COMMAND);
    this.onPatch({ heaterOn: on });
    this.confirmSoon('stat1');
  }

  async setPump(on: boolean) {
    await this.write(on ? 'pumpOn' : 'pumpOff', COMMAND);
    this.onPatch({ pumpOn: on });
    this.confirmSoon('stat1', 500);
  }

  async setBrightness(percent: number) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    await this.write('brightness', encodeU16(p));
    this.onPatch({ brightness: p });
  }

  async setAutoOffMinutes(minutes: number) {
    const s = Math.max(1, Math.min(360, Math.round(minutes))) * 60;
    await this.write('autoOffSetting', encodeU16(s));
    this.onPatch({ autoOffSec: s });
  }

  async setVibration(on: boolean) {
    await this.write('stat3', encodeRegister(STAT3.VIBRATION_DISABLED, !on));
    this.confirmSoon('stat3', 300);
  }

  async setDisplayOnCooling(on: boolean) {
    await this.write('stat2', encodeRegister(STAT2.DISPLAY_ON_COOLING_DISABLED, !on));
    this.confirmSoon('stat2', 300);
  }

  async setDeviceFahrenheit(on: boolean) {
    await this.write('stat2', encodeRegister(STAT2.FAHRENHEIT, on));
    this.confirmSoon('stat2', 300);
  }

  async refresh() {
    for (const key of ['currentTemp', 'targetTemp', 'stat1', 'autoOffRemaining'] as CharKey[]) {
      await this.readInto(key).catch(() => undefined);
    }
  }

  setFastPolling(on: boolean) {
    if (this.fast === on) return;
    this.fast = on;
    if (this.device?.gatt?.connected) this.startPolling();
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(
      () => {
        if (!this.device?.gatt?.connected) return;
        void (async () => {
          await this.readInto('currentTemp').catch(() => undefined);
          await this.readInto('stat1').catch(() => undefined);
          if (this.fast) {
            await this.readInto('targetTemp').catch(() => undefined);
            await this.readInto('autoOffRemaining').catch(() => undefined);
          }
        })();
      },
      this.fast ? 2500 : 8000,
    );
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private clearListeners() {
    this.cleanups.forEach((f) => f());
    this.cleanups = [];
  }

  private handleDisconnect = () => {
    this.stopPolling();
    this.clearListeners();
    this.queue.reset();
    if (this.userDisconnect) {
      this.onPatch({ status: 'disconnected', pumpOn: false, heaterOn: false, ready: false });
      return;
    }
    this.onPatch({ status: 'reconnecting', error: 'Connection lost — reconnecting…' });
    void this.reconnectLoop();
  };

  private async reconnectLoop() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    for (const delay of [600, 1500, 3000, 5000, 8000, 12000]) {
      await sleep(delay);
      if (this.userDisconnect || !this.device) break;
      try {
        await this.openGatt();
        this.reconnecting = false;
        return;
      } catch (err) {
        console.warn('[volcano] reconnect failed', err);
      }
    }
    this.reconnecting = false;
    if (!this.userDisconnect) {
      this.onPatch({
        status: 'disconnected',
        error: 'Lost the connection to the Volcano. Check it is on and in range, then press Connect.',
      });
    }
  }

  private handleUnhealthy(reason: string) {
    console.warn('[volcano] GATT unhealthy, forcing reconnect:', reason);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }

  async disconnect() {
    this.userDisconnect = true;
    this.stopPolling();
    this.clearListeners();
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
      if (this.device.gatt?.connected) this.device.gatt.disconnect();
    }
    this.onPatch({ status: 'disconnected', pumpOn: false, heaterOn: false, ready: false });
  }
}
