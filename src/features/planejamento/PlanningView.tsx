"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Chip, EmptyState, Meter, PageHeader, Panel } from "@/components/ui";
import { ghostBtn, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { addMonthsToKey, monthEnd, monthKey, monthStart } from "@/domain/dates";
import { budgetUsage, cashflowTable, commitments, goalMonthlyNeed, goalProgress, periodSummary } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import type { AppData, Goal } from "@/domain/types";
import { formatDateBR, formatMonthTitle } from "@/lib/format";
import { t } from "@/i18n";
import { ProjectionChart } from "../dashboard/Charts";
import { WIDGET_REGISTRY } from "../dashboard/Widgets";
import { BudgetDrawer, GoalDrawer, RecurrenceDrawer } from "./PlanningDrawers";

type PanelState =
  | { kind: "budget"; categoryId?: string; key: number }
  | { kind: "goal"; mode: "create" | "edit" | "contribute"; goal?: Goal; key: number }
  | { kind: "recurrence"; key: number }
  | null;

export function PlanningView() {
  const { ready, data, today } = useAppData();
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-40 animate-pulse rounded-xl bg-sunken" />;
  return <Planning data={data} today={today} />;
}

function Planning({ data, today }: { data: AppData; today: string }) {
  const { actions } = useAppData();
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const currentKey = monthKey(today);
  const periodKey = picked ?? currentKey;
  const start = monthStart(periodKey);
  const end = monthEnd(periodKey);
  const horizon = end < today ? today : end;

  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const budgets = useMemo(() => budgetUsage(data, start, end), [data, start, end]);
  const summary = useMemo(() => periodSummary(data, start, end), [data, start, end]);
  const commit = useMemo(() => commitments(data, today, horizon), [data, today, horizon]);
  const flow = useMemo(() => cashflowTable(data, today, periodKey, 6), [data, today, periodKey]);
  const goals = data.goals.filter((g) => !g.archivedAt);
  const archived = data.goals.filter((g) => g.archivedAt);
  const alerts = [
    ...budgets.filter((b) => b.level !== "ok").map((b) => ({ id: `b-${b.categoryId}`, tone: b.level, text: t(`planning.alert.budget.${b.level}`, { name: cats.get(b.categoryId) ?? "—" }) })),
    ...goals.filter((g) => goalProgress(g, today).late).map((g) => ({ id: `g-${g.id}`, tone: "over" as const, text: t("planning.alert.goalLate", { name: g.name, date: formatDateBR(g.deadline, true) }) })),
  ];
  const label = formatMonthTitle(periodKey);
  const navBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line hover:bg-sunken";
  const Upcoming = WIDGET_REGISTRY.upcoming.Component;
  const open = (p: PanelState) => setPanel(p);

  const nextOccurrence = (id: string) => data.transactions.filter((x) => x.recurrenceId === id && !x.deletedAt && x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.date;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.planejamento")}
        subtitle={t("planning.subtitle")}
        actions={
          <div className="flex items-center gap-2" role="group" aria-label={t("dashboard.period.label")}>
            <button type="button" className={navBtn} onClick={() => setPicked(addMonthsToKey(periodKey, -1))} aria-label={t("dashboard.period.prev")}><ChevronLeft size={18} aria-hidden="true" /></button>
            <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">{label}</span>
            <button type="button" className={navBtn} onClick={() => setPicked(addMonthsToKey(periodKey, 1))} aria-label={t("dashboard.period.next")}><ChevronRight size={18} aria-hidden="true" /></button>
            <button type="button" className={`${ghostBtn} !h-9`} disabled={periodKey === currentKey} onClick={() => setPicked(null)}>{t("dashboard.period.current")}</button>
          </div>
        }
      />

      {alerts.length > 0 && (
        <section aria-label={t("planning.alerts")} className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-warn" aria-hidden="true" /> {t("planning.alerts")}</h2>
          <ul className="space-y-1.5 text-sm">
            {alerts.map((a) => (<li key={a.id} className={a.tone === "over" ? "text-neg" : "text-warn"}>{a.text}</li>))}
          </ul>
        </section>
      )}

      <Panel
        title={t("planning.budgets")}
        subtitle={t("planning.budgetsNote")}
        action={<button type="button" className={`${primaryBtn} !h-9`} onClick={() => open({ kind: "budget", key: Date.now() })}><Plus size={16} aria-hidden="true" /> {t("planning.budgetNew")}</button>}
      >
        {budgets.length === 0 ? (
          <EmptyState>{t("planning.noBudgets")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {budgets.map((b) => (
              <li key={b.categoryId} className="py-3 first:pt-0 last:pb-0">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{cats.get(b.categoryId)}</span>
                  <span className="text-xs tabular-nums text-muted">
                    {t("planning.budgetLine", { spent: formatBRL(b.spent), limit: formatBRL(b.limit) })}
                  </span>
                </div>
                <Meter ratio={b.ratio} tone={b.level === "over" ? "neg" : b.level === "near" ? "warn" : "purple"} label={cats.get(b.categoryId) ?? ""} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2">
                    {b.level !== "ok" && <Chip tone={b.level === "over" ? "neg" : "warn"}>{t(`planning.level.${b.level}`)}</Chip>}
                    {b.planned > 0 && <span className="text-brand-orange">{t("planning.plannedExtra", { value: formatBRL(b.planned) })}</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => open({ kind: "budget", categoryId: b.categoryId, key: Date.now() })} aria-label={t("planning.editBudget", { name: cats.get(b.categoryId) ?? "" })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg"><Pencil size={14} aria-hidden="true" /></button>
                    {confirm === `bud-${b.categoryId}` ? (
                      <>
                        <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs text-neg`} onClick={() => { actions.removeBudget(b.categoryId); setConfirm(null); toast(t("planning.toast.budgetRemoved")); }}>{t("planning.confirmRemove")}</button>
                        <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirm(`bud-${b.categoryId}`)} aria-label={t("planning.removeBudget", { name: cats.get(b.categoryId) ?? "" })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-neg"><Trash2 size={14} aria-hidden="true" /></button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("planning.plannedTitle")} subtitle={t("planning.plannedNote", { month: label })}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted">{t("statement.sum.plannedIncome")}</dt><dd className="text-lg font-semibold tabular-nums">{formatBRL(summary.plannedIncome)}</dd></div>
            <div><dt className="text-xs text-muted">{t("statement.sum.plannedExpense")}</dt><dd className="text-lg font-semibold tabular-nums">{formatBRL(summary.plannedExpense)}</dd></div>
            <div><dt className="text-xs text-muted">{t("statement.sum.income")}</dt><dd className="tabular-nums">{formatBRL(summary.income)}</dd></div>
            <div><dt className="text-xs text-muted">{t("statement.sum.expense")}</dt><dd className="tabular-nums">{formatBRL(summary.expense)}</dd></div>
          </dl>
        </Panel>
        <Panel title={t("planning.commitments")} subtitle={t("planning.commitmentsNote", { date: formatDateBR(horizon) })}>
          <p className="mb-3 text-lg font-semibold tabular-nums">{formatBRL(commit.total)}</p>
          <p className="mb-3 text-xs text-muted">{t("dashboard.kpi.commitmentsHint", { bills: formatBRL(commit.bills), invoices: formatBRL(commit.invoices) })}</p>
          <Upcoming data={data} today={today} periodKey={periodKey} />
        </Panel>
      </div>

      <Panel
        title={t("planning.goals")}
        action={<button type="button" className={`${primaryBtn} !h-9`} onClick={() => open({ kind: "goal", mode: "create", key: Date.now() })}><Plus size={16} aria-hidden="true" /> {t("planning.goalNew")}</button>}
      >
        {goals.length === 0 ? (
          <EmptyState>{t("planning.noGoals")}</EmptyState>
        ) : (
          <ul className="space-y-5">
            {goals.map((g) => {
              const { ratio, late } = goalProgress(g, today);
              const done = g.saved >= g.target;
              const need = goalMonthlyNeed(g, today);
              return (
                <li key={g.id}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">{g.name} {done ? <Chip tone="pos">{t("planning.goalDone")}</Chip> : late ? <Chip tone="neg">{t("widgets.goals.late")}</Chip> : null}</span>
                    <span className="text-xs tabular-nums text-muted">{formatBRL(g.saved)} / {formatBRL(g.target)}</span>
                  </div>
                  <Meter ratio={ratio} tone={done ? "purple" : late ? "neg" : "orange"} label={g.name} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {t("widgets.goals.deadline", { date: formatDateBR(g.deadline, true) })}
                      {need !== null && ` · ${t("planning.goalNeed", { value: formatBRL(need) })}`}
                    </span>
                    <span className="flex gap-1">
                      {!done && <button type="button" className={`${primaryBtn} !h-8 !px-3 text-xs`} onClick={() => open({ kind: "goal", mode: "contribute", goal: g, key: Date.now() })}>{t("planning.addContribution")}</button>}
                      <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => open({ kind: "goal", mode: "edit", goal: g, key: Date.now() })}>{t("common.edit")}</button>
                      <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => { actions.archiveGoal(g.id); toast(t("planning.toast.archived")); }}>{t("planning.archive")}</button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {archived.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <button type="button" aria-expanded={showArchived} className="text-sm text-muted underline" onClick={() => setShowArchived((s) => !s)}>{showArchived ? t("planning.hideArchived") : t("planning.showArchived", { count: archived.length })}</button>
            {showArchived && (
              <ul className="mt-3 space-y-2">
                {archived.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">{g.name}</span>
                    <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => { actions.restoreGoal(g.id); toast(t("planning.toast.restoredGoal")); }}>{t("tx.restore")}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectionChart data={data} today={today} periodKey={periodKey} />
        <Panel title={t("planning.flowTable")} subtitle={t("planning.flowTableNote")}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("planning.flowTable")}</caption>
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">{t("planning.col.month")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("planning.col.income")}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t("planning.col.expense")}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t("planning.col.projected")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {flow.map((r) => (
                  <tr key={r.key}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">{formatMonthTitle(r.key, "short")}</th>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatBRL(r.income)}
                      {r.plannedIncome > 0 && <span className="block text-xs text-brand-orange">+ {formatBRL(r.plannedIncome)}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatBRL(r.expense)}
                      {r.plannedExpense > 0 && <span className="block text-xs text-brand-orange">+ {formatBRL(r.plannedExpense)}</span>}
                    </td>
                    <td className={`py-2 text-right font-medium tabular-nums ${r.projected < 0 ? "text-neg" : ""}`}>{formatBRL(r.projected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel
        title={t("planning.recurrences")}
        subtitle={t("planning.recurrencesNote")}
        action={<button type="button" className={`${primaryBtn} !h-9`} onClick={() => open({ kind: "recurrence", key: Date.now() })}><Plus size={16} aria-hidden="true" /> {t("planning.recNew")}</button>}
      >
        {data.recurrences.length === 0 ? (
          <EmptyState>{t("planning.noRecurrences")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {data.recurrences.map((r) => {
              const next = r.active ? nextOccurrence(r.id) : undefined;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">{r.description} {!r.active && <Chip tone="neutral">{t("planning.ended")}</Chip>}</p>
                    <p className="text-xs text-muted">
                      {t(`kind.${r.kind}`)} · {t(`frequency.${r.frequency}`)}
                      {next && ` · ${t("planning.nextOccurrence", { date: formatDateBR(next, true) })}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{formatBRL(r.amount)}</span>
                    {r.active &&
                      (confirm === `rec-${r.id}` ? (
                        <>
                          <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs text-neg`} onClick={() => { const res = actions.endRecurrence(r.id); setConfirm(null); toast(res.ok ? t("planning.toast.recEnded") : t(res.error), res.ok ? "ok" : "error"); }}>{t("planning.confirmEnd")}</button>
                          <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
                        </>
                      ) : (
                        <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => setConfirm(`rec-${r.id}`)}>{t("planning.end")}</button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {panel?.kind === "budget" && <BudgetDrawer key={panel.key} categoryId={panel.categoryId} onClose={() => setPanel(null)} />}
      {panel?.kind === "goal" && <GoalDrawer key={panel.key} mode={panel.mode} goal={panel.goal} onClose={() => setPanel(null)} />}
      {panel?.kind === "recurrence" && <RecurrenceDrawer key={panel.key} onClose={() => setPanel(null)} />}
    </div>
  );
}
