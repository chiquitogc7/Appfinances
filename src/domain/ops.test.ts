import { describe, expect, it } from "vitest";
import { computeInvoices, periodSummary, spendingByCategory, totalBalance, accountBalance } from "./finance";
import { filterTransactions, defaultFilters, displaySign } from "./filters";
import { applyCreate, buildTransactions, createAccount, createCategory, deleteTransaction, editTransaction, restoreTransaction, reverseTransaction, settleTransaction } from "./ops";
import { validateAccountInput, validateTxInput, type TxInput } from "./validation";
import type { AppData } from "./types";

const TODAY = "2025-03-15";
const NOW = "2025-03-15T12:00:00.000Z";

const base = (): AppData => ({
  isDemo: true,
  accounts: [
    { id: "cc", name: "Corrente", type: "checking", currency: "BRL", initialBalance: 100000, referenceDate: "2025-01-01" },
    { id: "pp", name: "Poupança", type: "savings", currency: "BRL", initialBalance: 0, referenceDate: "2025-01-01" },
  ],
  cards: [{ id: "c1", name: "Cartão", issuer: "X", limit: 500000, closingDay: 10, dueDay: 17, payAccountId: "cc" }],
  categories: [
    { id: "food", name: "Alimentação", kind: "expense", color: "#000" },
    { id: "sal", name: "Salário", kind: "income", color: "#000" },
  ],
  transactions: [], budgets: [], goals: [], investments: [], recurrences: [],
});
const ctx = (d: AppData) => ({ today: TODAY, accounts: d.accounts, cards: d.cards, categories: d.categories });
const expenseInput = (over: Partial<TxInput> = {}): TxInput => ({ kind: "expense", amountText: "50,00", description: "Mercado", date: "2025-03-10", status: "realized", categoryId: "food", paymentMethod: "pix", accountId: "cc", installments: 1, ...over });

describe("validação do formulário", () => {
  const d = base();
  const errs = (i: TxInput) => validateTxInput(i, ctx(d)).errors;
  it("aceita despesa válida", () => expect(errs(expenseInput())).toEqual({}));
  it("rejeita valores e textos inválidos", () => {
    expect(errs(expenseInput({ amountText: "abc" })).amount).toBe("errors.amountInvalid");
    expect(errs(expenseInput({ amountText: "0" })).amount).toBe("errors.amountPositive");
    expect(errs(expenseInput({ amountText: "-5" })).amount).toBe("errors.amountPositive");
    expect(errs(expenseInput({ description: "   " })).description).toBe("errors.descriptionRequired");
    expect(errs(expenseInput({ date: "2025-02-30" })).date).toBe("errors.dateInvalid");
  });
  it("rejeita combinações inconsistentes", () => {
    expect(errs(expenseInput({ date: "2025-04-01", status: "realized" })).date).toBe("errors.realizedFuture");
    expect(errs(expenseInput({ date: "2025-04-01", status: "planned" }))).toEqual({});
    expect(errs(expenseInput({ categoryId: "sal" })).category).toBe("errors.categoryInvalid");
    expect(errs(expenseInput({ installments: 3 })).installments).toBe("errors.installmentsNeedCard");
    expect(errs(expenseInput({ paymentMethod: "credit_card", cardId: undefined })).card).toBe("errors.cardRequired");
    expect(errs(expenseInput({ paymentMethod: "credit_card", cardId: "c1", installments: 0 })).installments).toBe("errors.installmentsInvalid");
    expect(errs({ kind: "income", amountText: "10", description: "x", date: TODAY, status: "realized", categoryId: "sal", paymentMethod: "credit_card", accountId: "cc" }).paymentMethod).toBe("errors.cardIncome");
    expect(errs({ kind: "transfer", amountText: "10", description: "x", date: TODAY, status: "realized", accountId: "cc", toAccountId: "cc" }).toAccount).toBe("errors.sameAccount");
  });
  it("valida conta", () => {
    expect(validateAccountInput({ name: "corrente", type: "checking", balanceText: "10", referenceDate: TODAY }, d.accounts).errors.name).toBe("errors.accountNameDuplicate");
    const ok = validateAccountInput({ name: "Nova", type: "cash", balanceText: "", referenceDate: TODAY }, d.accounts);
    expect(ok.errors).toEqual({});
    expect(ok.balance).toBe(0);
  });
});

