/**
 * Operações puras sobre AppData (sem React, sem Firebase). Cada operação devolve novos dados.
 * - Criações são idempotentes: o mesmo operationId aplicado duas vezes não duplica lançamentos.
 * - Movimentação realizada não é editada em valor/conta/data: corrige-se por estorno.
 * - Exclusão é lógica (deletedAt) e recuperável, e só vale para movimentações previstas.
 */
import { addDays, addMonths, addMonthsToKey, isValidISODate, monthEnd, monthKey, type ISODate } from "./dates";
import { computeInvoices, invoiceKeyFor } from "./finance";
import { splitInstallments, type Cents } from "./money";
import type { TxInput } from "./validation";
import type { Account, AccountType, AppData, Card, Category, ChargeType, Frequency, HistoryAction, HistoryEntry, Recurrence, Transaction } from "./types";

export interface OpResult {
  data: AppData;
  error?: string; // chave i18n
}

const entry = (action: HistoryAction, at: string, fields?: string[]): HistoryEntry => (fields ? { at, action, fields } : { at, action });
const replaceTx = (data: AppData, next: Transaction): AppData => ({ ...data, transactions: data.transactions.map((t) => (t.id === next.id ? next : t)) });

/** Monta as movimentações de um formulário. Os ids derivam do operationId (idempotência). */
export function buildTransactions(input: TxInput, amount: Cents, operationId: string, today: ISODate, now: string, card?: Card): Transaction[] {
  const common = {
    description: input.description.trim(),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    currency: "BRL",
    createdAt: now,
    history: [entry("created", now)],
  };

  if (input.kind === "transfer") {
    return [{ ...common, id: `${operationId}:0`, kind: "transfer", amount, date: input.date, status: input.status, accountId: input.accountId, toAccountId: input.toAccountId }];
  }
  if (input.kind === "income") {
    return [{ ...common, id: `${operationId}:0`, kind: "income", amount, date: input.date, status: input.status, categoryId: input.categoryId, accountId: input.accountId, paymentMethod: input.paymentMethod }];
  }
  if (input.paymentMethod === "credit_card") {
    const n = input.installments ?? 1;
    return splitInstallments(amount, n).map((part, i) => {
      const date = addMonths(input.date, i);
      return {
        ...common,
        id: `${operationId}:${i}`,
        kind: "expense" as const,
        amount: part,
        date,
        status: date <= today ? ("realized" as const) : ("planned" as const),
        categoryId: input.categoryId,
        cardId: input.cardId,
        ...(card ? { invoiceKey: invoiceKeyFor(card, date) } : {}),
        paymentMethod: "credit_card" as const,
        ...(n > 1 ? { installment: { groupId: operationId, index: i + 1, total: n } } : {}),
      };
    });
  }
  return [{ ...common, id: `${operationId}:0`, kind: "expense", amount, date: input.date, status: input.status, categoryId: input.categoryId, accountId: input.accountId, paymentMethod: input.paymentMethod }];
}

export function applyCreate(data: AppData, txs: Transaction[]): AppData {
  if (txs.length === 0 || data.transactions.some((t) => t.id === txs[0].id)) return data; // já aplicada
  return { ...data, transactions: [...data.transactions, ...txs] };
}

export type EditPatch = Partial<Pick<Transaction, "description" | "notes" | "categoryId" | "date" | "amount" | "accountId" | "toAccountId">>;
const SOFT_FIELDS = new Set(["description", "notes", "categoryId"]);

export function editTransaction(data: AppData, id: string, patch: EditPatch, now: string): OpResult {
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx || tx.deletedAt) return { data, error: "errors.notFound" };
  if (tx.reversalOf || tx.reversedBy) return { data, error: "errors.reversedLocked" };
  const locked = tx.status === "realized" || Boolean(tx.installment) || Boolean(tx.cardId);
  const next: Record<string, unknown> = { ...tx };
  const changed: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || (tx as unknown as Record<string, unknown>)[key] === value) continue;
    if (locked && !SOFT_FIELDS.has(key)) return { data, error: tx.status === "realized" ? "errors.realizedLocked" : "errors.installmentLocked" };
    next[key] = value;
    changed.push(key);
  }
  if (changed.length === 0) return { data };
  next.history = [...(tx.history ?? []), entry("edited", now, changed)];
  return { data: replaceTx(data, next as unknown as Transaction) };
}

