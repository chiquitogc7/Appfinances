import { describe, expect, it } from "vitest";
import { buildDemoData } from "@/data/demo";
import { toCSV } from "@/lib/export";
import { t } from "@/i18n";
import { buildAlerts, DEFAULT_NOTIFICATIONS } from "./alerts";
import { exportBackup, parseBackup, validateAppData } from "./backup";
import { computeInvoices, netWorth, periodSummary, spendingByCategory, totalBalance } from "./finance";
import { archiveInvestment, applyCreate, buildTransactions, createCategory, createInvestment, deleteCategory, renameCategory, restoreInvestment, reverseTransaction, updateInvestment } from "./ops";
import { balanceDaily, balanceReport, budgetReport, buildReport, commitmentsReport, incomeExpenseReport, matchesSource, netWorthReport, REPORT_IDS, spendingReport, type ReportFilters } from "./reports";
import { validateInvestmentInput } from "./validation";
import type { AppData } from "./types";

const TODAY = "2026-10-25";
const NOW = "2026-10-25T12:00:00.000Z";
const demo = () => buildDemoData(TODAY);
const F: ReportFilters = { from: "2026-08-01", to: "2026-10-31", source: "", categoryId: "" };

describe("relatórios batem com as regras centrais", () => {
  it("receitas e despesas por mês somam o mesmo que periodSummary", () => {
    const d = demo();
    const r = incomeExpenseReport(d, F, TODAY);
    expect(r.rows).toHaveLength(3);
    const whole = periodSummary(d, F.from, F.to);
    expect(r.footer).toMatchObject({ income: whole.income, expense: whole.expense, plannedIncome: whole.plannedIncome, plannedExpense: whole.plannedExpense, net: whole.net });
  });
  it("gastos por categoria batem com spendingByCategory e excluem transferências e pagamentos de fatura", () => {
    const d = demo();
    const rep = spendingReport(d, F);
    const direct = spendingByCategory(d, F.from, F.to);
    expect(rep.rows.reduce((s, r) => s + (r.amount as number), 0)).toBe(direct.reduce((s, r) => s + r.amount, 0));
    expect(rep.footer?.share).toBe(1);
  });
  it("estorno não aparece nos relatórios de gasto", () => {
    let d = demo();
    d = applyCreate(d, buildTransactions({ kind: "expense", amountText: "1", description: "Erro", date: TODAY, status: "realized", categoryId: "cat_pets", paymentMethod: "pix", accountId: "acc_cc", installments: 1 }, 77700, "x", TODAY, NOW));
    const before = spendingReport(demo(), F).footer?.amount as number;
    expect(spendingReport(d, F).footer?.amount).toBe(before + 77700);
    d = reverseTransaction(d, "x:0", "xr", TODAY, NOW, TODAY).data;
    expect(spendingReport(d, F).footer?.amount).toBe(before);
  });
  it("filtro por cartão e por conta considera só aquela origem", () => {
    const d = demo();
    const card = spendingReport(d, { ...F, source: "card:card_2" });
    const direct = d.transactions.filter((x) => x.cardId === "card_2" && x.kind === "expense" && x.status === "realized" && x.date >= F.from && x.date <= F.to).reduce((s, x) => s + x.amount, 0);
    expect(card.footer?.amount).toBe(direct);
    expect(matchesSource({ id: "1", kind: "transfer", amount: 1, date: TODAY, status: "realized", description: "", accountId: "a", toAccountId: "b" }, "acc:b")).toBe(true);
    expect(matchesSource({ id: "1", kind: "income", amount: 1, date: TODAY, status: "realized", description: "", accountId: "a" }, "card:c")).toBe(false);
  });
  it("saldo mensal e diário terminam no saldo real de hoje", () => {
    const d = demo();
    const monthly = balanceReport(d, F, TODAY).rows;
    expect(monthly.at(-1)?.balance).toBe(totalBalance(d, TODAY));
    expect(balanceDaily(d, F, TODAY).at(-1)?.balance).toBe(totalBalance(d, TODAY));
    const acc = balanceReport(d, { ...F, source: "acc:acc_pp" }, TODAY).rows.at(-1)?.balance;
    expect(acc).toBeLessThan(totalBalance(d, TODAY));
  });
  it("orçamentos e compromissos", () => {
    const d = demo();
    const b = budgetReport(d, F, TODAY);
    expect(b.rows.length).toBe(d.budgets.length);
    expect(b.rows.find((r) => r.category === "Alimentação")?.level).toBe("reports.level.over");
    const [plans, invoices] = commitmentsReport(d, F, TODAY);
    expect(plans.rows.length).toBe(2);
    const open = computeInvoices(d, TODAY).filter((i) => i.remaining > 0).reduce((s, i) => s + i.remaining, 0);
    expect(invoices.footer?.remaining).toBe(open);
  });
  it("todos os relatórios geram tabelas com chaves de tradução existentes", () => {
    const d = demo();
    const missing: string[] = [];
    for (const id of REPORT_IDS) {
      for (const table of buildReport(id, d, F, TODAY)) {
        for (const k of [table.titleKey, ...table.columns.map((c) => c.labelKey)]) if (t(k) === k) missing.push(k);
        for (const row of [...table.rows, ...(table.footer ? [table.footer] : [])])
          for (const c of table.columns) {
            const v = row[c.key];
            if ((c.type === "i18n" || (typeof v === "string" && v.startsWith("reports."))) && typeof v === "string" && t(v) === v) missing.push(v);
          }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe("patrimônio", () => {
  it("soma contas e investimentos e desconta só faturas fechadas ou vencidas", () => {
    const d = demo();
    const nw = netWorth(d, TODAY);
    const closed = computeInvoices(d, TODAY).filter((i) => i.status === "closed" || i.status === "overdue").reduce((s, i) => s + i.remaining, 0);
    expect(nw.liabilities).toBe(closed);
    expect(nw.total).toBe(totalBalance(d, TODAY) + nw.investmentsTotal - closed);
    const rep = netWorthReport(d, TODAY);
    expect(rep[0].footer?.value).toBe(nw.total);
  });
  it("investimentos: criar é idempotente, atualizar guarda histórico, arquivar tira do total", () => {
    let d = createInvestment(demo(), "i9", { name: "Tesouro", category: "Renda fixa", applied: 100000, current: 100000, referenceDate: TODAY });
    d = createInvestment(d, "i9", { name: "Tesouro", category: "Renda fixa", applied: 1, current: 1, referenceDate: TODAY });
    expect(d.investments.filter((i) => i.id === "i9")).toHaveLength(1);
    const before = netWorth(d, TODAY).investmentsTotal;
    d = updateInvestment(d, "i9", { name: "Tesouro", category: "Renda fixa", applied: 100000, current: 104000, referenceDate: TODAY, notes: "ok" });
    expect(d.investments.find((i) => i.id === "i9")?.updates).toHaveLength(2);
    expect(netWorth(d, TODAY).investmentsTotal).toBe(before + 4000);
    d = archiveInvestment(d, "i9", NOW);
    expect(netWorth(d, TODAY).investmentsTotal).toBe(before - 100000);
    expect(netWorth(restoreInvestment(d, "i9"), TODAY).investmentsTotal).toBe(before + 4000);
  });
  it("valida investimento", () => {
    const ok = validateInvestmentInput({ name: "CDB", category: "Renda fixa", appliedText: "1.000,00", currentText: "1.050,00", referenceDate: TODAY, notes: "" }, TODAY);
    expect(ok.errors).toEqual({});
    expect(ok.current).toBe(105000);
    const bad = validateInvestmentInput({ name: "", category: "", appliedText: "-1", currentText: "x", referenceDate: "2027-01-01", notes: "" }, TODAY).errors;
    expect(bad).toMatchObject({ name: "errors.assetNameRequired", category: "errors.categoryRequired", applied: "errors.amountNegative", current: "errors.amountInvalid", referenceDate: "errors.dateFuture" });
  });
});

describe("exportação CSV", () => {
  const l = { t };
  it("usa BOM, ponto e vírgula, vírgula decimal e total", () => {
    const csv = toCSV([incomeExpenseReport(demo(), F, TODAY)], l);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Mês;Receitas realizadas;Receitas previstas;Despesas realizadas;Despesas previstas;Resultado realizado");
    expect(lines.at(-1)).toMatch(/^Total;\d+,\d{2};/);
    expect(lines).toHaveLength(1 + 3 + 1);
  });
  it("protege contra injeção de fórmula e escapa aspas e quebras de linha", () => {
    const csv = toCSV([{ id: "x", titleKey: "reports.total", columns: [{ key: "a", labelKey: "reports.col.description", type: "text" }, { key: "b", labelKey: "reports.col.amount", type: "money" }], rows: [{ a: '=HYPERLINK("http://x")', b: -1250 }, { a: 'Linha "um"\ndois; três', b: 5 }, { a: "+55 11", b: 0 }] }], l);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain('"\'=HYPERLINK(""http://x"")";-12,50');
    expect(csv).toContain('"Linha ""um""\ndois; três";0,05');
    expect(csv).toContain("'+55 11;0,00");
  });
});

describe("avisos, categorias e backup", () => {
  it("avisos de fatura, orçamento e meta seguem as preferências", () => {
    const d = demo();
    const all = buildAlerts(d, TODAY, DEFAULT_NOTIFICATIONS);
    expect(all.some((a) => a.type === "budgetOver" && a.name === "Alimentação")).toBe(true);
    expect(all.some((a) => a.type === "goalLate")).toBe(true);
    expect(buildAlerts(d, TODAY, { ...DEFAULT_NOTIFICATIONS, daysBefore: 15 }).some((a) => a.type === "invoiceDue" && a.name.startsWith("Cartão Roxo"))).toBe(true);
    expect(buildAlerts(d, TODAY, { ...DEFAULT_NOTIFICATIONS, invoiceDue: false, budgetLimit: false, goalLate: false })).toEqual([]);
    expect(buildAlerts(d, TODAY, { ...DEFAULT_NOTIFICATIONS, daysBefore: 0 }).some((a) => a.type === "invoiceDue")).toBe(false);
  });
  it("categorias: personalizadas podem ser renomeadas/removidas sem uso; padrão e em uso não", () => {
    let d = demo();
    const c = createCategory(d, "c1", "Presentes", "expense");
    d = c.data;
    expect(d.categories.find((x) => x.id === "c1")?.custom).toBe(true);
    expect(renameCategory(d, "c1", "alimentação").error).toBe("errors.categoryDuplicate");
    expect(renameCategory(d, "c1", "Presentes e festas").data.categories.find((x) => x.id === "c1")?.name).toBe("Presentes e festas");
    expect(deleteCategory(d, "cat_moradia").error).toBe("errors.categoryDefault");
    d = applyCreate(d, buildTransactions({ kind: "expense", amountText: "1", description: "Presente", date: TODAY, status: "realized", categoryId: "c1", paymentMethod: "pix", accountId: "acc_cc", installments: 1 }, 1000, "g", TODAY, NOW));
    expect(deleteCategory(d, "c1").error).toBe("errors.categoryInUse");
    expect(deleteCategory(createCategory(demo(), "c2", "Vazia", "income").data, "c2").data.categories.some((x) => x.id === "c2")).toBe(false);
  });
  it("backup: ida e volta preserva tudo; recusa lixo, versão errada e ids duplicados", () => {
    const d = demo();
    expect(validateAppData(d)).toBe(true);
    const back = parseBackup(exportBackup(d, NOW));
    expect(back.error).toBeUndefined();
    expect(back.data).toEqual(d);
    expect(parseBackup("não é json").error).toBe("errors.backupInvalid");
    expect(parseBackup(JSON.stringify({ app: "outro", version: 2, data: d })).error).toBe("errors.backupInvalid");
    expect(parseBackup(JSON.stringify({ app: "appfinances", version: 1, data: d })).error).toBe("errors.backupVersion");
    const dup: AppData = { ...d, transactions: [d.transactions[0], d.transactions[0]] };
    expect(parseBackup(exportBackup(dup, NOW)).error).toBe("errors.backupInvalid");
    const bad = { ...d, transactions: [{ ...d.transactions[0], amount: 1.5 }] } as AppData;
    expect(validateAppData(bad)).toBe(false);
  });
});
