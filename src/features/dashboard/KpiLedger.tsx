import type { Commitments } from "@/domain/finance";
import { formatBRL, type Cents } from "@/domain/money";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";
import { Chip } from "@/components/ui";

interface Props {
  real: Cents;
  income: Cents;
  expense: Cents;
  commit: Commitments;
  available: Cents;
  projected: Cents;
  horizon: string;
  periodLabel: string;
}

function Metric({ label, value, hint, tone }: { label: string; value: Cents; hint: string; tone?: "neg" | "pos" }) {
  const color = tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "";
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${color}`}>{formatBRL(value)}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function KpiLedger({ real, income, expense, commit, available, projected, horizon, periodLabel }: Props) {
  const until = formatDateBR(horizon);
  return (
    <section aria-label={t("dashboard.kpi.aria")} className="grid gap-4 2xl:grid-cols-2">
      <div className="rounded-xl border border-line border-l-4 border-l-brand-purple bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Chip tone="real">{t("dashboard.kpi.realized")}</Chip>
          <span className="text-xs text-muted">{t("dashboard.kpi.realizedNote")}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label={t("dashboard.kpi.realBalance")} value={real} hint={t("dashboard.kpi.realBalanceHint")} />
          <Metric label={t("dashboard.kpi.income")} value={income} hint={periodLabel} tone="pos" />
          <Metric label={t("dashboard.kpi.expense")} value={expense} hint={periodLabel} />
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-brand-orange bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Chip tone="planned">{t("dashboard.kpi.planned")}</Chip>
          <span className="text-xs text-muted">{t("dashboard.kpi.plannedNote", { date: until })}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label={t("dashboard.kpi.commitments")} value={commit.total} hint={t("dashboard.kpi.commitmentsHint", { bills: formatBRL(commit.bills), invoices: formatBRL(commit.invoices) })} />
          <Metric label={t("dashboard.kpi.available")} value={available} hint={t("dashboard.kpi.availableHint")} tone={available < 0 ? "neg" : undefined} />
          <Metric label={t("dashboard.kpi.projected")} value={projected} hint={t("dashboard.kpi.projectedHint", { date: until })} tone={projected < 0 ? "neg" : undefined} />
        </div>
      </div>
    </section>
  );
}
