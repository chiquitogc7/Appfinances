import { describe, expect, it } from "vitest";
import { addMonthsToKey, monthEnd, monthKey, monthStart } from "@/domain/dates";
import { commitments, computeInvoices, estimatedAvailable, periodSummary, projectedBalance, projectedCashflow, totalBalance } from "@/domain/finance";
import { buildDemoData } from "./demo";

const TODAY = "2026-10-25";

describe("dados de demonstração", () => {
  const data = buildDemoData(TODAY);
  const key = monthKey(TODAY);

  it("é identificado como fictício e determinístico", () => {
    expect(data.isDemo).toBe(true);
    expect(buildDemoData(TODAY)).toEqual(data);
  });

  it("não tem saldo negativo e indicadores são coerentes entre si", () => {
    const real = totalBalance(data, TODAY);
    expect(real).toBeGreaterThan(0);
    const c = commitments(data, TODAY, monthEnd(key));
    expect(estimatedAvailable(data, TODAY, monthEnd(key))).toBe(real - c.total);
    expect(projectedCashflow(data, TODAY, 6)[0].balance).toBe(projectedBalance(data, TODAY, TODAY));
  });

  it("pagamentos de fatura não entram nas despesas do período", () => {
    const start = monthStart(addMonthsToKey(key, -2));
    const end = monthEnd(key);
    const payments = data.transactions.filter((t) => t.kind === "invoice_payment");
    expect(payments.length).toBeGreaterThan(0);
    const expenses = data.transactions.filter((t) => t.kind === "expense" && t.status === "realized" && t.date >= start && t.date <= end).reduce((s, t) => s + t.amount, 0);
    expect(periodSummary(data, start, end).expense).toBe(expenses);
  });

  it("faturas vencidas estão quitadas", () => {
    for (const inv of computeInvoices(data, TODAY)) if (inv.due <= TODAY) expect(inv.remaining).toBe(0);
  });

  it("parcelas do parcelamento somam o valor original", () => {
    const sum = data.transactions.filter((t) => t.installment?.groupId === "grp_notebook").reduce((s, t) => s + t.amount, 0);
    expect(sum).toBe(419999);
  });
});
