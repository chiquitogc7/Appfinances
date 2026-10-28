import { describe, expect, it } from "vitest";
import { budgetUsage, cardUsage, cashflowTable, computeInvoices, invoiceTransactions, periodSummary, projectedBalance, spendingByCategory, totalBalance } from "./finance";
import { addGoalContribution, addInvoiceAdjustment, anticipateInstallments, applyCreate, archiveGoal, buildTransactions, createCard, createGoal, createRecurrence, endRecurrence, materializeRecurrences, occurrenceDates, payInvoice, removeBudget, restoreGoal, setBudget, updateCard } from "./ops";
import { validateBudgetInput, validateCardInput, validateGoalInput, validateInvoiceAction, validateRecurrenceInput, type TxInput } from "./validation";
import type { AppData } from "./types";

const TODAY = "2025-03-15";
const NOW = "2025-03-15T12:00:00.000Z";

const base = (): AppData => ({
  isDemo: true,
  accounts: [{ id: "cc", name: "Corrente", type: "checking", currency: "BRL", initialBalance: 500000, referenceDate: "2025-01-01" }],
  cards: [{ id: "c1", name: "Cartão", issuer: "X", limit: 300000, closingDay: 10, dueDay: 17, payAccountId: "cc" }],
  categories: [
    { id: "food", name: "Alimentação", kind: "expense", color: "#000" },
    { id: "fin", name: "Serviços financeiros", kind: "expense", color: "#000" },
    { id: "sal", name: "Salário", kind: "income", color: "#000" },
  ],
  transactions: [], budgets: [], goals: [], investments: [], recurrences: [],
});
const cardInput = (over: Partial<TxInput> = {}): TxInput => ({ kind: "expense", amountText: "1", description: "Compra", date: "2025-02-05", status: "realized", categoryId: "food", paymentMethod: "credit_card", cardId: "c1", installments: 1, ...over });
const withPurchase = (amount = 30000) => { const d = base(); return applyCreate(d, buildTransactions(cardInput(), amount, "p", TODAY, NOW, d.cards[0])); };

describe("pagamento de fatura", () => {
  it("pagamento total quita e não cria despesa", () => {
    const d = withPurchase();
    const r = payInvoice(d, "pay1", { cardId: "c1", invoiceKey: "2025-02", amount: 30000, date: TODAY, accountId: "cc" }, NOW, TODAY);
    expect(r.error).toBeUndefined();
    expect(totalBalance(r.data, TODAY)).toBe(470000);
    expect(computeInvoices(r.data, TODAY)[0].status).toBe("paid");
    expect(periodSummary(r.data, "2025-02-01", "2025-03-31").expense).toBe(30000);
  });
  it("parcial mantém o restante; não aceita pagar mais que o devido; retry não duplica", () => {
    const d = withPurchase();
    const pay = { cardId: "c1", invoiceKey: "2025-02", amount: 10000, date: TODAY, accountId: "cc" };
    const r1 = payInvoice(d, "pay1", pay, NOW, TODAY);
    const r2 = payInvoice(r1.data, "pay1", pay, NOW, TODAY); // reenvio
    expect(r2.data.transactions.filter((t) => t.kind === "invoice_payment")).toHaveLength(1);
    expect(computeInvoices(r2.data, TODAY)[0].remaining).toBe(20000);
    expect(payInvoice(r2.data, "pay2", { ...pay, amount: 20001 }, NOW, TODAY).error).toBe("errors.payExceeds");
    const r3 = payInvoice(r2.data, "pay3", { ...pay, amount: 20000 }, NOW, TODAY);
    expect(computeInvoices(r3.data, TODAY)[0].status).toBe("paid");
    expect(payInvoice(r3.data, "pay4", { ...pay, amount: 1 }, NOW, TODAY).error).toBe("errors.invoiceNothingToPay");
  });
});

