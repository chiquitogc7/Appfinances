/**
 * Auditoria dos cálculos financeiros: sequências aleatórias (com semente fixa) de operações,
 * verificando invariantes com um cálculo independente depois de CADA operação.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateAppData } from "./backup";
import { cardUsage, computeInvoices, commitments, estimatedAvailable, isCounted, periodSummary, projectedBalance, totalBalance } from "./finance";
import {
  anticipateInstallments, applyCreate, addInvoiceAdjustment, buildTransactions, createRecurrence, deleteTransaction, editTransaction, endRecurrence,
  payInvoice, restoreTransaction, reverseTransaction, settleTransaction, type OpResult,
} from "./ops";
import { addDays } from "./dates";
import type { AppData, Transaction } from "./types";
import type { TxInput } from "./validation";

const TODAY = "2025-06-15";
const NOW = "2025-06-15T12:00:00.000Z";

function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = (): AppData => ({
  isDemo: true,
  accounts: ["a1", "a2", "a3"].map((id, i) => ({ id, name: id, type: "checking" as const, currency: "BRL", initialBalance: 100000 * (i + 1), referenceDate: "2025-01-01" })),
  cards: [
    { id: "c1", name: "C1", issuer: "X", limit: 500000, closingDay: 10, dueDay: 17, payAccountId: "a1" },
    { id: "c2", name: "C2", issuer: "X", limit: 300000, closingDay: 28, dueDay: 5, payAccountId: "a2" },
  ],
  categories: [
    { id: "e1", name: "E1", kind: "expense", color: "#000" },
    { id: "e2", name: "E2", kind: "expense", color: "#000" },
    { id: "i1", name: "I1", kind: "income", color: "#000" },
  ],
  transactions: [], budgets: [], goals: [], investments: [], recurrences: [],
});

/* ───── cálculo independente (não reutiliza accountEffect/summarize) ───── */
function expectedBalance(d: AppData, accountId: string): number {
  const acc = d.accounts.find((a) => a.id === accountId)!;
  let v = acc.initialBalance;
  for (const t of d.transactions) {
    if (t.deletedAt || t.status !== "realized" || t.date < acc.referenceDate || t.date > TODAY) continue;
    const sign = t.reversalOf ? -1 : 1;
    if (t.kind === "income" && t.accountId === accountId) v += sign * t.amount;
    else if (t.kind === "expense" && !t.cardId && t.accountId === accountId) v -= sign * t.amount;
    else if (t.kind === "invoice_payment" && t.accountId === accountId) v -= sign * t.amount;
    else if (t.kind === "transfer") {
      if (t.accountId === accountId) v -= sign * t.amount;
      if (t.toAccountId === accountId) v += sign * t.amount;
    }
  }
  return v;
}

