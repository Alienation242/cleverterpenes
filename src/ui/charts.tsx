// Small SVG charts. Series colours follow the validated dark palette (terpenes = slot 1 blue,
// cannabinoids = slot 2 orange); text always uses ink tokens, never the series colour.

import { useRef, useState, type ReactNode } from 'react';
import { COMPOUNDS, type TerpeneId } from '../science/compounds';
import type { PlannedBalloon } from '../science/planner';
import { fmtMg, fmtTemp, type Unit } from './format';

const TERP = 'var(--color-terp)';
const CANN = 'var(--color-cann)';
const GRID = 'var(--color-grid)';
const BASE = 'var(--color-line)';
const MUTED = 'var(--color-ink-3)';

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: { clientX: number; clientY: number } | null, content: ReactNode, anchor?: DOMRect) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const x = e ? e.clientX - box.left : (anchor ? anchor.left + anchor.width / 2 - box.left : 0);
    const y = e ? e.clientY - box.top : (anchor ? anchor.top - box.top : 0);
    setTip({ x, y, content });
  };
  const node = tip ? (
    <div
      className="pointer-events-none absolute z-10 min-w-40 rounded-xl border border-white/10 bg-raised px-3 py-2 text-xs shadow-xl"
      style={{
        left: Math.min(Math.max(tip.x, 90), (ref.current?.clientWidth ?? 300) - 90),
        top: tip.y,
        transform: 'translate(-50%, calc(-100% - 12px))',
      }}
    >
      {tip.content}
    </div>
  ) : null;
  return { ref, show, hide: () => setTip(null), node };
}

function niceMax(v: number): { max: number; step: number } {
  if (v <= 0) return { max: 1, step: 0.5 };
  const raw = v / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  return { max: Math.ceil(v / step) * step, step };
}

const LineKey = ({ color }: { color: string }) => <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />;

