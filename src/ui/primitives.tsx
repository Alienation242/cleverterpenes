import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'heat' | 'air' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-black hover:bg-white/90 disabled:bg-white/30',
  secondary: 'bg-raised text-ink border border-line hover:bg-field disabled:opacity-50',
  ghost: 'text-ink-2 hover:bg-raised hover:text-ink disabled:opacity-40',
  heat: 'bg-heat text-black hover:brightness-110 disabled:opacity-40',
  air: 'bg-air text-black hover:brightness-110 disabled:opacity-40',
  danger: 'bg-critical text-white hover:brightness-110 disabled:opacity-40',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-sm', lg: 'h-14 px-6 text-base' };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition select-none',
        sizes[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  title,
  action,
  tour,
}: {
  className?: string;
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  /** Anchor for the first-run tour */
  tour?: string;
}) {
  return (
    <section data-tour={tour} className={cx('rounded-2xl border border-white/10 bg-card p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = 'neutral' | 'good' | 'warn' | 'serious' | 'critical' | 'heat' | 'air' | 'terp';

const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-2 border-line',
  good: 'bg-good/15 text-[#5fd35f] border-good/40',
  warn: 'bg-warn/12 text-warn border-warn/40',
  serious: 'bg-serious/12 text-serious border-serious/40',
  critical: 'bg-critical/15 text-[#ff7b7b] border-critical/50',
  heat: 'bg-heat/15 text-heat border-heat/40',
  air: 'bg-air/15 text-air border-air/40',
  terp: 'bg-terp/15 text-[#8fbaf5] border-terp/40',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0">
        <span id={`${id}-label`} className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-good' : 'bg-field', disabled && 'opacity-40')}
      >
        <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cx('grid gap-1 rounded-xl bg-field p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 rounded-lg px-2 py-1.5 text-sm font-medium transition',
            o.value === value ? 'bg-ink text-black' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-3">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-line bg-field px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-air focus:outline-none';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, 'min-h-28 font-mono text-xs', props.className)} />;
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  className,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.');
          if (raw === '') return onChange(undefined);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        className={cx(inputClass, 'tabular', suffix && 'pr-12')}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className={cx(inputClass, 'appearance-none pr-8', className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const CALLOUT: Record<'info' | 'warn' | 'critical' | 'good', { cls: string; icon: string; label: string }> = {
  info: { cls: 'border-air/30 bg-air/8', icon: 'ⓘ', label: 'Info' },
  warn: { cls: 'border-warn/40 bg-warn/8', icon: '⚠', label: 'Warning' },
  critical: { cls: 'border-critical/60 bg-critical/12', icon: '⛔', label: 'Critical' },
  good: { cls: 'border-good/40 bg-good/10', icon: '✓', label: 'OK' },
};

export function Callout({ tone = 'info', title, children, className }: { tone?: keyof typeof CALLOUT; title?: ReactNode; children: ReactNode; className?: string }) {
  const c = CALLOUT[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3 text-sm', c.cls, className)} role={tone === 'critical' ? 'alert' : undefined}>
      <span aria-label={c.label} className="mt-0.5 shrink-0 text-base leading-none">
        {c.icon}
      </span>
      <div className="min-w-0 text-ink-2">
        {title && <div className="mb-0.5 font-semibold text-ink">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-white/10 bg-card sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-ink-3 hover:bg-raised hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 safe-bottom">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0 rounded-xl bg-raised px-3 py-2.5', className)}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className="truncate text-lg font-semibold text-ink">{value}</div>
      {sub && <div className="truncate text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ value, tone = 'air', className }: { value: number; tone?: 'air' | 'heat' | 'good'; className?: string }) {
  const color = { air: 'bg-air', heat: 'bg-heat', good: 'bg-good' }[tone];
  const track = { air: 'bg-air/15', heat: 'bg-heat/15', good: 'bg-good/15' }[tone];
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full', track, className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-200', color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
      <div className="text-base font-semibold text-ink">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
