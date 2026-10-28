import { addMonths, isValidISODate, type ISODate } from "./dates";
import { parseMoneyInput, type Cents } from "./money";
import type { Account, AccountType, Card, Category, PaymentMethod, TxStatus } from "./types";

export type TxFormKind = "income" | "expense" | "transfer";

export interface TxInput {
  kind: TxFormKind;
  amountText: string;
  description: string;
  date: ISODate;
  status: TxStatus;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  accountId?: string;
  toAccountId?: string;
  cardId?: string;
  installments?: number;
  notes?: string;
}

export const MAX_CENTS = 99_999_999_999;
export const MAX_INSTALLMENTS = 48;

export type TxField = "amount" | "description" | "date" | "category" | "account" | "toAccount" | "card" | "installments" | "paymentMethod";
export type TxErrors = Partial<Record<TxField, string>>;

export interface ValidationContext {
  today: ISODate;
  accounts: Account[];
  cards: Card[];
  categories: Category[];
}

/** Valores de erro são chaves de tradução (i18n), nunca texto solto. */
export function validateTxInput(input: TxInput, ctx: ValidationContext): { errors: TxErrors; amount: Cents | null } {
  const errors: TxErrors = {};

  const amount = parseMoneyInput(input.amountText);
  if (amount === null) errors.amount = "errors.amountInvalid";
  else if (amount <= 0) errors.amount = "errors.amountPositive";
  else if (amount > MAX_CENTS) errors.amount = "errors.amountTooLarge";

  const description = input.description.trim();
  if (!description) errors.description = "errors.descriptionRequired";
  else if (description.length > 80) errors.description = "errors.descriptionTooLong";

  const isCard = input.kind === "expense" && input.paymentMethod === "credit_card";

  if (!isValidISODate(input.date)) errors.date = "errors.dateInvalid";
  else if (!isCard && input.status === "realized" && input.date > ctx.today) errors.date = "errors.realizedFuture";

  if (input.kind !== "transfer") {
    const cat = ctx.categories.find((c) => c.id === input.categoryId);
    if (!input.categoryId) errors.category = "errors.categoryRequired";
    else if (!cat || cat.kind !== input.kind) errors.category = "errors.categoryInvalid";
    if (!input.paymentMethod) errors.paymentMethod = "errors.paymentRequired";
  }
  if (input.kind === "income" && input.paymentMethod === "credit_card") errors.paymentMethod = "errors.cardIncome";

  if (isCard) {
    if (!ctx.cards.some((c) => c.id === input.cardId)) errors.card = "errors.cardRequired";
    const n = input.installments ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > MAX_INSTALLMENTS) errors.installments = "errors.installmentsInvalid";
  } else {
    if ((input.installments ?? 1) !== 1) errors.installments = "errors.installmentsNeedCard";
    if (!ctx.accounts.some((a) => a.id === input.accountId)) errors.account = "errors.accountRequired";
  }

  if (input.kind === "transfer") {
    if (!ctx.accounts.some((a) => a.id === input.toAccountId)) errors.toAccount = "errors.toAccountRequired";
    else if (input.toAccountId === input.accountId) errors.toAccount = "errors.sameAccount";
  }

  return { errors, amount };
}

export interface AccountInput {
  name: string;
  type: AccountType;
  balanceText: string;
  referenceDate: ISODate;
}
export type AccountErrors = Partial<Record<"name" | "balance" | "referenceDate", string>>;

export function validateAccountInput(input: AccountInput, existing: Account[], ignoreId?: string): { errors: AccountErrors; balance: Cents | null } {
  const errors: AccountErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "errors.accountNameRequired";
  else if (name.length > 40) errors.name = "errors.accountNameTooLong";
  else if (existing.some((a) => a.id !== ignoreId && a.name.trim().toLowerCase() === name.toLowerCase())) errors.name = "errors.accountNameDuplicate";

  const text = input.balanceText.trim() === "" ? "0" : input.balanceText;
  const balance = parseMoneyInput(text);
  if (balance === null) errors.balance = "errors.amountInvalid";
  else if (Math.abs(balance) > MAX_CENTS) errors.balance = "errors.amountTooLarge";

  if (!isValidISODate(input.referenceDate)) errors.referenceDate = "errors.dateInvalid";
  return { errors, balance };
}