export function settleTransaction(data: AppData, id: string, date: ISODate, now: string, today: ISODate): OpResult {
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx || tx.deletedAt) return { data, error: "errors.notFound" };
  if (tx.status !== "planned") return { data, error: "errors.notPlanned" };
  if (tx.kind === "expense" && tx.cardId) return { data, error: "errors.cardSettle" };
  if (!isValidISODate(date)) return { data, error: "errors.dateInvalid" };
  if (date > today) return { data, error: "errors.realizedFuture" };
  const next: Transaction = { ...tx, status: "realized", date, history: [...(tx.history ?? []), entry("settled", now, date !== tx.date ? ["date"] : undefined)] };
  return { data: replaceTx(data, next) };
}

export function deleteTransaction(data: AppData, id: string, now: string): OpResult {
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx || tx.deletedAt) return { data, error: "errors.notFound" };
  if (tx.reversalOf || tx.reversedBy) return { data, error: "errors.reversedLocked" };
  if (tx.status === "realized") return { data, error: "errors.realizedUseReverse" };
  if (tx.installment) return { data, error: "errors.installmentLocked" };
  return { data: replaceTx(data, { ...tx, deletedAt: now, history: [...(tx.history ?? []), entry("deleted", now)] }) };
}

export function restoreTransaction(data: AppData, id: string, now: string): OpResult {
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx) return { data, error: "errors.notFound" };
  if (!tx.deletedAt) return { data };
  const { deletedAt: _removed, ...rest } = tx;
  void _removed;
  return { data: replaceTx(data, { ...rest, history: [...(tx.history ?? []), entry("restored", now)] }) };
}

/** Estorno: cria uma movimentação inversa ligada à original. Saldo volta ao que era; nenhuma receita/despesa nova aparece. */
export function reverseTransaction(data: AppData, id: string, operationId: string, date: ISODate, now: string, today: ISODate): OpResult {
  const tx = data.transactions.find((t) => t.id === id);
  if (!tx || tx.deletedAt) return { data, error: "errors.notFound" };
  const reversalId = `${operationId}:0`;
  if (data.transactions.some((t) => t.id === reversalId)) return { data }; // já aplicado
  if (tx.status !== "realized") return { data, error: "errors.reverseNeedsRealized" };
  if (tx.reversedBy || tx.reversalOf) return { data, error: "errors.alreadyReversed" };
  if (!isValidISODate(date)) return { data, error: "errors.dateInvalid" };
  if (date > today) return { data, error: "errors.realizedFuture" };
  if (date < tx.date) return { data, error: "errors.reverseDateBefore" };

  const card = tx.cardId ? data.cards.find((c) => c.id === tx.cardId) : undefined;
  const reversal: Transaction = {
    id: reversalId,
    kind: tx.kind,
    amount: tx.amount,
    date,
    status: "realized",
    description: tx.description,
    categoryId: tx.categoryId,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId,
    cardId: tx.cardId,
    invoiceKey: tx.invoiceKey ?? (card ? invoiceKeyFor(card, tx.date) : undefined),
    paymentMethod: tx.paymentMethod,
    currency: tx.currency,
    reversalOf: tx.id,
    createdAt: now,
    history: [entry("created", now)],
  };
  const original: Transaction = { ...tx, reversedBy: reversalId, history: [...(tx.history ?? []), entry("reversed", now)] };
  return { data: { ...replaceTx(data, original), transactions: [...replaceTx(data, original).transactions, reversal] } };
}

/* ───────────── Contas e categorias ───────────── */

export function createAccount(data: AppData, id: string, input: { name: string; type: AccountType; initialBalance: Cents; referenceDate: ISODate }): AppData {
  if (data.accounts.some((a) => a.id === id)) return data;
  const account: Account = { id, name: input.name.trim(), type: input.type, currency: "BRL", initialBalance: input.initialBalance, referenceDate: input.referenceDate };
  return { ...data, accounts: [...data.accounts, account] };
}

