import type { Cents } from "./money";
import type { ISODate } from "./dates";

export type AccountType = "checking" | "savings" | "cash" | "investment" | "wallet";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: Cents;
  /** Movimentações anteriores a esta data não entram no saldo. */
  referenceDate: ISODate;
}

export interface Card {
  id: string;
  name: string;
  issuer: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  payAccountId: string;
}

export interface Category {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  /** Criada pelo usuário (as categorias iniciais não podem ser removidas). */
  custom?: boolean;
}

/**
 * - income: entrada em uma conta
 * - expense: gasto. Com cardId é compra no cartão (não mexe em conta); sem cardId sai da conta
 * - transfer: entre contas próprias (nunca é receita nem despesa)
 * - invoice_payment: liquidação de fatura (saída da conta, nunca é despesa)
 * - card_refund: reembolso/crédito na fatura (reduz a fatura e o gasto; não mexe em conta)
 * Juros, multa e tarifa de fatura são `expense` com cardId + invoiceKey + chargeType.
 */
export type TxKind = "income" | "expense" | "transfer" | "invoice_payment" | "card_refund";
export type ChargeType = "interest" | "fine" | "fee";
export type PaymentMethod = "pix" | "debit" | "cash" | "boleto" | "credit_card" | "transfer" | "other";
export type HistoryAction = "created" | "edited" | "settled" | "deleted" | "restored" | "reversed" | "anticipated";
export interface HistoryEntry {
  at: string;
  action: HistoryAction;
  fields?: string[];
}

/** realized = aconteceu; planned = previsto (não altera o saldo real). */
export type TxStatus = "realized" | "planned";

export interface Transaction {
  id: string;
  kind: TxKind;
  amount: Cents;
  date: ISODate;
  status: TxStatus;
  description: string;
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  cardId?: string;
  invoiceKey?: string;
  installment?: { groupId: string; index: number; total: number };
  paymentMethod?: PaymentMethod;
  notes?: string;
  currency?: string;
  /** Estorno: esta movimentação desfaz `reversalOf`; o original recebe `reversedBy`. */
  reversalOf?: string;
  reversedBy?: string;
  chargeType?: ChargeType;
  recurrenceId?: string;
  createdAt?: string;
  history?: HistoryEntry[];
  /** Exclusão lógica: recuperável. */
  deletedAt?: string;
}

export interface Budget {
  categoryId: string;
  monthlyLimit: Cents;
}

export interface Goal {
  id: string;
  name: string;
  target: Cents;
  saved: Cents;
  deadline: ISODate;
  contributions?: { id: string; date: ISODate; amount: Cents }[];
  /** Arquivada = fora das listas, mas recuperável. */
  archivedAt?: string;
}

export type Frequency = "weekly" | "monthly" | "yearly";

export interface Recurrence {
  id: string;
  kind: "income" | "expense";
  amount: Cents;
  description: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  accountId?: string;
  cardId?: string;
  frequency: Frequency;
  startDate: ISODate;
  endDate?: ISODate;
  active: boolean;
  createdAt: string;
}

export interface Investment {
  id: string;
  name: string;
  category: string;
  applied: Cents;
  current: Cents;
  referenceDate: ISODate;
  notes?: string;
  /** Histórico de atualizações manuais do valor atual. */
  updates?: { date: ISODate; current: Cents }[];
  archivedAt?: string;
}

export interface AppData {
  isDemo: boolean;
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: Goal[];
  investments: Investment[];
  recurrences: Recurrence[];
}
