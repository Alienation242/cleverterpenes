// One search for any strain or product name. Tries every source in order of reliability and
// always ends in a profile — lab data when it exists, otherwise a clearly labelled estimate.

import { useEffect, useMemo, useState } from 'react';
import { COMPOUNDS, TERPENE_IDS, type TerpeneId } from '../science/compounds';
import { findCompoundNames } from '../data/coaParser';
import { searchRegistry, type RegistryProduct } from '../data/ctRegistry';
import {
  combineEstimates,
  estimateFromLineage,
  estimateFromNames,
  fromDbStrain,
  fromRegistryMedian,
  fromRegistryProduct,
  isTerpene,
  loadTerpeneSets,
  typicalProfile,
  type ProfileResult,
  type TerpeneSetDb,
} from '../data/estimate';
import { parseCross, resolveLineage } from '../data/lineage';
import { parseProductName, type ParsedProductName } from '../data/productName';
import { loadStrainDb, profileFromDb, searchStrains, type DbStrain, type StrainDb } from '../data/strainDb';
import type { StrainEntry } from '../data/types';
import { useLibrary } from '../store/library';
import { Badge, Button, Callout, Field, TextArea, TextInput, Toggle, cx } from '../ui/primitives';
import { TerpeneBars } from '../ui/charts';
import { fmtDate } from '../ui/format';
import { BatchFields, CONF_BADGE, Cannabinoids, MAIN_TERPENES, ProvenanceCard, TopTerpenes, terpeneData } from './strainParts';

interface Draft {
  result: ProfileResult;
  name: string;
}

/** The product name's THC/CBD (label claim) beats any strain median for cannabinoids. */
function withLabelClaim(r: ProfileResult, p: ParsedProductName): ProfileResult {
  if (p.thc === undefined) return r;
  const percent = { ...r.percent, thc: p.thc };
  if (p.cbd !== undefined) percent.cbd = p.cbd;
  else if (p.cbdBelowOne) delete percent.cbd;
  const step = `THC ${p.thc} %${p.cbd !== undefined ? ` / CBD ${p.cbd} %` : ' / CBD < 1 %'} taken from the product name (label claim)${
    p.origin ? `; grown in ${p.origin}` : ''
  }.`;
  return { ...r, percent, provenance: { ...r.provenance, steps: [...r.provenance.steps, step] } };
}

function Preview({ draft, parsed, onBack, onSaved }: { draft: Draft; parsed: ParsedProductName; onBack: () => void; onSaved: (id: string) => void }) {
  const lib = useLibrary();
  const [name, setName] = useState(draft.name);
  const [meta, setMeta] = useState<Partial<StrainEntry>>({ producer: parsed.brand });
  const r = draft.result;
  return (
    <div className="space-y-4">
      <button className="text-sm text-ink-3 hover:text-ink" onClick={onBack}>
        ← Back to results
      </button>
      <Field label="Name in your library">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Badge tone={CONF_BADGE[r.confidence].tone}>{CONF_BADGE[r.confidence].label}</Badge>
      </div>
      <TerpeneBars data={terpeneData(r.percent, r.ranges)} />
      <p className="text-sm text-ink-2">
        Cannabinoids: <Cannabinoids percent={r.percent} />
      </p>
      <ProvenanceCard provenance={r.provenance} />
      <BatchFields entry={meta} onChange={(p) => setMeta({ ...meta, ...p })} />
      <Button
        variant="primary"
        disabled={!name.trim()}
        onClick={() =>
          onSaved(
            lib.addStrain({
              name: name.trim(),
              source: r.source,
              sourceDetail: r.provenance.steps[0],
              sourceUrl: r.provenance.sources[0]?.url,
              confidence: r.confidence,
              percent: r.percent,
              ranges: r.ranges,
              provenance: r.provenance,
              ...meta,
            }),
          )
        }
      >
        Save to my strains
      </Button>
    </div>
  );
}

