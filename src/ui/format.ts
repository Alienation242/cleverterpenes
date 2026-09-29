export type Unit = 'C' | 'F';

export const cToF = (c: number) => (c * 9) / 5 + 32;

export function fmtTemp(c: number | undefined, unit: Unit): string {
  if (c === undefined || Number.isNaN(c)) return '—';
  return unit === 'F' ? `${Math.round(cToF(c))} °F` : `${Math.round(c)} °C`;
}

export function tempNumber(c: number | undefined, unit: Unit): string {
  if (c === undefined || Number.isNaN(c)) return '—';
  return String(Math.round(unit === 'F' ? cToF(c) : c));
}

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtSeconds(s: number): string {
  return s >= 10 ? `${Math.round(s)} s` : `${s.toFixed(1)} s`;
}

export function fmtMg(x: number): string {
  if (x >= 10) return x.toFixed(0);
  if (x >= 1) return x.toFixed(1);
  return x.toFixed(2);
}

export function fmtPct(x: number, digits = 2): string {
  return `${x.toFixed(digits)} %`;
}

export function daysSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