export function updateAccount(data: AppData, id: string, patch: { name?: string; type?: AccountType }): AppData {
  return { ...data, accounts: data.accounts.map((a) => (a.id === id ? { ...a, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}), ...(patch.type ? { type: patch.type } : {}) } : a)) };
}

const PALETTE = ["#6334C4", "#E86314", "#8B5CF6", "#F59E0B", "#4C1D95", "#C2410C", "#A78BFA", "#FB923C"];

export function createCategory(data: AppData, id: string, name: string, kind: Category["kind"]): { data: AppData; error?: string; category?: Category } {
  const clean = name.trim();
  if (!clean) return { data, error: "errors.categoryNameRequired" };
  if (clean.length > 40) return { data, error: "errors.categoryNameTooLong" };
  const dup = data.categories.find((c) => c.kind === kind && c.name.trim().toLowerCase() === clean.toLowerCase());
  if (dup) return { data, error: "errors.categoryDuplicate" };
  if (data.categories.some((c) => c.id === id)) return { data, category: data.categories.find((c) => c.id === id) };
  const category: Category = { id, name: clean, kind, color: PALETTE[data.categories.length % PALETTE.length], custom: true };
  return { data: { ...data, categories: [...data.categories, category] }, category };
}

/* ───────────── Etapa 3: cartões e faturas ───────────── */

export interface CardFields {
  name: string;
  issuer: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  payAccountId: string;
}

export function createCard(data: AppData, id: string, f: CardFields): AppData {
  if (data.cards.some((c) => c.id === id)) return data;
  return { ...data, cards: [...data.cards, { id, name: f.name.trim(), issuer: f.issuer.trim(), limit: f.limit, closingDay: f.closingDay, dueDay: f.dueDay, payAccountId: f.payAccountId }] };
}

/**
 * Antes de mudar fechamento/vencimento, "crava" em cada compra a fatura em que ela caiu pela regra antiga.
 * Assim compras já lançadas não pulam de fatura quando o cartão é reconfigurado.
 */
export function updateCard(data: AppData, id: string, f: CardFields): AppData {
  const old = data.cards.find((c) => c.id === id);
  if (!old) return data;
  const daysChanged = old.closingDay !== f.closingDay || old.dueDay !== f.dueDay;
  const transactions = daysChanged
    ? data.transactions.map((t) => (t.cardId === id && !t.invoiceKey && (t.kind === "expense" || t.kind === "card_refund") ? { ...t, invoiceKey: invoiceKeyFor(old, t.date) } : t))
    : data.transactions;
  const cards = data.cards.map((c) => (c.id === id ? { ...c, name: f.name.trim(), issuer: f.issuer.trim(), limit: f.limit, closingDay: f.closingDay, dueDay: f.dueDay, payAccountId: f.payAccountId } : c));
  return { ...data, cards, transactions };
}

/** Pagamento total ou parcial. Só liquida a fatura: não cria despesa nova. */
export function payInvoice(data: AppData, operationId: string, p: { cardId: string; invoiceKey: string; amount: Cents; date: ISODate; accountId: string }, now: string, today: ISODate): OpResult {
  const id = `${operationId}:0`;
  if (data.transactions.some((t) => t.id === id)) return { data };
  const card = data.cards.find((c) => c.id === p.cardId);
  if (!card) return { data, error: "errors.notFound" };
  const invoice = computeInvoices(data, today).find((i) => i.cardId === p.cardId && i.key === p.invoiceKey);
  if (!invoice || invoice.remaining <= 0) return { data, error: "errors.invoiceNothingToPay" };
  if (!Number.isInteger(p.amount) || p.amount <= 0) return { data, error: "errors.amountPositive" };
  if (p.amount > invoice.remaining) return { data, error: "errors.payExceeds" };
  if (!isValidISODate(p.date)) return { data, error: "errors.dateInvalid" };
  if (p.date > today) return { data, error: "errors.realizedFuture" };
  if (!data.accounts.some((a) => a.id === p.accountId)) return { data, error: "errors.accountRequired" };
  const tx: Transaction = { id, kind: "invoice_payment", amount: p.amount, date: p.date, status: "realized", description: card.name, cardId: card.id, invoiceKey: p.invoiceKey, accountId: p.accountId, currency: "BRL", createdAt: now, history: [entry("created", now)] };
  return { data: { ...data, transactions: [...data.transactions, tx] } };
}

