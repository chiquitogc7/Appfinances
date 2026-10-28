import type { ISODate } from "@/domain/dates";

/** "2025-03-05" → "05/03" (ou "05/03/2025" com ano). */
export function formatDateBR(iso: ISODate, withYear = false): string {
  const [y, m, d] = iso.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function formatMonthLabel(key: string, style: "long" | "short" = "long"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: style === "long" ? "long" : "short",
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  });
}

/** "outubro de 2026" → "Outubro de 2026" (só a primeira letra, sem capitalizar "de"). */
export function formatMonthTitle(key: string, style: "long" | "short" = "long"): string {
  const s = formatMonthLabel(key, style);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