describe("criação idempotente", () => {
  it("repetir a mesma operação (retry após falha) não duplica", () => {
    const d = base();
    const txs = buildTransactions(expenseInput(), 5000, "op-1", TODAY, NOW);
    const once = applyCreate(d, txs);
    const twice = applyCreate(once, buildTransactions(expenseInput(), 5000, "op-1", TODAY, NOW));
    expect(twice.transactions).toHaveLength(1);
    expect(totalBalance(twice, TODAY)).toBe(95000);
  });
  it("compra parcelada no cartão gera parcelas mensais que somam o total", () => {
    const input = expenseInput({ paymentMethod: "credit_card", cardId: "c1", accountId: undefined, installments: 3, amountText: "1.000,01", date: "2025-03-05" });
    const txs = buildTransactions(input, 100001, "op-2", TODAY, NOW);
    expect(txs.map((t) => t.date)).toEqual(["2025-03-05", "2025-04-05", "2025-05-05"]);
    expect(txs.map((t) => t.status)).toEqual(["realized", "planned", "planned"]);
    expect(txs.reduce((s, t) => s + t.amount, 0)).toBe(100001);
    expect(txs[2].amount).toBeGreaterThanOrEqual(txs[0].amount);
    const d = applyCreate(base(), txs);
    expect(totalBalance(d, TODAY)).toBe(100000); // cartão não mexe na conta
    expect(computeInvoices(d, TODAY).reduce((s, i) => s + i.total, 0)).toBe(100001);
  });
  it("transferência move dinheiro entre contas sem virar receita/despesa", () => {
    const t = buildTransactions({ kind: "transfer", amountText: "200", description: "Reserva", date: TODAY, status: "realized", accountId: "cc", toAccountId: "pp" }, 20000, "op-3", TODAY, NOW);
    const d = applyCreate(base(), t);
    expect(accountBalance(d.accounts[0], d.transactions, TODAY)).toBe(80000);
    expect(accountBalance(d.accounts[1], d.transactions, TODAY)).toBe(20000);
    expect(periodSummary(d, "2025-03-01", "2025-03-31")).toMatchObject({ income: 0, expense: 0 });
  });
});

