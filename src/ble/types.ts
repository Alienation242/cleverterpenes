export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface VolcanoState {
  status: ConnectionStatus;
  mode: 'ble' | 'demo' | null;
  deviceName?: string;
  error?: string;
  currentC?: number;
  targetC?: number;
  heaterOn: boolean;
  pumpOn: boolean;
  /** Device "setpoint reached" latch (PRJSTAT1 0x0400) */
  ready: boolean;
  faults: string[];
  deviceFahrenheit?: boolean;
  displayOnCooling?: boolean;
  vibration?: boolean;
  brightness?: number;
  autoOffSec?: number;
  autoOffRemainingSec?: number;
  heatHours?: number;
  heatMinutes?: number;
  serial?: string;
  firmware?: string;
  bleFirmware?: string;
  appFirmware?: string;
  /** ms timestamp of the last value received from the device */
  lastSeen?: number;
}

export const INITIAL_STATE: VolcanoState = {
  status: 'disconnected',
  mode: null,
  heaterOn: false,
  pumpOn: false,
  ready: false,
  faults: [],
};

export type StatePatch = Partial<VolcanoState>;

export interface VolcanoDriver {
  readonly kind: 'ble' | 'demo';
  connect(onPatch: (patch: StatePatch) => void): Promise<void>;
  disconnect(): Promise<void>;
  setTargetTemp(celsius: number): Promise<void>;
  setHeater(on: boolean): Promise<void>;
  setPump(on: boolean): Promise<void>;
  setBrightness(percent: number): Promise<void>;
  setAutoOffMinutes(minutes: number): Promise<void>;
  setVibration(on: boolean): Promise<void>;
  setDisplayOnCooling(on: boolean): Promise<void>;
  setDeviceFahrenheit(on: boolean): Promise<void>;
  refresh(): Promise<void>;
  /** Poll more often while a session runs (notifications are change-only and can be lost). */
  setFastPolling(on: boolean): void;
}
