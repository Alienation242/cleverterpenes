import { useEffect, useMemo, useState } from 'react';
import { COMPOUNDS } from '../science/compounds';
import { profileInsight } from '../science/planner';
import type { Amounts } from '../science/releaseModel';
import { findCompoundNames, parseCoaText, type ParsedCoa } from '../data/coaParser';
import { estimateFromNames, isTerpene, loadTerpeneSets, type ProfileResult } from '../data/estimate';
import type { Provenance, StrainEntry } from '../data/types';
import { useLibrary } from '../store/library';
import { Badge, Button, Callout, Card, Empty, Field, Segmented, Sheet, TextArea, TextInput, Toggle, cx } from '../ui/primitives';
import { TerpeneBars } from '../ui/charts';
import { daysSince } from '../ui/format';
import { go, type Route } from '../ui/route';
import { FindStrain } from './FindStrain';
import {
  BatchFields,
  CONF_BADGE,
  Cannabinoids,
  MethodBadge,
  ProfileForm,
  ProvenanceCard,
  SOURCE_LABEL,
  TopTerpenes,
  cleanAmounts,
  provenanceOf,
  terpeneData,
} from './strainParts';

/* ---------- label / COA ---------- */

function CoaTab({ onSaved }: { onSaved: (id: string) => void }) {
  const lib = useLibrary();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedCoa | null>(null);
  const [meta, setMeta] = useState<Partial<StrainEntry>>({ name: '' });
  const [values, setValues] = useState<Amounts>({});
  const [estimate, setEstimate] = useState<ProfileResult | null>(null);

  const namesOnly = useMemo(() => {
    if (!parsed) return [];
    const hasTerpValues = Object.keys(parsed.percent).some((id) => COMPOUNDS[id as keyof typeof COMPOUNDS]?.cls !== 'cannabinoid');
    return hasTerpValues ? [] : findCompoundNames(text).filter(isTerpene);
  }, [parsed, text]);

  const read = () => {
    const r = parseCoaText(text);
    setParsed(r);
    setValues(r.percent);
    setEstimate(null);
  };

  const estimateAmounts = async () => {
    const sets = await loadTerpeneSets();
    const est = estimateFromNames(sets, namesOnly);
    setEstimate(est);
    setValues({ ...est.percent, ...Object.fromEntries(Object.entries(values).filter(([id]) => COMPOUNDS[id as keyof typeof COMPOUNDS]?.cls === 'cannabinoid')) });
  };

  const save = () => {
    const percent = cleanAmounts(values);
    const provenance: Provenance = estimate
      ? { ...estimate.provenance, steps: [...estimate.provenance.steps, 'Cannabinoids from the pasted label.'] }
      : {
          method: 'lab-batch',
          steps: [
            `Read ${Object.keys(percent).length} values from the pasted label / certificate of analysis.`,
            'This is the lab result for your own batch — the most accurate profile possible.',
          ],
          sources: [],
        };
    onSaved(
      lib.addStrain({
        name: meta.name!.trim(),
        source: estimate ? 'names' : 'coa',
        sourceDetail: provenance.steps[0],
        confidence: estimate ? estimate.confidence : 'batch',
        percent,
        provenance,
        producer: meta.producer,
        batch: meta.batch,
        testDate: meta.testDate,
        packagedDate: meta.packagedDate,
      }),
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Copy the terpene and cannabinoid lines from your product’s label, the pharmacy page or the certificate of analysis (German or English, % or
        mg/g) and paste them here. Names without amounts work too.
      </p>
      <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder={'β-Myrcen 0,45 %\nLimonen 0,31 %\nβ-Caryophyllen 0,52 %\nTHCA 24,6 %'} />
      <Button onClick={read} disabled={!text.trim()}>
        Read values
      </Button>
      {parsed && (
        <div className="space-y-4">
          {parsed.warnings.map((w) => (
            <Callout key={w} tone="warn">
              {w}
            </Callout>
          ))}
          {namesOnly.length > 0 && !estimate && (
            <Callout tone="info" title={`Found ${namesOnly.length} terpene names but no amounts`}>
              {namesOnly.map((id) => COMPOUNDS[id].name).join(', ')}.{' '}
              <button className="underline" onClick={() => void estimateAmounts()}>
                Estimate amounts from lab tests with the same top terpenes
              </button>
            </Callout>
          )}
          {estimate && <ProvenanceCard provenance={estimate.provenance} compact />}
          {parsed.unmatched.length > 0 && <p className="text-xs text-ink-3">Not recognised: {parsed.unmatched.slice(0, 6).join(' · ')}</p>}
          {parsed.belowLimit.length > 0 && (
            <p className="text-xs text-ink-3">Below detection limit: {parsed.belowLimit.map((id) => COMPOUNDS[id].name).join(', ')}</p>
          )}
          <ProfileForm value={values} onChange={setValues} />
          <Field label="Name">
            <TextInput value={meta.name ?? ''} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Product / cultivar name" />
          </Field>
          <BatchFields entry={meta} onChange={(p) => setMeta({ ...meta, ...p })} />
          <Button variant="primary" disabled={!meta.name?.trim()} onClick={save}>
            Save strain
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- manual ---------- */

function ManualTab({ onSaved }: { onSaved: (id: string) => void }) {
  const lib = useLibrary();
  const [name, setName] = useState('');
  const [values, setValues] = useState<Amounts>({});
  const [fromLabel, setFromLabel] = useState(true);
  const [meta, setMeta] = useState<Partial<StrainEntry>>({});
  return (
    <div className="space-y-4">
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pink Kush (Aurora)" />
      </Field>
      <ProfileForm value={values} onChange={setValues} />
      <Toggle checked={fromLabel} onChange={setFromLabel} label="Values are from my product’s label / COA" hint="Otherwise they are marked as a rough guess." />
      <BatchFields entry={meta} onChange={(p) => setMeta({ ...meta, ...p })} />
      <Button
        variant="primary"
        disabled={!name.trim()}
        onClick={() =>
          onSaved(
            lib.addStrain({
              name: name.trim(),
              source: 'manual',
              sourceDetail: fromLabel ? 'Entered from product label' : 'Entered manually (estimate)',
              confidence: fromLabel ? 'batch' : 'low',
              percent: cleanAmounts(values),
              provenance: fromLabel
                ? { method: 'lab-batch', steps: ['Typed in from your product label / certificate of analysis.'], sources: [] }
                : { method: 'manual', steps: ['Values typed in by you without a lab document — treated as a rough guess.'], sources: [] },
              ...meta,
            }),
          )
        }
      >
        Save strain
      </Button>
    </div>
  );
}

function AddStrainSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'find' | 'coa' | 'manual'>('find');
  const saved = (id: string) => {
    onClose();
    go(`strains/${id}`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a strain" wide>
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-4"
        options={[
          { value: 'find', label: 'Search' },
          { value: 'coa', label: 'Label / COA' },
          { value: 'manual', label: 'Type values' },
        ]}
      />
      {tab === 'find' && <FindStrain onSaved={saved} onPasteLabel={() => setTab('coa')} />}
      {tab === 'coa' && <CoaTab onSaved={saved} />}
      {tab === 'manual' && <ManualTab onSaved={saved} />}
    </Sheet>
  );
}

/* ---------- detail ---------- */

function StrainDetail({ strain }: { strain: StrainEntry }) {
  const lib = useLibrary();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StrainEntry>(strain);
  const [notes, setNotes] = useState(strain.notes ?? '');
  const insight = profileInsight(strain.percent);
  const age = daysSince(strain.packagedDate || strain.testDate);
  const sessions = lib.sessions.filter((s) => s.strainId === strain.id);
  const monoShare = insight.classShares.monoterpenes;
  const provenance = provenanceOf(strain);
  const isEstimate = ['names-estimate', 'lineage-estimate', 'typical'].includes(provenance.method);

  return (
    <div className="space-y-4">
      <button className="text-sm text-ink-3 hover:text-ink" onClick={() => go('strains')}>
        ← All strains
      </button>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{strain.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <MethodBadge method={provenance.method} />
              <Badge tone={CONF_BADGE[strain.confidence].tone}>{CONF_BADGE[strain.confidence].label}</Badge>
              {strain.producer && <span className="text-xs text-ink-3">{strain.producer}</span>}
              {strain.batch && <span className="text-xs text-ink-3">batch {strain.batch}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => lib.updateStrain(strain.id, { favorite: !strain.favorite })} aria-pressed={!!strain.favorite}>
              {strain.favorite ? '★ Favourite' : '☆ Favourite'}
            </Button>
            <Button variant="heat" size="sm" onClick={() => go(`plan?strain=${strain.id}`)}>
              Plan session
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <ProvenanceCard provenance={provenance} compact={!isEstimate} />
        </div>
        {isEstimate && (
          <p className="mt-2 text-xs text-ink-3">
            Got the batch label or certificate? Use “Edit values” — real numbers replace this estimate and the plan improves.
          </p>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-3" title="Terpene profile">
          <TerpeneBars data={terpeneData(strain.percent, strain.ranges)} />
          <p className="mt-3 text-sm text-ink-2">
            Total {insight.totalTerpPct.toFixed(2)} % (typical flower ≈ 1.9 %) · Cannabinoids: <Cannabinoids percent={strain.percent} />
          </p>
        </Card>
        <Card className="md:col-span-2" title="What it means in the Volcano">
          <ul className="space-y-2 text-sm text-ink-2">
            <li>
              <b className="text-ink">{Math.round(monoShare * 100)} %</b> volatile monoterpenes — these leave the herb within the first ~20 s of balloon 1
              at any setting.
            </li>
            <li>
              <b className="text-ink">{Math.round(insight.classShares.sesquiterpenes * 100)} %</b> sesquiterpenes (peppery, woody) — out mostly in balloon 1,
              some in balloon 2.
            </li>
            <li>
              <b className="text-ink">{Math.round((insight.classShares.oxygenatedMono + insight.classShares.lowVolatility) * 100)} %</b> heavier alcohols
              (floral, woody) — the slowest; they linger into later balloons.
            </li>
            {insight.dominant.length > 0 && <li>Expect: {insight.dominant.map((d) => COMPOUNDS[d.id].aroma.split(',').slice(0, 2).join(',')).join(' · ')}.</li>}
          </ul>
          {age !== undefined && age > 90 && monoShare > 0.4 && (
            <Callout tone="warn" className="mt-3" title={`Tested ${age} days ago`}>
              Monoterpenes fade in storage (older studies: −30–55 % within weeks to months). The flavour is probably weaker than the label says.
            </Callout>
          )}
        </Card>
      </div>

      <Card title="Notes">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => lib.updateStrain(strain.id, { notes })} placeholder="Taste, effect, where you bought it…" className="font-sans text-sm" />
        {sessions.length > 0 && (
          <p className="mt-2 text-xs text-ink-3">
            {sessions.length} session{sessions.length > 1 ? 's' : ''} logged ·{' '}
            <button className="underline" onClick={() => go('history')}>
              history
            </button>
          </p>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setDraft(strain);
            setEditing(true);
          }}
        >
          Edit values
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            const id = lib.addStrain({ ...strain, name: `${strain.name} (copy)`, prefs: strain.prefs });
            go(`strains/${id}`);
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="ghost"
          className="text-critical"
          onClick={() => {
            if (confirm(`Delete ${strain.name}? Session history stays.`)) {
              lib.deleteStrain(strain.id);
              go('strains');
            }
          }}
        >
          Delete
        </Button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title={`Edit ${strain.name}`} wide>
        <div className="space-y-4">
          <Field label="Name">
            <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <ProfileForm value={draft.percent} onChange={(percent) => setDraft({ ...draft, percent })} />
          <BatchFields entry={draft} onChange={(p) => setDraft({ ...draft, ...p })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const valuesChanged = JSON.stringify(cleanAmounts(draft.percent)) !== JSON.stringify(cleanAmounts(strain.percent));
                const provenance: Provenance | undefined = valuesChanged
                  ? {
                      method: 'manual',
                      steps: [
                        'Values edited by you.',
                        `Before: ${provenanceOf(strain).steps[0]}`,
                        'Mark it as your batch by re-entering it via “Label / COA” if the numbers come from a lab document.',
                      ],
                      sources: provenanceOf(strain).sources,
                    }
                  : strain.provenance;
                lib.updateStrain(strain.id, { ...draft, percent: cleanAmounts(draft.percent), provenance, ranges: valuesChanged ? undefined : draft.ranges });
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

export function StrainsScreen({ route }: { route: Route }) {
  const lib = useLibrary();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(route.query.get('add') === '1');
  useEffect(() => {
    if (route.query.get('add') === '1') setAdding(true);
  }, [route]);
  const id = route.path[1];
  const strain = id ? lib.strains.find((s) => s.id === id) : undefined;
  if (id && strain) return <StrainDetail strain={strain} />;

  const list = lib.strains
    .filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Strains</h1>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => setAdding(true)}>
          + Add strain
        </Button>
      </div>
      {lib.strains.length > 0 && <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter your strains" />}
      {lib.strains.length === 0 ? (
        <Empty
          title="No strains yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first strain
            </Button>
          }
        >
          Search any strain or pharmacy product: cleverTerpenes uses lab data when it exists, a live product registry, or a clearly labelled estimate from the
          terpene names on the package — and always shows how the profile was made.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => (
            <button key={s.id} onClick={() => go(`strains/${s.id}`)} className={cx('rounded-2xl border border-white/10 bg-card p-4 text-left transition hover:border-white/25')}>
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">
                  {s.favorite ? '★ ' : ''}
                  {s.name}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <MethodBadge method={provenanceOf(s).method} />
              </div>
              <div className="mt-1 text-xs text-ink-3">
                {SOURCE_LABEL[s.source]} · <Cannabinoids percent={s.percent} />
              </div>
              <div className="mt-2">
                <TopTerpenes percent={s.percent} />
              </div>
            </button>
          ))}
        </div>
      )}
      <AddStrainSheet
        open={adding}
        onClose={() => {
          setAdding(false);
          if (route.query.get('add')) go('strains');
        }}
      />
    </div>
  );
}
