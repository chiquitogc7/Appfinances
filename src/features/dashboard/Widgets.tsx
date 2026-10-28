import type { ComponentType } from "react";
import { monthEnd, monthStart } from "@/domain/dates";
import { budgetUsage, cardUsage, computeInvoices, goalProgress, installmentPlans, investmentSummary, upcomingCommitments } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import type { AppData } from "@/domain/types";
import type { WidgetId } from "@/data/store";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";
import { Chip, EmptyState, Meter } from "@/components/ui";

export interface WidgetProps {
  data: AppData;
  today: string;
  periodKey: string;
}

const INVOICE_TONE = { open: "neutral", closed: "warn", overdue: "neg", paid: "pos" } as const;

function CardsWidget({ data, today }: WidgetProps) {
  const invoices = computeInvoices(data, today);
  if (data.cards.length === 0) return <EmptyState>{t("widgets.cards.empty")}</EmptyState>;
  return (
    <ul className="space-y-4">
      {data.cards.map((card) => {
        const { used, available } = cardUsage(card, invoices);
        const next = invoices.find((i) => i.cardId === card.id && i.remaining > 0);
        return (
          <li key={card.id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{card.name}</span>
              <span className="shrink-0 text-xs text-muted tabular-nums">{t("widgets.cards.available", { value: formatBRL(available) })}</span>
            </div>
            <div className="my-1.5">
              <Meter ratio={card.limit > 0 ? used / card.limit : 0} tone={used / card.limit > 0.8 ? "warn" : "purple"} label={t("widgets.cards.usage", { name: card.name })} />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>{t("widgets.cards.closing", { day: card.closingDay, due: card.dueDay })}</span>
              {next && (
                <span className="flex items-center gap-1.5">
                  <Chip tone={INVOICE_TONE[next.status]}>{t(`invoiceStatus.${next.status}`)}</Chip>
                  <span className="tabular-nums">{formatBRL(next.remaining)}</span>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InstallmentsWidget({ data }: WidgetProps) {
  const plans = installmentPlans(data);
  const cards = new Map(data.cards.map((c) => [c.id, c.name]));
  if (plans.length === 0) return <EmptyState>{t("widgets.installments.empty")}</EmptyState>;
  return (
    <ul className="divide-y divide-line">
      {plans.map((p) => (
        <li key={p.groupId} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{p.description}</p>
            <p className="text-xs text-muted">
              {t("widgets.installments.left", { left: p.remainingCount, total: p.count })}
              {p.cardId && ` · ${cards.get(p.cardId)}`}
              {p.nextDate && ` · ${t("widgets.installments.next", { date: formatDateBR(p.nextDate) })}`}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums">{formatBRL(p.remainingAmount)}</span>
        </li>
      ))}
    </ul>
  );
}

function UpcomingWidget({ data, today }: WidgetProps) {
  const items = upcomingCommitments(data, today, 6);
  if (items.length === 0) return <EmptyState>{t("widgets.upcoming.empty")}</EmptyState>;
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{i.kind === "invoice" ? t("widgets.upcoming.invoice", { name: i.label }) : i.label}</p>
            <p className="text-xs text-muted">
              {formatDateBR(i.date)} {i.overdue && <Chip tone="neg">{t("widgets.upcoming.overdue")}</Chip>}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums">{formatBRL(i.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function BudgetsWidget({ data, periodKey }: WidgetProps) {
  const rows = budgetUsage(data, monthStart(periodKey), monthEnd(periodKey));
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  if (rows.length === 0) return <EmptyState>{t("widgets.budgets.empty")}</EmptyState>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.categoryId}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{cats.get(r.categoryId)}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted">
              {formatBRL(r.spent)} / {formatBRL(r.limit)}
            </span>
          </div>
          <Meter ratio={r.ratio} tone={r.level === "over" ? "neg" : r.level === "near" ? "warn" : "purple"} label={cats.get(r.categoryId) ?? ""} />
          {r.level !== "ok" && <p className={`mt-1 text-xs ${r.level === "over" ? "text-neg" : "text-warn"}`}>{t(`widgets.budgets.${r.level}`)}</p>}
        </li>
      ))}
    </ul>
  );
}

function GoalsWidget({ data, today }: WidgetProps) {
  const goals = data.goals.filter((g) => !g.archivedAt);
  if (goals.length === 0) return <EmptyState>{t("widgets.goals.empty")}</EmptyState>;
  return (
    <ul className="space-y-4">
      {goals.map((g) => {
        const { ratio, late } = goalProgress(g, today);
        return (
          <li key={g.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{g.name}</span>
              {late && <Chip tone="neg">{t("widgets.goals.late")}</Chip>}
            </div>
            <Meter ratio={ratio} tone={late ? "neg" : "orange"} label={g.name} />
            <p className="mt-1 text-xs text-muted tabular-nums">
              {formatBRL(g.saved)} / {formatBRL(g.target)} · {t("widgets.goals.deadline", { date: formatDateBR(g.deadline, true) })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function InvestmentsWidget({ data }: WidgetProps) {
  const s = investmentSummary(data);
  if (data.investments.length === 0) return <EmptyState>{t("widgets.investments.empty")}</EmptyState>;
  return (
    <div>
      <p className="text-xl font-semibold tabular-nums">{formatBRL(s.current)}</p>
      <p className={`text-xs tabular-nums ${s.result >= 0 ? "text-pos" : "text-neg"}`}>
        {s.result >= 0 ? "+" : "−"}
        {formatBRL(Math.abs(s.result))} {t("widgets.investments.result")}
      </p>
      <ul className="mt-3 space-y-1.5">
        {s.byCategory.map((c) => (
          <li key={c.category} className="flex justify-between text-sm">
            <span className="text-muted">{c.category}</span>
            <span className="tabular-nums">{formatBRL(c.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{t("widgets.investments.note")}</p>
    </div>
  );
}

export const WIDGET_REGISTRY: Record<WidgetId, { Component: ComponentType<WidgetProps>; planned: boolean }> = {
  upcoming: { Component: UpcomingWidget, planned: true },
  cards: { Component: CardsWidget, planned: false },
  installments: { Component: InstallmentsWidget, planned: true },
  budgets: { Component: BudgetsWidget, planned: false },
  goals: { Component: GoalsWidget, planned: false },
  investments: { Component: InvestmentsWidget, planned: false },
};

