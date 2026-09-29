import { CLASS_LABEL, COMPOUNDS, TERPENE_IDS, type CompoundId } from '../science/compounds';
import { volatilityVsThc } from '../science/vaporPressure';
import { DEFAULT_MODEL } from '../science/releaseModel';
import { Badge, Card } from '../ui/primitives';
import { VolatilityBars } from '../ui/charts';

const CHART_IDS: CompoundId[] = [
  'alphaPinene',
  'myrcene',
  'limonene',
  'ocimene',
  'terpinolene',
  'linalool',
  'caryophyllene',
  'humulene',
  'bisabolol',
  'nerolidol',
  'guaiol',
  'phytol',
  'cbd',
  'cbn',
];

const SOURCES = [
  ['Eyal et al. 2023 — vapor pressures & Volcano release data', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10249740/'],
  ['NIST 2026 — measured THC/CBD/CBN vapor pressures (J Breath Res)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12856838/'],
  ['Hazekamp et al. 2006 — Volcano THC delivery & balloon storage', 'https://pubmed.ncbi.nlm.nih.gov/16637053/'],
  ['Lanz et al. 2016 — vaporizer validation incl. Volcano Medic', 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0147286'],
  ['Smith et al. 2022 — 90k US lab tests, strain-name reliability (data CC0)', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9119530/'],
  ['Cannlytics cannabis_results — Florida & California lab results 2019–2024 (CC BY 4.0)', 'https://huggingface.co/datasets/cannlytics/cannabis_results'],
  ['Connecticut DCP brand registry — live product lab data (data.ct.gov)', 'https://data.ct.gov/resource/egd5-wb6r'],
  ['Meehan-Atrash et al. 2017 — terpene toxicants only at dab-nail temperatures', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5623941/'],
  ['Turovsky et al. 2025 — where “THC boils at 157 °C” comes from', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12802246/'],
  ['Storz & Bickel — Volcano Hybrid instructions for use', 'https://www.storz-bickel.com/en-us/volcanohybrid'],
];

export function ScienceScreen() {
  const rows = CHART_IDS.map((id) => ({
    label: COMPOUNDS[id].name,
    ratio: volatilityVsThc(id, 180),
    note: `${CLASS_LABEL[COMPOUNDS[id].cls]} · vapour-pressure confidence ${COMPOUNDS[id].vpConfidence}`,
  }));
  const myths = (Object.values(COMPOUNDS) as (typeof COMPOUNDS)[CompoundId][]).filter((c) => c.chartClaim);
  const table = [...TERPENE_IDS.map((id) => COMPOUNDS[id]), COMPOUNDS.thc, COMPOUNDS.cbd, COMPOUNDS.cbn];
  const m = DEFAULT_MODEL;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">The science behind the plans</h1>
      <Card title="Four things that decide your balloon">
        <ol className="list-decimal space-y-3 pl-5 text-sm text-ink-2">
          <li>
            <b className="text-ink">Nothing boils in a Volcano.</b> Every compound evaporates below its boiling point at a speed set by its
            vapor pressure. The popular charts mostly quote vacuum values — THC’s “157 °C” is its boiling point at 0.05 Torr; at normal
            pressure it would be ~380–450 °C.
          </li>
          <li>
            <b className="text-ink">Terpenes always come first.</b> At 180 °C the common terpenes are 100–5,000× more volatile than THC, so
            they leave the herb in the first balloon at any normal setting (monoterpenes within ~20 s). Heavier sesquiterpene alcohols
            linger into balloon 2.
          </li>
          <li>
            <b className="text-ink">Temperature is mainly a dial for cannabinoid dose and harshness.</b> THC release roughly doubles every
            ~10–15 °C (≈ 0.0055 s⁻¹ at 180 °C → ≈ 0.019 s⁻¹ at 220 °C in Volcano measurements). So the first balloon’s temperature decides
            how flavour-forward it is; later steps keep the dose even as the herb depletes.
          </li>
          <li>
            <b className="text-ink">The balloon sets the dose, the clock sets the balloon.</b> The pump only switches on/off at ~12 L/min. A
            balloon should be inhaled within ~10 min — THC condenses on the film (~11 % after 10 min, most of it after 3 h).
          </li>
        </ol>
      </Card>

      <Card title="How much faster than THC does each compound evaporate? (180 °C)">
        <VolatilityBars rows={rows} />
        <p className="mt-2 text-xs text-ink-3">
          Ratio of pure-compound vapor pressures (log scale). Sources: NIST WebBook / PubChem for terpenes, NIST 2026 for cannabinoids.
        </p>
      </Card>

      <Card title="Chart myths vs. measured values">
        <div className="space-y-3">
          {myths.map((c) => (
            <div key={c.id} className="rounded-xl bg-raised p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.name}</span>
                <Badge tone="serious">chart says {c.chartClaim!.value}</Badge>
                <Badge tone="good">{c.bp760 ? `${c.bp760} °C at 1 atm` : c.bpNote.split(';')[0]}</Badge>
              </div>
              <p className="mt-1 text-ink-2">{c.chartClaim!.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Reference table">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-xs text-ink-3">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">Compound</th>
                <th className="py-2 pr-3 font-medium">Class</th>
                <th className="py-2 pr-3 font-medium">Boiling point (1 atm)</th>
                <th className="py-2 pr-3 font-medium">× THC @180 °C</th>
                <th className="py-2 font-medium">Aroma</th>
              </tr>
            </thead>
            <tbody>
              {table.map((c) => (
                <tr key={c.id} className="border-b border-white/5 align-top">
                  <td className="py-2 pr-3 font-medium">{c.name}</td>
                  <td className="py-2 pr-3 text-ink-3">{CLASS_LABEL[c.cls]}</td>
                  <td className="py-2 pr-3 text-ink-2">{c.bpNote}</td>
                  <td className="py-2 pr-3 tabular">{c.id === 'thc' ? '1' : fmtRatio(volatilityVsThc(c.id, 180))}</td>
                  <td className="py-2 text-ink-2">{c.aroma}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Safety corridor">
        <ul className="list-disc space-y-2 pl-5 text-sm text-ink-2">
          <li>Up to ~200 °C: no benzene, toluene or naphthalene found in the flower-vaporizer tests; terpene-derived toxicants were only seen from ~320–400 °C (dab nails).</li>
          <li>200–220 °C: THC delivery rises steeply; still below every demonstrated terpene toxicant threshold, but close to where plant fibre (hemicellulose) starts to break down (~220 °C).</li>
          <li>220–230 °C: best kept for a short final balloon; many people find it harsh. The Volcano’s 230 °C maximum is only 5–7 °C below the autoignition points of linalool and limonene — never modify the device to go hotter.</li>
        </ul>
      </Card>

      <Card title="Model assumptions (editable in Settings → Model)">
        <ul className="grid gap-1 text-sm text-ink-2 sm:grid-cols-2">
          <li>THC release at 180 °C: {m.kThc180} s⁻¹ (Eyal 2023)</li>
          <li>Temperature sensitivity: {m.eaEffKJ} kJ/mol (fit 180→220 °C)</li>
          <li>Terpene max. release: {m.terpKCap} s⁻¹, half-rate at {m.terpHalfPressure} mmHg</li>
          <li>Herb runs at {Math.round(m.herbTempFraction * 100)} % of the set temperature rise</li>
          <li>Resin mobilises around {m.resinMobileC} °C herb temperature</li>
          <li>Delivered to balloon: {Math.round(m.deliveryCann * 100)} % cannabinoids, {Math.round(m.deliveryTerp * 100)} % terpenes</li>
          <li>Pump flow: {m.flowLpm} L/min (Volcano Medic 2 spec)</li>
          <li>Heat-up: {m.heatUpTauFirst} s first balloon, {m.heatUpTauNext} s later</li>
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          Honest limits: no study has measured terpenes balloon-by-balloon or validated stepping plans; strain names predict a batch’s
          terpenes only loosely; absolute mg values are ±50 %. The model is for comparing options, not for dosing.
        </p>
      </Card>

      <Card title="Key sources">
        <ul className="space-y-1.5 text-sm">
          {SOURCES.map(([label, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="text-ink-2 underline decoration-dotted hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function fmtRatio(r: number) {
  return r >= 100 ? String(Math.round(r)) : r.toFixed(1);
}