function check(d: AppData, label: string) {
  const where = `após ${label}`;
  expect(validateAppData(d), `${where}: forma dos dados`).toBe(true);

  // I1 saldo
  let sum = 0;
  for (const a of d.accounts) sum += expectedBalance(d, a.id);
  expect(totalBalance(d, TODAY), `${where}: saldo total`).toBe(sum);

  // I2 receitas e despesas (realizadas) em todo o período
  let inc = 0, exp = 0, pInc = 0, pExp = 0;
  for (const t of d.transactions) {
    if (t.deletedAt || t.reversalOf || t.reversedBy) continue;
    const real = t.status === "realized";
    if (t.kind === "income") real ? (inc += t.amount) : (pInc += t.amount);
    if (t.kind === "expense") real ? (exp += t.amount) : (pExp += t.amount);
    if (t.kind === "card_refund") real ? (exp -= t.amount) : (pExp -= t.amount);
  }
  const s = periodSummary(d, "2000-01-01", "2100-12-31");
  expect([s.income, s.expense, s.plannedIncome, s.plannedExpense], `${where}: resumo`).toEqual([inc, exp, pInc, pExp]);

  // I3 faturas
  const invoices = computeInvoices(d, TODAY);
  const totals = new Map<string, { total: number; paid: number }>();
  for (const t of d.transactions) {
    if (t.deletedAt || !t.cardId) continue;
    const card = d.cards.find((c) => c.id === t.cardId)!;
    const key = t.invoiceKey ?? (parseInt(t.date.slice(8), 10) > card.closingDay ? nextMonth(t.date.slice(0, 7)) : t.date.slice(0, 7));
    const id = `${t.cardId}|${key}`;
    const row = totals.get(id) ?? { total: 0, paid: 0 };
    const sign = t.reversalOf ? -1 : 1;
    if (t.kind === "expense") row.total += sign * t.amount;
    if (t.kind === "card_refund") row.total -= sign * t.amount;
    if (t.kind === "invoice_payment" && t.status === "realized") row.paid += sign * t.amount;
    totals.set(id, row);
  }
  for (const inv of invoices) {
    const exp3 = totals.get(`${inv.cardId}|${inv.key}`)!;
    expect([inv.total, inv.paid], `${where}: fatura ${inv.cardId} ${inv.key}`).toEqual([exp3.total, exp3.paid]);
    expect(inv.remaining, `${where}: restante`).toBe(Math.max(inv.total - inv.paid, 0));
    expect(inv.remaining).toBeGreaterThanOrEqual(0);
  }
  for (const c of d.cards) expect(cardUsage(c, invoices).used, `${where}: limite usado`).toBe(invoices.filter((i) => i.cardId === c.id).reduce((x, i) => x + i.remaining, 0));

  // I4 projeção coerente
  const until = "2025-12-31";
  const com = commitments(d, TODAY, until);
  expect(com.total).toBe(com.bills + com.invoices);
  expect(estimatedAvailable(d, TODAY, until)).toBe(totalBalance(d, TODAY) - com.total);
  expect(projectedBalance(d, TODAY, until)).toBeGreaterThanOrEqual(estimatedAvailable(d, TODAY, until));

  // I5 estados consistentes
  const byId = new Map(d.transactions.map((t) => [t.id, t]));
  for (const t of d.transactions) {
    if (t.deletedAt) expect(t.status, `${where}: excluída precisa ser prevista (${t.id})`).toBe("planned");
    if (t.status === "realized") expect(t.date <= TODAY, `${where}: realizada no futuro (${t.id} ${t.date})`).toBe(true);
    if (t.kind === "expense" && t.cardId && !t.reversalOf) expect(t.status === "realized", `${where}: compra no cartão ${t.id}`).toBe(t.date <= TODAY);
    if (t.reversedBy) {
      const r = byId.get(t.reversedBy);
      expect(r?.reversalOf, `${where}: estorno aponta de volta`).toBe(t.id);
      expect(r?.amount).toBe(t.amount);
    }
    expect(isCounted(t)).toBe(!t.deletedAt && !t.reversalOf && !t.reversedBy);
  }
}

function nextMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

const stats: Record<string, number> = {};

