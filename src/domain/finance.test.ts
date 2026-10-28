import { describe, expect, it } from "vitest";
import { addMonths, addMonthsToKey } from "./dates";
import {
  accountBalance, commitments, computeInvoices, installmentPlans, invoiceDates, invoiceKeyFor,
  periodSummary, projectedBalance, totalBalance,
} from "./finance";
import { parseMoneyInput, splitInstallments } from "./money";
import type { AppData, Transaction } from "./types";

const TODAY = "2025-03-15";

function fixture(txs: Omit<Transaction, "id" | "status">[] & { status?: "planned" | "realized" }[] | any[]): AppData {
  return {
    isDemo: true,
    accounts: [
      { id: "cc", name: "CC", type: "checking", currency: "BRL", initialBalance: 100000, referenceDate: "2025-01-01" },
      { id: "pp", name: "PP", type: "savings", currency: "BRL", initialBalance: 50000, referenceDate: "2025-01-01" },
    ],
    cards: [{ id: "c1", name: "Cartão", issuer: "X", limit: 500000, closingDay: 10, dueDay: 17, payAccountId: "cc" }],
    categories: [], budgets: [], goals: [], investments: [], recurrences: [],
    transactions: txs.map((t, i) => ({ id: `t${i}`, status: "realized", description: "x", ...t })),
  };
}

