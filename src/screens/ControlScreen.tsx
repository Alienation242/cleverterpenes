import { useEffect, useRef, useState } from 'react';
import { webBluetoothStatus } from '../ble/volcanoBle';
import { useDevice } from '../store/device';
import { activeBalloon, fillPlanFor, useLibrary } from '../store/library';
import { isActivePhase, useSession } from '../store/session';
import { Badge, Button, Callout, Card, Select, cx } from '../ui/primitives';
import { TempGauge } from '../ui/TempGauge';
import { cToF, fmtClock, fmtSeconds, fmtTemp } from '../ui/format';
import { go } from '../ui/route';
import { SessionRunner } from './SessionRunner';

const PRESETS = [170, 180, 185, 190, 200, 210];

function ConnectPanel() {
  const { status, connectBle, connectDemo, error } = useDevice();
  const demoSpeed = useLibrary((s) => s.settings.demoSpeed);
  const support = webBluetoothStatus();
  const busy = status === 'connecting';
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <Card className="md:col-span-3">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your Volcano Hybrid</h1>
        <p className="mt-2 text-sm text-ink-2">
          cleverTerpenes talks to the Volcano over Bluetooth directly from this browser — no account, no cloud. Switch the Volcano on
          and keep it within a few metres.
        </p>
        {!support.supported && (
          <Callout tone="warn" className="mt-4" title="Bluetooth not available here">
            {support.reason}
          </Callout>
        )}
        {error && !busy && (
          <Callout tone="warn" className="mt-4" title="Could not connect">
            {error}
          </Callout>
        )}
        <div className="mt-5 flex flex-wrap gap-3" data-tour="connect">
          <Button variant="heat" size="lg" disabled={!support.supported || busy} onClick={() => void connectBle()}>
            {busy ? 'Connecting…' : 'Connect Volcano'}
          </Button>
          <Button size="lg" onClick={() => void connectDemo(demoSpeed)} disabled={busy}>
            Try demo mode
          </Button>
        </div>
        <button
          className="mt-3 text-xs text-ink-3 underline decoration-dotted hover:text-ink-2"
          disabled={!support.supported || busy}
          onClick={() => void connectBle({ acceptAllDevices: true })}
        >
          Volcano not listed? Show all Bluetooth devices
        </button>
      </Card>
      <Card className="md:col-span-2" title="If it doesn’t show up">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>
            The Volcano accepts <b className="text-ink">one connection at a time</b>. Close the S&amp;B web app or other apps on your
            phone, and switch off Home Assistant integrations.
          </li>
          <li>
            On Windows, <b className="text-ink">don’t pair it in Windows Settings</b> — if you did, remove it there.
          </li>
          <li>
            Bluetooth on the Volcano can be switched off: hold <b className="text-ink">“−” and AIR</b> together for ~3 s to toggle it.
          </li>
          <li>Use Chrome or Edge (PC, Mac, Android). On iPhone use the Bluefy browser.</li>
          <li>It can take ~10 s after another device disconnects before the Volcano advertises again.</li>
        </ul>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => go('help')}>
          More troubleshooting →
        </Button>
      </Card>
    </div>
  );
}

