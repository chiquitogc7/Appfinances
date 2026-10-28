import { describe, expect, it } from "vitest";
import { backoffDelayMs, enqueue, isCriticalTransaction, markFailure, markSuccess, MAX_ATTEMPTS, needsAttention, nextReady, resolveConflict, type QueuedOp } from "./syncQueue";

const T0 = "2025-06-15T12:00:00.000Z";

describe("fila de sincronização", () => {
  it("não duplica a mesma operação e respeita a ordem", () => {
    let q: QueuedOp[] = [];
    q = enqueue(q, { id: "a", kind: "tx", payload: 1 }, T0);
    q = enqueue(q, { id: "a", kind: "tx", payload: 2 }, T0);
    q = enqueue(q, { id: "b", kind: "tx", payload: 3 }, "2025-06-15T12:00:01.000Z");
    expect(q).toHaveLength(2);
    expect(q[0].payload).toBe(1);
    expect(nextReady(q, "2025-06-15T12:00:05.000Z")?.id).toBe("a");
  });
  it("falha volta com espera crescente e para depois do limite", () => {
    expect([1, 2, 3, 4].map(backoffDelayMs)).toEqual([2000, 4000, 8000, 16000]);
    expect(backoffDelayMs(50)).toBe(5 * 60_000);
    let q = enqueue([], { id: "a", kind: "tx", payload: 1 }, T0);
    q = markFailure(q, "a", T0, "sem rede");
    expect(q[0]).toMatchObject({ attempts: 1, lastError: "sem rede", nextAttemptAt: "2025-06-15T12:00:02.000Z" });
    expect(nextReady(q, T0)).toBeUndefined();
    expect(nextReady(q, "2025-06-15T12:00:02.000Z")?.id).toBe("a");
    for (let i = 1; i < MAX_ATTEMPTS; i++) q = markFailure(q, "a", T0, "sem rede");
    expect(needsAttention(q)).toHaveLength(1);
    expect(nextReady(q, "2030-01-01T00:00:00.000Z")).toBeUndefined();
  });
  it("sucesso remove da fila", () => {
    const q = enqueue([], { id: "a", kind: "tx", payload: 1 }, T0);
    expect(markSuccess(q, "a")).toEqual([]);
  });
});

describe("política de conflitos", () => {
  const v = (updatedAt: string, name: string) => ({ updatedAt, name });
  it("só um lado mudou: vence quem mudou", () => {
    const base = v("1", "x");
    expect(resolveConflict(base, v("2", "y"), base, false)).toBe("local");
    expect(resolveConflict(base, base, v("2", "z"), false)).toBe("remote");
  });
  it("os dois mudaram: última alteração vence, exceto em dado crítico", () => {
    const base = v("1", "x");
    expect(resolveConflict(base, v("3", "a"), v("2", "b"), false)).toBe("local");
    expect(resolveConflict(base, v("2", "a"), v("3", "b"), false)).toBe("remote");
    expect(resolveConflict(base, v("3", "a"), v("2", "b"), true)).toBe("manual");
  });
  it("mudanças idênticas não geram conflito", () => {
    expect(resolveConflict(v("1", "x"), v("2", "a"), v("3", "a"), true)).toBe("remote");
  });
  it("classifica o que é crítico", () => {
    expect(isCriticalTransaction({ status: "realized", kind: "expense" })).toBe(true);
    expect(isCriticalTransaction({ status: "planned", kind: "invoice_payment" })).toBe(true);
    expect(isCriticalTransaction({ status: "planned", kind: "expense" })).toBe(false);
  });
});
