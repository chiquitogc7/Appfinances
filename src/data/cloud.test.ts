import { describe, expect, it } from "vitest";
import { buildDemoData } from "./demo";
import { createCloudRepository, type RemoteStore } from "./cloudRepository";
import { COLLECTIONS, computeChanges, docId, emptySnapshot, fromDocs, isSafeDocId, stableStringify, stripUndefined, toSnapshot, type CollectionName, type Delete, type Write } from "./sync";
import { DEFAULT_CATEGORIES, emptyAppData } from "@/domain/categories";
import { applyCreate, buildTransactions, deleteCategory, createCategory } from "@/domain/ops";
import { validateAppData } from "@/domain/backup";
import type { AppData } from "@/domain/types";

const TODAY = "2026-10-25";
const NOW = "2026-10-25T12:00:00.000Z";

/** Nuvem de mentira: guarda documentos em memória e permite simular falhas. */
function fakeRemote(opts: { maxBatch?: number } = {}) {
  const store: Record<CollectionName, Map<string, unknown>> = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()])) as never;
  const state = { profile: false, failNext: 0, hang: false, commits: [] as { writes: number; deletes: number; profile: boolean }[] };
  const remote: RemoteStore = {
    maxBatch: opts.maxBatch ?? 450,
    async list(c) { return [...store[c].values()]; },
    async hasProfile() { return state.profile; },
    async commit(writes: Write[], deletes: Delete[], withProfile) {
      if (state.hang) return new Promise<void>(() => {});
      if (state.failNext > 0) { state.failNext--; throw new Error("sem rede"); }
      state.commits.push({ writes: writes.length, deletes: deletes.length, profile: withProfile });
      for (const w of writes) store[w.collection].set(w.id, JSON.parse(JSON.stringify(w.data)));
      for (const d of deletes) store[d.collection].delete(d.id);
      if (withProfile) state.profile = true;
    },
  };
  return { remote, store, state };
}

describe("diferenças para a nuvem", () => {
  it("grava só o que mudou e apaga só o que sumiu", () => {
    const d = buildDemoData(TODAY);
    const prev = toSnapshot(d);
    expect(computeChanges(prev, d)).toMatchObject({ writes: [], deletes: [] });

    const edited: AppData = { ...d, accounts: d.accounts.map((a, i) => (i === 0 ? { ...a, name: "Renomeada" } : a)), budgets: d.budgets.slice(1) };
    const { writes, deletes } = computeChanges(prev, edited);
    expect(writes.map((w) => `${w.collection}/${w.id}`)).toEqual([`accounts/${d.accounts[0].id}`]);
    expect(deletes).toEqual([{ collection: "budgets", id: d.budgets[0].categoryId }]);
  });
  it("ordem das chaves e campos undefined não geram gravação à toa", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(stableStringify({ a: [2, { c: undefined, d: 1 }], b: 1 }));
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [undefined, 2] } })).toEqual({ a: 1, c: { e: [undefined, 2].map((x) => x) } });
    const d = buildDemoData(TODAY);
    const reordered: AppData = { ...d, accounts: d.accounts.map((a) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse())))) };
    expect(computeChanges(toSnapshot(d), reordered).writes).toEqual([]);
  });
  it("nunca envia undefined ao Firestore", () => {
    const d = buildDemoData(TODAY);
    const withUndef: AppData = { ...d, goals: [...d.goals, { id: "g", name: "x", target: 1, saved: 0, deadline: TODAY, archivedAt: undefined }] };
    const w = computeChanges(emptySnapshot(), withUndef).writes.find((x) => x.id === "g")!;
    expect("archivedAt" in w.data).toBe(false);
  });
  it("recusa ids que virariam caminho forjado", () => {
    for (const bad of ["a/b", "..", ".", "__x__", "", "x".repeat(201)]) expect(isSafeDocId(bad)).toBe(false);
    for (const ok of ["abc", "uuid:0", "rec:id:2025-01-01", "cat_x"]) expect(isSafeDocId(ok)).toBe(true);
    expect(() => docId("transactions", { id: "a/b" })).toThrow();
    const evil = { ...buildDemoData(TODAY) };
    evil.transactions = [{ ...evil.transactions[0], id: "../../users/outro/x" }];
    expect(validateAppData(evil)).toBe(false);
  });
});

