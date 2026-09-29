import { useEffect, useRef, useState } from 'react';
import {
  BALLOON_PRESETS,
  KNOT_AND_FOLD_CM,
  cylinderVolumeL,
  estimateVolume,
  inflatableLengthCm,
  learnFromCalibrations,
  robinVolumeL,
  type BalloonKind,
  type BalloonProfile,
  type CalibrationLearning,
} from '../science/balloon';
import { useDevice } from '../store/device';
import { fillPlanFor, learningOf, useLibrary } from '../store/library';
import { isActivePhase, useSession } from '../store/session';
import { Badge, Button, Callout, Card, Field, NumberInput, Segmented, Select, Sheet, TextInput } from '../ui/primitives';
import { fmtDate, fmtSeconds } from '../ui/format';

type Draft = Omit<BalloonProfile, 'id' | 'createdAt' | 'calibrations'>;

function BalloonEditor({
  initial,
  onSave,
  onClose,
  learning,
}: {
  initial: Draft;
  onSave: (d: Draft) => void;
  onClose: () => void;
  learning: CalibrationLearning | null;
}) {
  const [d, setD] = useState<Draft>(initial);
  const flow = useLibrary((s) => s.settings.model.flowLpm);
  const preset = BALLOON_PRESETS[d.kind];
  const hasGeo = !!d.widthCm && !!d.lengthCm;
  const vol = estimateVolume({ ...d, id: 'x', createdAt: '', calibrations: [] });
  const usable = inflatableLengthCm(d) ?? 0;
  const learned = learning && learning.n > 0 ? learning.factor : 1;
  return (
    <div className="space-y-4">
      <Field label="Name">
        <TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Bratschlauch 55 cm" />
      </Field>
      <Field label="Type" hint={preset.note}>
        <Select
          value={d.kind}
          onChange={(kind: BalloonKind) => setD({ ...d, kind })}
          options={(Object.keys(BALLOON_PRESETS) as BalloonKind[]).map((k) => ({ value: k, label: BALLOON_PRESETS[k].label }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lay-flat width" hint="Measure the flat, unstretched tube edge to edge.">
          <NumberInput value={d.widthCm} min={5} max={60} step={0.5} suffix="cm" onChange={(v) => setD({ ...d, widthCm: v })} placeholder="e.g. 22" />
        </Field>
        <Field
          label={d.lengthIsCut ? 'Cut length' : 'Effective length'}
          hint={d.lengthIsCut ? `The piece you cut; ~${KNOT_AND_FOLD_CM} cm go into knot and valve fold.` : 'Valve to where the air stops at the top — not the knot tip.'}
        >
          <NumberInput value={d.lengthCm} min={10} max={150} step={1} suffix="cm" onChange={(v) => setD({ ...d, lengthCm: v })} placeholder="e.g. 55" />
        </Field>
      </div>
      <Segmented
        value={d.lengthIsCut ? 'cut' : 'effective'}
        onChange={(v) => setD({ ...d, lengthIsCut: v === 'cut' })}
        options={[
          { value: 'effective', label: 'Measured on the balloon' },
          { value: 'cut', label: 'Length of the cut piece' },
        ]}
      />
      {hasGeo && (
        <div className="rounded-xl bg-raised p-3 text-sm text-ink-2">
          Inflatable length {usable} cm → estimated volume <b className="text-ink">{robinVolumeL(d.widthCm!, usable).toFixed(1)} L</b> (tapered ends;
          ideal cylinder {cylinderVolumeL(d.widthCm!, usable).toFixed(1)} L) · ≈{' '}
          <b className="text-ink">{fmtSeconds((vol.litres / (flow / 60)) * learned)}</b> to just taut
          {learned !== 1 ? ` (corrected ×${learned.toFixed(2)} from your calibrations)` : ` at ${flow} L/min`}.
          {d.fullTimeS ? <> Your calibration: {fmtSeconds(d.fullTimeS)}.</> : null}
        </div>
      )}
      <Field label="Measured volume when just taut (optional)" hint="By water displacement. Together with a calibration it reveals your pump’s real flow.">
        <NumberInput value={d.volumeL} min={0.5} max={40} step={0.1} suffix="L" onChange={(v) => setD({ ...d, volumeL: v })} />
      </Field>
      <Field label={`Fill to ${d.fillPercent} % of full`} hint="S&B: never fill completely — over-pressure loses vapour. 70–85 % is a good range.">
        <input type="range" min={40} max={100} step={5} value={d.fillPercent} onChange={(e) => setD({ ...d, fillPercent: Number(e.target.value) })} className="w-full" />
      </Field>
      <Field label="Notes">
        <TextInput value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Material, where from…" />
      </Field>
      <Callout tone="info">
        Self-made balloons: use only food-safe, heat-resistant oven bags or roasting tube (S&amp;B’s own advice), no cling film. Cut 50–60 cm,
        tie one end with a plain tie, fold the open end into 16 pleats and fix it with the ring. Don’t use sections with steam vents.
      </Callout>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!d.name.trim()} onClick={() => onSave(d)}>
          Save balloon
        </Button>
      </div>
    </div>
  );
}

function Calibrator({ balloon, onClose }: { balloon: BalloonProfile; onClose: () => void }) {
  const lib = useLibrary();
  const dev = useDevice();
  const sessionPhase = useSession((s) => s.phase);
  const [running, setRunning] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [manual, setManual] = useState<number | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runningRef = useRef(false);
  const current = lib.balloons.find((b) => b.id === balloon.id) ?? balloon;
  const connected = dev.status === 'connected';
  const busy = isActivePhase(sessionPhase);

  useEffect(() => {
    if (running === null) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  useEffect(
    () => () => {
      clearTimeout(safety.current);
      // Closing the sheet mid-calibration must never leave the pump running.
      if (runningRef.current) void useDevice.getState().run('stop the pump', (d) => d.setPump(false));
    },
    [],
  );
  useEffect(() => {
    runningRef.current = running !== null;
  }, [running]);

  const start = async () => {
    setNote(null);
    const ok = await dev.run('start the pump', (d) => d.setPump(true));
    if (!ok) return;
    const t = Date.now();
    setRunning(t);
    setNow(t);
    safety.current = setTimeout(() => {
      void dev.run('stop the pump', (d) => d.setPump(false));
      setRunning(null);
      setNote('Stopped after 120 s — is the balloon leaking or the chamber blocked?');
    }, 120_000);
  };

  const full = async () => {
    if (running === null) return;
    const seconds = (Date.now() - running) / 1000;
    clearTimeout(safety.current);
    setRunning(null);
    await dev.run('stop the pump', (d) => d.setPump(false));
    record(seconds);
  };

  const cancel = async () => {
    clearTimeout(safety.current);
    setRunning(null);
    await dev.run('stop the pump', (d) => d.setPump(false));
  };

  const record = (seconds: number) => {
    const { drift } = lib.addCalibration(current.id, seconds);
    setNote(drift ?? `Recorded ${fmtSeconds(seconds)}.`);
  };

  const runs = current.calibrations;
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>Heat to your usual temperature and put a loaded filling chamber on — realistic resistance matters.</li>
        <li>Attach the empty balloon and stretch it so it stands upright.</li>
        <li>Tap Start. Tap “Full!” the moment the balloon is just taut (no wrinkles along the middle).</li>
        <li>Repeat 3 times — cleverTerpenes uses the median.</li>
      </ol>
      {running === null ? (
        <Button variant="air" size="lg" className="w-full" disabled={!connected || busy} onClick={() => void start()}>
          {connected ? 'Start pump' : 'Connect the Volcano to calibrate'}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="text-center text-5xl font-bold tabular text-air">{((now - running) / 1000).toFixed(1)} s</div>
          <Button variant="primary" size="lg" className="w-full" onClick={() => void full()}>
            Full!
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void cancel()}>
            Cancel (pump off)
          </Button>
        </div>
      )}
      {busy && <p className="text-xs text-warn">⚠ A session is running — finish it first.</p>}
      {note && <Callout tone={note.startsWith('Fill time changed') ? 'warn' : 'good'}>{note}</Callout>}
      <div className="rounded-xl bg-raised p-3">
        <div className="mb-2 text-sm font-medium">Timed it with a stopwatch instead?</div>
        <div className="flex gap-2">
          <NumberInput value={manual} min={3} max={200} step={0.5} suffix="s" onChange={setManual} className="flex-1" />
          <Button disabled={!manual} onClick={() => manual && (record(manual), setManual(undefined))}>
            Add
          </Button>
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-medium">Runs</div>
        {runs.length === 0 ? (
          <p className="text-sm text-ink-3">No runs yet.</p>
        ) : (
          <ul className="space-y-1 text-sm tabular">
            {runs
              .slice()
              .reverse()
              .map((r, i) => (
                <li key={r.at + i} className="flex justify-between text-ink-2">
                  <span>{fmtDate(r.at)}</span>
                  <span>{fmtSeconds(r.seconds)}</span>
                </li>
              ))}
          </ul>
        )}
        {current.fullTimeS && (
          <p className="mt-2 text-sm">
            Full time: <b>{fmtSeconds(current.fullTimeS)}</b> (median of the last {Math.min(3, runs.length)}) → fill{' '}
            {fmtSeconds((current.fullTimeS * current.fillPercent) / 100)} at {current.fillPercent} %.
          </p>
        )}
      </div>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" disabled={!runs.length} onClick={() => lib.clearCalibrations(current.id)}>
          Clear runs
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function BalloonsScreen() {
  const lib = useLibrary();
  const [editing, setEditing] = useState<BalloonProfile | 'new' | null>(null);
  const [calibrating, setCalibrating] = useState<BalloonProfile | null>(null);
  const flow = lib.settings.model.flowLpm;
  const activeId = lib.settings.activeBalloonId ?? lib.balloons[0]?.id;
  const learning = learningOf(lib);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Balloons</h1>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => setEditing('new')}>
          + Add balloon
        </Button>
      </div>
      <p className="text-sm text-ink-2">
        The Volcano’s pump moves about {flow} L/min and can only switch on or off, so the fill <i>time</i> is what cleverTerpenes controls.
        Every self-made balloon is different — calibrate each once and the pump stops at exactly the right moment.
      </p>
      {learning && <LearningCard learning={learning} flow={flow} onUseFlow={(q) => lib.updateSettings({ model: { ...lib.settings.model, flowLpm: q } })} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {lib.balloons.map((b, i) => {
          const fp = fillPlanFor(lib, b);
          const vol = estimateVolume(b);
          const sample = learning?.samples.find((x) => x.id === b.id);
          return (
            <Card key={b.id} tour={i === 0 ? 'balloon' : undefined}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{b.name}</div>
                  <div className="text-xs text-ink-3">{BALLOON_PRESETS[b.kind].label}</div>
                </div>
                {b.id === activeId && <Badge tone="air">active</Badge>}
                <Badge tone={fp.source === 'calibrated' ? 'good' : 'warn'}>
                  {fp.source === 'calibrated' ? '✓ calibrated' : fp.source === 'learned' ? '≈ learned estimate' : '⚠ estimate'}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-raised py-2">
                  <div className="text-lg font-semibold tabular">{fmtSeconds(fp.seconds)}</div>
                  <div className="text-[11px] text-ink-3">pump at {fp.fillPercent} %</div>
                </div>
                <div className="rounded-lg bg-raised py-2">
                  <div className="text-lg font-semibold tabular">{fmtSeconds(fp.fullSeconds)}</div>
                  <div className="text-[11px] text-ink-3">to just taut</div>
                </div>
                <div className="rounded-lg bg-raised py-2">
                  <div className="text-lg font-semibold tabular">{((fp.fullSeconds * flow) / 60).toFixed(1)} L</div>
                  <div className="text-[11px] text-ink-3">
                    {fp.source === 'calibrated' ? `full, at ${flow} L/min` : fp.source === 'learned' ? 'learned estimate' : vol.source}
                  </div>
                </div>
              </div>
              {sample && (
                <p className="mt-2 text-xs text-ink-3">
                  Width × length predicted {fmtSeconds(sample.predictedS)} ({sample.modelL.toFixed(1)} L) — measured {fmtSeconds(sample.measuredS)} → ×
                  {sample.ratio.toFixed(2)}.
                </p>
              )}
              {fp.source === 'calibrated' && !sample && b.kind !== 'easyValve' && b.kind !== 'easyValveXL' && (
                <p className="mt-2 text-xs text-ink-3">
                  Tip: add this balloon’s lay-flat width and length (Edit) — then cleverTerpenes can estimate other lengths of the same material
                  without re-calibrating.
                </p>
              )}
              {fp.warnings.map((w) => (
                <p key={w} className="mt-2 text-xs text-warn">
                  ⚠ {w}
                </p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="air" onClick={() => setCalibrating(b)}>
                  Calibrate
                </Button>
                <Button size="sm" onClick={() => setEditing(b)}>
                  Edit
                </Button>
                {b.id !== activeId && (
                  <Button size="sm" variant="ghost" onClick={() => lib.updateSettings({ activeBalloonId: b.id })}>
                    Make active
                  </Button>
                )}
                {lib.balloons.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${b.name}?`) && lib.deleteBalloon(b.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New balloon' : 'Edit balloon'}>
        {editing !== null && (
          <BalloonEditor
            learning={editing === 'new' ? learning : learnFromCalibrations(lib.balloons.filter((x) => x.id !== editing.id), flow)}
            initial={
              editing === 'new'
                ? { name: '', kind: 'diy', fillPercent: 80 }
                : {
                    name: editing.name,
                    kind: editing.kind,
                    widthCm: editing.widthCm,
                    lengthCm: editing.lengthCm,
                    lengthIsCut: editing.lengthIsCut,
                    volumeL: editing.volumeL,
                    fillPercent: editing.fillPercent,
                    notes: editing.notes,
                    fullTimeS: editing.fullTimeS,
                  }
            }
            onClose={() => setEditing(null)}
            onSave={(d) => {
              if (editing === 'new') {
                const id = lib.addBalloon(d);
                lib.updateSettings({ activeBalloonId: id });
              } else lib.updateBalloon(editing.id, d);
              setEditing(null);
            }}
          />
        )}
      </Sheet>
      <Sheet open={calibrating !== null} onClose={() => setCalibrating(null)} title={`Calibrate ${calibrating?.name ?? ''}`}>
        {calibrating && <Calibrator balloon={calibrating} onClose={() => setCalibrating(null)} />}
      </Sheet>
    </div>
  );
}

function LearningCard({ learning, flow, onUseFlow }: { learning: CalibrationLearning; flow: number; onUseFlow: (q: number) => void }) {
  const f = learning.factor;
  const q = learning.measuredFlowLpm;
  let verdict: string;
  if (Math.abs(f - 1) < 0.08) verdict = 'The model is spot on for your material.';
  else if (f > 1) verdict = `They hold more than the model thinks (softer film, a fuller “taut”) or your pump runs slower than ${flow} L/min.`;
  else verdict = `They hold less than the model thinks (bigger knot or pleats, stiffer film) or your pump runs faster than ${flow} L/min.`;
  return (
    <Card title="What your calibrations taught cleverTerpenes">
      {learning.n > 0 ? (
        <>
          <p className="text-sm text-ink-2">
            Your self-made balloons take <b className="text-ink">×{f.toFixed(2)}</b> the time the width × length model predicts
            {learning.n > 1 ? ` (${learning.n} balloons, range ×${learning.range[0].toFixed(2)}–×${learning.range[1].toFixed(2)})` : ' (1 balloon)'}. {verdict}{' '}
            Balloons you haven’t calibrated yet now use this correction.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm tabular">
              <thead className="text-xs text-ink-3">
                <tr className="border-b border-line">
                  <th className="py-1.5 pr-3 font-medium">Balloon</th>
                  <th className="py-1.5 pr-3 font-medium">Width × length</th>
                  <th className="py-1.5 pr-3 font-medium">Model</th>
                  <th className="py-1.5 pr-3 font-medium">Measured</th>
                  <th className="py-1.5 font-medium">Ratio</th>
                </tr>
              </thead>
              <tbody>
                {learning.samples.map((x) => (
                  <tr key={x.id} className="border-b border-white/5 text-ink-2">
                    <td className="py-1.5 pr-3 text-ink">{x.name}</td>
                    <td className="py-1.5 pr-3">
                      {x.widthCm} × {x.lengthCm} cm{x.lengthIsCut ? ' (cut)' : ''}
                    </td>
                    <td className="py-1.5 pr-3">
                      {fmtSeconds(x.predictedS)} · {x.modelL.toFixed(1)} L
                    </td>
                    <td className="py-1.5 pr-3">
                      {fmtSeconds(x.measuredS)} · {x.impliedL.toFixed(1)} L
                    </td>
                    <td className="py-1.5">×{x.ratio.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-2">Add width and length to a calibrated self-made balloon and cleverTerpenes will learn how your material fills.</p>
      )}
      {q !== undefined && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-raised p-3 text-sm text-ink-2">
          <span>
            Your measured volume says the pump moves <b className="text-ink">≈ {q.toFixed(1)} L/min</b> (setting: {flow} L/min).
          </span>
          {Math.abs(q - flow) / flow > 0.03 && (
            <Button size="sm" onClick={() => onUseFlow(Math.round(q * 10) / 10)}>
              Use {q.toFixed(1)} L/min
            </Button>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">Litres shown for calibrated balloons assume {flow} L/min; the fill time itself is exact either way.</p>
    </Card>
  );
}
