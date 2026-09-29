import { useEffect, useMemo, useState } from 'react';
import { COMPOUNDS } from '../science/compounds';
import { GOALS, buildPlan, evaluateCustom, suggestBalloonCount, type Goal, type PlannedBalloon } from '../science/planner';
import type { BalloonSpec } from '../science/releaseModel';
import { useDevice } from '../store/device';
import { activeBalloon, fillPlanFor, useLibrary } from '../store/library';
import { isActivePhase, useSession, type RunPlan } from '../store/session';
import { Badge, Button, Callout, Card, Field, NumberInput, Segmented, Select, Sheet, Stat, cx } from '../ui/primitives';
import { PlanChart } from '../ui/charts';
import { fmtMg, fmtSeconds, fmtTemp, type Unit } from '../ui/format';
import { go, type Route } from '../ui/route';
import { SessionRunner } from './SessionRunner';
import { MethodBadge, provenanceOf } from './strainParts';

const COMFORT_BADGE = {
  smooth: { tone: 'good' as const, label: '✓ smooth' },
  moderate: { tone: 'warn' as const, label: '◐ moderate' },
  harsh: { tone: 'serious' as const, label: '⚠ harsh' },
};

function BalloonTable({ balloons, unit }: { balloons: PlannedBalloon[]; unit: Unit }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs text-ink-3">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-medium">#</th>
            <th className="py-2 pr-3 font-medium">Temperature</th>
            <th className="py-2 pr-3 font-medium">Pump</th>
            <th className="py-2 pr-3 font-medium">Terpenes</th>
            <th className="py-2 pr-3 font-medium">Cannabinoids</th>
            <th className="py-2 pr-3 font-medium">Aroma</th>
            <th className="py-2 font-medium">Comfort</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {balloons.map((b) => (
            <tr key={b.index} className="border-b border-white/5 align-top">
              <td className="py-2 pr-3 text-ink-3">{b.index + 1}</td>
              <td className="py-2 pr-3 font-semibold">
                {b.segments.length > 1 ? b.segments.map((s) => fmtTemp(s.tempC, unit)).join(' → ') : fmtTemp(b.tempC, unit)}
              </td>
              <td className="py-2 pr-3">
                {fmtSeconds(b.pumpSeconds)}
                {b.preheatSeconds > 0 && <div className="text-xs text-ink-3">+{b.preheatSeconds} s pre-heat</div>}
              </td>
              <td className="py-2 pr-3">
                {fmtMg(b.result.terpMg)} mg<div className="text-xs text-ink-3">{Math.round(b.result.terpShare * 100)} % of vapour</div>
              </td>
              <td className="py-2 pr-3">
                {fmtMg(b.result.cannMg)} mg<div className="text-xs text-ink-3">{fmtMg(b.result.thcMg)} mg THC</div>
              </td>
              <td className="py-2 pr-3 text-xs text-ink-2">
                {b.aroma.length ? b.aroma.map((a) => COMPOUNDS[a.id].aroma.split(',')[0]).join(', ') : <span className="text-ink-3">faint</span>}
              </td>
              <td className="py-2">
                <Badge tone={COMFORT_BADGE[b.comfort].tone}>{COMFORT_BADGE[b.comfort].label}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanEditor({
  open,
  onClose,
  initial,
  onSave,
  unit,
}: {
  open: boolean;
  onClose: () => void;
  initial: BalloonSpec[];
  onSave: (specs: BalloonSpec[]) => void;
  unit: Unit;
}) {
  const [rows, setRows] = useState<BalloonSpec[]>(initial);
  useEffect(() => {
    if (open) setRows(initial);
  }, [open, initial]);
  const update = (i: number, fn: (b: BalloonSpec) => BalloonSpec) => setRows((r) => r.map((b, j) => (j === i ? fn(b) : b)));
  return (
    <Sheet open={open} onClose={onClose} title="Edit plan" wide>
      <p className="mb-3 text-sm text-ink-2">
        Temperatures in °C (the device works in °C). Split a balloon into steps to fill it at rising temperatures, like the S&amp;B
        workflows — the pump pauses while the Volcano heats to the next step.
      </p>
      <div className="space-y-3">
        {rows.map((b, i) => (
          <div key={i} className="rounded-xl bg-raised p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Balloon {i + 1}</div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => update(i, (x) => ({ ...x, segments: [...x.segments, { ...x.segments[x.segments.length - 1] }] }))}>
                  + step
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} disabled={rows.length <= 1}>
                  Remove
                </Button>
              </div>
            </div>
            {b.segments.map((s, k) => (
              <div key={k} className="mb-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <Field label={`Step ${k + 1} temperature`}>
                  <NumberInput
                    value={s.tempC}
                    min={40}
                    max={230}
                    suffix="°C"
                    onChange={(v) => update(i, (x) => ({ ...x, segments: x.segments.map((y, m) => (m === k ? { ...y, tempC: Math.max(40, Math.min(230, v ?? y.tempC)) } : y)) }))}
                  />
                </Field>
                <Field label="Pump">
                  <NumberInput
                    value={s.seconds}
                    min={1}
                    max={120}
                    step={0.5}
                    suffix="s"
                    onChange={(v) => update(i, (x) => ({ ...x, segments: x.segments.map((y, m) => (m === k ? { ...y, seconds: Math.max(0.5, v ?? y.seconds) } : y)) }))}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={b.segments.length <= 1}
                  onClick={() => update(i, (x) => ({ ...x, segments: x.segments.filter((_, m) => m !== k) }))}
                  aria-label="Remove step"
                >
                  ×
                </Button>
              </div>
            ))}
            <Field label="Pre-heat (beeps when to put the balloon on)">
              <NumberInput value={b.preheatSeconds} min={0} max={15} suffix="s" onChange={(v) => update(i, (x) => ({ ...x, preheatSeconds: Math.max(0, v ?? 0) }))} />
            </Field>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setRows((r) => [...r, { segments: [{ ...r[r.length - 1].segments[0], tempC: Math.min(230, r[r.length - 1].segments[0].tempC + 8) }], preheatSeconds: 0 }])}>
          + Balloon
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onSave(rows)}>
          Save plan
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-3">Shown in {unit === 'F' ? '°C for editing (display unit °F elsewhere)' : '°C'}.</p>
    </Sheet>
  );
}

export function PlanScreen({ route }: { route: Route }) {
  const lib = useLibrary();
  const dev = useDevice();
  const session = useSession();
  const unit = lib.settings.unit;
  const queryStrain = route.query.get('strain') ?? undefined;
  const [strainId, setStrainId] = useState<string>(queryStrain ?? lib.strains.find((s) => s.favorite)?.id ?? lib.strains[0]?.id ?? '');
  const strain = lib.strains.find((s) => s.id === strainId);
  const prefs = strain?.prefs;
  const [goal, setGoal] = useState<Goal>(prefs?.goal ?? 'balanced');
  const [loadMg, setLoadMg] = useState<number>(prefs?.loadMg ?? lib.settings.defaultLoadMg);
  const [count, setCount] = useState<number | 'auto'>(prefs?.balloonCount ?? 'auto');
  const [balloonId, setBalloonId] = useState<string>(prefs?.balloonId ?? activeBalloon(lib)?.id ?? '');
  const [preheat, setPreheat] = useState<number>(prefs?.preheatSeconds ?? lib.settings.preheatSeconds);
  const [maxTemp, setMaxTemp] = useState<number>(prefs?.maxTempC ?? lib.settings.maxTempC);
  const [useCustom, setUseCustom] = useState<boolean>(!!strain?.customPlan);
  const [editorInitial, setEditorInitial] = useState<BalloonSpec[] | null>(null);
  const [localCustom, setLocalCustom] = useState<BalloonSpec[] | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (queryStrain && queryStrain !== strainId) setStrainId(queryStrain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryStrain]);

  // Load the strain's saved preferences whenever the strain changes.
  useEffect(() => {
    const p = lib.strains.find((s) => s.id === strainId)?.prefs;
    setGoal(p?.goal ?? 'balanced');
    setLoadMg(p?.loadMg ?? lib.settings.defaultLoadMg);
    setCount(p?.balloonCount ?? 'auto');
    if (p?.balloonId && lib.balloons.some((b) => b.id === p.balloonId)) setBalloonId(p.balloonId);
    setPreheat(p?.preheatSeconds ?? lib.settings.preheatSeconds);
    setMaxTemp(p?.maxTempC ?? lib.settings.maxTempC);
    setUseCustom(!!lib.strains.find((s) => s.id === strainId)?.customPlan);
    setLocalCustom(null);
    setSavedNote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strainId]);

  const balloon = lib.balloons.find((b) => b.id === balloonId) ?? activeBalloon(lib);
  const fp = balloon ? fillPlanFor(lib, balloon) : null;
  const suggested = suggestBalloonCount(loadMg, fp?.litres ?? 8);
  const n = count === 'auto' ? suggested : count;

  const plan = useMemo(() => {
    if (!fp) return null;
    return buildPlan({
      percent: strain?.percent ?? {},
      loadMg,
      pumpSeconds: fp.seconds,
      balloonCount: n,
      goal,
      minTempC: lib.settings.minTempC,
      maxTempC: maxTemp,
      preheatSeconds: preheat,
      firstOffsetC: prefs?.firstOffsetC ?? 0,
      laterOffsetC: prefs?.laterOffsetC ?? 0,
      model: lib.settings.model,
    });
  }, [strain?.percent, loadMg, fp?.seconds, n, goal, lib.settings.minTempC, maxTemp, preheat, prefs?.firstOffsetC, prefs?.laterOffsetC, lib.settings.model, fp]);

  const customSpecs = localCustom ?? strain?.customPlan?.balloons ?? null;
  const customBalloons = useMemo(
    () => (useCustom && customSpecs ? evaluateCustom(strain?.percent ?? {}, loadMg, customSpecs, lib.settings.model) : null),
    [useCustom, customSpecs, strain?.percent, loadMg, lib.settings.model],
  );
  const shown = customBalloons ?? plan?.balloons ?? [];

  if (isActivePhase(session.phase) || session.phase === 'done' || session.phase === 'error') {
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Session">
          <SessionRunner />
        </Card>
        <Card className="lg:col-span-2" title="Volcano">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Now" value={fmtTemp(dev.currentC, unit)} sub={dev.heaterOn ? 'heater on' : 'heater off'} />
            <Stat label="Target" value={fmtTemp(dev.targetC, unit)} sub={dev.pumpOn ? 'pump running' : 'pump off'} />
          </div>
          {session.plan && session.plan.predictedThcMg !== undefined && (
            <p className="mt-3 text-xs text-ink-3">Model estimate for the whole session: ≈ {fmtMg(session.plan.predictedThcMg)} mg THC delivered into balloons.</p>
          )}
        </Card>
      </div>
    );
  }

  const startSession = () => {
    if (!balloon || !shown.length) return;
    const runPlan: RunPlan = {
      balloons: shown.map((b) => ({
        segments: b.segments.map((s) => ({ tempC: s.tempC, seconds: Math.round(s.seconds * 10) / 10 })),
        preheatSeconds: b.preheatSeconds,
        predictedThcMg: b.result.thcMg,
      })),
      strainId: strain?.id,
      strainName: strain?.name ?? 'Typical flower',
      balloonName: balloon.name,
      loadMg,
      goal: customBalloons ? 'custom' : goal,
      predictedThcMg: shown.reduce((s, b) => s + b.result.thcMg, 0),
    };
    void session.start(runPlan);
  };

  const savePrefs = () => {
    if (!strain) return;
    lib.updateStrainPrefs(strain.id, { goal, loadMg, balloonCount: count === 'auto' ? undefined : count, balloonId: balloon?.id, preheatSeconds: preheat, maxTempC: maxTemp });
    setSavedNote(`Saved as the default plan settings for ${strain.name}.`);
  };

  const specsFromShown = (): BalloonSpec[] => shown.map((b) => ({ segments: b.segments.map((s) => ({ ...s })), preheatSeconds: b.preheatSeconds }));

  const totalThc = shown.reduce((s, b) => s + b.result.thcMg, 0);
  const connected = dev.status === 'connected';

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Strain"
            hint={
              strain ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  Profile: <MethodBadge method={provenanceOf(strain).method} />
                  <button className="underline" onClick={() => go(`strains/${strain.id}`)}>
                    how it was made
                  </button>
                </span>
              ) : undefined
            }
          >
            <Select
              value={strainId}
              onChange={setStrainId}
              options={[{ value: '', label: 'No strain — typical flower profile' }, ...lib.strains.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
          <Field
            label="Balloon"
            hint={fp ? `${fmtSeconds(fp.seconds)} pump · ${fp.fillPercent} % of ${fmtSeconds(fp.fullSeconds)} · ≈ ${fp.litres.toFixed(1)} L · ${fp.source === 'calibrated' ? 'calibrated' : fp.source === 'learned' ? 'estimate from your other balloons' : 'estimate — calibrate for accuracy'}` : undefined}
          >
            <Select value={balloon?.id ?? ''} onChange={setBalloonId} options={lib.balloons.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="Herb in the chamber" hint="Weigh it for best results — 0.15–0.3 g is typical for 3–5 balloons.">
            <div className="flex flex-wrap items-center gap-2">
              <NumberInput value={loadMg} min={30} max={700} step={10} suffix="mg" onChange={(v) => setLoadMg(Math.max(30, Math.min(700, v ?? 200)))} className="w-32" />
              {[100, 150, 200, 250, 300, 400].map((m) => (
                <button key={m} onClick={() => setLoadMg(m)} className={cx('rounded-lg border px-2.5 py-1.5 text-xs tabular', loadMg === m ? 'border-ink text-ink' : 'border-line text-ink-3 hover:text-ink')}>
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Balloons" hint={count === 'auto' ? `Auto: ${suggested} for ${loadMg} mg and this balloon size` : undefined}>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setCount('auto')} className={cx('rounded-lg border px-3 py-1.5 text-sm', count === 'auto' ? 'border-ink bg-ink text-black' : 'border-line text-ink-2')}>
                Auto
              </button>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => (
                <button key={k} onClick={() => setCount(k)} className={cx('min-w-9 rounded-lg border px-2 py-1.5 text-sm tabular', count === k ? 'border-ink bg-ink text-black' : 'border-line text-ink-2')}>
                  {k}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Segmented
            value={goal}
            onChange={setGoal}
            options={(Object.keys(GOALS) as Goal[]).map((g) => ({ value: g, label: GOALS[g].label }))}
          />
          <p className="mt-2 text-sm text-ink-3">{GOALS[goal].blurb}</p>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-3 hover:text-ink">Fine-tuning</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field
              label="Pre-heat (pump before balloon)"
              hint="0 s: put the balloon on, then tap Start. With pre-heat the pump runs first and beeps when to put the balloon on — filling continues by itself. Shorter keeps more of the lightest terpenes."
            >
              <NumberInput value={preheat} min={0} max={10} suffix="s" onChange={(v) => setPreheat(Math.max(0, Math.min(10, v ?? 0)))} />
            </Field>
            <Field label="Never hotter than" hint={`The goal “${GOALS[goal].label}” stops at ${GOALS[goal].maxC} °C.`}>
              <NumberInput value={maxTemp} min={160} max={230} suffix="°C" onChange={(v) => setMaxTemp(Math.max(160, Math.min(230, v ?? 230)))} />
            </Field>
            <Field label="Learned from your ratings">
              <div className="flex items-center gap-2 py-2 text-sm text-ink-2">
                <span className="tabular">
                  1st {signed(prefs?.firstOffsetC ?? 0)} °C · later {signed(prefs?.laterOffsetC ?? 0)} °C
                </span>
                {strain && (prefs?.firstOffsetC || prefs?.laterOffsetC) ? (
                  <Button size="sm" variant="ghost" onClick={() => lib.updateStrainPrefs(strain.id, { firstOffsetC: 0, laterOffsetC: 0 })}>
                    Reset
                  </Button>
                ) : null}
              </div>
            </Field>
          </div>
        </details>
      </Card>

      {!strain && (
        <Callout tone="info" title="Better with your strain’s terpenes">
          Without a strain the plan uses a typical US flower profile.{' '}
          <button className="underline" onClick={() => go('strains?add=1')}>
            Add your strain
          </button>{' '}
          from lab data or paste the values from your product’s label / certificate (COA).
        </Callout>
      )}

      {plan && (
        <Card
          title={customBalloons ? 'Your custom plan' : 'Your balloon plan'}
          action={
            <div className="flex flex-wrap gap-2">
              {customBalloons && <Badge tone="air">custom</Badge>}
              <Badge tone="neutral">model estimate</Badge>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Balloons" value={shown.length} sub={`${fmtSeconds(shown[0]?.pumpSeconds ?? 0)} pump each`} />
            <Stat label="Temperatures" value={`${Math.min(...shown.map((b) => b.tempC))}–${Math.max(...shown.map((b) => b.tempC))} °C`} sub={unit === 'F' ? `${fmtTemp(Math.min(...shown.map((b) => b.tempC)), 'F')} → ${fmtTemp(Math.max(...shown.map((b) => b.tempC)), 'F')}` : 'first → last'} />
            <Stat label="Balloon 1 flavour" value={`${Math.round((shown[0]?.result.terpShare ?? 0) * 100)} %`} sub="terpene share of vapour" />
            <Stat label="THC into balloons" value={`≈ ${fmtMg(totalThc)} mg`} sub={`${Math.round((shown[shown.length - 1]?.result.cumCannReleased ?? 0) * 100)} % of the herb’s cannabinoids released`} />
          </div>
          <PlanChart balloons={shown} unit={unit} />
          <div className="mt-4" data-tour="plan">
            <BalloonTable balloons={shown} unit={unit} />
          </div>
          {!customBalloons && (
            <ul className="mt-4 space-y-2 text-sm text-ink-2">
              {plan.explanation.map((e) => (
                <li key={e} className="flex gap-2">
                  <span className="text-ink-3" aria-hidden="true">
                    •
                  </span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.warnings.length > 0 && !customBalloons && (
            <div className="mt-3 space-y-2">
              {plan.warnings.map((w) => (
                <Callout key={w} tone="warn">
                  {w}
                </Callout>
              ))}
            </div>
          )}
          {fp?.warnings.map((w) => (
            <Callout key={w} tone="warn" className="mt-2">
              {w}
            </Callout>
          ))}
          <div className="mt-5 flex flex-wrap gap-2">
            {connected ? (
              <Button variant="heat" size="lg" onClick={startSession}>
                Start session
              </Button>
            ) : (
              <Button variant="heat" size="lg" onClick={() => go('control')}>
                Connect to start
              </Button>
            )}
            <Button onClick={() => setEditorInitial(specsFromShown())}>Edit plan</Button>
            {customBalloons && (
              <Button
                variant="ghost"
                onClick={() => {
                  setUseCustom(false);
                  setLocalCustom(null);
                  if (strain?.customPlan) lib.updateStrain(strain.id, { customPlan: undefined });
                }}
              >
                Back to automatic
              </Button>
            )}
            {strain && (
              <Button variant="ghost" onClick={savePrefs}>
                Save as {strain.name} default
              </Button>
            )}
          </div>
          {savedNote && <p className="mt-2 text-sm text-good">✓ {savedNote}</p>}
          <p className="mt-4 text-xs text-ink-3">
            Numbers come from a physics model calibrated to published Volcano measurements (±50 %). They show what changes between
            balloons and settings — not an exact dose. Not medical advice.
          </p>
        </Card>
      )}

      <PlanEditor
        open={editorInitial !== null}
        onClose={() => setEditorInitial(null)}
        initial={editorInitial ?? []}
        unit={unit}
        onSave={(specs) => {
          setEditorInitial(null);
          setLocalCustom(specs);
          setUseCustom(true);
          if (strain) lib.updateStrain(strain.id, { customPlan: { balloons: specs, savedAt: new Date().toISOString() } });
        }}
      />
    </div>
  );
}

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}