/* ───────────── Etapa 3: cartões, faturas, planejamento ───────────── */

export interface CardInput {
  name: string;
  issuer: string;
  limitText: string;
  closingDay: number;
  dueDay: number;
  payAccountId: string;
}
export type CardErrors = Partial<Record<"name" | "issuer" | "limit" | "closingDay" | "dueDay" | "payAccountId", string>>;

export function validateCardInput(input: CardInput, accounts: Account[], cards: Card[], ignoreId?: string): { errors: CardErrors; limit: Cents | null } {
  const errors: CardErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "errors.cardNameRequired";
  else if (name.length > 40) errors.name = "errors.cardNameTooLong";
  else if (cards.some((c) => c.id !== ignoreId && c.name.trim().toLowerCase() === name.toLowerCase())) errors.name = "errors.cardNameDuplicate";
  if (!input.issuer.trim()) errors.issuer = "errors.issuerRequired";
  const limit = parseMoneyInput(input.limitText);
  if (limit === null) errors.limit = "errors.amountInvalid";
  else if (limit <= 0) errors.limit = "errors.amountPositive";
  else if (limit > MAX_CENTS) errors.limit = "errors.amountTooLarge";
  for (const [field, value] of [["closingDay", input.closingDay], ["dueDay", input.dueDay]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 31) errors[field] = "errors.dayInvalid";
  }
  if (!accounts.some((a) => a.id === input.payAccountId)) errors.payAccountId = "errors.accountRequired";
  return { errors, limit };
}

export interface InvoiceActionInput {
  type: "pay" | "interest" | "fine" | "fee" | "refund";
  amountText: string;
  date: ISODate;
  accountId?: string;
  categoryId?: string;
  description: string;
}
export type InvoiceActionErrors = Partial<Record<"amount" | "date" | "account" | "category" | "description", string>>;

export function validateInvoiceAction(input: InvoiceActionInput, ctx: { today: ISODate; accounts: Account[]; categories: Category[]; remaining: Cents }): { errors: InvoiceActionErrors; amount: Cents | null } {
  const errors: InvoiceActionErrors = {};
  const amount = parseMoneyInput(input.amountText);
  if (amount === null) errors.amount = "errors.amountInvalid";
  else if (amount <= 0) errors.amount = "errors.amountPositive";
  else if (amount > MAX_CENTS) errors.amount = "errors.amountTooLarge";
  else if (input.type === "pay" && amount > ctx.remaining) errors.amount = "errors.payExceeds";
  if (!isValidISODate(input.date)) errors.date = "errors.dateInvalid";
  else if (input.date > ctx.today) errors.date = "errors.realizedFuture";
  if (input.type === "pay" && !ctx.accounts.some((a) => a.id === input.accountId)) errors.account = "errors.accountRequired";
  if (input.type !== "pay") {
    if (!input.description.trim()) errors.description = "errors.descriptionRequired";
    else if (input.description.trim().length > 80) errors.description = "errors.descriptionTooLong";
    if (input.type !== "refund" && !ctx.categories.some((c) => c.id === input.categoryId && c.kind === "expense")) errors.category = "errors.categoryRequired";
  }
  return { errors, amount };
}

export interface RecurrenceInput {
  kind: "income" | "expense";
  amountText: string;
  description: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  accountId?: string;
  cardId?: string;
  frequency: "weekly" | "monthly" | "yearly";
  startDate: ISODate;
  endDate: string;
}
export type RecurrenceErrors = TxErrors & { startDate?: string; endDate?: string };

export function validateRecurrenceInput(input: RecurrenceInput, ctx: ValidationContext): { errors: RecurrenceErrors; amount: Cents | null } {
  const { errors, amount } = validateTxInput({ kind: input.kind, amountText: input.amountText, description: input.description, date: input.startDate, status: "planned", categoryId: input.categoryId, paymentMethod: input.paymentMethod, accountId: input.accountId, cardId: input.cardId, installments: 1 }, ctx);
  const out: RecurrenceErrors = { ...errors };
  delete out.date;
  if (!isValidISODate(input.startDate)) out.startDate = "errors.dateInvalid";
  else if (input.startDate < addMonths(ctx.today, -12)) out.startDate = "errors.recurrenceTooOld";
  if (input.endDate) {
    if (!isValidISODate(input.endDate)) out.endDate = "errors.dateInvalid";
    else if (input.endDate < input.startDate) out.endDate = "errors.endBeforeStart";
  }
  return { errors: out, amount };
}