describe("repositório da nuvem", () => {
  it("conta nova começa vazia (sem dados fictícios) e só grava ao haver mudança", async () => {
    const { remote, state } = fakeRemote();
    const repo = createCloudRepository(remote);
    const data = await repo.load(TODAY);
    expect(data.isDemo).toBe(false);
    expect(data.accounts).toEqual([]);
    expect(data.categories.map((c) => c.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(state.commits).toHaveLength(0);
  });
  it("primeira gravação cria o perfil; categorias iniciais não são gravadas", async () => {
    const { remote, store, state } = fakeRemote();
    const repo = createCloudRepository(remote);
    let data = await repo.load(TODAY);
    data = { ...data, accounts: [{ id: "a1", name: "Conta", type: "checking", currency: "BRL", initialBalance: 1000, referenceDate: TODAY }] };
    await repo.save(data);
    expect(state.commits).toEqual([{ writes: 1, deletes: 0, profile: true }]);
    expect(store.categories.size).toBe(0);
    expect(store.accounts.get("a1")).toMatchObject({ name: "Conta", initialBalance: 1000 });
  });
  it("ida e volta: o que foi salvo é carregado igual por outra sessão", async () => {
    const { remote } = fakeRemote();
    const a = createCloudRepository(remote);
    let data = await a.load(TODAY);
    data = { ...data, accounts: [{ id: "a1", name: "Conta", type: "checking", currency: "BRL", initialBalance: 1000, referenceDate: TODAY }], cards: [{ id: "c1", name: "Cartão", issuer: "X", limit: 5000, closingDay: 10, dueDay: 17, payAccountId: "a1" }] };
    data = createCategory(data, "cat_custom", "Presentes", "expense").data;
    data = applyCreate(data, buildTransactions({ kind: "expense", amountText: "1", description: "Parcelado", date: TODAY, status: "realized", categoryId: "cat_custom", paymentMethod: "credit_card", cardId: "c1", installments: 3 }, 10001, "op1", TODAY, NOW, data.cards[0]));
    await a.save(data);

    const b = createCloudRepository(remote);
    const loaded = await b.load(TODAY);
    const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id));
    expect(byId(loaded.transactions)).toEqual(byId(data.transactions));
    expect(byId(loaded.accounts)).toEqual(data.accounts);
    expect(loaded.categories.find((c) => c.id === "cat_custom")?.custom).toBe(true);
    expect(loaded.categories.length).toBe(data.categories.length);
  });
  it("removida na tela = removida na nuvem", async () => {
    const { remote, store } = fakeRemote();
    const repo = createCloudRepository(remote);
    let data = await repo.load(TODAY);
    data = createCategory(data, "c9", "Temporária", "expense").data;
    await repo.save(data);
    expect(store.categories.has("c9")).toBe(true);
    await repo.save(deleteCategory(data, "c9").data);
    expect(store.categories.has("c9")).toBe(false);
  });
  it("falha de rede não perde nada: a tentativa seguinte reenvia e não duplica", async () => {
    const { remote, store, state } = fakeRemote();
    const repo = createCloudRepository(remote);
    let data = await repo.load(TODAY);
    data = { ...data, accounts: [{ id: "a1", name: "Conta", type: "checking", currency: "BRL", initialBalance: 1, referenceDate: TODAY }] };
    state.failNext = 1;
    await expect(repo.save(data)).rejects.toThrow("sem rede");
    expect(store.accounts.size).toBe(0);
    await repo.save(data); // retry
    await repo.save(data); // repetir não faz nada
    expect(store.accounts.size).toBe(1);
    expect(state.commits).toHaveLength(1);
  });
  it("sem resposta (offline): estoura o tempo, avisa e depois recupera", async () => {
    const { remote, state, store } = fakeRemote();
    const repo = createCloudRepository(remote, { timeoutMs: 30 });
    let data = await repo.load(TODAY);
    data = { ...data, accounts: [{ id: "a1", name: "Conta", type: "checking", currency: "BRL", initialBalance: 1, referenceDate: TODAY }] };
    state.hang = true;
    await expect(repo.save(data)).rejects.toThrow("timeout");
    state.hang = false;
    await repo.save(data);
    expect(store.accounts.size).toBe(1);
  });
  it("muitas mudanças são divididas em lotes dentro do limite", async () => {
    const { remote, state, store } = fakeRemote({ maxBatch: 50 });
    const repo = createCloudRepository(remote);
    let data = await repo.load(TODAY);
    data = { ...data, accounts: [{ id: "a1", name: "Conta", type: "checking", currency: "BRL", initialBalance: 0, referenceDate: TODAY }] };
    for (let i = 0; i < 130; i++) data = applyCreate(data, buildTransactions({ kind: "income", amountText: "1", description: "x", date: TODAY, status: "realized", categoryId: "cat_salario", paymentMethod: "pix", accountId: "a1", installments: 1 }, 100 + i, `op${i}`, TODAY, NOW));
    await repo.save(data);
    expect(store.transactions.size).toBe(130);
    expect(state.commits.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...state.commits.map((c) => c.writes + c.deletes + 1))).toBeLessThanOrEqual(50);
  });
  it("salvamentos simultâneos são serializados e o último estado vence", async () => {
    const { remote, store } = fakeRemote();
    const repo = createCloudRepository(remote);
    const base = await repo.load(TODAY);
    const mk = (name: string): AppData => ({ ...base, accounts: [{ id: "a1", name, type: "checking", currency: "BRL", initialBalance: 0, referenceDate: TODAY }] });
    await Promise.all([repo.save(mk("primeiro")), repo.save(mk("segundo")), repo.save(mk("terceiro"))]);
    expect((store.accounts.get("a1") as { name: string }).name).toBe("terceiro");
  });
  it("recusa dados com formato inesperado vindos da nuvem", async () => {
    const { remote, store, state } = fakeRemote();
    state.profile = true;
    store.transactions.set("t1", { id: "t1", kind: "expense", amount: -5, date: "2025-01-01", status: "realized", description: "x" });
    await expect(createCloudRepository(remote).load(TODAY)).rejects.toThrow();
  });
  it("modo demonstração não existe na nuvem", () => {
    expect(() => createCloudRepository(fakeRemote().remote).reset(TODAY)).toThrow();
    expect(fromDocs(Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as never)).toMatchObject({ isDemo: false });
    expect(validateAppData(emptyAppData())).toBe(true);
  });
});