function TargetControl() {
  const { targetC, run } = useDevice();
  const unit = useLibrary((s) => s.settings.unit);
  const [draft, setDraft] = useState<number | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const shown = draft ?? targetC ?? 180;

  const commit = (c: number) => {
    const v = Math.max(40, Math.min(230, Math.round(c)));
    setDraft(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void run('set the temperature', (d) => d.setTargetTemp(v)).then(() => setDraft(undefined));
    }, 350);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={() => commit(shown - 1)} aria-label="Lower target by 1 degree">
          −
        </Button>
        <div className="flex-1 text-center">
          <div className="text-xs text-ink-3 uppercase">Target</div>
          <div className="text-3xl font-semibold tabular">{fmtTemp(shown, unit)}</div>
        </div>
        <Button size="lg" onClick={() => commit(shown + 1)} aria-label="Raise target by 1 degree">
          +
        </Button>
      </div>
      <input
        type="range"
        min={40}
        max={230}
        value={shown}
        onChange={(e) => commit(Number(e.target.value))}
        className="mt-4 w-full"
        aria-label="Target temperature"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => commit(p)}
            className={cx('rounded-lg border px-3 py-1.5 text-sm tabular', shown === p ? 'border-heat bg-heat/15 text-ink' : 'border-line text-ink-2 hover:text-ink')}
          >
            {unit === 'F' ? Math.round(cToF(p)) : p}°
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickFill() {
  const lib = useLibrary();
  const { targetC, currentC, heaterOn } = useDevice();
  const start = useSession((s) => s.start);
  const balloon = activeBalloon(lib);
  if (!balloon) return null;
  const fp = fillPlanFor(lib, balloon);
  const atTemp = heaterOn && currentC !== undefined && targetC !== undefined && currentC >= targetC - 1;
  return (
    <Card title="Fill a balloon" action={<Badge tone={fp.source === 'calibrated' ? 'good' : 'warn'}>{fp.source === 'calibrated' ? '✓ calibrated' : '⚠ estimate'}</Badge>}>
      <Select
        value={balloon.id}
        onChange={(id) => lib.updateSettings({ activeBalloonId: id })}
        options={lib.balloons.map((b) => ({ value: b.id, label: b.name }))}
      />
      <p className="mt-3 text-sm text-ink-2">
        Pump <b className="text-ink">{fmtSeconds(fp.seconds)}</b> — {fp.fillPercent} % of {fmtSeconds(fp.fullSeconds)} to “just taut”, ≈{' '}
        {fp.litres.toFixed(1)} L at {fmtTemp(targetC, lib.settings.unit)}.
      </p>
      {fp.warnings.map((w) => (
        <p key={w} className="mt-1 text-xs text-warn">
          ⚠ {w}
        </p>
      ))}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="air"
          disabled={targetC === undefined}
          onClick={() =>
            void start(
              {
                balloons: [{ segments: [{ tempC: targetC ?? 185, seconds: fp.seconds }], preheatSeconds: 0 }],
                strainName: 'Quick fill',
                balloonName: balloon.name,
                loadMg: 0,
                goal: 'custom',
              },
              { quick: true },
            )
          }
        >
          {atTemp ? 'Fill balloon now' : 'Heat & fill'}
        </Button>
        <Button variant="ghost" onClick={() => go('balloons')}>
          Calibrate balloons →
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-3">Attach the loaded chamber with the balloon first. The pump stops automatically.</p>
    </Card>
  );
}

export function ControlScreen() {
  const dev = useDevice();
  const unit = useLibrary((s) => s.settings.unit);
  const phase = useSession((s) => s.phase);
  if (dev.status === 'disconnected' || dev.status === 'connecting') return <ConnectPanel />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:row-span-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{dev.deviceName}</div>
            <div className="text-xs text-ink-3">
              {dev.mode === 'demo' ? 'Simulated device' : `Firmware ${dev.appFirmware ?? dev.firmware ?? '?'} · serial ${dev.serial ?? '?'}`}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void dev.disconnect()}>
            Disconnect
          </Button>
        </div>
        {dev.status === 'reconnecting' && (
          <Callout tone="warn" className="mt-3">
            Connection lost — reconnecting…
          </Callout>
        )}
        {dev.faults.length > 0 && (
          <Callout tone="critical" className="mt-3" title="The Volcano reports a fault">
            {dev.faults.join(' · ')}. Switch the device off and on; if it persists, contact Storz &amp; Bickel support.
          </Callout>
        )}
        <div className="mt-2">
          <TempGauge current={dev.currentC} target={dev.targetC} heaterOn={dev.heaterOn} pumpOn={dev.pumpOn} ready={dev.ready} unit={unit} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant={dev.heaterOn ? 'heat' : 'secondary'}
            aria-pressed={dev.heaterOn}
            onClick={() => void dev.run('switch the heater', (d) => d.setHeater(!dev.heaterOn))}
          >
            {dev.heaterOn ? '🔥 Heat on' : 'Heat off'}
          </Button>
          <Button
            size="lg"
            variant={dev.pumpOn ? 'air' : 'secondary'}
            aria-pressed={dev.pumpOn}
            onClick={() => void dev.run('switch the pump', (d) => d.setPump(!dev.pumpOn))}
          >
            {dev.pumpOn ? '💨 Air on' : 'Air off'}
          </Button>
        </div>
        <div className="mt-5">
          <TargetControl />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          {dev.autoOffRemainingSec ? <span>Auto-off in {fmtClock(dev.autoOffRemainingSec * 1000)}</span> : null}
          {dev.heatHours !== undefined && (
            <span>
              Heater used {dev.heatHours} h {dev.heatMinutes ?? 0} min
            </span>
          )}
        </div>
      </Card>
      {isActivePhase(phase) || phase === 'done' || phase === 'error' ? (
        <Card title="Session in progress">
          <SessionRunner compact />
        </Card>
      ) : (
        <QuickFill />
      )}
      <Card title="Plan the perfect balloon">
        <p className="text-sm text-ink-2">
          Pick a strain and a balloon: cleverTerpenes works out a temperature and pump time for every balloon from the strain’s terpenes and
          cannabinoids, then runs the session for you.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => go('plan')}>
          Plan a session →
        </Button>
      </Card>
    </div>
  );
}