/**
 * Juros, multa e tarifa entram na fatura como despesa (uma vez); reembolso reduz fatura e gasto.
 * Ao pagar a fatura nada disso é contado de novo.
 */
export function addInvoiceAdjustment(
  data: AppData,
  operationId: string,
  p: { cardId: string; invoiceKey: string; type: ChargeType | "refund"; amount: Cents; date: ISODate; categoryId?: string; description: string },
  now: string,
  today: ISODate,
): OpResult {
  const id = `${operationId}:0`;
  if (data.transactions.some((t) => t.id === id)) return { data };
  if (!data.cards.some((c) => c.id === p.cardId)) return { data, error: "errors.notFound" };
  if (!computeInvoices(data, today).some((i) => i.cardId === p.cardId && i.key === p.invoiceKey)) return { data, error: "errors.notFound" };
  if (!Number.isInteger(p.amount) || p.amount <= 0) return { data, error: "errors.amountPositive" };
  if (!isValidISODate(p.date)) return { data, error: "errors.dateInvalid" };
  if (p.date > today) return { data, error: "errors.realizedFuture" };
  const base = { id, amount: p.amount, date: p.date, status: "realized" as const, description: p.description.trim(), categoryId: p.categoryId, cardId: p.cardId, invoiceKey: p.invoiceKey, currency: "BRL", createdAt: now, history: [entry("created", now)] };
  const tx: Transaction = p.type === "refund" ? { ...base, kind: "card_refund" } : { ...base, kind: "expense", chargeType: p.type, paymentMethod: "credit_card" };
  return { data: { ...data, transactions: [...data.transactions, tx] } };
}

/** Antecipar parcelas: as selecionadas passam a cair na fatura da data informada e viram realizadas. */
export function anticipateInstallments(data: AppData, groupId: string, indexes: number[], date: ISODate, now: string, today: ISODate): OpResult {
  const picked = data.transactions.filter((t) => !t.deletedAt && t.installment?.groupId === groupId && indexes.includes(t.installment.index));
  if (picked.length === 0 || picked.length !== new Set(indexes).size) return { data, error: "errors.notFound" };
  if (picked.some((t) => t.status !== "planned")) return { data, error: "errors.notPlanned" };
  if (!isValidISODate(date)) return { data, error: "errors.dateInvalid" };
  if (date > today) return { data, error: "errors.realizedFuture" };
  const ids = new Set(picked.map((t) => t.id));
  const transactions = data.transactions.map((t) => {
    if (!ids.has(t.id)) return t;
    const card = data.cards.find((c) => c.id === t.cardId);
    return { ...t, date, status: "realized" as const, ...(card ? { invoiceKey: invoiceKeyFor(card, date) } : {}), history: [...(t.history ?? []), entry("anticipated", now, ["date"])] };
  });
  return { data: { ...data, transactions } };
}

/* ───────────── Etapa 3: recorrências ───────────── */

export const RECURRENCE_HORIZON_MONTHS = 12;
const MAX_OCCURRENCES = 240;

export function occurrenceDates(r: Pick<Recurrence, "frequency" | "startDate" | "endDate">, until: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const date = r.frequency === "weekly" ? addDays(r.startDate, 7 * i) : addMonths(r.startDate, r.frequency === "monthly" ? i : 12 * i);
    if (date > until || (r.endDate && date > r.endDate)) break;
    out.push(date);
  }
  return out;
}