describe("dinheiro", () => {
  it("converte texto em centavos sem float", () => {
    expect(parseMoneyInput("1.234,56")).toBe(123456);
    expect(parseMoneyInput("10")).toBe(1000);
    expect(parseMoneyInput("0,5")).toBe(50);
    expect(parseMoneyInput("R$ 19,90")).toBe(1990);
    expect(parseMoneyInput("12.5")).toBe(1250);
    expect(parseMoneyInput("1.000")).toBe(100000);
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("1,234")).toBeNull();
  });
  it("parcelas somam exatamente o total e a última compensa os centavos", () => {
    expect(splitInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
    for (const [total, n] of [[100, 7], [419999, 10], [1, 3], [999999, 12]]) {
      expect(splitInstallments(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
    expect(() => splitInstallments(100, 0)).toThrow();
  });
});

describe("datas", () => {
  it("respeita fim de mês e anos bissextos sem acumular deriva", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-01-31", 2)).toBe("2025-03-31");
    expect(addMonthsToKey("2025-11", 3)).toBe("2026-02");
    expect(addMonthsToKey("2025-02", -3)).toBe("2024-11");
  });
});

describe("regras financeiras", () => {
  it("saldo inicial não é receita", () => {
    const d = fixture([]);
    expect(totalBalance(d, TODAY)).toBe(150000);
    expect(periodSummary(d, "2025-03-01", "2025-03-31").income).toBe(0);
  });

  it("transferência não é receita nem despesa e preserva o total", () => {
    const d = fixture([{ kind: "transfer", amount: 20000, date: "2025-03-02", accountId: "cc", toAccountId: "pp" }]);
    const s = periodSummary(d, "2025-03-01", "2025-03-31");
    expect(s.income + s.expense + s.plannedIncome + s.plannedExpense).toBe(0);
    expect(accountBalance(d.accounts[0], d.transactions, TODAY)).toBe(80000);
    expect(accountBalance(d.accounts[1], d.transactions, TODAY)).toBe(70000);
    expect(totalBalance(d, TODAY)).toBe(150000);
  });

  it("compra no cartão não mexe na conta; pagar a fatura não gera segunda despesa", () => {
    const purchase = { kind: "expense", amount: 30000, date: "2025-02-05", cardId: "c1", categoryId: "x" };
    const d1 = fixture([purchase]);
    expect(totalBalance(d1, TODAY)).toBe(150000);
    expect(periodSummary(d1, "2025-02-01", "2025-02-28").expense).toBe(30000);

    const inv = computeInvoices(d1, TODAY)[0];
    expect(inv.key).toBe("2025-02");
    const d2 = fixture([purchase, { kind: "invoice_payment", amount: 30000, date: "2025-02-17", accountId: "cc", cardId: "c1", invoiceKey: inv.key }]);
    expect(totalBalance(d2, TODAY)).toBe(120000);
    // despesas continuam sendo apenas a compra
    expect(periodSummary(d2, "2025-02-01", "2025-02-28").expense).toBe(30000);
    expect(periodSummary(d2, "2025-03-01", "2025-03-31").expense).toBe(0);
    expect(computeInvoices(d2, TODAY)[0].status).toBe("paid");
  });

  it("pagamento parcial mantém o saldo restante em aberto", () => {
    const d = fixture([
      { kind: "expense", amount: 30000, date: "2025-02-05", cardId: "c1" },
      { kind: "invoice_payment", amount: 10000, date: "2025-02-17", accountId: "cc", cardId: "c1", invoiceKey: "2025-02" },
    ]);
    const inv = computeInvoices(d, TODAY)[0];
    expect(inv.paid).toBe(10000);
    expect(inv.remaining).toBe(20000);
    expect(inv.status).toBe("overdue");
    expect(commitments(d, TODAY, TODAY).invoices).toBe(20000);
  });

  it("receita prevista não aumenta o saldo real, mas entra na projeção", () => {
    const d = fixture([{ kind: "income", amount: 500000, date: "2025-03-25", status: "planned", accountId: "cc" }]);
    expect(totalBalance(d, TODAY)).toBe(150000);
    expect(projectedBalance(d, TODAY, "2025-03-31")).toBe(650000);
    expect(projectedBalance(d, TODAY, "2025-03-20")).toBe(150000);
  });

  it("despesa prevista fica separada da paga e vira compromisso", () => {
    const d = fixture([{ kind: "expense", amount: 40000, date: "2025-03-20", status: "planned", accountId: "cc" }]);
    const s = periodSummary(d, "2025-03-01", "2025-03-31");
    expect(s.expense).toBe(0);
    expect(s.plannedExpense).toBe(40000);
    expect(totalBalance(d, TODAY)).toBe(150000);
    expect(commitments(d, TODAY, "2025-03-31").bills).toBe(40000);
  });

  it("fatura: fechamento define o mês e o vencimento respeita o calendário", () => {
    const card = fixture([]).cards[0]; // fecha dia 10, vence dia 17
    expect(invoiceKeyFor(card, "2025-03-10")).toBe("2025-03");
    expect(invoiceKeyFor(card, "2025-03-11")).toBe("2025-04");
    expect(invoiceKeyFor(card, "2025-12-20")).toBe("2026-01");
    expect(invoiceDates(card, "2025-03")).toEqual({ closing: "2025-03-10", due: "2025-03-17" });
    const late = { ...card, closingDay: 25, dueDay: 5 };
    expect(invoiceDates(late, "2025-03")).toEqual({ closing: "2025-03-25", due: "2025-04-05" });
    expect(invoiceDates({ ...card, closingDay: 28, dueDay: 31 }, "2025-02").due).toBe("2025-02-28");
  });

  it("parcelas futuras ficam previstas e somam o total original", () => {
    const parts = splitInstallments(100001, 3);
    const d = fixture(
      parts.map((amount, i) => ({
        kind: "expense", amount, date: addMonths("2025-03-01", i), cardId: "c1", description: "TV",
        status: i === 0 ? "realized" : "planned", installment: { groupId: "g", index: i + 1, total: 3 },
      })),
    );
    const plan = installmentPlans(d)[0];
    expect(plan.remainingCount).toBe(2);
    expect(plan.remainingAmount).toBe(parts[1] + parts[2]);
    expect(d.transactions.reduce((s, t) => s + t.amount, 0)).toBe(100001);
  });

  it("exclusão lógica remove o registro dos cálculos", () => {
    const d = fixture([{ kind: "income", amount: 99999, date: "2025-03-01", accountId: "cc", deletedAt: "2025-03-02T00:00:00Z" }]);
    expect(totalBalance(d, TODAY)).toBe(150000);
    expect(periodSummary(d, "2025-03-01", "2025-03-31").income).toBe(0);
  });
});
