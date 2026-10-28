import type { ReactNode } from "react";

export function Panel({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = "real" | "planned" | "neutral" | "warn" | "neg" | "pos";
const TONES: Record<Tone, string> = {
  real: "bg-brand-purple/[0.12] text-brand-purple",
  planned: "border border-dashed border-brand-orange text-brand-orange",
  neutral: "bg-sunken text-muted",
  warn: "bg-warn/[0.15] text-warn",
  neg: "bg-neg/[0.12] text-neg",
  pos: "bg-pos/[0.12] text-pos",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONES[tone]}`}>{children}</span>;
}

export function Meter({ ratio, tone = "purple", label }: { ratio: number; tone?: "purple" | "orange" | "neg" | "warn"; label: string }) {
  const pct = Math.max(0, Math.min(ratio, 1)) * 100;
  const color = { purple: "bg-brand-purple", orange: "bg-brand-orange", neg: "bg-neg", warn: "bg-warn" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>;
}