export interface BudgetInput {
  categoryId: string;
  limitText: string;
}
export function validateBudgetInput(input: BudgetInput, categories: Category[]): { errors: Partial<Record<"category" | "limit", string>>; limit: Cents | null } {
  const errors: Partial<Record<"category" | "limit", string>> = {};
  if (!categories.some((c) => c.id === input.categoryId && c.kind === "expense")) errors.category = "errors.categoryRequired";
  const limit = parseMoneyInput(input.limitText);
  if (limit === null) errors.limit = "errors.amountInvalid";
  else if (limit <= 0) errors.limit = "errors.amountPositive";
  else if (limit > MAX_CENTS) errors.limit = "errors.amountTooLarge";
  return { errors, limit };
}

export interface GoalInput {
  name: string;
  targetText: string;
  savedText: string;
  deadline: ISODate;
}
export function validateGoalInput(input: GoalInput, requireSaved: boolean): { errors: Partial<Record<"name" | "target" | "saved" | "deadline", string>>; target: Cents | null; saved: Cents } {
  const errors: Partial<Record<"name" | "target" | "saved" | "deadline", string>> = {};
  const name = input.name.trim();
  if (!name) errors.name = "errors.goalNameRequired";
  else if (name.length > 60) errors.name = "errors.goalNameTooLong";
  const target = parseMoneyInput(input.targetText);
  if (target === null) errors.target = "errors.amountInvalid";
  else if (target <= 0) errors.target = "errors.amountPositive";
  else if (target > MAX_CENTS) errors.target = "errors.amountTooLarge";
  let saved = 0;
  if (requireSaved) {
    const parsed = parseMoneyInput(input.savedText.trim() === "" ? "0" : input.savedText);
    if (parsed === null || parsed < 0) errors.saved = "errors.amountInvalid";
    else saved = parsed;
  }
  if (!isValidISODate(input.deadline)) errors.deadline = "errors.dateInvalid";
  return { errors, target, saved };
}

/* ───────────── Etapa 4: investimentos ───────────── */

export const INVESTMENT_CATEGORIES = ["Renda fixa", "Renda variável", "Fundos", "Previdência", "Criptomoedas", "Imóveis", "Outros"] as const;

export interface InvestmentInput {
  name: string;
  category: string;
  appliedText: string;
  currentText: string;
  referenceDate: ISODate;
  notes: string;
}
export type InvestmentErrors = Partial<Record<"name" | "category" | "applied" | "current" | "referenceDate" | "notes", string>>;

export function validateInvestmentInput(input: InvestmentInput, today: ISODate): { errors: InvestmentErrors; applied: Cents | null; current: Cents | null } {
  const errors: InvestmentErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "errors.assetNameRequired";
  else if (name.length > 60) errors.name = "errors.assetNameTooLong";
  if (!input.category.trim()) errors.category = "errors.categoryRequired";
  const applied = parseMoneyInput(input.appliedText);
  if (applied === null) errors.applied = "errors.amountInvalid";
  else if (applied < 0) errors.applied = "errors.amountNegative";
  else if (applied > MAX_CENTS) errors.applied = "errors.amountTooLarge";
  const current = parseMoneyInput(input.currentText);
  if (current === null) errors.current = "errors.amountInvalid";
  else if (current < 0) errors.current = "errors.amountNegative";
  else if (current > MAX_CENTS) errors.current = "errors.amountTooLarge";
  if (!isValidISODate(input.referenceDate)) errors.referenceDate = "errors.dateInvalid";
  else if (input.referenceDate > today) errors.referenceDate = "errors.dateFuture";
  if (input.notes.length > 300) errors.notes = "errors.notesTooLong";
  return { errors, applied, current };
}
