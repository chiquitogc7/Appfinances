import { isValidISODate } from "./dates";
import type { AppData } from "./types";

export const BACKUP_VERSION = 2;
const MAX_BYTES = 8 * 1024 * 1024;
const KINDS = new Set(["income", "expense", "transfer", "invoice_payment", "card_refund"]);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCents = (x: unknown) => typeof x === "number" && Number.isSafeInteger(x);
/** Ids viram nomes de documento na nuvem: sem "/" (evita caminhos forjados), sem "." / "..", sem __x__. */
const safeId = (x: unknown) => typeof x === "string" && x.length > 0 && x.length <= 200 && !x.includes("/") && x !== "." && x !== ".." && !/^__.*__$/.test(x);

/** Valida a forma dos dados antes de aceitá-los (backup importado ou salvo no navegador). */
export function validateAppData(x: unknown): x is AppData {
  if (!isObj(x)) return false;
  const arrays = ["accounts", "cards", "categories", "transactions", "budgets", "goals", "investments"] as const;
  for (const k of arrays) if (!Array.isArray(x[k])) return false;
  if (x.recurrences !== undefined && !Array.isArray(x.recurrences)) return false;
  const tx = x.transactions as unknown[];
  if (tx.length > 200_000) return false;
  const ids = new Set<string>();
  for (const t of tx) {
    if (!isObj(t) || !safeId(t.id) || ids.has(t.id as string)) return false;
    ids.add(t.id as string);
    if (typeof t.kind !== "string" || !KINDS.has(t.kind) || !isCents(t.amount) || (t.amount as number) < 0) return false;
    if (typeof t.date !== "string" || !isValidISODate(t.date) || (t.status !== "realized" && t.status !== "planned") || typeof t.description !== "string") return false;
  }
  for (const a of x.accounts as unknown[]) if (!isObj(a) || !safeId(a.id) || typeof a.name !== "string" || !isCents(a.initialBalance) || typeof a.referenceDate !== "string" || !isValidISODate(a.referenceDate)) return false;
  for (const c of x.cards as unknown[]) if (!isObj(c) || !safeId(c.id) || typeof c.name !== "string" || !isCents(c.limit) || !Number.isInteger(c.closingDay) || !Number.isInteger(c.dueDay)) return false;
  for (const c of x.categories as unknown[]) if (!isObj(c) || !safeId(c.id) || typeof c.name !== "string" || (c.kind !== "expense" && c.kind !== "income")) return false;
  for (const g of x.goals as unknown[]) if (!isObj(g) || !safeId(g.id) || !isCents(g.target) || !isCents(g.saved)) return false;
  for (const i of x.investments as unknown[]) if (!isObj(i) || !safeId(i.id) || !isCents(i.applied) || !isCents(i.current)) return false;
  for (const b of x.budgets as unknown[]) if (!isObj(b) || !safeId(b.categoryId) || !isCents(b.monthlyLimit)) return false;
  for (const r of (x.recurrences ?? []) as unknown[]) if (!isObj(r) || !safeId(r.id) || !isCents(r.amount)) return false;
  return true;
}

export function exportBackup(data: AppData, now: string): string {
  return JSON.stringify({ app: "appfinances", version: BACKUP_VERSION, exportedAt: now, data }, null, 2);
}

export function parseBackup(text: string): { data?: AppData; error?: string } {
  if (text.length > MAX_BYTES) return { error: "errors.backupTooBig" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "errors.backupInvalid" };
  }
  if (!isObj(parsed) || parsed.app !== "appfinances") return { error: "errors.backupInvalid" };
  if (parsed.version !== BACKUP_VERSION) return { error: "errors.backupVersion" };
  if (!validateAppData(parsed.data)) return { error: "errors.backupInvalid" };
  const d = parsed.data as AppData;
  return { data: { ...d, isDemo: Boolean(d.isDemo), recurrences: Array.isArray(d.recurrences) ? d.recurrences : [] } };
}
