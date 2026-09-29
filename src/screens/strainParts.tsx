// Shared pieces of the strain screens: badges, profile summaries, forms, and the
// "How this profile was made" card.

import { useState } from 'react';
import { CANNABINOID_IDS, COMPOUNDS, TERPENE_IDS, type CompoundId, type TerpeneId } from '../science/compounds';
import type { Amounts } from '../science/releaseModel';
import type { DataConfidence, ProfileMethod, Provenance, StrainEntry, StrainSource } from '../data/types';
import { Badge, Field, NumberInput, Segmented, TextInput } from '../ui/primitives';
import type { TerpeneBarDatum } from '../ui/charts';

export const SOURCE_LABEL: Record<StrainSource, string> = {
  coa: 'Your label / COA',
  database: 'US lab database',
  registry: 'CT product registry',
  cannlytics: 'Cannlytics',
  manual: 'Manual entry',
  names: 'Estimate from terpene names',
  lineage: 'Estimate from parent strains',
  typical: 'Typical flower',
};

export const CONF_BADGE: Record<DataConfidence, { tone: 'good' | 'terp' | 'warn' | 'neutral'; label: string }> = {
  batch: { tone: 'good', label: '✓ your batch' },
  high: { tone: 'terp', label: '● high confidence' },
  medium: { tone: 'neutral', label: '◐ medium confidence' },
  low: { tone: 'warn', label: '○ low confidence' },
};

export const METHOD: Record<ProfileMethod, { label: string; tone: 'good' | 'terp' | 'neutral' | 'warn' | 'serious'; rank: number }> = {
  'lab-batch': { label: 'Lab test · your batch', tone: 'good', rank: 1 },
  'lab-product': { label: 'Lab test · same product, other batch', tone: 'terp', rank: 2 },
  'lab-strain': { label: 'Lab data · strain median', tone: 'terp', rank: 3 },
  'combined-estimate': { label: 'Estimate · terpene names + parents', tone: 'warn', rank: 4 },
  'names-estimate': { label: 'Estimate · from terpene names', tone: 'warn', rank: 4 },
  'lineage-estimate': { label: 'Estimate · from parent strains', tone: 'warn', rank: 5 },
  typical: { label: 'Estimate · typical flower', tone: 'serious', rank: 6 },
  manual: { label: 'Entered by you', tone: 'neutral', rank: 2 },
};

export const MAIN_TERPENES: TerpeneId[] = [
  'myrcene',
  'limonene',
  'caryophyllene',
  'humulene',
  'linalool',
  'alphaPinene',
  'betaPinene',
  'terpinolene',
  'ocimene',
  'bisabolol',
  'nerolidol',
  'caryophylleneOxide',
];

export function terpeneData(percent: Amounts, ranges?: StrainEntry['ranges']): TerpeneBarDatum[] {
  return TERPENE_IDS.filter((id) => (percent[id] ?? 0) > 0).map((id) => ({ id, value: percent[id] ?? 0, range: ranges?.[id] }));
}

export function TopTerpenes({ percent }: { percent: Amounts }) {
  const top = TERPENE_IDS.map((id) => ({ id, v: percent[id] ?? 0 }))
    .filter((t) => t.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  if (!top.length) return <span className="text-xs text-ink-3">no terpene data</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {top.map((t) => (
        <span key={t.id} className="rounded-md bg-raised px-2 py-0.5 text-xs text-ink-2 tabular">
          {COMPOUNDS[t.id].name} {t.v.toFixed(2)} %
        </span>
      ))}
    </div>
  );
}

export function Cannabinoids({ percent }: { percent: Amounts }) {
  const list = CANNABINOID_IDS.filter((id) => (percent[id] ?? 0) > 0);
  if (!list.length) return <span className="text-ink-3">—</span>;
  return <span className="tabular">{list.map((id) => `${COMPOUNDS[id].name} ${(percent[id] ?? 0).toFixed(1)} %`).join(' · ')}</span>;
}