/** Gera como previstas as ocorrências que faltam até o horizonte. Idempotente: o id é fixo por recorrência+data. */
export function materializeRecurrences(data: AppData, today: ISODate, now: string, horizonMonths = RECURRENCE_HORIZON_MONTHS): AppData {
  const until = monthEnd(addMonthsToKey(monthKey(today), horizonMonths));
  const existing = new Set(data.transactions.map((t) => t.id));
  const created: Transaction[] = [];
  for (const r of data.recurrences) {
    if (!r.active) continue;
    for (const date of occurrenceDates(r, until)) {
      const id = `rec:${r.id}:${date}`;
      if (existing.has(id)) continue;
      const card = r.cardId ? data.cards.find((c) => c.id === r.cardId) : undefined;
      const onCard = r.kind === "expense" && r.paymentMethod === "credit_card" && card;
      created.push({
        id,
        kind: r.kind,
        amount: r.amount,
        date,
        status: onCard && date <= today ? "realized" : "planned",
        description: r.description,
        categoryId: r.categoryId,
        paymentMethod: r.paymentMethod,
        ...(onCard ? { cardId: r.cardId, invoiceKey: invoiceKeyFor(card, date) } : { accountId: r.accountId }),
        recurrenceId: r.id,
        currency: "BRL",
        createdAt: now,
        history: [entry("created", now)],
      });
    }
  }
  return created.length === 0 ? data : { ...data, transactions: [...data.transactions, ...created] };
}

export function createRecurrence(data: AppData, id: string, f: Omit<Recurrence, "id" | "active" | "createdAt">, now: string, today: ISODate): AppData {
  if (data.recurrences.some((r) => r.id === id)) return data;
  const rec: Recurrence = { ...f, id, description: f.description.trim(), active: true, createdAt: now, ...(f.endDate ? {} : { endDate: undefined }) };
  return materializeRecurrences({ ...data, recurrences: [...data.recurrences, rec] }, today, now);
}

/** Encerra: não gera mais e exclui (de forma recuperável) as ocorrências futuras ainda previstas. */
export function endRecurrence(data: AppData, id: string, now: string, today: ISODate): OpResult {
  const rec = data.recurrences.find((r) => r.id === id);
  if (!rec) return { data, error: "errors.notFound" };
  if (!rec.active) return { data };
  const transactions = data.transactions.map((t) =>
    t.recurrenceId === id && !t.deletedAt && t.status === "planned" && t.date > today ? { ...t, deletedAt: now, history: [...(t.history ?? []), entry("deleted", now)] } : t,
  );
  const recurrences = data.recurrences.map((r) => (r.id === id ? { ...r, active: false, endDate: r.endDate && r.endDate < today ? r.endDate : today } : r));
  return { data: { ...data, recurrences, transactions } };
}

export type { Frequency };

/* ───────────── Etapa 3: orçamentos e metas ───────────── */

export function setBudget(data: AppData, categoryId: string, monthlyLimit: Cents): AppData {
  const exists = data.budgets.some((b) => b.categoryId === categoryId);
  return { ...data, budgets: exists ? data.budgets.map((b) => (b.categoryId === categoryId ? { ...b, monthlyLimit } : b)) : [...data.budgets, { categoryId, monthlyLimit }] };
}

export function removeBudget(data: AppData, categoryId: string): AppData {
  return { ...data, budgets: data.budgets.filter((b) => b.categoryId !== categoryId) };
}

export function createGoal(data: AppData, id: string, f: { name: string; target: Cents; saved: Cents; deadline: ISODate }): AppData {
  if (data.goals.some((g) => g.id === id)) return data;
  return { ...data, goals: [...data.goals, { id, name: f.name.trim(), target: f.target, saved: f.saved, deadline: f.deadline }] };
}

export function updateGoal(data: AppData, id: string, f: { name: string; target: Cents; deadline: ISODate }): AppData {
  return { ...data, goals: data.goals.map((g) => (g.id === id ? { ...g, name: f.name.trim(), target: f.target, deadline: f.deadline } : g)) };
}