describe("edição, liquidação, exclusão e estorno", () => {
  const withPlanned = () => applyCreate(base(), buildTransactions(expenseInput({ status: "planned", date: "2025-03-20" }), 5000, "p1", TODAY, NOW));
  const withRealized = () => applyCreate(base(), buildTransactions(expenseInput(), 5000, "r1", TODAY, NOW));

  it("previsto pode ser editado e registra histórico", () => {
    const r = editTransaction(withPlanned(), "p1:0", { amount: 7000, description: "Mercado 2" }, NOW);
    expect(r.error).toBeUndefined();
    const tx = r.data.transactions[0];
    expect(tx.amount).toBe(7000);
    expect(tx.history?.at(-1)).toEqual({ at: NOW, action: "edited", fields: ["amount", "description"] });
  });
  it("realizado só aceita descrição/categoria/observações", () => {
    expect(editTransaction(withRealized(), "r1:0", { amount: 1 }, NOW).error).toBe("errors.realizedLocked");
    expect(editTransaction(withRealized(), "r1:0", { description: "Novo nome" }, NOW).error).toBeUndefined();
  });
  it("liquidar previsto: só então altera o saldo real", () => {
    const d = withPlanned();
    expect(totalBalance(d, TODAY)).toBe(100000);
    const r = settleTransaction(d, "p1:0", TODAY, NOW, TODAY);
    expect(r.error).toBeUndefined();
    expect(totalBalance(r.data, TODAY)).toBe(95000);
    expect(settleTransaction(d, "p1:0", "2025-03-30", NOW, TODAY).error).toBe("errors.realizedFuture");
  });
  it("exclusão lógica é recuperável e só vale para previstas", () => {
    const del = deleteTransaction(withPlanned(), "p1:0", NOW);
    expect(del.data.transactions[0].deletedAt).toBe(NOW);
    expect(periodSummary(del.data, "2025-03-01", "2025-03-31").plannedExpense).toBe(0);
    const back = restoreTransaction(del.data, "p1:0", NOW);
    expect(back.data.transactions[0].deletedAt).toBeUndefined();
    expect(periodSummary(back.data, "2025-03-01", "2025-03-31").plannedExpense).toBe(5000);
    expect(deleteTransaction(withRealized(), "r1:0", NOW).error).toBe("errors.realizedUseReverse");
  });
  it("estorno devolve o saldo e some das despesas, sem duplicar", () => {
    const d = withRealized();
    expect(totalBalance(d, TODAY)).toBe(95000);
    const r = reverseTransaction(d, "r1:0", "rev-1", TODAY, NOW, TODAY);
    expect(r.error).toBeUndefined();
    expect(totalBalance(r.data, TODAY)).toBe(100000);
    expect(periodSummary(r.data, "2025-03-01", "2025-03-31").expense).toBe(0);
    expect(spendingByCategory(r.data, "2025-03-01", "2025-03-31")).toEqual([]);
    // retry com o mesmo operationId não cria segundo estorno
    expect(reverseTransaction(r.data, "r1:0", "rev-1", TODAY, NOW, TODAY).data.transactions).toHaveLength(2);
    // não dá para estornar duas vezes
    expect(reverseTransaction(r.data, "r1:0", "rev-2", TODAY, NOW, TODAY).error).toBe("errors.alreadyReversed");
    expect(displaySign(r.data.transactions[1])).toBe(1);
  });
  it("estorno de compra no cartão reduz a fatura", () => {
    const d = applyCreate(base(), buildTransactions(expenseInput({ paymentMethod: "credit_card", cardId: "c1", accountId: undefined }), 5000, "k1", TODAY, NOW));
    expect(computeInvoices(d, TODAY)[0].total).toBe(5000);
    const r = reverseTransaction(d, "k1:0", "k-rev", TODAY, NOW, TODAY);
    expect(computeInvoices(r.data, TODAY)[0].total).toBe(0);
  });
});

describe("contas, categorias e filtros", () => {
  it("cria conta e categoria sem duplicar", () => {
    const d = createAccount(base(), "a1", { name: "Carteira", type: "wallet", initialBalance: 1000, referenceDate: TODAY });
    expect(createAccount(d, "a1", { name: "Carteira", type: "wallet", initialBalance: 1000, referenceDate: TODAY }).accounts).toHaveLength(3);
    expect(totalBalance(d, TODAY)).toBe(101000);
    const c = createCategory(d, "cat1", "Pets premium", "expense");
    expect(c.category?.name).toBe("Pets premium");
    expect(createCategory(c.data, "cat2", "pets PREMIUM", "expense").error).toBe("errors.categoryDuplicate");
  });
  it("filtra por texto sem acento, valor, tipo e ordena", () => {
    let d = base();
    d = applyCreate(d, buildTransactions(expenseInput({ description: "Padaria São João", date: "2025-03-02" }), 3000, "a", TODAY, NOW));
    d = applyCreate(d, buildTransactions(expenseInput({ description: "Cinema", date: "2025-03-05" }), 9000, "b", TODAY, NOW));
    d = applyCreate(d, buildTransactions({ kind: "income", amountText: "1", description: "Salário", date: "2025-03-05", status: "realized", categoryId: "sal", paymentMethod: "pix", accountId: "cc" }, 500000, "c", TODAY, NOW));
    const f = defaultFilters(TODAY);
    expect(filterTransactions(d.transactions, { ...f, query: "sao joao" }).map((t) => t.description)).toEqual(["Padaria São João"]);
    expect(filterTransactions(d.transactions, { ...f, tab: "expense", min: "50" }).map((t) => t.description)).toEqual(["Cinema"]);
    expect(filterTransactions(d.transactions, { ...f, tab: "income" })).toHaveLength(1);
    expect(filterTransactions(d.transactions, { ...f, sort: "amount_asc" }).map((t) => t.amount)).toEqual([3000, 9000, 500000]);
  });
});