function NamesBuilder({
  sets,
  initialText,
  parentsLabel,
  onEstimate,
}: {
  sets: TerpeneSetDb;
  initialText: string;
  parentsLabel?: string;
  onEstimate: (ids: TerpeneId[], withParents: boolean) => void;
}) {
  const [picked, setPicked] = useState<TerpeneId[]>([]);
  const [withParents, setWithParents] = useState(true);
  const [text, setText] = useState(initialText);
  const [showAll, setShowAll] = useState(false);
  const fromText = useMemo(() => findCompoundNames(text).filter(isTerpene), [text]);
  const all = [...new Set([...fromText, ...picked])];
  const toggle = (id: TerpeneId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const chips = showAll ? TERPENE_IDS : MAIN_TERPENES;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Most German pharmacy pages and labels list the main terpenes without amounts. Paste that list or tap the terpenes — cleverTerpenes looks up lab
        tests with the same top terpenes and uses their typical amounts.
      </p>
      <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Terpene: Myrcen, D-Limonen, α-Humulen, β-Caryophyllen, Linalool" className="min-h-16 font-sans text-sm" />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((id) => {
          const on = all.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              disabled={fromText.includes(id)}
              aria-pressed={on}
              className={cx('rounded-lg border px-2.5 py-1 text-xs', on ? 'border-terp bg-terp/20 text-ink' : 'border-line text-ink-3 hover:text-ink')}
            >
              {COMPOUNDS[id].name}
            </button>
          );
        })}
        <button className="px-2 text-xs text-ink-3 underline" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'fewer' : 'more…'}
        </button>
      </div>
      {parentsLabel && (
        <Toggle checked={withParents} onChange={setWithParents} label={`Also use its parents (${parentsLabel})`} hint="Combines both estimates: 60 % terpene names, 40 % parents." />
      )}
      <Button variant="primary" disabled={!all.length} onClick={() => onEstimate(all, !!parentsLabel && withParents)}>
        Estimate from {all.length || 'these'} terpene{all.length === 1 ? '' : 's'}
      </Button>
      <p className="text-xs text-ink-3">{sets.sets.length} terpene combinations from US lab tests are available.</p>
    </div>
  );
}