describe("juros, multas, tarifas e reembolsos", () => {
  it("juros entram uma vez como despesa e na fatura; pagar a fatura não conta de novo", () => {
    const d = withPurchase();
    const r = addInvoiceAdjustment(d, "j1", { cardId: "c1", invoiceKey: "2025-02", type: "interest", amount: 2500, date: TODAY, categoryId: "fin", description: "Juros" }, NOW, TODAY);
    expect(computeInvoices(r.data, TODAY)[0].total).toBe(32500);
    const paid = payInvoice(r.data, "p2", { cardId: "c1", invoiceKey: "2025-02", amount: 32500, date: TODAY, accountId: "cc" }, NOW, TODAY);
    expect(periodSummary(paid.data, "2025-02-01", "2025-03-31").expense).toBe(32500);
    expect(spendingByCategory(paid.data, "2025-03-01", "2025-03-31")).toEqual([{ categoryId: "fin", amount: 2500 }]);
    expect(totalBalance(paid.data, TODAY)).toBe(467500);
  });
  it("juros depois de quitar reabrem a fatura", () => {
    let d = withPurchase();
    d = payInvoice(d, "pay-x", { cardId: "c1", invoiceKey: "2025-02", amount: 30000, date: TODAY, accountId: "cc" }, NOW, TODAY).data;
    d = addInvoiceAdjustment(d, "fee-x", { cardId: "c1", invoiceKey: "2025-02", type: "fee", amount: 900, date: TODAY, categoryId: "fin", description: "Tarifa" }, NOW, TODAY).data;
    const inv = computeInvoices(d, TODAY)[0];
    expect(inv.remaining).toBe(900);
    expect(inv.status).toBe("overdue");
  });
  it("reembolso reduz fatura, gasto e categoria", () => {
    const d = withPurchase();
    const r = addInvoiceAdjustment(d, "r1", { cardId: "c1", invoiceKey: "2025-02", type: "refund", amount: 4000, date: TODAY, categoryId: "food", description: "Reembolso loja" }, NOW, TODAY);
    expect(computeInvoices(r.data, TODAY)[0].total).toBe(26000);
    expect(periodSummary(r.data, "2025-02-01", "2025-03-31").expense).toBe(26000);
    expect(totalBalance(r.data, TODAY)).toBe(500000);
    const again = addInvoiceAdjustment(r.data, "r1", { cardId: "c1", invoiceKey: "2025-02", type: "refund", amount: 4000, date: TODAY, categoryId: "food", description: "Reembolso loja" }, NOW, TODAY);
    expect(computeInvoices(again.data, TODAY)[0].total).toBe(26000);
  });
});

describe("parcelas e cartões", () => {
  const withInstallments = () => {
    const d = base();
    return applyCreate(d, buildTransactions(cardInput({ date: "2025-03-05" }), 100001, "g", TODAY, NOW, d.cards[0]));
  };
  it("compra à vista no cartão e parcelada geram parcelas fixas em suas faturas", () => {
    const d = base();
    const txs = buildTransactions(cardInput({ installments: 3, date: "2025-03-05" }), 100001, "g", TODAY, NOW, d.cards[0]);
    expect(txs.map((t) => t.invoiceKey)).toEqual(["2025-03", "2025-04", "2025-05"]);
    expect(txs.reduce((s, t) => s + t.amount, 0)).toBe(100001);
  });
  it("antecipar move parcelas selecionadas para a fatura atual sem mudar o total", () => {
    const d = applyCreate(base(), buildTransactions(cardInput({ installments: 4, date: "2025-03-05" }), 100000, "g", TODAY, NOW, base().cards[0]));
    const before = computeInvoices(d, TODAY).reduce((s, i) => s + i.total, 0);
    const r = anticipateInstallments(d, "g", [3, 4], TODAY, NOW, TODAY);
    expect(r.error).toBeUndefined();
    const inv = computeInvoices(r.data, TODAY);
    expect(inv.reduce((s, i) => s + i.total, 0)).toBe(before);
    expect(inv.find((i) => i.key === "2025-04")!.total).toBe(25000 + 50000); // parcela 2 + parcelas 3 e 4 antecipadas (data 15/03 > fechamento 10)
    expect(r.data.transactions.filter((t) => t.status === "planned")).toHaveLength(1);
    expect(r.data.transactions.find((t) => t.installment?.index === 3)!.history?.at(-1)?.action).toBe("anticipated");
    expect(anticipateInstallments(r.data, "g", [3], TODAY, NOW, TODAY).error).toBe("errors.notPlanned");
    void withInstallments;
  });
  it("limite usado considera todas as parcelas futuras", () => {
    const d = applyCreate(base(), buildTransactions(cardInput({ installments: 3, date: "2025-03-05" }), 90000, "g", TODAY, NOW, base().cards[0]));
    expect(cardUsage(d.cards[0], computeInvoices(d, TODAY))).toEqual({ used: 90000, available: 210000 });
  });
  it("mudar fechamento do cartão não move compras já lançadas de fatura", () => {
    const d = { ...withPurchase(), transactions: withPurchase().transactions.map(({ invoiceKey: _k, ...t }) => (void _k, t)) };
    expect(computeInvoices(d, TODAY)[0].key).toBe("2025-02");
    const moved = updateCard(d, "c1", { name: "Cartão", issuer: "X", limit: 300000, closingDay: 1, dueDay: 8, payAccountId: "cc" });
    expect(computeInvoices(moved, TODAY)[0].key).toBe("2025-02");
    expect(invoiceTransactions(moved, "c1", "2025-02")).toHaveLength(1);
  });
  it("valida cartão e ações de fatura", () => {
    const d = base();
    const ok = { name: "Novo", issuer: "Banco", limitText: "2.000,00", closingDay: 5, dueDay: 12, payAccountId: "cc" };
    expect(validateCardInput(ok, d.accounts, d.cards).errors).toEqual({});
    expect(validateCardInput({ ...ok, closingDay: 32, dueDay: 0, name: "cartão" }, d.accounts, d.cards).errors).toMatchObject({ closingDay: "errors.dayInvalid", dueDay: "errors.dayInvalid", name: "errors.cardNameDuplicate" });
    const ctx = { today: TODAY, accounts: d.accounts, categories: d.categories, remaining: 1000 };
    expect(validateInvoiceAction({ type: "pay", amountText: "20,00", date: TODAY, accountId: "cc", description: "" }, ctx).errors.amount).toBe("errors.payExceeds");
    expect(validateInvoiceAction({ type: "interest", amountText: "5", date: TODAY, description: "Juros" }, ctx).errors.category).toBe("errors.categoryRequired");
    expect(createCard(d, "n", { name: "Novo", issuer: "B", limit: 1000, closingDay: 5, dueDay: 12, payAccountId: "cc" }).cards).toHaveLength(2);
  });
});

