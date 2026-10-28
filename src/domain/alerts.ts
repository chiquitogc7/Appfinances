import { addDays, monthEnd, monthKey, monthStart, type ISODate } from "./dates";
import { budgetUsage, computeInvoices, goalProgress } from "./finance";
import type { Cents } from "./money";
import type { AppData } from "./types";

export interface NotificationSettings {
  invoiceDue: boolean;
  budgetLimit: boolean;
  goalLate: boolean;
  /** Avisar faturas que vencem em até N dias. */
  daysBefore: number;
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = { invoiceDue: true, budgetLimit: true, goalLate: true, daysBefore: 5 };

export type AlertType = "invoiceDue" | "invoiceOverdue" | "budgetNear" | "budgetOver" | "goalLate";

export interface AlertItem {
  id: string;
  type: AlertType;
  /** Nome do cartão, categoria ou meta. */
  name: string;
  date?: ISODate;
  amount?: Cents;
  href: string;
}

/** Avisos dentro do app, calculados dos dados (não há envio por e-mail ou push nesta versão). */
export function buildAlerts(data: AppData, today: ISODate, s: NotificationSettings): AlertItem[] {
  const out: AlertItem[] = [];
  if (s.invoiceDue) {
    const limit = addDays(today, Math.max(0, Math.floor(s.daysBefore)));
    const cards = new Map(data.cards.map((c) => [c.id, c.name]));
    for (const inv of computeInvoices(data, today)) {
      if (inv.remaining <= 0 || inv.due > limit) continue;
      out.push({ id: `inv-${inv.cardId}-${inv.key}`, type: inv.due < today ? "invoiceOverdue" : "invoiceDue", name: cards.get(inv.cardId) ?? "Cartão", date: inv.due, amount: inv.remaining, href: "/cartoes" });
    }
  }
  if (s.budgetLimit) {
    const key = monthKey(today);
    const cats = new Map(data.categories.map((c) => [c.id, c.name]));
    for (const b of budgetUsage(data, monthStart(key), monthEnd(key))) {
      if (b.level === "ok") continue;
      out.push({ id: `bud-${b.categoryId}`, type: b.level === "over" ? "budgetOver" : "budgetNear", name: cats.get(b.categoryId) ?? "—", amount: b.spent, href: "/planejamento" });
    }
  }
  if (s.goalLate) {
    for (const g of data.goals) {
      if (!g.archivedAt && goalProgress(g, today).late) out.push({ id: `goal-${g.id}`, type: "goalLate", name: g.name, date: g.deadline, href: "/planejamento" });
    }
  }
  const order: Record<AlertType, number> = { invoiceOverdue: 0, budgetOver: 1, goalLate: 2, invoiceDue: 3, budgetNear: 4 };
  return out.sort((a, b) => order[a.type] - order[b.type]);
}
