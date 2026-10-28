"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonthsToKey, monthEnd, monthKey, monthStart } from "@/domain/dates";
import { commitments, estimatedAvailable, periodSummary, plannedIncomeUntil, totalBalance } from "@/domain/finance";
import { useAppData } from "@/data/store";
import { greetingFor } from "@/lib/greeting";
import { formatMonthLabel } from "@/lib/format";
import { t } from "@/i18n";
import { PageHeader } from "@/components/ui";
import { BalanceChart, CategoryBreakdown, FlowChart, ProjectionChart } from "./Charts";
import { AlertsPanel } from "./AlertsPanel";
import { FirstSteps } from "./FirstSteps";
import { KpiLedger } from "./KpiLedger";
import { WidgetBoard } from "./WidgetBoard";

const navBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-sunken";

export function DashboardView() {
  const { ready, data, today, prefs } = useAppData();
  const [picked, setPicked] = useState<string | null>(null);
  const currentKey = monthKey(today);
  const periodKey = picked ?? currentKey;

  const numbers = useMemo(() => {
    if (!data) return null;
    const start = monthStart(periodKey);
    const end = monthEnd(periodKey);
    const horizon = end < today ? today : end;
    const summary = periodSummary(data, start, end);
    const commit = commitments(data, today, horizon);
    const available = estimatedAvailable(data, today, horizon);
    return { real: totalBalance(data, today), summary, commit, available, projected: available + plannedIncomeUntil(data, horizon), horizon };
  }, [data, today, periodKey]);

  if (!ready || !data || !numbers) {
    return <div role="status" aria-busy="true" className="h-64 animate-pulse rounded-xl bg-sunken" aria-label={t("common.loading")} />;
  }

  const greetingKey = greetingFor(new Date().getHours());
  const rawLabel = formatMonthLabel(periodKey);
  const periodLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  const chartProps = { data, today, periodKey };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.greeting", { name: prefs.userName, period: t(`dashboard.greetings.${greetingKey}`) })}
        subtitle={t("dashboard.subtitle")}
        actions={
          <div className="flex items-center gap-2" role="group" aria-label={t("dashboard.period.label")}>
            <button type="button" className={navBtn} onClick={() => setPicked(addMonthsToKey(periodKey, -1))} aria-label={t("dashboard.period.prev")}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
              {periodLabel}
            </span>
            <button type="button" className={navBtn} onClick={() => setPicked(addMonthsToKey(periodKey, 1))} aria-label={t("dashboard.period.next")}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" className="h-9 rounded-lg border border-line px-3 text-sm hover:bg-sunken disabled:opacity-40" disabled={periodKey === currentKey} onClick={() => setPicked(null)}>
              {t("dashboard.period.current")}
            </button>
          </div>
        }
      />

      <FirstSteps />

      <AlertsPanel />

      <KpiLedger
        real={numbers.real}
        income={numbers.summary.income}
        expense={numbers.summary.expense}
        commit={numbers.commit}
        available={numbers.available}
        projected={numbers.projected}
        horizon={numbers.horizon}
        periodLabel={periodLabel}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <FlowChart {...chartProps} />
        <BalanceChart {...chartProps} />
        <CategoryBreakdown {...chartProps} />
        <ProjectionChart {...chartProps} />
      </div>

      <WidgetBoard {...chartProps} />
    </div>
  );
}
