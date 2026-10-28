"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addMonthsToKey, monthEnd, monthStart } from "@/domain/dates";
import { balanceSeries, monthlyFlow, projectedCashflow, spendingByCategory } from "@/domain/finance";
import { formatBRL, formatBRLCompact } from "@/domain/money";
import type { AppData } from "@/domain/types";
import { formatMonthLabel } from "@/lib/format";
import { t } from "@/i18n";
import { EmptyState, Panel } from "@/components/ui";

const PURPLE = "rgb(var(--purple))";
const ORANGE = "rgb(var(--orange))";
const tooltipProps = {
  contentStyle: { background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 10, fontSize: 12, color: "rgb(var(--fg))" },
  labelStyle: { color: "rgb(var(--fg))", fontWeight: 600 },
  formatter: (v: unknown) => formatBRL(Number(v)),
};
const axisProps = { stroke: "rgb(var(--muted))", fontSize: 11, tickLine: false, axisLine: false } as const;
const tick = (v: number) => formatBRLCompact(v);

interface Props {
  data: AppData;
  today: string;
  periodKey: string;
}

export function FlowChart({ data, periodKey }: Props) {
  const keys = Array.from({ length: 6 }, (_, i) => addMonthsToKey(periodKey, i - 3));
  const rows = monthlyFlow(data, keys).map((r) => ({ ...r, label: formatMonthLabel(r.key, "short") }));
  return (
    <Panel title={t("dashboard.charts.flow")} subtitle={t("dashboard.charts.flowNote")}>
      <div className="h-64" role="img" aria-label={t("dashboard.charts.flow")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis tickFormatter={tick} width={76} {...axisProps} />
            <Tooltip {...tooltipProps} cursor={{ fill: "rgb(var(--sunken))" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="income" stackId="in" name={t("dashboard.charts.incomeReal")} fill={PURPLE} />
            <Bar dataKey="plannedIncome" stackId="in" name={t("dashboard.charts.incomePlanned")} fill={PURPLE} fillOpacity={0.35} />
            <Bar dataKey="expense" stackId="out" name={t("dashboard.charts.expenseReal")} fill={ORANGE} />
            <Bar dataKey="plannedExpense" stackId="out" name={t("dashboard.charts.expensePlanned")} fill={ORANGE} fillOpacity={0.35} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function BalanceChart({ data, today, periodKey }: Props) {
  const start = monthStart(periodKey);
  const end = monthEnd(periodKey) < today ? monthEnd(periodKey) : today;
  const rows = start > end ? [] : balanceSeries(data, start, end).map((r) => ({ ...r, label: r.date.slice(8) }));
  return (
    <Panel title={t("dashboard.charts.balance")} subtitle={t("dashboard.charts.balanceNote")}>
      {rows.length === 0 ? (
        <EmptyState>{t("dashboard.charts.balanceEmpty")}</EmptyState>
      ) : (
        <div className="h-64" role="img" aria-label={t("dashboard.charts.balance")}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
              <YAxis tickFormatter={tick} width={76} {...axisProps} domain={["auto", "auto"]} />
              <Tooltip {...tooltipProps} labelFormatter={(l) => t("dashboard.charts.day", { day: String(l) })} />
              <Area type="monotone" dataKey="balance" name={t("dashboard.kpi.realBalance")} stroke={PURPLE} fill={PURPLE} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

export function CategoryBreakdown({ data, periodKey }: Props) {
  const rows = spendingByCategory(data, monthStart(periodKey), monthEnd(periodKey));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  return (
    <Panel title={t("dashboard.charts.categories")} subtitle={t("dashboard.charts.categoriesNote")}>
      {rows.length === 0 ? (
        <EmptyState>{t("dashboard.charts.categoriesEmpty")}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 7).map((r) => {
            const cat = cats.get(r.categoryId);
            const pct = total > 0 ? (r.amount / total) * 100 : 0;
            return (
              <li key={r.categoryId}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{cat?.name ?? t("common.uncategorized")}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatBRL(r.amount)} <span className="text-xs text-muted">{Math.round(pct)}%</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cat?.color ?? "rgb(var(--muted))" }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function ProjectionChart({ data, today }: Props) {
  const rows = projectedCashflow(data, today, 6).map((p) => ({ ...p, label: p.key === "today" ? t("dashboard.charts.today") : formatMonthLabel(p.key, "short") }));
  return (
    <Panel title={t("dashboard.charts.projection")} subtitle={t("dashboard.charts.projectionNote")}>
      <div className="h-64" role="img" aria-label={t("dashboard.charts.projection")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis tickFormatter={tick} width={76} {...axisProps} />
            <Tooltip {...tooltipProps} />
            <ReferenceLine y={0} stroke="rgb(var(--neg))" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="balance" name={t("dashboard.kpi.projected")} stroke={ORANGE} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: ORANGE }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
