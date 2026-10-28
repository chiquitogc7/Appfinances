import { addMonthsToKey, monthEnd, monthKey, monthStart, type ISODate } from "./dates";
import { parseMoneyInput } from "./money";
import type { PaymentMethod, Transaction, TxStatus } from "./types";

export type TxTab = "all" | "income" | "expense";
export type TxSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

export interface Filters {
  tab: TxTab;
  query: string;
  from: ISODate;
  to: ISODate;
  accountId: string;
  categoryId: string;
  min: string;
  max: string;
  status: "" | TxStatus;
  paymentMethod: "" | PaymentMethod;
  sort: TxSort;
  showDeleted: boolean;
}

export function defaultFilters(today: ISODate): Filters {
  const key = monthKey(today);
  return { tab: "all", query: "", from: monthStart(key), to: monthEnd(key), accountId: "", categoryId: "", min: "", max: "", status: "", paymentMethod: "", sort: "date_desc", showDeleted: false };
}

export function monthRangeFilters(today: ISODate, offset: number): Pick<Filters, "from" | "to"> {
  const key = addMonthsToKey(monthKey(today), offset);
  return { from: monthStart(key), to: monthEnd(key) };
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterTransactions(txs: Transaction[], f: Filters): Transaction[] {
  const q = norm(f.query.trim());
  const min = f.min.trim() ? parseMoneyInput(f.min) : null;
  const max = f.max.trim() ? parseMoneyInput(f.max) : null;

  const out = txs.filter((t) => {
    if (t.deletedAt && !f.showDeleted) return false;
    if (f.tab === "income" && t.kind !== "income") return false;
    if (f.tab === "expense" && t.kind !== "expense") return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
    if (f.categoryId && t.categoryId !== f.categoryId) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.paymentMethod && t.paymentMethod !== f.paymentMethod) return false;
    if (min !== null && t.amount < min) return false;
    if (max !== null && t.amount > max) return false;
    if (q && !norm(t.description).includes(q)) return false;
    return true;
  });

  const dir = f.sort.endsWith("asc") ? 1 : -1;
  const byAmount = f.sort.startsWith("amount");
  return out.sort((a, b) => {
    const primary = byAmount ? a.amount - b.amount : a.date.localeCompare(b.date);
    return primary !== 0 ? primary * dir : a.id.localeCompare(b.id);
  });
}

/** Sinal exibido: +1 entra dinheiro, −1 sai, 0 neutro (transferência). Estorno inverte. */
export function displaySign(t: Transaction): -1 | 0 | 1 {
  const base = t.kind === "income" || t.kind === "card_refund" ? 1 : t.kind === "transfer" ? 0 : -1;
  return (t.reversalOf ? -base : base) as -1 | 0 | 1;
}
