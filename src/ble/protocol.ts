// Storz & Bickel VOLCANO HYBRID — BLE GATT protocol.
//
// Implemented from the publicly documented GATT interface (e.g. the SavageNL Home Assistant
// integration's protocol specification) and the behaviour of the official S&B web app.
// No third-party code was copied.
//
// - Two custom services; all integers little-endian; temperatures in tenths of °C (always °C on the wire).
// - Heater and pump are switched by writing one byte to separate on/off characteristics.
// - Settings bits in PRJSTAT2/3: write uint32 LE, (0x10000 | mask) SETS the bit, bare mask CLEARS it.
// - NEVER write PRJSTAT1, the code-number characteristic (4711 enters the bootloader!) or any
//   undocumented characteristic.

const BASE = '-5354-4f52-5a26-4249434b454c'; // ASCII "STORZ&BICKEL"
const u = (short: string) => `${short}${BASE}`;

export const SERVICE_STATE = u('10100000');
export const SERVICE_CONTROL = u('10110000');

export const CHAR = {
  // control service
  currentTemp: u('10110001'),
  targetTemp: u('10110003'),
  brightness: u('10110005'),
  autoOffRemaining: u('1011000c'),
  autoOffSetting: u('1011000d'),
  heaterOn: u('1011000f'),
  heaterOff: u('10110010'),
  pumpOn: u('10110013'),
  pumpOff: u('10110014'),
  heatHours: u('10110015'),
  heatMinutes: u('10110016'),
  // state / identity service
  firmware: u('10100003'),
  bleFirmware: u('10100004'),
  appFirmware: u('10100005'),
  serial: u('10100008'),
  stat1: u('1010000c'),
  stat2: u('1010000d'),
  stat3: u('1010000e'),
} as const;

export type CharKey = keyof typeof CHAR;

export const CONTROL_CHARS: CharKey[] = [
  'currentTemp',
  'targetTemp',
  'brightness',
  'autoOffRemaining',
  'autoOffSetting',
  'heaterOn',
  'heaterOff',
  'pumpOn',
  'pumpOff',
  'heatHours',
  'heatMinutes',
];
export const STATE_CHARS: CharKey[] = ['firmware', 'bleFirmware', 'appFirmware', 'serial', 'stat1', 'stat2', 'stat3'];
export const REQUIRED_CHARS: CharKey[] = ['currentTemp', 'targetTemp', 'heaterOn', 'heaterOff', 'pumpOn', 'pumpOff', 'stat1'];

/** PRJSTAT1 (live state) */
export const STAT1 = {
  HEATER_ON: 0x0020,
  TARGET_REACHED_ONCE: 0x0200,
  READY: 0x0400,
  PUMP_ON: 0x2000,
  ERROR_MASK: 0x4018,
} as const;

/** PRJSTAT2 (display) */
export const STAT2 = {
  FAHRENHEIT: 0x0200,
  DISPLAY_ON_COOLING_DISABLED: 0x1000,
  ERROR_MASK: 0x003b,
} as const;

/** PRJSTAT3 */
export const STAT3 = {
  VIBRATION_DISABLED: 0x0400,
} as const;

export const TEMP_MIN_C = 40;
export const TEMP_MAX_C = 230;

export function bytesOf(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function readU16(view: DataView): number {
  if (view.byteLength >= 2) return view.getUint16(0, true);
  if (view.byteLength === 1) return view.getUint8(0);
  return 0;
}

export function readU32(view: DataView): number {
  if (view.byteLength >= 4) return view.getUint32(0, true);
  return readU16(view);
}

/** Temperatures come as uint16 deci-°C; values ≥ 6536 °C are the start-up/invalid sentinel. */
export function decodeTemp(view: DataView): number | undefined {
  const c = Math.round(readU16(view) / 10);
  return c >= 6536 ? undefined : c;
}

export function encodeU16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, Math.max(0, Math.min(0xffff, Math.round(value))), true);
  return out;
}

export function encodeU32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

/** Target temperature: clamp to 40–230 °C, write uint32 LE in tenths of °C (as the vendor app does). */
export function encodeTarget(celsius: number): Uint8Array {
  const c = Math.max(TEMP_MIN_C, Math.min(TEMP_MAX_C, Math.round(celsius)));
  return encodeU32(c * 10);
}

/** One-byte command for heater/pump on/off characteristics (payload ignored by the device). */
export const COMMAND = new Uint8Array([0x00]);

/** Settings register write: (0x10000 | mask) sets the bit, the bare mask clears it. */
export function encodeRegister(mask: number, set: boolean): Uint8Array {
  return encodeU32(set ? 0x10000 | mask : mask);
}

export function decodeString(view: DataView): string {
  return new TextDecoder()
    .decode(bytesOf(view))
    .replace(/\0/g, '')
    .trim();
}

export interface Stat1 {
  heaterOn: boolean;
  pumpOn: boolean;
  ready: boolean;
  targetReachedOnce: boolean;
  error: number;
}

export function decodeStat1(v: number): Stat1 {
  return {
    heaterOn: (v & STAT1.HEATER_ON) !== 0,
    pumpOn: (v & STAT1.PUMP_ON) !== 0,
    ready: (v & STAT1.READY) !== 0,
    targetReachedOnce: (v & STAT1.TARGET_REACHED_ONCE) !== 0,
    error: v & STAT1.ERROR_MASK,
  };
}

export function decodeStat2(v: number) {
  return {
    fahrenheit: (v & STAT2.FAHRENHEIT) !== 0,
    displayOnCooling: (v & STAT2.DISPLAY_ON_COOLING_DISABLED) === 0,
    error: v & STAT2.ERROR_MASK,
  };
}

export function decodeStat3(v: number) {
  return { vibration: (v & STAT3.VIBRATION_DISABLED) === 0 };
}

export function describeFaults(err1: number, err2: number): string[] {
  const out: string[] = [];
  if (err1 & 0x0008) out.push('Heater regulation fault (code 60)');
  if (err1 & 0x0010) out.push('Device fault — heater and pump stopped (code 61)');
  if (err1 & 0x4000) out.push('Pump interlock fault');
  if (err2) out.push(`Regulation/sensor error bits 0x${err2.toString(16).padStart(4, '0')}`);
  return out;
}
