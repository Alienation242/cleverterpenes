import { useRef, useState } from 'react';
import { DEFAULT_MODEL, type ModelParams } from '../science/releaseModel';
import { useDevice } from '../store/device';
import { DEFAULT_SETTINGS, useLibrary, type ExportFile } from '../store/library';
import { Button, Callout, Card, Field, NumberInput, Segmented, Toggle } from '../ui/primitives';
import { startTour } from '../ui/Tour';

const MODEL_FIELDS: { key: keyof ModelParams; label: string; step: number; hint?: string }[] = [
  { key: 'flowLpm', label: 'Pump flow (L/min)', step: 0.5, hint: 'Measure with water displacement for “litres” accuracy.' },
  { key: 'kThc180', label: 'THC release at 180 °C (1/s)', step: 0.0005 },
  { key: 'eaEffKJ', label: 'Temperature sensitivity (kJ/mol)', step: 1 },
  { key: 'terpKCap', label: 'Terpene max. release (1/s)', step: 0.01 },
  { key: 'terpHalfPressure', label: 'Terpene half-rate pressure (mmHg)', step: 1 },
  { key: 'herbTempFraction', label: 'Herb temperature fraction', step: 0.05 },
  { key: 'resinMobileC', label: 'Resin mobility midpoint (°C)', step: 1 },
  { key: 'resinWidthC', label: 'Resin mobility width (°C)', step: 1 },
  { key: 'heatUpTauFirst', label: 'Heat-up, first balloon (s)', step: 1 },
  { key: 'heatUpTauNext', label: 'Heat-up, later balloons (s)', step: 1 },
  { key: 'deliveryCann', label: 'Cannabinoids reaching balloon', step: 0.05 },
  { key: 'deliveryTerp', label: 'Terpenes reaching balloon', step: 0.05 },
  { key: 'firstBalloonDelivery', label: 'First-balloon factor (cold parts)', step: 0.05 },
];

function DeviceSettings() {
  const dev = useDevice();
  const [brightness, setBrightness] = useState<number | undefined>(undefined);
  const [autoOff, setAutoOff] = useState<number | undefined>(undefined);
  if (dev.status !== 'connected') {
    return <p className="text-sm text-ink-3">Connect the Volcano to change its settings.</p>;
  }
  const b = brightness ?? dev.brightness ?? 70;
  const a = autoOff ?? Math.round((dev.autoOffSec ?? 1800) / 60);
  return (
    <div className="space-y-2">
      <Field label={`Display brightness ${b} %`}>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={b}
          onChange={(e) => setBrightness(Number(e.target.value))}
          onPointerUp={() => void dev.run('set brightness', (d) => d.setBrightness(b)).then(() => setBrightness(undefined))}
          onKeyUp={() => void dev.run('set brightness', (d) => d.setBrightness(b)).then(() => setBrightness(undefined))}
          className="w-full"
        />
      </Field>
      <Field label={`Automatic switch-off after ${a} min`} hint="Counts from the last time heat or air was switched on. Long sessions need enough time.">
        <input
          type="range"
          min={30}
          max={360}
          step={30}
          value={a}
          onChange={(e) => setAutoOff(Number(e.target.value))}
          onPointerUp={() => void dev.run('set auto-off', (d) => d.setAutoOffMinutes(a)).then(() => setAutoOff(undefined))}
          onKeyUp={() => void dev.run('set auto-off', (d) => d.setAutoOffMinutes(a)).then(() => setAutoOff(undefined))}
          className="w-full"
        />
      </Field>
      <Toggle checked={dev.vibration ?? true} onChange={(v) => void dev.run('change vibration', (d) => d.setVibration(v))} label="Vibrate when temperature is reached" />
      <Toggle
        checked={dev.displayOnCooling ?? true}
        onChange={(v) => void dev.run('change display', (d) => d.setDisplayOnCooling(v))}
        label="Keep display on while cooling"
      />
      <Toggle
        checked={dev.deviceFahrenheit ?? false}
        onChange={(v) => void dev.run('change the display unit', (d) => d.setDeviceFahrenheit(v))}
        label="Volcano display in °F"
        hint="Only the device display; cleverTerpenes’s own unit is set above."
      />
      <p className="pt-2 text-xs text-ink-3">
        {dev.deviceName} · firmware {dev.firmware ?? '?'} ({dev.appFirmware ?? '?'}) · BLE {dev.bleFirmware ?? '?'} · serial {dev.serial ?? '?'} · heater{' '}
        {dev.heatHours ?? 0} h {dev.heatMinutes ?? 0} min
      </p>
    </div>
  );
}