/** Aporte idempotente: o mesmo id de aporte nunca soma duas vezes. */
export function addGoalContribution(data: AppData, goalId: string, contributionId: string, amount: Cents, date: ISODate): OpResult {
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) return { data, error: "errors.notFound" };
  if (goal.contributions?.some((c) => c.id === contributionId)) return { data };
  if (!Number.isInteger(amount) || amount <= 0) return { data, error: "errors.amountPositive" };
  if (!isValidISODate(date)) return { data, error: "errors.dateInvalid" };
  const next = { ...goal, saved: goal.saved + amount, contributions: [...(goal.contributions ?? []), { id: contributionId, date, amount }] };
  return { data: { ...data, goals: data.goals.map((g) => (g.id === goalId ? next : g)) } };
}

export function archiveGoal(data: AppData, id: string, now: string): AppData {
  return { ...data, goals: data.goals.map((g) => (g.id === id ? { ...g, archivedAt: now } : g)) };
}

export function restoreGoal(data: AppData, id: string): AppData {
  return { ...data, goals: data.goals.map((g) => (g.id === id ? { ...g, archivedAt: undefined } : g)) };
}

/* ───────────── Etapa 4: investimentos e categorias ───────────── */

export interface InvestmentFields {
  name: string;
  category: string;
  applied: Cents;
  current: Cents;
  referenceDate: ISODate;
  notes?: string;
}

export function createInvestment(data: AppData, id: string, f: InvestmentFields): AppData {
  if (data.investments.some((i) => i.id === id)) return data;
  const notes = f.notes?.trim();
  return { ...data, investments: [...data.investments, { id, name: f.name.trim(), category: f.category.trim(), applied: f.applied, current: f.current, referenceDate: f.referenceDate, ...(notes ? { notes } : {}), updates: [{ date: f.referenceDate, current: f.current }] }] };
}

/** Atualiza o ativo. Mudou o valor atual ou a data? Guarda a atualização no histórico do ativo. */
export function updateInvestment(data: AppData, id: string, f: InvestmentFields): AppData {
  return {
    ...data,
    investments: data.investments.map((i) => {
      if (i.id !== id) return i;
      const changed = i.current !== f.current || i.referenceDate !== f.referenceDate;
      const notes = f.notes?.trim();
      const { notes: _old, ...rest } = i;
      void _old;
      return { ...rest, name: f.name.trim(), category: f.category.trim(), applied: f.applied, current: f.current, referenceDate: f.referenceDate, ...(notes ? { notes } : {}), updates: changed ? [...(i.updates ?? []), { date: f.referenceDate, current: f.current }] : i.updates };
    }),
  };
}

export function archiveInvestment(data: AppData, id: string, now: string): AppData {
  return { ...data, investments: data.investments.map((i) => (i.id === id ? { ...i, archivedAt: now } : i)) };
}

export function restoreInvestment(data: AppData, id: string): AppData {
  return { ...data, investments: data.investments.map((i) => (i.id === id ? { ...i, archivedAt: undefined } : i)) };
}

export function categoryInUse(data: AppData, id: string): boolean {
  return data.transactions.some((t) => t.categoryId === id) || data.budgets.some((b) => b.categoryId === id) || data.recurrences.some((r) => r.categoryId === id);
}

export function renameCategory(data: AppData, id: string, name: string): { data: AppData; error?: string } {
  const cat = data.categories.find((c) => c.id === id);
  if (!cat) return { data, error: "errors.notFound" };
  const clean = name.trim();
  if (!clean) return { data, error: "errors.categoryNameRequired" };
  if (clean.length > 40) return { data, error: "errors.categoryNameTooLong" };
  if (data.categories.some((c) => c.id !== id && c.kind === cat.kind && c.name.trim().toLowerCase() === clean.toLowerCase())) return { data, error: "errors.categoryDuplicate" };
  return { data: { ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) } };
}

/** Só categorias criadas pelo usuário e sem nenhum uso podem ser removidas. */
export function deleteCategory(data: AppData, id: string): { data: AppData; error?: string } {
  const cat = data.categories.find((c) => c.id === id);
  if (!cat) return { data, error: "errors.notFound" };
  if (!cat.custom) return { data, error: "errors.categoryDefault" };
  if (categoryInUse(data, id)) return { data, error: "errors.categoryInUse" };
  return { data: { ...data, categories: data.categories.filter((c) => c.id !== id) } };
}