export function MethodBadge({ method }: { method: ProfileMethod }) {
  const m = METHOD[method];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Provenance for entries saved before provenance existed. */
export function provenanceOf(s: Pick<StrainEntry, 'provenance' | 'source' | 'sourceDetail' | 'sourceUrl'>): Provenance {
  if (s.provenance) return s.provenance;
  const method: ProfileMethod =
    s.source === 'coa' ? 'lab-batch' : s.source === 'database' ? 'lab-strain' : s.source === 'registry' ? 'lab-product' : 'manual';
  return { method, steps: [s.sourceDetail ?? SOURCE_LABEL[s.source]], sources: s.sourceUrl ? [{ name: 'Source', url: s.sourceUrl }] : [] };
}

export function ProvenanceCard({ provenance, compact = false }: { provenance: Provenance; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  return (
    <div className="rounded-xl border border-white/10 bg-raised/60 p-3">
      <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-sm font-semibold">How this profile was made</span>
        <MethodBadge method={provenance.method} />
        <span className="ml-auto text-xs text-ink-3">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink-2">
            {provenance.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {provenance.sources.length > 0 && (
            <div className="mt-2 text-xs text-ink-3">
              Sources:{' '}
              {provenance.sources.map((src, i) => (
                <span key={src.name}>
                  {i > 0 && ' · '}
                  {src.url ? (
                    <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink">
                      {src.name}
                    </a>
                  ) : (
                    src.name
                  )}
                  {src.license ? ` (${src.license})` : ''}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ProfileForm({ value, onChange }: { value: Amounts; onChange: (a: Amounts) => void }) {
  const [unit, setUnit] = useState<'%' | 'mg/g'>('%');
  const [showAll, setShowAll] = useState(false);
  const factor = unit === '%' ? 1 : 10;
  const ids: CompoundId[] = [...MAIN_TERPENES, ...(showAll ? TERPENE_IDS.filter((t) => !MAIN_TERPENES.includes(t)) : [])];
  const set = (id: CompoundId, v: number | undefined) => onChange({ ...value, [id]: v === undefined ? undefined : v / factor });
  const show = (id: CompoundId) => {
    const v = value[id];
    return v === undefined ? undefined : Math.round(v * factor * 1000) / 1000;
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Terpenes</div>
        <Segmented value={unit} onChange={setUnit} options={[{ value: '%', label: '%' }, { value: 'mg/g', label: 'mg/g' }]} className="w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ids.map((id) => (
          <Field key={id} label={COMPOUNDS[id].name}>
            <NumberInput value={show(id)} min={0} step={0.01} suffix={unit} onChange={(v) => set(id, v)} placeholder="—" />
          </Field>
        ))}
      </div>
      <button className="mt-2 text-xs text-ink-3 underline" onClick={() => setShowAll((s) => !s)}>
        {showAll ? 'Fewer terpenes' : 'More terpenes…'}
      </button>
      <div className="mt-4 mb-2 text-sm font-semibold">Cannabinoids (total, in %)</div>
      <div className="grid grid-cols-3 gap-3">
        {(['thc', 'cbd', 'cbg'] as CompoundId[]).map((id) => (
          <Field key={id} label={`${COMPOUNDS[id].name} %`}>
            <NumberInput value={value[id]} min={0} max={40} step={0.1} suffix="%" onChange={(v) => onChange({ ...value, [id]: v })} placeholder="—" />
          </Field>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-3">Labels often list THCA and THC separately: total THC = THC + 0.877 × THCA.</p>
    </div>
  );
}

export function BatchFields({ entry, onChange }: { entry: Partial<StrainEntry>; onChange: (p: Partial<StrainEntry>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Producer / brand">
        <TextInput value={entry.producer ?? ''} onChange={(e) => onChange({ producer: e.target.value })} placeholder="e.g. Four 20 Pharma" />
      </Field>
      <Field label="Batch / Charge">
        <TextInput value={entry.batch ?? ''} onChange={(e) => onChange({ batch: e.target.value })} />
      </Field>
      <Field label="Tested on">
        <TextInput type="date" value={entry.testDate ?? ''} onChange={(e) => onChange({ testDate: e.target.value })} />
      </Field>
      <Field label="Packaged on">
        <TextInput type="date" value={entry.packagedDate ?? ''} onChange={(e) => onChange({ packagedDate: e.target.value })} />
      </Field>
    </div>
  );
}

export const cleanAmounts = (a: Amounts): Amounts =>
  Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === 'number' && v > 0)) as Amounts;