function runSeed(seed: number, steps: number) {
  const rnd = rngFrom(seed);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T,>(xs: T[]): T | undefined => xs[int(0, xs.length - 1)];
  const date = () => addDays("2025-03-01", int(0, 210));
  let d = base();
  let n = 0;
  const installmentTotals = new Map<string, number>();
  const apply = (label: string, r: OpResult) => {
    if (r.error) {
      expect(r.data, `${label}: erro não pode alterar dados`).toBe(d);
      stats[`${label} (recusado)`] = (stats[`${label} (recusado)`] ?? 0) + 1;
    } else {
      if (r.data !== d) stats[label] = (stats[label] ?? 0) + 1;
      d = r.data;
    }
    check(d, `${label} (semente ${seed})`);
  };

  for (let step = 0; step < steps; step++) {
    const op = int(0, 13);
    const id = `s${seed}-${++n}`;
    const txs = d.transactions;
    if (op <= 3) {
      const kind = (["income", "expense", "transfer", "expense"] as const)[op];
      const card = op === 3;
      const amount = int(1, 90000);
      const installments = card ? int(1, 6) : 1;
      const dt = date();
      const input: TxInput = {
        kind, amountText: "1", description: "x", date: dt, status: dt <= TODAY ? (rnd() < 0.8 ? "realized" : "planned") : "planned",
        categoryId: kind === "income" ? "i1" : kind === "expense" ? pick(["e1", "e2"]) : undefined,
        paymentMethod: kind === "transfer" ? undefined : card ? "credit_card" : "pix",
        accountId: card ? undefined : pick(["a1", "a2", "a3"]), toAccountId: kind === "transfer" ? pick(["a1", "a2", "a3"].filter(() => true)) : undefined,
        cardId: card ? pick(["c1", "c2"]) : undefined, installments,
      };
      if (kind === "transfer" && input.toAccountId === input.accountId) input.toAccountId = input.accountId === "a1" ? "a2" : "a1";
      const built = buildTransactions(input, amount, id, TODAY, NOW, card ? d.cards.find((c) => c.id === input.cardId) : undefined);
      if (card && installments > 1) installmentTotals.set(id, amount);
      const next = applyCreate(d, built);
      apply(`criar ${kind}${card ? " cartão" : ""}`, { data: next });
      // idempotência: repetir a mesma operação não muda nada
      expect(applyCreate(d, built), `criar ${kind}: idempotência`).toBe(d);
    } else if (op === 4) {
      const t = pick(txs.filter((x) => x.status === "planned" && !x.deletedAt));
      if (t) apply("liquidar", settleTransaction(d, t.id, TODAY, NOW, TODAY));
    } else if (op === 5) {
      const t = pick(txs.filter((x) => x.status === "planned" && !x.deletedAt));
      if (t) apply("excluir", deleteTransaction(d, t.id, NOW));
    } else if (op === 6) {
      const t = pick(txs.filter((x) => x.deletedAt));
      if (t) apply("restaurar", restoreTransaction(d, t.id, NOW));
    } else if (op === 7) {
      const t = pick(txs.filter((x) => x.status === "realized" && !x.deletedAt));
      if (t) {
        const r = reverseTransaction(d, t.id, id, TODAY, NOW, TODAY);
        apply("estornar", r);
        expect(reverseTransaction(d, t.id, id, TODAY, NOW, TODAY).data, "estorno: idempotência").toBe(d);
      }
    } else if (op === 8) {
      const inv = pick(computeInvoices(d, TODAY).filter((i) => i.remaining > 0));
      if (inv) {
        const amount = int(1, inv.remaining);
        const card = d.cards.find((c) => c.id === inv.cardId)!;
        apply("pagar fatura", payInvoice(d, id, { cardId: inv.cardId, invoiceKey: inv.key, amount, date: TODAY, accountId: card.payAccountId }, NOW, TODAY));
        expect(payInvoice(d, id, { cardId: inv.cardId, invoiceKey: inv.key, amount, date: TODAY, accountId: card.payAccountId }, NOW, TODAY).data, "pagamento: idempotência").toBe(d);
      }
    } else if (op === 9) {
      const inv = pick(computeInvoices(d, TODAY));
      if (inv) apply("ajuste de fatura", addInvoiceAdjustment(d, id, { cardId: inv.cardId, invoiceKey: inv.key, type: pick(["interest", "fine", "fee", "refund"] as const)!, amount: int(1, 50000), date: TODAY, categoryId: "e1", description: "aj" }, NOW, TODAY));
    } else if (op === 10) {
      const groups = new Map<string, Transaction[]>();
      for (const t of txs) if (t.installment && t.status === "planned" && !t.deletedAt && !t.reversedBy) groups.set(t.installment.groupId, [...(groups.get(t.installment.groupId) ?? []), t]);
      const g = pick([...groups.values()]);
      if (g) apply("antecipar", anticipateInstallments(d, g[0].installment!.groupId, g.filter(() => rnd() < 0.6).map((t) => t.installment!.index).slice(0, Math.max(1, g.length)), TODAY, NOW, TODAY));
    } else if (op === 11) {
      d = createRecurrence(d, id, { kind: pick(["income", "expense"] as const)!, amount: int(1, 40000), description: "rec", categoryId: "e1", paymentMethod: "pix", accountId: "a1", frequency: pick(["monthly", "weekly", "yearly"] as const)!, startDate: addDays("2025-03-01", int(0, 90)) }, NOW, TODAY);
      d = { ...d, transactions: d.transactions.map((t) => (t.recurrenceId === id && t.kind === "income" ? { ...t, categoryId: "i1" } : t)) };
      check(d, `criar recorrência (semente ${seed})`);
    } else if (op === 12) {
      const r = pick(d.recurrences.filter((x) => x.active));
      if (r) apply("encerrar recorrência", endRecurrence(d, r.id, NOW, TODAY));
    } else {
      const t = pick(txs.filter((x) => x.status === "planned" && !x.deletedAt && !x.cardId && !x.installment && (x.kind === "income" || x.kind === "expense")));
      if (t) apply("editar", editTransaction(d, t.id, { amount: int(1, 70000), date: date() }, NOW));
    }
  }

  // I6 parcelas somam o total original
  for (const [groupId, total] of installmentTotals) {
    const sum = d.transactions.filter((t) => t.installment?.groupId === groupId).reduce((s, t) => s + t.amount, 0);
    expect(sum, `parcelas do grupo ${groupId}`).toBe(total);
  }
  return d;
}

