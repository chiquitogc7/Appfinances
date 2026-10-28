/**
 * Relatórios: funções puras que devolvem tabelas neutras de idioma (rótulos são chaves i18n).
 * Usam as mesmas regras de finance.ts, então os números batem com dashboard e extrato.
 */
import { addMonthsToKey, eachDay, monthEnd, monthKey, monthStart, type ISODate } from "./dates";
import { accountBalance, budgetUsage, computeInvoices, expenseDelta, installmentPlans, isCounted, netWorth, summarizeTransactions } from "./finance";
import type { Cents } from "./money";
import type { AppData, Transaction } from "./types";

export interface ReportFilters {
  from: ISODate;
  to: ISODate;
  /** "" = tudo; "acc:ID" = conta; "card:ID" = cartão. */
  source: string;
  categoryId: string;
}

/** text: texto livre · i18n: chave de tradução · month: "YYYY-MM" · money: centavos · percent: razão (0..1) · date: ISO · int: inteiro */
export type ColumnType = "text" | "i18n" | "month" | "money" | "percent" | "date" | "int";
export type Cell = string | number | null;

export interface ReportTable {
  id: string;
  titleKey: string;
  columns: { key: string; labelKey: string; type: ColumnType }[];
  rows: Record<string, Cell>[];
  footer?: Record<string, Cell>;
}

export const MAX_REPORT_MONTHS = 60;

export function matchesSource(t: Transaction, source: string): boolean {
  if (!source) return true;
  const [kind, id] = source.split(":");
  if (kind === "card") return t.cardId === id;
  if (kind === "acc") return t.accountId === id || t.toAccountId === id;
  return true;
}

/** Filtra por origem e categoria (sem data) devolvendo AppData completo, para reaproveitar funções existentes. */
export function scopedData(data: AppData, f: Pick<ReportFilters, "source" | "categoryId">): AppData {
  return { ...data, transactions: data.transactions.filter((t) => matchesSource(t, f.source) && (!f.categoryId || t.categoryId === f.categoryId)) };
}

function inRange(data: AppData, f: ReportFilters): Transaction[] {
  return scopedData(data, f).transactions.filter((t) => t.date >= f.from && t.date <= f.to);
}

function monthKeys(f: ReportFilters, fallbackToday: ISODate): string[] {
  const from = f.from || fallbackToday;
  const to = f.to || fallbackToday;
  const out: string[] = [];
  for (let k = monthKey(from); k <= monthKey(to) && out.length < MAX_REPORT_MONTHS; k = addMonthsToKey(k, 1)) out.push(k);
  return out;
}

const sum = (rows: Record<string, Cell>[], key: string) => rows.reduce((s, r) => s + (r[key] as number), 0);

export function incomeExpenseReport(data: AppData, f: ReportFilters, today: ISODate): ReportTable {
  const txs = inRange(data, f);
  const rows = monthKeys(f, today).map((key) => {
    const s = summarizeTransactions(txs.filter((t) => t.date >= monthStart(key) && t.date <= monthEnd(key)));
    return { month: key, income: s.income, plannedIncome: s.plannedIncome, expense: s.expense, plannedExpense: s.plannedExpense, net: s.net };
  });
  return {
    id: "incomeExpense",
    titleKey: "reports.incomeExpense.title",
    columns: [
      { key: "month", labelKey: "reports.col.month", type: "month" },
      { key: "income", labelKey: "reports.col.incomeReal", type: "money" },
      { key: "plannedIncome", labelKey: "reports.col.incomePlanned", type: "money" },
      { key: "expense", labelKey: "reports.col.expenseReal", type: "money" },
      { key: "plannedExpense", labelKey: "reports.col.expensePlanned", type: "money" },
      { key: "net", labelKey: "reports.col.net", type: "money" },
    ],
    rows,
    footer: { month: "reports.total", income: sum(rows, "income"), plannedIncome: sum(rows, "plannedIncome"), expense: sum(rows, "expense"), plannedExpense: sum(rows, "plannedExpense"), net: sum(rows, "net") },
  };
}

