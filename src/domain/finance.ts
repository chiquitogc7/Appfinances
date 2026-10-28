/**
 * Regras financeiras centrais. Dashboard, extrato e relatórios devem usar SEMPRE estas funções.
 * Valores em centavos (inteiros). Datas em ISO "YYYY-MM-DD".
 */
import { addMonthsToKey, eachDay, monthEnd, monthKey, parseISO, toISO, type ISODate } from "./dates";
import type { Cents } from "./money";
import type { Account, AppData, Card, Transaction } from "./types";

/* ───────────── Saldo das contas ───────────── */

function baseEffect(t: Transaction, accountId: string): Cents {
  switch (t.kind) {
    case "income":
      return t.accountId === accountId ? t.amount : 0;
    case "expense":
      return !t.cardId && t.accountId === accountId ? -t.amount : 0;
    case "invoice_payment":
      return t.accountId === accountId ? -t.amount : 0;
    case "transfer":
      return (t.accountId === accountId ? -t.amount : 0) + (t.toAccountId === accountId ? t.amount : 0);
    case "card_refund":
      return 0;
  }
}

/** Contribuição de uma movimentação ao gasto: despesa soma, reembolso no cartão subtrai. */
export function expenseDelta(t: Transaction): Cents {
  if (t.kind === "expense") return t.amount;
  if (t.kind === "card_refund") return -t.amount;
  return 0;
}

/** Efeito de uma movimentação no saldo de uma conta. Compra no cartão não afeta conta; estorno inverte o efeito. */
export function accountEffect(t: Transaction, accountId: string): Cents {
  const e = baseEffect(t, accountId);
  return t.reversalOf ? -e : e;
}

/** Conta nos relatórios (receita/despesa/categoria): ignora excluídas e pares original+estorno, que se anulam. */
export function isCounted(t: Transaction): boolean {
  return !t.deletedAt && !t.reversalOf && !t.reversedBy;
}

/** Saldo real: saldo inicial + movimentações REALIZADAS entre a data de referência e `asOf`. */
export function accountBalance(account: Account, txs: Transaction[], asOf: ISODate): Cents {
  let balance = account.initialBalance;
  for (const t of txs) {
    if (t.deletedAt || t.status !== "realized") continue;
    if (t.date < account.referenceDate || t.date > asOf) continue;
    balance += accountEffect(t, account.id);
  }
  return balance;
}

export function totalBalance(data: AppData, asOf: ISODate): Cents {
  return data.accounts.reduce((sum, a) => sum + accountBalance(a, data.transactions, asOf), 0);
}

/* ───────────── Faturas de cartão ───────────── */

export type InvoiceStatus = "open" | "closed" | "overdue" | "paid";

export interface Invoice {
  cardId: string;
  key: string; // mês de fechamento "YYYY-MM"
  closing: ISODate;
  due: ISODate;
  total: Cents;
  paid: Cents;
  remaining: Cents;
  status: InvoiceStatus;
}

/** Compras feitas após o dia de fechamento caem na fatura do mês seguinte. */
export function invoiceKeyFor(card: Card, purchaseDate: ISODate): string {
  const key = monthKey(purchaseDate);
  return parseISO(purchaseDate).d > card.closingDay ? addMonthsToKey(key, 1) : key;
}

export function invoiceDates(card: Card, key: string): { closing: ISODate; due: ISODate } {
  const [y, m] = key.split("-").map(Number);
  const closing = toISO(y, m, card.closingDay);
  const dueKey = card.dueDay > card.closingDay ? key : addMonthsToKey(key, 1);
  const [dy, dm] = dueKey.split("-").map(Number);
  return { closing, due: toISO(dy, dm, card.dueDay) };
}

/**
 * A compra é o gasto; o pagamento da fatura só liquida a obrigação.
 * Por isso o total da fatura vem das compras e o pago vem dos pagamentos realizados.
 */