export function PlanChart({ balloons, unit }: { balloons: PlannedBalloon[]; unit: Unit }) {
  const { ref, show, hide, node } = useTooltip();
  const W = 640;
  const H = 230;
  const pad = { l: 40, r: 12, t: 28, b: 42 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const totals = balloons.map((b) => b.result.terpMg + b.result.cannMg);
  const { max, step } = niceMax(Math.max(...totals, 0.1));
  const band = innerW / Math.max(1, balloons.length);
  const barW = Math.min(24, band * 0.5);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);

  const tipContent = (b: PlannedBalloon) => (
    <div className="space-y-1">
      <div className="font-semibold text-ink">
        Balloon {b.index + 1} · {fmtTemp(b.tempC, unit)}
      </div>
      <div className="flex items-center gap-2">
        <LineKey color={TERP} />
        <span className="font-semibold text-ink tabular">{fmtMg(b.result.terpMg)} mg</span>
        <span className="text-ink-3">terpenes</span>
      </div>
      <div className="flex items-center gap-2">
        <LineKey color={CANN} />
        <span className="font-semibold text-ink tabular">{fmtMg(b.result.cannMg)} mg</span>
        <span className="text-ink-3">cannabinoids ({fmtMg(b.result.thcMg)} mg THC)</span>
      </div>
      {b.aroma.length > 0 && <div className="text-ink-3">Aroma: {b.aroma.map((a) => COMPOUNDS[a.id].name).join(', ')}</div>}
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: TERP }} /> Terpenes (flavour)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: CANN }} /> Cannabinoids (effect)
        </span>
        <span className="text-ink-3">mg delivered into each balloon (model estimate)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Predicted terpenes and cannabinoids per balloon">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? BASE : GRID} strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill={MUTED} className="tabular">
              {v >= 10 ? v.toFixed(0) : v.toFixed(1)}
            </text>
          </g>
        ))}
        <text x={pad.l - 6} y={pad.t - 12} textAnchor="end" fontSize={11} fill={MUTED}>
          mg
        </text>
        {balloons.map((b, i) => {
          const cx0 = pad.l + band * i + band / 2;
          const x = cx0 - barW / 2;
          const tH = (b.result.terpMg / max) * innerH;
          const cH = (b.result.cannMg / max) * innerH;
          const base = y(0);
          const gap = tH > 0 && cH > 0 ? 2 : 0;
          const r = 4;
          const topH = cH > 0 ? cH : tH;
          const topColor = cH > 0 ? CANN : TERP;
          const topY = cH > 0 ? base - tH - gap - cH : base - tH;
          return (
            <g key={i}>
              {cH > 0 && tH > 0 && <rect x={x} y={base - tH} width={barW} height={tH} fill={TERP} />}
              {topH > 0 && (
                <path
                  d={`M${x},${topY + topH} V${topY + Math.min(r, topH)} Q${x},${topY} ${x + r},${topY} H${x + barW - r} Q${x + barW},${topY} ${x + barW},${topY + Math.min(r, topH)} V${topY + topH} Z`}
                  fill={topColor}
                />
              )}
              <text x={cx0} y={H - pad.b + 16} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">
                B{i + 1}
              </text>
              <text x={cx0} y={H - pad.b + 30} textAnchor="middle" fontSize={11} fill={MUTED} className="tabular">
                {fmtTemp(b.tempC, unit)}
              </text>
              {i === 0 && b.result.terpShare > 0 && (
                <text x={cx0} y={topY - 8} textAnchor="middle" fontSize={11} fill="var(--color-ink-2)">
                  {Math.round(b.result.terpShare * 100)} % terpenes
                </text>
              )}
              <rect
                x={pad.l + band * i}
                y={pad.t - 20}
                width={band}
                height={innerH + 20}
                fill="transparent"
                tabIndex={0}
                aria-label={`Balloon ${i + 1}: ${fmtMg(b.result.terpMg)} mg terpenes, ${fmtMg(b.result.cannMg)} mg cannabinoids at ${fmtTemp(b.tempC, unit)}`}
                onPointerMove={(e) => show(e, tipContent(b))}
                onPointerLeave={hide}
                onFocus={(e) => show(null, tipContent(b), e.currentTarget.getBoundingClientRect())}
                onBlur={hide}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

export interface TerpeneBarDatum {
  id: TerpeneId;
  value: number;
  range?: [number, number];
  note?: string;
}

export function TerpeneBars({ data }: { data: TerpeneBarDatum[] }) {
  const { ref, show, hide, node } = useTooltip();
  if (!data.length) return <div className="text-sm text-ink-3">No terpene values.</div>;
  const rows = [...data].sort((a, b) => b.value - a.value);
  const maxV = Math.max(...rows.map((r) => Math.max(r.value, r.range?.[1] ?? 0)), 0.05);
  const { max } = niceMax(maxV);
  const rowH = 30;
  const W = 640;
  const labelW = 150;
  const valueW = 64;
  const innerW = W - labelW - valueW;
  const H = rows.length * rowH + 6;
  const x = (v: number) => labelW + (v / max) * innerW;

  const tip = (r: TerpeneBarDatum) => (
    <div className="space-y-0.5">
      <div className="font-semibold text-ink">{COMPOUNDS[r.id].name}</div>
      <div>
        <span className="font-semibold text-ink tabular">{r.value.toFixed(2)} %</span>
        {r.range && <span className="text-ink-3"> · typical {r.range[0].toFixed(2)}–{r.range[1].toFixed(2)} %</span>}
      </div>
      <div className="text-ink-3">{COMPOUNDS[r.id].aroma}</div>
      {r.note && <div className="text-ink-3">{r.note}</div>}
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Terpene profile">
        <line x1={labelW} x2={labelW} y1={0} y2={H} stroke={BASE} strokeWidth={1} />
        {rows.map((r, i) => {
          const yMid = i * rowH + rowH / 2 + 3;
          const barH = Math.min(14, rowH - 12);
          const w = Math.max(2, x(r.value) - labelW);
          const rad = Math.min(4, w / 2);
          return (
            <g key={r.id}>
              <text x={labelW - 8} y={yMid + 4} textAnchor="end" fontSize={12} fill="var(--color-ink-2)">
                {COMPOUNDS[r.id].name}
              </text>
              <path
                d={`M${labelW},${yMid - barH / 2} H${labelW + w - rad} Q${labelW + w},${yMid - barH / 2} ${labelW + w},${yMid - barH / 2 + rad} V${yMid + barH / 2 - rad} Q${labelW + w},${yMid + barH / 2} ${labelW + w - rad},${yMid + barH / 2} H${labelW} Z`}
                fill={TERP}
              />
              {r.range && (
                <g stroke="var(--color-ink-2)" strokeWidth={1.5} opacity={0.8}>
                  <line x1={x(r.range[0])} x2={x(r.range[1])} y1={yMid} y2={yMid} />
                  <line x1={x(r.range[0])} x2={x(r.range[0])} y1={yMid - 5} y2={yMid + 5} />
                  <line x1={x(r.range[1])} x2={x(r.range[1])} y1={yMid - 5} y2={yMid + 5} />
                </g>
              )}
              <text x={W - 4} y={yMid + 4} textAnchor="end" fontSize={12} fill="var(--color-ink)" className="tabular">
                {r.value.toFixed(2)} %
              </text>
              <rect
                x={0}
                y={i * rowH}
                width={W}
                height={rowH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${COMPOUNDS[r.id].name} ${r.value.toFixed(2)} percent`}
                onPointerMove={(e) => show(e, tip(r))}
                onPointerLeave={hide}
                onFocus={(e) => show(null, tip(r), e.currentTarget.getBoundingClientRect())}
                onBlur={hide}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

/** Log-scale bars: how many times faster than THC a compound evaporates. */
export function VolatilityBars({ rows }: { rows: { label: string; ratio: number; note?: string }[] }) {
  const { ref, show, hide, node } = useTooltip();
  const W = 640;
  const labelW = 170;
  const valueW = 70;
  const rowH = 26;
  const H = rows.length * rowH + 24;
  const maxLog = Math.ceil(Math.log10(Math.max(...rows.map((r) => r.ratio), 10)));
  const x = (v: number) => labelW + (Math.log10(Math.max(1, v)) / maxLog) * (W - labelW - valueW);
  const ticks = Array.from({ length: maxLog + 1 }, (_, i) => Math.pow(10, i));
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Volatility relative to THC">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={H - 20} stroke={t === 1 ? BASE : GRID} strokeWidth={1} />
            <text x={x(t)} y={H - 6} textAnchor="middle" fontSize={10} fill={MUTED}>
              {t >= 1000 ? `${t / 1000}k×` : `${t}×`}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const yMid = i * rowH + rowH / 2;
          const w = Math.max(2, x(r.ratio) - labelW);
          const barH = 12;
          const rad = Math.min(4, w / 2);
          return (
            <g key={r.label}>
              <text x={labelW - 8} y={yMid + 4} textAnchor="end" fontSize={12} fill="var(--color-ink-2)">
                {r.label}
              </text>
              <path
                d={`M${labelW},${yMid - barH / 2} H${labelW + w - rad} Q${labelW + w},${yMid - barH / 2} ${labelW + w},${yMid - barH / 2 + rad} V${yMid + barH / 2 - rad} Q${labelW + w},${yMid + barH / 2} ${labelW + w - rad},${yMid + barH / 2} H${labelW} Z`}
                fill={TERP}
              />
              <text x={W - 4} y={yMid + 4} textAnchor="end" fontSize={12} fill="var(--color-ink)" className="tabular">
                {r.ratio >= 100 ? Math.round(r.ratio) : r.ratio.toFixed(1)}×
              </text>
              <rect
                x={0}
                y={i * rowH}
                width={W}
                height={rowH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${r.label}: ${Math.round(r.ratio)} times faster than THC`}
                onPointerMove={(e) =>
                  show(
                    e,
                    <div>
                      <div className="font-semibold text-ink">{r.label}</div>
                      <div>
                        <span className="font-semibold text-ink tabular">{r.ratio >= 100 ? Math.round(r.ratio) : r.ratio.toFixed(1)}×</span>
                        <span className="text-ink-3"> faster than THC at 180 °C</span>
                      </div>
                      {r.note && <div className="text-ink-3">{r.note}</div>}
                    </div>,
                  )
                }
                onPointerLeave={hide}
                style={{ outline: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}