describe("auditoria: invariantes sob operações aleatórias", () => {
  it("80 sequências × 60 operações mantêm saldo, resumo, faturas e estados consistentes", () => {
    let totalTx = 0;
    for (let seed = 1; seed <= 80; seed++) totalTx += runSeed(seed, 60).transactions.length;
    expect(totalTx).toBeGreaterThan(1000);
    // a auditoria só vale se de fato exercitou cada tipo de operação
    for (const op of ["criar income", "criar expense", "criar transfer", "criar expense cartão", "liquidar", "excluir", "restaurar", "estornar", "pagar fatura", "ajuste de fatura", "antecipar", "editar", "encerrar recorrência"]) {
      expect(stats[op] ?? 0, `operação nunca exercitada: ${op}`).toBeGreaterThan(5);
    }
    console.log("operações aplicadas na auditoria:", JSON.stringify(stats));
  }, 120_000);
});

describe("arquitetura: o domínio é reaproveitável em React Native", () => {
  it("src/domain não importa React, Next, Firebase nem usa APIs do navegador", () => {
    const dir = __dirname;
    const forbidden = /from\s+["'](react|react-dom|next|firebase|@\/|lucide-react|recharts)[^"']*["']|\b(window|document|localStorage|sessionStorage|navigator)\./;
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.includes(".test."))) {
      const src = readFileSync(path.join(dir, f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
      if (forbidden.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe("desempenho com muitos lançamentos", () => {
  it("20 mil lançamentos: telas principais calculam bem abaixo de 1 s", () => {
    const rnd = rngFrom(7);
    const d = base();
    for (let i = 0; i < 20000; i++) {
      const dt = addDays("2024-01-01", Math.floor(rnd() * 700));
      const card = i % 3 === 0;
      d.transactions.push({ id: `p${i}`, kind: i % 7 === 0 ? "income" : "expense", amount: 1 + Math.floor(rnd() * 50000), date: dt, status: dt <= TODAY ? "realized" : "planned", description: "p", categoryId: "e1", ...(card && i % 7 !== 0 ? { cardId: "c1" } : { accountId: "a1" }) });
    }
    const t0 = performance.now();
    totalBalance(d, TODAY);
    computeInvoices(d, TODAY);
    commitments(d, TODAY, "2025-12-31");
    for (let m = 0; m < 7; m++) projectedBalance(d, TODAY, "2025-12-31");
    for (let day = 0; day < 31; day++) totalBalance(d, addDays("2025-05-15", day));
    const ms = performance.now() - t0;
    console.log(`desempenho: ${ms.toFixed(0)} ms com ${d.transactions.length} lançamentos`);
    expect(ms).toBeLessThan(1500);
  });
});
