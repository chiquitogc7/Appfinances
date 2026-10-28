/**
 * Diferença entre o que já está na nuvem e o estado atual. Só o que mudou é gravado,
 * o que dá "última alteração vence" por documento e evita reescrever tudo a cada ação.
 * Puro (sem Firebase): testável sem rede.
 */
import type { AppData } from "@/domain/types";

export const COLLECTIONS = ["accounts", "cards", "categories", "transactions", "budgets", "goals", "investments", "recurrences"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export type Snapshot = Record<CollectionName, Map<string, string>>;
export interface Write {
  collection: CollectionName;
  id: string;
  data: Record<string, unknown>;
}
export interface Delete {
  collection: CollectionName;
  id: string;
}

/** O Firestore rejeita `undefined`; removemos recursivamente. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = stripUndefined(v);
    return out as T;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Id aceito como nome de documento (sem barra, sem "." ou "..", sem o padrão reservado __x__). */
export function isSafeDocId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 200 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}

export function docId(collection: CollectionName, item: unknown): string {
  const o = item as { id?: unknown; categoryId?: unknown };
  const id = collection === "budgets" ? o.categoryId : o.id;
  if (!isSafeDocId(id)) throw new Error(`Identificador inválido em ${collection}`);
  return id;
}

export function emptySnapshot(): Snapshot {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, new Map<string, string>()])) as Snapshot;
}

export function toSnapshot(data: AppData): Snapshot {
  const snap = emptySnapshot();
  for (const c of COLLECTIONS) for (const item of data[c] as unknown[]) snap[c].set(docId(c, item), stableStringify(item));
  return snap;
}

export function computeChanges(prev: Snapshot, next: AppData): { writes: Write[]; deletes: Delete[]; snapshot: Snapshot } {
  const snapshot = toSnapshot(next);
  const writes: Write[] = [];
  const deletes: Delete[] = [];
  for (const c of COLLECTIONS) {
    const items = new Map((next[c] as unknown[]).map((item) => [docId(c, item), item]));
    for (const [id, json] of snapshot[c]) {
      if (prev[c].get(id) !== json) writes.push({ collection: c, id, data: stripUndefined(items.get(id)) as Record<string, unknown> });
    }
    for (const id of prev[c].keys()) if (!snapshot[c].has(id)) deletes.push({ collection: c, id });
  }
  return { writes, deletes, snapshot };
}

/** Monta o AppData a partir dos documentos lidos (cada item já traz seu id). */
export function fromDocs(docs: Record<CollectionName, unknown[]>): AppData {
  return {
    isDemo: false,
    accounts: docs.accounts as AppData["accounts"],
    cards: docs.cards as AppData["cards"],
    categories: docs.categories as AppData["categories"],
    transactions: docs.transactions as AppData["transactions"],
    budgets: docs.budgets as AppData["budgets"],
    goals: docs.goals as AppData["goals"],
    investments: docs.investments as AppData["investments"],
    recurrences: docs.recurrences as AppData["recurrences"],
  };
}