export function computeInvoices(data: AppData, today: ISODate): Invoice[] {
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const map = new Map<string, Invoice>();
  const ensure = (card: Card, key: string): Invoice => {
    const id = `${card.id}|${key}`;
    let inv = map.get(id);
    if (!inv) {
      const { closing, due } = invoiceDates(card, key);
      inv = { cardId: card.id, key, closing, due, total: 0, paid: 0, remaining: 0, status: "open" };
      map.set(id, inv);
    }
    return inv;
  };

  for (const t of data.transactions) {
    if (t.deletedAt || !t.cardId) continue;
    const card = cards.get(t.cardId);
    if (!card) continue;
    const sign = t.reversalOf ? -1 : 1;
    if (t.kind === "expense" || t.kind === "card_refund") {
      ensure(card, t.invoiceKey ?? invoiceKeyFor(card, t.date)).total += sign * expenseDelta(t);
    } else if (t.kind === "invoice_payment" && t.status === "realized" && t.invoiceKey) {
      ensure(card, t.invoiceKey).paid += sign * t.amount;
    }
  }

  const out = [...map.values()];
  for (const inv of out) {
    inv.remaining = Math.max(inv.total - inv.paid, 0);
    inv.status =
      inv.total > 0 && inv.remaining === 0 ? "paid" : today > inv.due ? "overdue" : today > inv.closing ? "closed" : "open";
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/** Limite usado = soma do que ainda falta pagar em todas as faturas (inclui parcelas futuras). */
export function cardUsage(card: Card, invoices: Invoice[]): { used: Cents; available: Cents } {
  const used = invoices.filter((i) => i.cardId === card.id).reduce((s, i) => s + i.remaining, 0);
  return { used, available: card.limit - used };
}

/* ───────────── Período, compromissos e projeção ───────────── */

export interface PeriodSummary {
  income: Cents;
  expense: Cents;
  plannedIncome: Cents;
  plannedExpense: Cents;
  net: Cents;
}

/** Soma receitas/despesas de uma lista. Transferências, pagamentos de fatura e pares estornados nunca entram. */
export function summarizeTransactions(txs: Transaction[]): PeriodSummary {
  let income = 0;
  let expense = 0;
  let plannedIncome = 0;
  let plannedExpense = 0;
  for (const t of txs) {
    if (!isCounted(t)) continue;
    if (t.kind === "income") {
      if (t.status === "realized") income += t.amount;
      else plannedIncome += t.amount;
    } else if (t.kind === "expense" || t.kind === "card_refund") {
      if (t.status === "realized") expense += expenseDelta(t);
      else plannedExpense += expenseDelta(t);
    }
  }
  return { income, expense, plannedIncome, plannedExpense, net: income - expense };
}

export function periodSummary(data: AppData, start: ISODate, end: ISODate): PeriodSummary {
  return summarizeTransactions(data.transactions.filter((t) => t.date >= start && t.date <= end));
}

export interface Commitments {
  total: Cents;
  bills: Cents;
  invoices: Cents;
}

/** Compromissos pendentes até `until`: contas previstas (fora do cartão) + faturas em aberto vencendo até a data. */
export function commitments(data: AppData, today: ISODate, until: ISODate): Commitments {
  let bills = 0;
  for (const t of data.transactions) {
    if (t.deletedAt || t.kind !== "expense" || t.cardId || t.status !== "planned") continue;
    if (t.date <= until) bills += t.amount;
  }
  let invoices = 0;
  for (const inv of computeInvoices(data, today)) {
    if (inv.remaining > 0 && inv.due <= until) invoices += inv.remaining;
  }
  return { total: bills + invoices, bills, invoices };
}

export function plannedIncomeUntil(data: AppData, until: ISODate): Cents {
  let sum = 0;
  for (const t of data.transactions) {
    if (!t.deletedAt && t.kind === "income" && t.status === "planned" && t.date <= until) sum += t.amount;
  }
  return sum;
}

/** Disponibilidade estimada = saldo real − compromissos pendentes até a data. */
export function estimatedAvailable(data: AppData, today: ISODate, until: ISODate): Cents {
  return totalBalance(data, today) - commitments(data, today, until).total;
}

/** Projeção = disponibilidade estimada + receitas previstas até a data. */
export function projectedBalance(data: AppData, today: ISODate, until: ISODate): Cents {
  return estimatedAvailable(data, today, until) + plannedIncomeUntil(data, until);
}

/* ───────────── Séries para gráficos ───────────── */

export function monthlyFlow(data: AppData, keys: string[]) {
  return keys.map((key) => ({ key, ...periodSummary(data, `${key}-01`, monthEnd(key)) }));
}

export function balanceSeries(data: AppData, from: ISODate, to: ISODate) {
  return eachDay(from, to).map((date) => ({ date, balance: totalBalance(data, date) }));
}

export function projectedCashflow(data: AppData, today: ISODate, months = 6) {
  const points = [{ key: "today", date: today, balance: projectedBalance(data, today, today) }];
  const startKey = monthKey(today);
  for (let i = 0; i < months; i++) {
    const key = addMonthsToKey(startKey, i);
    const end = monthEnd(key);
    points.push({ key, date: end, balance: projectedBalance(data, today, end) });
  }
  return points;
}

export function spendingByCategory(data: AppData, start: ISODate, end: ISODate) {
  const map = new Map<string, Cents>();
  for (const t of data.transactions) {
    if (!isCounted(t) || t.status !== "realized" || (t.kind !== "expense" && t.kind !== "card_refund")) continue;
    if (t.date < start || t.date > end) continue;
    const id = t.categoryId ?? "uncategorized";
    map.set(id, (map.get(id) ?? 0) + expenseDelta(t));
  }
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/* ───────────── Widgets ───────────── */

export interface UpcomingItem {
  id: string;
  kind: "bill" | "invoice";
  label: string;
  date: ISODate;
  amount: Cents;
  overdue: boolean;
}

export function upcomingCommitments(data: AppData, today: ISODate, limit = 6): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const t of data.transactions) {
    if (t.deletedAt || t.kind !== "expense" || t.cardId || t.status !== "planned") continue;
    items.push({ id: t.id, kind: "bill", label: t.description, date: t.date, amount: t.amount, overdue: t.date < today });
  }
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  for (const inv of computeInvoices(data, today)) {
    if (inv.remaining <= 0) continue;
    items.push({
      id: `${inv.cardId}|${inv.key}`,
      kind: "invoice",
      label: cards.get(inv.cardId)?.name ?? "Cartão",
      date: inv.due,
      amount: inv.remaining,
      overdue: inv.due < today,
    });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

export interface InstallmentPlan {
  groupId: string;
  description: string;
  cardId?: string;
  count: number;
  remainingCount: number;
  remainingAmount: Cents;
  nextDate?: ISODate;
}

export function installmentPlans(data: AppData): InstallmentPlan[] {
  const map = new Map<string, InstallmentPlan>();
  for (const t of data.transactions) {
    if (!isCounted(t) || !t.installment) continue;
    let p = map.get(t.installment.groupId);
    if (!p) {
      p = { groupId: t.installment.groupId, description: t.description, cardId: t.cardId, count: t.installment.total, remainingCount: 0, remainingAmount: 0 };
      map.set(p.groupId, p);
    }
    if (t.status === "planned") {
      p.remainingCount += 1;
      p.remainingAmount += t.amount;
      if (!p.nextDate || t.date < p.nextDate) p.nextDate = t.date;
    }
  }
  return [...map.values()].filter((p) => p.remainingCount > 0);
}

export type BudgetLevel = "ok" | "near" | "over";

export function budgetUsage(data: AppData, start: ISODate, end: ISODate) {
  return data.budgets.map((b) => {
    let spent = 0;
    let planned = 0;
    for (const t of data.transactions) {
      if (!isCounted(t) || (t.kind !== "expense" && t.kind !== "card_refund") || t.categoryId !== b.categoryId) continue;
      if (t.date < start || t.date > end) continue;
      if (t.status === "realized") spent += expenseDelta(t);
      else planned += expenseDelta(t);
    }
    const ratio = b.monthlyLimit > 0 ? spent / b.monthlyLimit : 0;
    const level: BudgetLevel = ratio > 1 ? "over" : ratio >= 0.8 ? "near" : "ok";
    return { categoryId: b.categoryId, limit: b.monthlyLimit, spent, planned, ratio, level };
  });
}

export function goalProgress(goal: { target: Cents; saved: Cents; deadline: ISODate }, today: ISODate) {
  const ratio = goal.target > 0 ? Math.min(goal.saved / goal.target, 1) : 0;
  return { ratio, late: goal.deadline < today && goal.saved < goal.target };
}

export function investmentSummary(data: AppData) {
  const live = data.investments.filter((i) => !i.archivedAt);
  const applied = live.reduce((s, i) => s + i.applied, 0);
  const current = live.reduce((s, i) => s + i.current, 0);
  const byCategory = new Map<string, Cents>();
  for (const i of live) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.current);
  return { applied, current, result: current - applied, byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })) };
}

