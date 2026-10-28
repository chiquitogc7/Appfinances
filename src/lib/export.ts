/**
 * Exportação de relatórios. CSV está implementado; PDF e XLSX têm lugar na estrutura
 * (mesma interface `Exporter`), mas ainda não existem.
 */
import { formatMoneyInput } from "@/domain/money";
import type { Cell, ReportTable } from "@/domain/reports";
import { formatDateBR } from "./format";

export interface ExportLabels {
  /** Traduz chaves i18n usadas em rótulos e células. */
  t: (key: string) => string;
}

export interface Exporter {
  id: "csv" | "xlsx" | "pdf";
  available: boolean;
  extension: string;
  mime: string;
  run?: (tables: ReportTable[], labels: ExportLabels) => string;
}

const SEP = ";"; // Excel em português usa ponto e vírgula

/** Evita injeção de fórmula em planilhas: texto que começa com = + - @ vira texto literal. */
function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function escapeCell(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function cellText(v: Cell, type: ReportTable["columns"][number]["type"], l: ExportLabels): string {
  if (v === null || v === undefined || v === "") return "";
  switch (type) {
    case "money": return formatMoneyInput(v as number);
    case "percent": return (Math.round((v as number) * 1000) / 10).toFixed(1).replace(".", ",");
    case "date": return formatDateBR(String(v), true);
    case "month": return String(v).startsWith("reports.") ? l.t(String(v)) : String(v);
    case "int": return String(v).startsWith("reports.") ? l.t(String(v)) : String(v);
    case "i18n": return safeText(l.t(String(v)));
    case "text": {
      const s = String(v);
      return safeText(s.startsWith("reports.") ? l.t(s) : s);
    }
  }
}

export function toCSV(tables: ReportTable[], l: ExportLabels): string {
  const lines: string[] = [];
  tables.forEach((table, i) => {
    if (i > 0) lines.push("");
    if (tables.length > 1) lines.push(escapeCell(safeText(l.t(table.titleKey))));
    lines.push(table.columns.map((c) => escapeCell(safeText(l.t(c.labelKey)))).join(SEP));
    const all = table.footer ? [...table.rows, table.footer] : table.rows;
    for (const row of all) lines.push(table.columns.map((c) => escapeCell(cellText(row[c.key] ?? null, c.type, l))).join(SEP));
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export const EXPORTERS: Exporter[] = [
  { id: "csv", available: true, extension: "csv", mime: "text/csv;charset=utf-8", run: toCSV },
  { id: "xlsx", available: false, extension: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { id: "pdf", available: false, extension: "pdf", mime: "application/pdf" },
];

/** Baixa um texto como arquivo (somente no navegador). */
export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
