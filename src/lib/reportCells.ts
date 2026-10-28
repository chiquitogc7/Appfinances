import { formatBRL } from "@/domain/money";
import type { Cell, ColumnType } from "@/domain/reports";
import { formatDateBR, formatMonthTitle } from "./format";

/** Texto exibido na tabela de relatório (a exportação CSV usa formatos próprios, em lib/export.ts). */
export function displayCell(v: Cell, type: ColumnType, t: (key: string) => string): string {
  if (v === null || v === undefined || v === "") return "—";
  const text = typeof v === "string" && v.startsWith("reports.") ? t(v) : null;
  if (text !== null) return text;
  switch (type) {
    case "money": return formatBRL(v as number);
    case "percent": return `${(Math.round((v as number) * 1000) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    case "date": return formatDateBR(String(v), true);
    case "month": return formatMonthTitle(String(v), "short");
    case "i18n": return t(String(v));
    default: return String(v);
  }
}