/* ───────────── Cartões: compras de uma fatura e tabela de fluxo ───────────── */

export function invoiceTransactions(data: AppData, cardId: string, key: string): Transaction[] {
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) return [];
  return data.transactions
    .filter((t) => !t.deletedAt && t.cardId === cardId && (t.kind === "expense" || t.kind === "card_refund" || t.kind === "invoice_payment") && (t.invoiceKey ?? invoiceKeyFor(card, t.date)) === key)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function cashflowTable(data: AppData, today: ISODate, startKey: string, months: number) {
  return Array.from({ length: months }, (_, i) => {
    const key = addMonthsToKey(startKey, i);
    const end = monthEnd(key);
    return { key, ...periodSummary(data, `${key}-01`, end), projected: projectedBalance(data, today, end < today ? today : end) };
  });
}

/** Quanto guardar por mês para atingir a meta no prazo (arredondado para cima). null se já atingida ou vencida. */
export function goalMonthlyNeed(goal: { target: Cents; saved: Cents; deadline: ISODate }, today: ISODate): Cents | null {
  const missing = goal.target - goal.saved;
  if (missing <= 0 || goal.deadline < today) return null;
  const [ty, tm] = today.split("-").map(Number);
  const [dy, dm] = goal.deadline.split("-").map(Number);
  const months = Math.max(1, dy * 12 + dm - (ty * 12 + tm));
  return Math.ceil(missing / months);
}

/**
 * Patrimônio = saldo das contas + investimentos (valor atual) − faturas já fechadas ou vencidas.
 * Faturas abertas e parcelas futuras ainda não são dívida exigível, então ficam fora.
 */
export function netWorth(data: AppData, today: ISODate) {
  const accounts = data.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, value: accountBalance(a, data.transactions, today) }));
  const accountsTotal = accounts.reduce((s, a) => s + a.value, 0);
  const investments = data.investments.filter((i) => !i.archivedAt);
  const investmentsApplied = investments.reduce((s, i) => s + i.applied, 0);
  const investmentsTotal = investments.reduce((s, i) => s + i.current, 0);
  const byCategory = new Map<string, Cents>();
  for (const i of investments) byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.current);
  const liabilities = computeInvoices(data, today)
    .filter((i) => i.status === "closed" || i.status === "overdue")
    .reduce((s, i) => s + i.remaining, 0);
  return {
    accounts,
    accountsTotal,
    investments,
    investmentsApplied,
    investmentsTotal,
    investmentsByCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    liabilities,
    total: accountsTotal + investmentsTotal - liabilities,
  };
}
