import type { StatePatch, VolcanoDriver } from './types';

/**
 * Demo Volcano: a simple thermal model so every screen and a full session can be tried
 * without hardware. Heats ~4 °C/s like the Hybrid (≈40 s to 180 °C), cools slowly,
 * sags a little while the pump runs, and mimics the auto-off countdown and ready latch.
 */
export class VolcanoSimulator implements VolcanoDriver {
  readonly kind = 'demo' as const;
  private onPatch: (p: StatePatch) => void = () => {};
  private timer?: ReturnType<typeof setInterval>;
  private current = 24;
  private target = 180;
  private heater = false;
  private pump = false;
  private ready = false;
  private autoOffSec = 1800;
  private remaining = 0;
  private brightness = 70;
  private vibration = true;
  private displayOnCooling = true;
  private fahrenheit = false;
  private lastTick = 0;
  private heatSeconds = 5 * 3600 + 17 * 60;

  constructor(private readonly speed = 1) {}

  async connect(onPatch: (p: StatePatch) => void) {
    this.onPatch = onPatch;
    onPatch({ status: 'connecting', mode: 'demo', deviceName: 'Demo Volcano (simulated)', error: undefined });
    await delay(400);
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), 250);
    onPatch({
      status: 'connected',
      serial: 'DEMO0001',
      firmware: 'V01.03',
      appFirmware: 'V01.03',
      bleFirmware: 'demo',
      brightness: this.brightness,
      vibration: this.vibration,
      displayOnCooling: this.displayOnCooling,
      deviceFahrenheit: this.fahrenheit,
      autoOffSec: this.autoOffSec,
      faults: [],
    });
    this.emit();
  }

  private tick() {
    const now = performance.now();
    const dt = ((now - this.lastTick) / 1000) * this.speed;
    this.lastTick = now;
    const ambient = 24;
    if (this.heater) {
      this.heatSeconds += dt;
      const gap = this.target - this.current;
      if (gap > 0) this.current += Math.min(gap, (4 + gap * 0.02) * dt);
      else this.current += Math.max(gap, -0.35 * dt);
    } else {
      this.current += (ambient - this.current) * Math.min(1, 0.0025 * dt) - (this.current > ambient + 1 ? 0.12 * dt : 0);
    }
    if (this.pump) this.current -= this.heater ? 0.9 * dt * Math.random() : 0.4 * dt;
    this.current = Math.max(ambient, Math.min(235, this.current));
    if (this.heater && this.current >= this.target - 0.5) this.ready = true;
    if (!this.heater) this.ready = false;
    if (this.remaining > 0) {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining === 0) {
        this.heater = false;
        this.pump = false;
      }
    }
    this.emit();
  }

  private emit() {
    this.onPatch({
      currentC: Math.round(this.current),
      targetC: this.target,
      heaterOn: this.heater,
      pumpOn: this.pump,
      ready: this.ready,
      autoOffRemainingSec: Math.round(this.remaining),
      heatHours: Math.floor(this.heatSeconds / 3600),
      heatMinutes: Math.floor((this.heatSeconds % 3600) / 60),
      lastSeen: Date.now(),
    });
  }

  private reloadAutoOff() {
    this.remaining = this.autoOffSec;
  }

  async disconnect() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.heater = false;
    this.pump = false;
    this.onPatch({ status: 'disconnected', pumpOn: false, heaterOn: false, ready: false });
  }

  async setTargetTemp(celsius: number) {
    await delay(60);
    const t = Math.max(40, Math.min(230, Math.round(celsius)));
    if (t >= this.target + 3) this.ready = false;
    this.target = t;
    this.emit();
  }

  async setHeater(on: boolean) {
    await delay(60);
    this.heater = on;
    if (on) this.reloadAutoOff();
    this.emit();
  }

  async setPump(on: boolean) {
    await delay(60);
    this.pump = on;
    if (on) this.reloadAutoOff();
    this.emit();
  }

  async setBrightness(percent: number) {
    this.brightness = Math.max(0, Math.min(100, Math.round(percent)));
    this.onPatch({ brightness: this.brightness });
  }

  async setAutoOffMinutes(minutes: number) {
    this.autoOffSec = Math.max(1, Math.min(360, Math.round(minutes))) * 60;
    this.onPatch({ autoOffSec: this.autoOffSec });
  }

  async setVibration(on: boolean) {
    this.vibration = on;
    this.onPatch({ vibration: on });
  }

  async setDisplayOnCooling(on: boolean) {
    this.displayOnCooling = on;
    this.onPatch({ displayOnCooling: on });
  }

  async setDeviceFahrenheit(on: boolean) {
    this.fahrenheit = on;
    this.onPatch({ deviceFahrenheit: on });
  }

  async refresh() {
    this.emit();
  }

  setFastPolling() {}
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
