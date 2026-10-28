"use client";

import { useMemo, useState } from "react";
import { Eye, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Chip, EmptyState, PageHeader, Panel } from "@/components/ui";
import { inputCls, ghostBtn, primaryBtn } from "@/components/form";
import { useAppData } from "@/data/store";
import { defaultFilters, displaySign, filterTransactions, monthRangeFilters, type Filters, type TxTab } from "@/domain/filters";
import { summarizeTransactions } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import type { AppData, PaymentMethod, Transaction } from "@/domain/types";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";
import { TransactionDetail } from "../transactions/TransactionDetail";
import { TransactionDrawer, type DrawerMode } from "../transactions/TransactionDrawer";

const PAGE = 100;
const METHODS: PaymentMethod[] = ["pix", "debit", "cash", "boleto", "credit_card", "transfer", "other"];

type Panelstate = { kind: "form"; mode: DrawerMode; key: number } | { kind: "detail"; id: string; confirm?: "delete"; key: number } | null;

export function StatementView() {
  const { ready, data, today } = useAppData();
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-64 animate-pulse rounded-xl bg-sunken" />;
  return <Statement data={data} today={today} />;
}

function Statement({ data, today }: { data: AppData; today: string }) {
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(today));
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [panel, setPanel] = useState<Panelstate>(null);
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(PAGE);
  };

  const rows = useMemo(() => filterTransactions(data.transactions, filters), [data.transactions, filters]);
  const summary = useMemo(() => summarizeTransactions(rows), [rows]);
  const accounts = useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts]);
  const cards = useMemo(() => new Map(data.cards.map((c) => [c.id, c.name])), [data.cards]);
  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);

  const activeFilters = [filters.accountId, filters.categoryId, filters.paymentMethod, filters.status, filters.min, filters.max].filter(Boolean).length + (filters.showDeleted ? 1 : 0);
  const open = (mode: DrawerMode) => setPanel({ kind: "form", mode, key: Date.now() });
  const view = (id: string, confirm?: "delete") => setPanel({ kind: "detail", id, confirm, key: Date.now() });

  const where = (x: Transaction) => (x.kind === "transfer" ? `${accounts.get(x.accountId ?? "") ?? "—"} → ${accounts.get(x.toAccountId ?? "") ?? "—"}` : (cards.get(x.cardId ?? "") ?? accounts.get(x.accountId ?? "") ?? "—"));
  const amountCell = (x: Transaction) => {
    const s = displaySign(x);
    return <span className={`font-medium tabular-nums ${s > 0 ? "text-pos" : ""} ${x.deletedAt ? "line-through opacity-60" : ""}`}>{`${s > 0 ? "+ " : s < 0 ? "− " : ""}${formatBRL(x.amount)}`}</span>;
  };
  const badges = (x: Transaction) => (
    <span className="inline-flex flex-wrap gap-1">
      {x.status === "planned" && <Chip tone="planned">{t("status.planned")}</Chip>}
      {x.installment && <Chip tone="neutral">{`${x.installment.index}/${x.installment.total}`}</Chip>}
      {x.reversalOf && <Chip tone="warn">{t("tx.badge.reversal")}</Chip>}
      {x.reversedBy && <Chip tone="warn">{t("tx.badge.reversed")}</Chip>}
      {x.deletedAt && <Chip tone="neg">{t("tx.badge.deleted")}</Chip>}
    </span>
  );
  const actionsFor = (x: Transaction) => {
    const canEdit = !x.deletedAt && !x.reversalOf && !x.reversedBy && x.kind !== "invoice_payment" && x.kind !== "card_refund";
    const canDelete = !x.deletedAt && x.status === "planned" && !x.installment && !x.reversalOf && !x.reversedBy;
    const btn = "rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg";
    return (
      <span className="inline-flex">
        <button type="button" className={btn} onClick={() => view(x.id)} aria-label={t("tx.action.view", { name: x.description })}>
          <Eye size={16} aria-hidden="true" />
        </button>
        {canEdit && (
          <button type="button" className={btn} onClick={() => open({ type: "edit", tx: x })} aria-label={t("tx.action.edit", { name: x.description })}>
            <Pencil size={16} aria-hidden="true" />
          </button>
        )}
        {canDelete && (
          <button type="button" className={btn} onClick={() => view(x.id, "delete")} aria-label={t("tx.action.delete", { name: x.description })}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </span>
    );
  };

  const tabs: { value: TxTab; label: string }[] = [
    { value: "all", label: t("statement.tabs.all") },
    { value: "income", label: t("statement.tabs.income") },
    { value: "expense", label: t("statement.tabs.expense") },
  ];
  const sel = `${inputCls} bg-bg`;

  return (
    <>
      <PageHeader
        title={t("nav.movimentacoes")}
        subtitle={t("statement.subtitle")}
        actions={
          <button type="button" className={primaryBtn} onClick={() => open({ type: "create", kind: "expense" })}>
            <Plus size={16} aria-hidden="true" /> {t("statement.new")}
          </button>
        }
      />

      <section aria-label={t("statement.summary")} className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: t("statement.sum.income"), value: summary.income, tone: "text-pos" },
          { label: t("statement.sum.expense"), value: summary.expense, tone: "" },
          { label: t("statement.sum.net"), value: summary.net, tone: summary.net < 0 ? "text-neg" : "" },
          { label: t("statement.sum.plannedIncome"), value: summary.plannedIncome, tone: "", planned: true },
          { label: t("statement.sum.plannedExpense"), value: summary.plannedExpense, tone: "", planned: true },
        ].map((m) => (
          <div key={m.label} className={`rounded-xl border bg-surface p-3 ${m.planned ? "border-dashed border-brand-orange/70" : "border-line"}`}>
            <p className="text-xs text-muted">{m.label}</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${m.tone}`}>{formatBRL(m.value)}</p>
          </div>
        ))}
      </section>

      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label={t("tx.field.kind")} className="inline-flex rounded-lg bg-sunken p-1">
            {tabs.map((tab) => (
              <button key={tab.value} type="button" aria-pressed={filters.tab === tab.value} onClick={() => set({ tab: tab.value })} className={`h-8 rounded-md px-3 text-sm ${filters.tab === tab.value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="sr-only">
              {t("statement.search")}
            </label>
            <input id="q" type="search" className={inputCls} placeholder={t("statement.search")} value={filters.query} onChange={(e) => set({ query: e.target.value })} />
          </div>
          <button type="button" className={ghostBtn} aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal size={16} aria-hidden="true" /> {t("statement.filters")}
            {activeFilters > 0 && <span className="rounded-full bg-brand-purple px-1.5 text-[11px] text-on-brand">{activeFilters}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2" role="group" aria-label={t("statement.period")}>
              <button type="button" className={ghostBtn} onClick={() => set(monthRangeFilters(today, 0))}>{t("statement.presets.current")}</button>
              <button type="button" className={ghostBtn} onClick={() => set(monthRangeFilters(today, -1))}>{t("statement.presets.previous")}</button>
              <button type="button" className={ghostBtn} onClick={() => set({ from: "", to: "" })}>{t("statement.presets.all")}</button>
            </div>
            <div>
              <label htmlFor="f-from" className="mb-1 block text-sm font-medium">{t("statement.from")}</label>
              <input id="f-from" type="date" className={inputCls} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div>
              <label htmlFor="f-to" className="mb-1 block text-sm font-medium">{t("statement.to")}</label>
              <input id="f-to" type="date" className={inputCls} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
            <div>
              <label htmlFor="f-acc" className="mb-1 block text-sm font-medium">{t("tx.field.account")}</label>
              <select id="f-acc" className={sel} value={filters.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                <option value="">{t("statement.all")}</option>
                {data.accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="f-cat" className="mb-1 block text-sm font-medium">{t("tx.field.category")}</label>
              <select id="f-cat" className={sel} value={filters.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">{t("statement.all")}</option>
                {data.categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="f-pay" className="mb-1 block text-sm font-medium">{t("tx.field.payment")}</label>
              <select id="f-pay" className={sel} value={filters.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as Filters["paymentMethod"] })}>
                <option value="">{t("statement.all")}</option>
                {METHODS.map((m) => (<option key={m} value={m}>{t(`paymentMethod.${m}`)}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="f-status" className="mb-1 block text-sm font-medium">{t("tx.field.status")}</label>
              <select id="f-status" className={sel} value={filters.status} onChange={(e) => set({ status: e.target.value as Filters["status"] })}>
                <option value="">{t("statement.all")}</option>
                <option value="realized">{t("status.realized")}</option>
                <option value="planned">{t("status.planned")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-min" className="mb-1 block text-sm font-medium">{t("statement.min")}</label>
              <input id="f-min" className={inputCls} inputMode="decimal" placeholder="0,00" value={filters.min} onChange={(e) => set({ min: e.target.value })} />
            </div>
            <div>
              <label htmlFor="f-max" className="mb-1 block text-sm font-medium">{t("statement.max")}</label>
              <input id="f-max" className={inputCls} inputMode="decimal" placeholder="0,00" value={filters.max} onChange={(e) => set({ max: e.target.value })} />
            </div>
            <div>
              <label htmlFor="f-sort" className="mb-1 block text-sm font-medium">{t("statement.sort")}</label>
              <select id="f-sort" className={sel} value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters["sort"] })}>
                <option value="date_desc">{t("statement.sorts.date_desc")}</option>
                <option value="date_asc">{t("statement.sorts.date_asc")}</option>
                <option value="amount_desc">{t("statement.sorts.amount_desc")}</option>
                <option value="amount_asc">{t("statement.sorts.amount_asc")}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={filters.showDeleted} onChange={(e) => set({ showDeleted: e.target.checked })} />
              {t("statement.showDeleted")}
            </label>
            <div className="self-end sm:col-span-2 lg:col-span-1">
              <button type="button" className={ghostBtn} onClick={() => { setFilters(defaultFilters(today)); setLimit(PAGE); }}>{t("statement.clear")}</button>
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState>{data.transactions.length === 0 ? t("statement.emptyAll") : t("statement.empty")}</EmptyState>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted" aria-live="polite">{t("statement.count", { count: rows.length })}</p>
            <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("nav.movimentacoes")}</caption>
                <thead className="border-b border-line text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">{t("tx.field.date")}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t("tx.field.description")}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t("tx.field.category")}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t("statement.where")}</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">{t("tx.field.amountShort")}</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium"><span className="sr-only">{t("statement.actions")}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.slice(0, limit).map((x) => (
                    <tr key={x.id} className={x.deletedAt ? "opacity-70" : ""}>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDateBR(x.date, true)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{x.description}</div>
                        <div className="mt-0.5">{badges(x)}</div>
                      </td>
                      <td className="px-4 py-3 text-muted">{x.kind === "transfer" ? t("kind.transfer") : x.kind === "invoice_payment" ? t("kind.invoice_payment") : (cats.get(x.categoryId ?? "") ?? t("common.uncategorized"))}</td>
                      <td className="px-4 py-3 text-muted">{where(x)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{amountCell(x)}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">{actionsFor(x)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-2 md:hidden">
              {rows.slice(0, limit).map((x) => (
                <li key={x.id} className={`rounded-xl border border-line bg-surface p-3 ${x.deletedAt ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{x.description}</p>
                      <p className="text-xs text-muted">
                        {formatDateBR(x.date, true)} · {where(x)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">{amountCell(x)}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div>{badges(x)}</div>
                    {actionsFor(x)}
                  </div>
                </li>
              ))}
            </ul>

            {rows.length > limit && (
              <div className="mt-4 text-center">
                <button type="button" className={ghostBtn} onClick={() => setLimit((l) => l + PAGE)}>{t("statement.more", { count: rows.length - limit })}</button>
              </div>
            )}
          </>
        )}
      </div>

      {panel?.kind === "form" && <TransactionDrawer key={panel.key} mode={panel.mode} onClose={() => setPanel(null)} />}
      {panel?.kind === "detail" && (
        <TransactionDetail key={panel.key} txId={panel.id} startConfirm={panel.confirm ?? null} onClose={() => setPanel(null)} onEdit={(tx) => open({ type: "edit", tx })} />
      )}
    </>
  );
}
