import type { ReactNode } from "react";

export const inputCls = "h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-neg";
export const primaryBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-purple px-4 text-sm font-medium text-on-brand hover:opacity-90 disabled:opacity-50";
export const ghostBtn = "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line px-4 text-sm hover:bg-sunken disabled:opacity-50";

interface AriaProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

/** Rótulo + controle + erro/dica, ligados por aria. O controle recebe `props` via função. */
export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: (props: AriaProps) => ReactNode }) {
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children({ id, ...(error ? { "aria-invalid": true as const } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) })}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-neg">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-9 rounded-md text-sm disabled:cursor-not-allowed ${value === o.value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