export function spendingReport(data: AppData, f: ReportFilters): ReportTable {
  const names = new Map(data.categories.map((c) => [c.id, c.name]));
  const totals = new Map<string, Cents>();
  for (const t of inRange(data, f)) {
    if (!isCounted(t) || t.status !== "realized") continue;
    const delta = expenseDelta(t);
    if (delta === 0) continue;
    const id = t.categoryId ?? "";
    totals.set(id, (totals.get(id) ?? 0) + delta);
  }
  const entries = [...totals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const rows = entries.map(([id, amount]) => ({ category: id ? (names.get(id) ?? id) : "reports.noCategory", amount, share: total > 0 ? amount / total : 0 }));
  return {
    id: "spending",
    titleKey: "reports.spending.title",
    columns: [
      { key: "category", labelKey: "reports.col.category", type: "text" },
      { key: "amount", labelKey: "reports.col.amount", type: "money" },
      { key: "share", labelKey: "reports.col.share", type: "percent" },
    ],
    rows,
    footer: { category: "reports.total", amount: total, share: total > 0 ? 1 : 0 },
  };
}

function balanceAccounts(data: AppData, f: ReportFilters) {
  const [kind, id] = f.source.split(":");
  return kind === "acc" ? data.accounts.filter((a) => a.id === id) : data.accounts;
}

export function balanceDaily(data: AppData, f: ReportFilters, today: ISODate) {
  const accounts = balanceAccounts(data, f);
  const from = f.from || today;
  const to = f.to && f.to < today ? f.to : today;
  if (from > to) return [];
  const days = eachDay(from, to).slice(-400);
  return days.map((date) => ({ date, balance: accounts.reduce((s, a) => s + accountBalance(a, data.transactions, date), 0) }));
}

export function balanceReport(data: AppData, f: ReportFilters, today: ISODate): ReportTable {
  const accounts = balanceAccounts(data, f);
  const rows = monthKeys(f, today)
    .filter((key) => monthStart(key) <= today)
    .map((key) => {
      const end = monthEnd(key) < today ? monthEnd(key) : today;
      return { month: key, date: end, balance: accounts.reduce((s, a) => s + accountBalance(a, data.transactions, end), 0) };
    });
  return {
    id: "balance",
    titleKey: "reports.balance.title",
    columns: [
      { key: "month", labelKey: "reports.col.month", type: "month" },
      { key: "date", labelKey: "reports.col.asOf", type: "date" },
      { key: "balance", labelKey: "reports.col.balance", type: "money" },
    ],
    rows,
  };
}

export function budgetReport(data: AppData, f: ReportFilters, today: ISODate): ReportTable {
  const ref = f.to && f.to < today ? f.to : today;
  const key = monthKey(ref);
  const names = new Map(data.categories.map((c) => [c.id, c.name]));
  const rows = budgetUsage(scopedData(data, { source: f.source, categoryId: "" }), monthStart(key), monthEnd(key))
    .filter((b) => !f.categoryId || b.categoryId === f.categoryId)
    .map((b) => ({ category: names.get(b.categoryId) ?? b.categoryId, month: key, limit: b.limit, spent: b.spent, planned: b.planned, ratio: b.ratio, level: `reports.level.${b.level}` }));
  return {
    id: "budgets",
    titleKey: "reports.budgets.title",
    columns: [
      { key: "category", labelKey: "reports.col.category", type: "text" },
      { key: "month", labelKey: "reports.col.month", type: "month" },
      { key: "limit", labelKey: "reports.col.limit", type: "money" },
      { key: "spent", labelKey: "reports.col.spent", type: "money" },
      { key: "planned", labelKey: "reports.col.planned", type: "money" },
      { key: "ratio", labelKey: "reports.col.used", type: "percent" },
      { key: "level", labelKey: "reports.col.status", type: "i18n" },
    ],
    rows,
  };
}

export function commitmentsReport(data: AppData, f: ReportFilters, today: ISODate): ReportTable[] {
  const scoped = scopedData(data, f);
  const cards = new Map(data.cards.map((c) => [c.id, c.name]));
  const plans = installmentPlans(scoped).map((p) => ({ description: p.description, card: p.cardId ? (cards.get(p.cardId) ?? "") : "", left: p.remainingCount, total: p.count, amount: p.remainingAmount, next: p.nextDate ?? null }));
  const [kind, id] = f.source.split(":");
  const invoices = computeInvoices(data, today)
    .filter((i) => i.remaining > 0 && (kind !== "card" || i.cardId === id) && kind !== "acc")
    .map((i) => ({ card: cards.get(i.cardId) ?? "", month: i.key, due: i.due, total: i.total, paid: i.paid, remaining: i.remaining, status: `invoiceStatus.${i.status}` }));
  return [
    {
      id: "installments",
      titleKey: "reports.commitments.installments",
      columns: [
        { key: "description", labelKey: "reports.col.description", type: "text" },
        { key: "card", labelKey: "reports.col.card", type: "text" },
        { key: "left", labelKey: "reports.col.left", type: "int" },
        { key: "total", labelKey: "reports.col.count", type: "int" },
        { key: "amount", labelKey: "reports.col.remaining", type: "money" },
        { key: "next", labelKey: "reports.col.next", type: "date" },
      ],
      rows: plans,
      footer: { description: "reports.total", amount: sum(plans, "amount") },
    },
    {
      id: "invoices",
      titleKey: "reports.commitments.invoices",
      columns: [
        { key: "card", labelKey: "reports.col.card", type: "text" },
        { key: "month", labelKey: "reports.col.month", type: "month" },
        { key: "due", labelKey: "reports.col.due", type: "date" },
        { key: "total", labelKey: "reports.col.total", type: "money" },
        { key: "paid", labelKey: "reports.col.paid", type: "money" },
        { key: "remaining", labelKey: "reports.col.remaining", type: "money" },
        { key: "status", labelKey: "reports.col.status", type: "i18n" },
      ],
      rows: invoices,
      footer: { card: "reports.total", remaining: sum(invoices, "remaining") },
    },
  ];
}

export function netWorthReport(data: AppData, today: ISODate): ReportTable[] {
  const nw = netWorth(data, today);
  const composition: Record<string, Cell>[] = [
    ...nw.accounts.map((a) => ({ group: "reports.group.accounts", item: a.name, value: a.value })),
    ...nw.investmentsByCategory.map((c) => ({ group: "reports.group.investments", item: c.category, value: c.amount })),
    { group: "reports.group.liabilities", item: "reports.liabilitiesItem", value: -nw.liabilities },
  ];
  const detail = nw.investments.map((i) => ({ name: i.name, category: i.category, applied: i.applied, current: i.current, result: i.current - i.applied, resultPct: i.applied > 0 ? (i.current - i.applied) / i.applied : null, date: i.referenceDate }));
  return [
    {
      id: "composition",
      titleKey: "reports.netWorth.composition",
      columns: [
        { key: "group", labelKey: "reports.col.group", type: "i18n" },
        { key: "item", labelKey: "reports.col.item", type: "text" },
        { key: "value", labelKey: "reports.col.value", type: "money" },
      ],
      rows: composition,
      footer: { group: "reports.netWorth.total", value: nw.total },
    },
    {
      id: "investments",
      titleKey: "reports.netWorth.investments",
      columns: [
        { key: "name", labelKey: "reports.col.asset", type: "text" },
        { key: "category", labelKey: "reports.col.category", type: "text" },
        { key: "applied", labelKey: "reports.col.applied", type: "money" },
        { key: "current", labelKey: "reports.col.current", type: "money" },
        { key: "result", labelKey: "reports.col.result", type: "money" },
        { key: "resultPct", labelKey: "reports.col.resultPct", type: "percent" },
        { key: "date", labelKey: "reports.col.asOf", type: "date" },
      ],
      rows: detail,
      footer: { name: "reports.total", applied: nw.investmentsApplied, current: nw.investmentsTotal, result: nw.investmentsTotal - nw.investmentsApplied },
    },
  ];
}

export type ReportId = "incomeExpense" | "spending" | "balance" | "budgets" | "commitments" | "netWorth";
export const REPORT_IDS: ReportId[] = ["incomeExpense", "spending", "balance", "budgets", "commitments", "netWorth"];

export function buildReport(id: ReportId, data: AppData, f: ReportFilters, today: ISODate): ReportTable[] {
  switch (id) {
    case "incomeExpense": return [incomeExpenseReport(data, f, today)];
    case "spending": return [spendingReport(data, f)];
    case "balance": return [balanceReport(data, f, today)];
    case "budgets": return [budgetReport(data, f, today)];
    case "commitments": return commitmentsReport(data, f, today);
    case "netWorth": return netWorthReport(data, today);
  }
}