function ParentPicker({ db, label, value, onChange }: { db: StrainDb; label: string; value: DbStrain | null; onChange: (s: DbStrain | null) => void }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => (q.trim().length >= 2 ? searchStrains(db, q, 5) : []), [db, q]);
  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-raised px-3 py-2 text-sm">
        <span className="text-ink-3">{label}:</span>
        <span className="font-medium">{value.n}</span>
        <span className="text-xs text-ink-3">{value.k} tests</span>
        <button className="ml-auto text-ink-3 hover:text-ink" onClick={() => onChange(null)} aria-label={`Remove ${label}`}>
          ×
        </button>
      </div>
    );
  }
  return (
    <div>
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${label}, e.g. Kush Mints`} />
      {hits.length > 0 && (
        <ul className="mt-1 divide-y divide-white/5 rounded-xl border border-white/10">
          {hits.map((h) => (
            <li key={h.strain.s}>
              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-raised" onClick={() => onChange(h.strain)}>
                {h.strain.n} <span className="text-xs text-ink-3">· {h.strain.k} tests</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ParentsBuilder({ db, child, onEstimate }: { db: StrainDb; child: string; onEstimate: (parents: string[]) => void }) {
  const [a, setA] = useState<DbStrain | null>(null);
  const [b, setB] = useState<DbStrain | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Know the cross? (Breeders and pharmacies usually name it — e.g. Alien Mints = Alien Cookies × Kush Mints.) The estimate averages both parents’ lab
        profiles.
      </p>
      <ParentPicker db={db} label="Parent 1" value={a} onChange={setA} />
      <ParentPicker db={db} label="Parent 2" value={b} onChange={setB} />
      <Button variant="primary" disabled={!a && !b} onClick={() => onEstimate([a, b].filter((x): x is DbStrain => !!x).map((x) => x.n))}>
        Estimate {child ? `“${child}”` : ''} from {a && b ? 'both parents' : 'this parent'}
      </Button>
    </div>
  );
}

export function FindStrain({ onSaved, onPasteLabel }: { onSaved: (id: string) => void; onPasteLabel: () => void }) {
  const [db, setDb] = useState<StrainDb | null>(null);
  const [sets, setSets] = useState<TerpeneSetDb | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [builder, setBuilder] = useState<'names' | 'parents' | null>(null);
  const [registry, setRegistry] = useState<RegistryProduct[] | null>(null);
  const [regState, setRegState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [regError, setRegError] = useState('');

  useEffect(() => {
    Promise.all([loadStrainDb(), loadTerpeneSets()]).then(([d, s]) => {
      setDb(d);
      setSets(s);
    }, (e) => setLoadError(String(e)));
  }, []);

  const parsed = useMemo(() => parseProductName(q), [q]);
  const hits = useMemo(() => (db && parsed.cultivar.trim() ? searchStrains(db, parsed.cultivar, 8) : []), [db, parsed.cultivar]);
  const direct = hits.filter((h) => h.via === 'exact' || h.via === 'alias' || h.via === 'prefix');
  const similar = hits.filter((h) => !direct.includes(h));
  const label = parsed.cultivar.trim();
  const displayName = q.trim();
  const cross = useMemo(() => parseCross(label), [label]);
  const lineage = useMemo(() => {
    if (!db || !label || (direct.length && !cross)) return null;
    const node = resolveLineage(db, label, cross ?? undefined);
    return node.kind === 'cross' ? { node, estimate: estimateFromLineage(node) } : null;
  }, [db, label, cross, direct.length]);
  const parentsLabel = lineage?.node.kind === 'cross' ? lineage.node.children.map((c) => (c.kind === 'data' ? c.strain.n : c.name)).join(' × ') : undefined;

  useEffect(() => {
    setRegistry(null);
    setRegState('idle');
    setBuilder(null);
  }, [q]);

  const open = (result: ProfileResult, name = displayName || label) => setDraft({ result: withLabelClaim(result, parsed), name });

  const lookupRegistry = async () => {
    setRegState('loading');
    try {
      setRegistry(await searchRegistry(label));
      setRegState('idle');
    } catch (e) {
      setRegError(e instanceof Error ? e.message : String(e));
      setRegState('error');
    }
  };

  if (draft) return <Preview draft={draft} parsed={parsed} onBack={() => setDraft(null)} onSaved={onSaved} />;

  return (
    <div className="space-y-4">
      <TextInput data-tour="strain-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Strain or product, e.g. Huala 22/1 CA ALM Alien Mints, Blue Dream, GG4" />
      {parsed.thc !== undefined && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {parsed.brand && <Badge>brand {parsed.brand}</Badge>}
          <Badge>THC {parsed.thc} %</Badge>
          <Badge>CBD {parsed.cbd !== undefined ? `${parsed.cbd} %` : '< 1 %'}</Badge>
          {parsed.origin && <Badge>{parsed.origin}</Badge>}
          {parsed.code && <Badge>code {parsed.code}</Badge>}
          <Badge tone="terp">cultivar “{parsed.cultivar}”</Badge>
        </div>
      )}
      {loadError && <Callout tone="warn">Could not load the offline data: {loadError}</Callout>}
      {!db && !loadError && <div className="text-sm text-ink-3">Loading lab data…</div>}

      {db && label && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">1 · Lab data for “{label}”</h3>
          {direct.length ? (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
              {direct.map((h) => (
                <li key={h.strain.s}>
                  <button className="w-full px-3 py-2.5 text-left hover:bg-raised" onClick={() => open(fromDbStrain(h.strain, label))}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{h.strain.n}</span>
                      <Badge tone={CONF_BADGE[h.strain.conf].tone}>{CONF_BADGE[h.strain.conf].label}</Badge>
                      <span className="text-xs text-ink-3">
                        {h.strain.k} tests{h.strain.y ? ` · ${h.strain.y[1]}` : ''}
                      </span>
                    </div>
                    <div className="mt-1">
                      <TopTerpenes percent={profileFromDb(h.strain).percent} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">No lab tests under this name{cross ? ' (it is a cross)' : ''}.</p>
          )}
          {!direct.length && lineage?.estimate && (
            <div className="rounded-xl border border-terp/40 bg-terp/10 p-3">
              <div className="text-sm font-semibold">Estimated from its parents: {parentsLabel}</div>
              <p className="mt-1 text-xs text-ink-2">{lineage.estimate.provenance.steps.slice(0, 3).join(' ')}</p>
              <div className="mt-2">
                <TopTerpenes percent={lineage.estimate.percent} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => open(lineage.estimate!)}>
                  Use this estimate
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setBuilder('names')}>
                  Improve it with the terpene names from the package
                </Button>
              </div>
            </div>
          )}
          {similar.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-3 hover:text-ink">Similar names ({similar.length}) — different strains, only if you meant one of them</summary>
              <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10">
                {similar.map((h) => (
                  <li key={h.strain.s}>
                    <button className="w-full px-3 py-2 text-left hover:bg-raised" onClick={() => open(fromDbStrain(h.strain, label), h.strain.n)}>
                      {h.strain.n} <span className="text-xs text-ink-3">· {h.strain.k} tests</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {label.length >= 2 && (
        <section className="space-y-2 rounded-xl bg-raised p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <div className="font-semibold">2 · Lab-tested products (online)</div>
              <div className="text-xs text-ink-3">
                Connecticut’s official product registry (USA), updated daily. Search sends “{label}” and your IP address to data.ct.gov —{' '}
                <a href="#/privacy" className="underline">
                  privacy
                </a>
                .
              </div>
            </div>
            <Button size="sm" onClick={() => void lookupRegistry()} disabled={regState === 'loading'}>
              {regState === 'loading' ? 'Searching…' : 'Search'}
            </Button>
          </div>
          {regState === 'error' && <p className="text-sm text-warn">⚠ {regError}</p>}
          {registry && (
            <>
              {registry.length === 0 && <p className="text-sm text-ink-3">No flower products with terpene data found.</p>}
              {registry.length >= 2 && (
                <Button size="sm" variant="ghost" onClick={() => open(fromRegistryMedian(registry, label))}>
                  Use the median of these {registry.length} products
                </Button>
              )}
              <ul className="divide-y divide-white/5">
                {registry.slice(0, 12).map((p) => (
                  <li key={p.registration + p.brandName}>
                    <button className="w-full py-2 text-left" onClick={() => open(fromRegistryProduct(p))}>
                      <div className="text-sm font-medium">{p.brandName}</div>
                      <div className="text-xs text-ink-3">
                        {p.producer} · {fmtDate(p.approvalDate)}
                      </div>
                      <div className="mt-1">
                        <TopTerpenes percent={p.percent} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {db && sets && label && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">3 · {direct.length ? 'Or estimate it' : 'No lab data? Estimate it'}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <button onClick={() => setBuilder(builder === 'names' ? null : 'names')} className={cx('rounded-xl border p-3 text-left text-sm', builder === 'names' ? 'border-terp bg-terp/10' : 'border-white/10 hover:border-white/25')}>
              <div className="font-semibold">From its terpene names</div>
              <div className="text-xs text-ink-3">Best estimate — what pharmacy pages list</div>
            </button>
            <button onClick={() => setBuilder(builder === 'parents' ? null : 'parents')} className={cx('rounded-xl border p-3 text-left text-sm', builder === 'parents' ? 'border-terp bg-terp/10' : 'border-white/10 hover:border-white/25')}>
              <div className="font-semibold">From its parents</div>
              <div className="text-xs text-ink-3">{parentsLabel ? `Known: ${parentsLabel} — or enter others` : 'If you know the cross'}</div>
            </button>
            <button onClick={() => open(typicalProfile())} className="rounded-xl border border-white/10 p-3 text-left text-sm hover:border-white/25">
              <div className="font-semibold">Typical flower</div>
              <div className="text-xs text-ink-3">Last resort</div>
            </button>
          </div>
          {builder === 'names' && (
            <NamesBuilder
              sets={sets}
              initialText=""
              parentsLabel={lineage?.estimate ? parentsLabel : undefined}
              onEstimate={(ids, withParents) => {
                const names = estimateFromNames(sets, ids);
                open(withParents && lineage?.estimate ? combineEstimates(names, lineage.estimate) : names);
              }}
            />
          )}
          {builder === 'parents' && (
            <ParentsBuilder
              db={db}
              child={label}
              onEstimate={(ps) => {
                const est = estimateFromLineage(resolveLineage(db, label, ps));
                if (est) open(est);
              }}
            />
          )}
        </section>
      )}

      <Callout tone="info" title="Best of all: your batch’s label or certificate">
        Pharmacies can give you the lab certificate (Analysenzertifikat) of your batch.{' '}
        <button className="underline" onClick={onPasteLabel}>
          Paste its values
        </button>{' '}
        — real numbers always beat any database or estimate.
      </Callout>
    </div>
  );
}
