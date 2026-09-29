import { tempNumber, type Unit } from './format';

const MIN = 20;
const MAX = 230;
const START = 135; // degrees, SVG angle of the arc start (bottom-left)
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${a.x},${a.y} A${r},${r} 0 ${large} 1 ${b.x},${b.y}`;
}

const angleOf = (c: number) => START + (Math.max(0, Math.min(1, (c - MIN) / (MAX - MIN))) * SWEEP);

export function TempGauge({
  current,
  target,
  heaterOn,
  pumpOn,
  ready,
  unit,
}: {
  current?: number;
  target?: number;
  heaterOn: boolean;
  pumpOn: boolean;
  ready: boolean;
  unit: Unit;
}) {
  const cx = 110;
  const cy = 110;
  const r = 92;
  const status = pumpOn
    ? 'Pump running'
    : heaterOn
      ? current !== undefined && target !== undefined && current >= target - 1
        ? ready
          ? 'Ready'
          : 'At temperature'
        : 'Heating'
      : current !== undefined && current > 45
        ? 'Cooling down'
        : 'Standby';
  const statusColor = pumpOn ? 'var(--color-air)' : heaterOn ? 'var(--color-heat)' : 'var(--color-ink-3)';
  return (
    <svg viewBox="0 0 220 200" className="mx-auto w-full max-w-[280px]" role="img" aria-label={`Current ${tempNumber(current, unit)}°, target ${tempNumber(target, unit)}°, ${status}`}>
      <path d={arc(cx, cy, r, START, START + SWEEP)} stroke="var(--color-field)" strokeWidth={12} fill="none" strokeLinecap="round" />
      {current !== undefined && current > MIN && (
        <path
          d={arc(cx, cy, r, START, angleOf(current))}
          stroke={heaterOn ? 'var(--color-heat)' : 'var(--color-ink-3)'}
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {target !== undefined && (
        <g>
          {(() => {
            const a = polar(cx, cy, r - 14, angleOf(target));
            const b = polar(cx, cy, r + 14, angleOf(target));
            return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />;
          })()}
        </g>
      )}
      <text x={cx} y={cy + 6} textAnchor="middle" fontSize={50} fontWeight={650} fill="var(--color-ink)">
        {tempNumber(current, unit)}°
      </text>
      <text x={cx} y={cy + 32} textAnchor="middle" fontSize={14} fill="var(--color-ink-2)">
        target {tempNumber(target, unit)}°{unit}
      </text>
      <text x={cx} y={cy + 72} textAnchor="middle" fontSize={14} fontWeight={600} fill={statusColor}>
        {status}
      </text>
    </svg>
  );
}