describe("recorrências", () => {
  const rec = { kind: "expense" as const, amount: 5000, description: "Assinatura", categoryId: "food", paymentMethod: "pix" as const, accountId: "cc", frequency: "monthly" as const, startDate: "2025-01-31" };
  it("respeita fim de mês e data final", () => {
    expect(occurrenceDates({ frequency: "monthly", startDate: "2025-01-31" }, "2025-05-31")).toEqual(["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30", "2025-05-31"]);
    expect(occurrenceDates({ frequency: "monthly", startDate: "2025-01-31", endDate: "2025-03-01" }, "2025-12-31")).toHaveLength(2);
    expect(occurrenceDates({ frequency: "weekly", startDate: "2025-03-01" }, "2025-03-22")).toHaveLength(4);
    expect(occurrenceDates({ frequency: "yearly", startDate: "2024-02-29" }, "2026-12-31")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });
  it("gera previstas, é idempotente e não altera o saldo real", () => {
    const d = createRecurrence(base(), "r1", rec, NOW, TODAY);
    const n = d.transactions.length;
    expect(n).toBeGreaterThan(12);
    expect(d.transactions.every((t) => t.status === "planned" && t.recurrenceId === "r1")).toBe(true);
    expect(totalBalance(d, TODAY)).toBe(500000);
    expect(materializeRecurrences(d, TODAY, NOW).transactions).toHaveLength(n);
    expect(createRecurrence(d, "r1", rec, NOW, TODAY).transactions).toHaveLength(n);
    expect(materializeRecurrences(d, "2025-09-15", NOW).transactions.length).toBeGreaterThan(n);
  });
  it("encerrar exclui só as futuras previstas, de forma recuperável", () => {
    const d = createRecurrence(base(), "r1", rec, NOW, TODAY);
    const r = endRecurrence(d, "r1", NOW, TODAY);
    const live = r.data.transactions.filter((t) => !t.deletedAt);
    expect(live.every((t) => t.date <= TODAY)).toBe(true);
    expect(r.data.recurrences[0].active).toBe(false);
    expect(materializeRecurrences(r.data, TODAY, NOW).transactions).toHaveLength(r.data.transactions.length);
  });
  it("assinatura no cartão vira compra realizada nas datas passadas", () => {
    const d = createRecurrence(base(), "r2", { ...rec, paymentMethod: "credit_card", accountId: undefined, cardId: "c1", startDate: "2025-02-20" }, NOW, TODAY);
    expect(d.transactions[0]).toMatchObject({ status: "realized", cardId: "c1", invoiceKey: "2025-03" });
    expect(d.transactions.find((t) => t.date > TODAY)!.status).toBe("planned");
  });
  it("valida recorrência", () => {
    const ctx = { today: TODAY, accounts: base().accounts, cards: base().cards, categories: base().categories };
    const input = { ...rec, amountText: "50,00", endDate: "" };
    expect(validateRecurrenceInput(input, ctx).errors).toEqual({});
    expect(validateRecurrenceInput({ ...input, startDate: "2023-01-01" }, ctx).errors.startDate).toBe("errors.recurrenceTooOld");
    expect(validateRecurrenceInput({ ...input, endDate: "2024-12-01" }, ctx).errors.endDate).toBe("errors.endBeforeStart");
  });
});

describe("orçamentos, metas e projeção", () => {
  it("orçamento separa realizado de previsto e sinaliza alerta", () => {
    let d = setBudget(base(), "food", 10000);
    d = applyCreate(d, buildTransactions({ kind: "expense", amountText: "1", description: "Mercado", date: "2025-03-02", status: "realized", categoryId: "food", paymentMethod: "pix", accountId: "cc", installments: 1 }, 8500, "a", TODAY, NOW));
    d = applyCreate(d, buildTransactions({ kind: "expense", amountText: "1", description: "Feira", date: "2025-03-25", status: "planned", categoryId: "food", paymentMethod: "pix", accountId: "cc", installments: 1 }, 3000, "b", TODAY, NOW));
    const [u] = budgetUsage(d, "2025-03-01", "2025-03-31");
    expect(u).toMatchObject({ spent: 8500, planned: 3000, level: "near" });
    expect(budgetUsage(setBudget(d, "food", 8000), "2025-03-01", "2025-03-31")[0].level).toBe("over");
    expect(removeBudget(d, "food").budgets).toHaveLength(0);
    expect(validateBudgetInput({ categoryId: "sal", limitText: "10" }, d.categories).errors.category).toBe("errors.categoryRequired");
  });
  it("metas: aporte idempotente, arquivar e restaurar", () => {
    let d = createGoal(base(), "g1", { name: "Viagem", target: 100000, saved: 10000, deadline: "2025-12-01" });
    d = addGoalContribution(d, "g1", "c1", 5000, TODAY).data;
    d = addGoalContribution(d, "g1", "c1", 5000, TODAY).data;
    expect(d.goals[0].saved).toBe(15000);
    expect(addGoalContribution(d, "g1", "c2", 0, TODAY).error).toBe("errors.amountPositive");
    expect(archiveGoal(d, "g1", NOW).goals[0].archivedAt).toBe(NOW);
    expect(restoreGoal(archiveGoal(d, "g1", NOW), "g1").goals[0].archivedAt).toBeUndefined();
    expect(validateGoalInput({ name: "", targetText: "0", savedText: "-1", deadline: "x" }, true).errors).toMatchObject({ name: "errors.goalNameRequired", target: "errors.amountPositive", saved: "errors.amountInvalid", deadline: "errors.dateInvalid" });
  });
  it("tabela de fluxo de caixa é coerente com a projeção", () => {
    const d = createRecurrence(base(), "r1", { kind: "income", amount: 100000, description: "Salário", categoryId: "sal", paymentMethod: "pix", accountId: "cc", frequency: "monthly", startDate: "2025-03-20" }, NOW, TODAY);
    const rows = cashflowTable(d, TODAY, "2025-03", 3);
    expect(rows[0].plannedIncome).toBe(100000);
    expect(rows[0].projected).toBe(projectedBalance(d, TODAY, "2025-03-31"));
    expect(rows[2].projected).toBe(500000 + 300000);
  });
});

describe("meta: quanto guardar por mês", () => {
  it("divide o que falta pelos meses restantes, arredondando para cima", async () => {
    const { goalMonthlyNeed } = await import("./finance");
    expect(goalMonthlyNeed({ target: 100000, saved: 10000, deadline: "2025-09-15" }, "2025-03-15")).toBe(15000);
    expect(goalMonthlyNeed({ target: 100001, saved: 0, deadline: "2025-05-15" }, "2025-03-15")).toBe(50001);
    expect(goalMonthlyNeed({ target: 100, saved: 100, deadline: "2025-09-15" }, "2025-03-15")).toBeNull();
    expect(goalMonthlyNeed({ target: 100, saved: 0, deadline: "2025-01-15" }, "2025-03-15")).toBeNull();
  });
});
