/**
 * Dados FICTÍCIOS de demonstração. Gerados de forma determinística a partir da data de hoje,
 * para que o mês atual sempre tenha movimentações plausíveis. Nada aqui vem de banco ou corretora.
 */
import { addMonths, addMonthsToKey, monthKey, monthStart, parseISO, toISO, type ISODate } from "@/domain/dates";
import { computeInvoices } from "@/domain/finance";
import { splitInstallments } from "@/domain/money";
import { DEFAULT_CATEGORIES as CATEGORIES } from "@/domain/categories";
import type { AppData, Transaction, TxStatus } from "@/domain/types";

export function buildDemoData(today: ISODate): AppData {
  const curKey = monthKey(today);
  const startKey = addMonthsToKey(curKey, -3);
  const refDate = monthStart(startKey);

  let seq = 0;
  let rnd = 20240611;
  const rand = (min: number, max: number) => {
    rnd = (rnd * 1664525 + 1013904223) % 4294967296;
    return min + Math.floor((rnd / 4294967296) * (max - min + 1));
  };
  const statusOf = (date: ISODate): TxStatus => (date <= today ? "realized" : "planned");
  const txs: Transaction[] = [];
  const add = (t: Omit<Transaction, "id" | "status"> & { status?: TxStatus }) =>
    txs.push({ id: `tx_${++seq}`, status: t.status ?? statusOf(t.date), ...t });

  const accounts: AppData["accounts"] = [
    { id: "acc_cc", name: "Conta corrente (exemplo)", type: "checking", currency: "BRL", initialBalance: 320000, referenceDate: refDate },
    { id: "acc_pp", name: "Poupança (exemplo)", type: "savings", currency: "BRL", initialBalance: 800000, referenceDate: refDate },
    { id: "acc_cash", name: "Dinheiro (exemplo)", type: "cash", currency: "BRL", initialBalance: 25000, referenceDate: refDate },
    { id: "acc_wallet", name: "Carteira digital (exemplo)", type: "wallet", currency: "BRL", initialBalance: 90000, referenceDate: refDate },
  ];
  const cards: AppData["cards"] = [
    { id: "card_1", name: "Cartão Roxo (exemplo)", issuer: "Banco Exemplo", limit: 800000, closingDay: 25, dueDay: 5, payAccountId: "acc_cc" },
    { id: "card_2", name: "Cartão Laranja (exemplo)", issuer: "Banco Exemplo", limit: 450000, closingDay: 10, dueDay: 17, payAccountId: "acc_cc" },
  ];

  for (let i = -3; i <= 2; i++) {
    const key = addMonthsToKey(curKey, i);
    const [y, m] = key.split("-").map(Number);
    const day = (d: number) => toISO(y, m, d);

    add({ kind: "income", amount: 650000, date: day(5), description: "Salário (exemplo)", categoryId: "cat_salario", accountId: "acc_cc" });
    if (Math.abs(i) % 2 === 0) add({ kind: "income", amount: 120000, date: day(18), description: "Projeto freelance (exemplo)", categoryId: "cat_outras_receitas", accountId: "acc_cc" });
    add({ kind: "transfer", amount: 50000, date: day(6), description: "Reserva mensal", accountId: "acc_cc", toAccountId: "acc_pp" });
    add({ kind: "expense", amount: 145000, date: day(10), description: "Aluguel", categoryId: "cat_moradia", accountId: "acc_cc" });
    add({ kind: "expense", amount: 9990, date: day(12), description: "Internet", categoryId: "cat_moradia", accountId: "acc_cc" });
    add({ kind: "expense", amount: 15000 + rand(0, 6000), date: day(14), description: "Energia elétrica", categoryId: "cat_moradia", accountId: "acc_cc" });
    add({ kind: "expense", amount: 38000, date: day(27), description: "Condomínio", categoryId: "cat_moradia", accountId: "acc_cc" });
    add({ kind: "expense", amount: 42000, date: day(30), description: "Plano de saúde", categoryId: "cat_saude", accountId: "acc_cc" });
    add({ kind: "expense", amount: 14000, date: day(15), description: "Ração e petshop", categoryId: "cat_pets", accountId: "acc_cc" });
    add({ kind: "expense", amount: 3990, date: day(8), description: "Streaming de vídeo", categoryId: "cat_assinaturas", cardId: "card_1" });
    add({ kind: "expense", amount: 2990, date: day(20), description: "Software de produtividade", categoryId: "cat_assinaturas", cardId: "card_1" });
    add({ kind: "expense", amount: 19900, date: day(2), description: "Curso online", categoryId: "cat_educacao", cardId: "card_1" });

    if (i <= 0) {
      for (let k = 0; k < 4; k++) {
        const date = day(3 + k * 7);
        if (date <= today) add({ kind: "expense", amount: rand(18000, 42000), date, description: "Supermercado", categoryId: "cat_alimentacao", accountId: "acc_cc" });
      }
      for (let k = 0; k < 3; k++) {
        const date = day(4 + k * 9);
        if (date <= today) add({ kind: "expense", amount: rand(4500, 12000), date, description: "Restaurante", categoryId: "cat_alimentacao", cardId: "card_1" });
      }
      for (let k = 0; k < 3; k++) {
        const date = day(6 + k * 8);
        if (date <= today) add({ kind: "expense", amount: rand(1800, 5500), date, description: "App de transporte", categoryId: "cat_transporte", accountId: "acc_wallet" });
      }
      if (day(21) <= today) add({ kind: "expense", amount: rand(6000, 18000), date: day(21), description: "Cinema e passeio", categoryId: "cat_lazer", cardId: "card_2" });
      if (i % 2 === 0 && day(9) <= today) add({ kind: "expense", amount: 8900, date: day(9), description: "Farmácia", categoryId: "cat_saude", accountId: "acc_cc" });
    }
  }

  // Compras parceladas no cartão: cada parcela é um gasto mensal; a última absorve os centavos.
  const installments = [
    { groupId: "grp_notebook", description: "Notebook (exemplo)", total: 419999, n: 10, start: toISO(parseISO(refDate).y, parseISO(refDate).m, 8), cardId: "card_1", categoryId: "cat_compras" },
    { groupId: "grp_geladeira", description: "Geladeira (exemplo)", total: 270000, n: 6, start: addMonths(toISO(parseISO(today).y, parseISO(today).m, 12), -1), cardId: "card_2", categoryId: "cat_moradia" },
  ];
  for (const p of installments) {
    splitInstallments(p.total, p.n).forEach((amount, idx) => {
      const date = addMonths(p.start, idx);
      add({ kind: "expense", amount, date, description: p.description, categoryId: p.categoryId, cardId: p.cardId, installment: { groupId: p.groupId, index: idx + 1, total: p.n } });
    });
  }

  const base: AppData = {
    isDemo: true,
    accounts,
    cards,
    categories: CATEGORIES,
    transactions: txs,
    budgets: [
      { categoryId: "cat_alimentacao", monthlyLimit: 150000 },
      { categoryId: "cat_transporte", monthlyLimit: 35000 },
      { categoryId: "cat_lazer", monthlyLimit: 40000 },
      { categoryId: "cat_assinaturas", monthlyLimit: 15000 },
      { categoryId: "cat_pets", monthlyLimit: 20000 },
    ],
    goals: [
      { id: "goal_reserva", name: "Reserva de emergência", target: 2000000, saved: 800000, deadline: addMonths(today, 10) },
      { id: "goal_viagem", name: "Viagem de fim de ano", target: 500000, saved: 120000, deadline: addMonths(today, -1) },
    ],
    recurrences: [],
    investments: [
      { id: "inv_1", name: "Renda fixa pós-fixada (exemplo)", category: "Renda fixa", applied: 500000, current: 531200, referenceDate: today },
      { id: "inv_2", name: "CDB (exemplo)", category: "Renda fixa", applied: 300000, current: 312500, referenceDate: today },
      { id: "inv_3", name: "Ações (exemplo)", category: "Renda variável", applied: 150000, current: 141000, referenceDate: today },
      { id: "inv_4", name: "Fundo imobiliário (exemplo)", category: "Fundos", applied: 100000, current: 104000, referenceDate: today },
    ],
  };

  // Faturas já vencidas aparecem pagas: o pagamento sai da conta, mas NÃO vira nova despesa.
  for (const inv of computeInvoices(base, today)) {
    if (inv.due <= today && inv.remaining > 0) {
      const card = cards.find((c) => c.id === inv.cardId)!;
      add({ kind: "invoice_payment", amount: inv.remaining, date: inv.due, status: "realized", description: `Pagamento de fatura — ${card.name}`, accountId: card.payAccountId, cardId: card.id, invoiceKey: inv.key });
    }
  }
  return base;
}
