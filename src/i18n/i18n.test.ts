import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { t } from "./index";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !f.includes(".test.") ? [p] : [];
  });
}

describe("i18n", () => {
  it("toda chave t('...') usada no código existe no dicionário", () => {
    const missing: string[] = [];
    for (const file of files(path.resolve(__dirname, ".."))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) if (t(m[1]) === m[1]) missing.push(`${path.basename(file)}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it("todo código de erro 'errors.xxx' citado no domínio existe no dicionário", () => {
    const missing: string[] = [];
    for (const file of files(path.resolve(__dirname, "../domain"))) {
      for (const m of readFileSync(file, "utf8").matchAll(/"(errors\.\w+)"/g)) if (t(m[1]) === m[1]) missing.push(m[1]);
    }
    expect([...new Set(missing)]).toEqual([]);
  });
  it("famílias de chaves montadas dinamicamente existem", () => {
    const kinds = ["income", "expense", "transfer"];
    const keys = [
      ...["income", "expense", "transfer", "invoice_payment", "card_refund"].map((k) => `kind.${k}`),
      ...["interest", "fine", "fee", "refund"].flatMap((k) => [`invoiceAction.types.${k}`, `invoiceAction.defaultDescription.${k}`, `invoiceAction.toast.${k}`]),
      ...["monthly", "weekly", "yearly"].map((k) => `frequency.${k}`),
      ...["near", "over"].flatMap((k) => [`planning.level.${k}`, `planning.alert.budget.${k}`]),
      ...["realized", "planned"].map((k) => `status.${k}`),
      ...["pix", "debit", "cash", "boleto", "credit_card", "transfer", "other"].map((k) => `paymentMethod.${k}`),
      ...["created", "edited", "settled", "deleted", "restored", "reversed", "anticipated"].map((k) => `history.${k}`),
      ...["description", "notes", "categoryId", "date", "amount", "accountId", "toAccountId"].map((k) => `fields.${k}`),
      ...kinds.flatMap((k) => [`tx.statusFor.${k}.realized`, `tx.statusFor.${k}.planned`, `tx.toast.created.${k}`]),
      ...["delete", "settle", "reverse"].flatMap((k) => ["title", "body", "action"].map((f) => `tx.confirm.${k}.${f}`)),
      "tx.confirm.settle.date", "tx.confirm.reverse.date", "tx.settle.income", "tx.settle.other",
      ...["checking", "savings", "cash", "investment", "wallet"].map((k) => `accountType.${k}`),
      ...["open", "closed", "overdue", "paid"].map((k) => `invoiceStatus.${k}`),
      ...["cards", "installments", "upcoming", "budgets", "goals", "investments"].map((k) => `widgets.${k}.title`),
      ...["dashboard", "movimentacoes", "cartoes", "planejamento"].map((k) => `nav.${k}Short`),
      ...["date_desc", "date_asc", "amount_desc", "amount_asc"].map((k) => `statement.sorts.${k}`),
      ...["incomeExpense", "spending", "balance", "budgets", "commitments", "netWorth"].map((k) => `reports.tab.${k}`),
      ...["incomeExpense", "spending", "balance", "budgets", "commitments", "netWorth"].map((k) => `reports.note.${k}`),
      ...["ok", "near", "over"].map((k) => `reports.level.${k}`),
      ...["invoiceDue", "invoiceOverdue", "budgetNear", "budgetOver", "goalLate"].map((k) => `alerts.${k}`),
      ...["profile", "appearance", "currency", "categories", "notifications", "dashboard", "data", "accountsCards"].map((k) => `settings.nav.${k}`),
      ...["csv", "xlsx", "pdf"].map((k) => `reports.export.${k}`),
      ...["month", "prevMonth", "last3", "year", "all"].map((k) => `reports.filters.presets.${k}`),
    ];
    expect(keys.filter((k) => t(k) === k)).toEqual([]);
  });
  it("substitui variáveis", () => {
    expect(t("dashboard.greeting", { name: "Ana", period: "Boa noite" })).toBe("Olá, Ana. Boa noite!");
  });
});