export function SettingsScreen() {
  const lib = useLibrary();
  const s = lib.settings;
  const set = lib.updateSettings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(lib.exportAll(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cleverterpenes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File, mode: 'merge' | 'replace') => {
    try {
      const data = JSON.parse(await file.text()) as ExportFile;
      lib.importAll(data, mode);
      setImportMsg(`Imported ${data.strains?.length ?? 0} strains, ${data.balloons?.length ?? 0} balloons, ${data.sessions?.length ?? 0} sessions (${mode}).`);
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Display & alerts">
          <Field label="Temperature unit">
            <Segmented value={s.unit} onChange={(unit) => set({ unit })} options={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} />
          </Field>
          <div className="mt-2">
            <Toggle
              checked={s.sounds}
              onChange={(sounds) => set({ sounds })}
              label="Sounds"
              hint="Beeps when the Volcano is ready, when to put the balloon on (after a pre-heat), and when a balloon is full."
            />
            <Toggle checked={s.vibrate} onChange={(vibrate) => set({ vibrate })} label="Vibration (phones)" />
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={startTour}>
            Show the tour again
          </Button>
        </Card>

        <Card title="Session defaults">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Herb load">
              <NumberInput value={s.defaultLoadMg} min={30} max={700} step={10} suffix="mg" onChange={(v) => set({ defaultLoadMg: v ?? 200 })} />
            </Field>
            <Field label="Pre-heat" hint="0 = balloon on before Start.">
              <NumberInput value={s.preheatSeconds} min={0} max={10} suffix="s" onChange={(v) => set({ preheatSeconds: v ?? 0 })} />
            </Field>
            <Field label="Settle at temperature">
              <NumberInput value={s.settleSeconds} min={0} max={60} suffix="s" onChange={(v) => set({ settleSeconds: v ?? 0 })} />
            </Field>
            <Field label="Inhale within">
              <NumberInput value={s.inhaleMinutes} min={1} max={30} suffix="min" onChange={(v) => set({ inhaleMinutes: v ?? 10 })} />
            </Field>
            <Field label="Lowest temperature">
              <NumberInput value={s.minTempC} min={120} max={200} suffix="°C" onChange={(v) => set({ minTempC: v ?? 160 })} />
            </Field>
            <Field label="Highest temperature">
              <NumberInput value={s.maxTempC} min={160} max={230} suffix="°C" onChange={(v) => set({ maxTempC: Math.min(230, v ?? 230) })} />
            </Field>
            <Field label="Pump safety limit" hint="Longest single fill allowed.">
              <NumberInput value={s.maxPumpSeconds} min={10} max={180} suffix="s" onChange={(v) => set({ maxPumpSeconds: v ?? 90 })} />
            </Field>
            <Field label="Demo speed" hint="Heating speed of the simulated Volcano.">
              <NumberInput value={s.demoSpeed} min={1} max={20} onChange={(v) => set({ demoSpeed: v ?? 1 })} />
            </Field>
          </div>
          <div className="mt-2">
            <Toggle checked={s.heaterOffAtEnd} onChange={(heaterOffAtEnd) => set({ heaterOffAtEnd })} label="Switch the heater off after the last balloon" />
          </div>
        </Card>

        <Card title="Volcano settings">
          <DeviceSettings />
        </Card>

        <Card title="Backup">
          <p className="text-sm text-ink-2">Everything is stored only in this browser. Export a backup to move it to another device.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={exportData}>Export backup</Button>
            <Button onClick={() => fileRef.current?.click()}>Import (merge)</Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.dataset.mode = 'replace';
                  fileRef.current.click();
                }
              }}
            >
              Import (replace all)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                const mode = (e.target.dataset.mode as 'merge' | 'replace') ?? 'merge';
                e.target.dataset.mode = 'merge';
                e.target.value = '';
                if (f) {
                  if (mode === 'replace' && !confirm('Replace ALL strains, balloons and history with the backup?')) return;
                  void importData(f, mode);
                }
              }}
            />
          </div>
          {importMsg && <p className="mt-2 text-sm text-ink-2">{importMsg}</p>}
        </Card>
      </div>

      <Card title="Model (advanced)">
        <details>
          <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">Show the parameters behind the release model</summary>
          <Callout tone="info" className="mt-3">
            These values come from the research (see Science). Change them only if you have measurements — e.g. your measured pump flow.
          </Callout>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {MODEL_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <NumberInput value={s.model[f.key]} step={f.step} onChange={(v) => v !== undefined && v > 0 && set({ model: { ...s.model, [f.key]: v } })} />
              </Field>
            ))}
          </div>
          <Button className="mt-3" variant="ghost" onClick={() => set({ model: DEFAULT_MODEL })}>
            Reset model to research defaults
          </Button>
        </details>
      </Card>

      <Card title="Reset">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm('Reset settings to defaults? Strains, balloons and history are kept.')) set({ ...DEFAULT_SETTINGS, activeBalloonId: s.activeBalloonId });
          }}
        >
          Reset settings
        </Button>
      </Card>
    </div>
  );
}
