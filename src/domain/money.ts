/**
 * Todo valor monetário é um inteiro em centavos. Nunca use float para somar dinheiro.
 */
export type Cents = number;

/**
 * Converte texto digitado ("1.234,56", "10", "0,5") em centavos, sem float.
 * Retorna null se o texto não for um valor válido.
 */
export function parseMoneyInput(input: string): Cents | null {
  let s = input.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;

  let intPart: string;
  let fracPart = "";
  if (s.includes(",")) {
    const parts = s.split(",");
    if (parts.length !== 2) return null;
    intPart = parts[0].replace(/\./g, "");
    fracPart = parts[1];
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [intPart, fracPart] = s.split(".");
  } else {
    intPart = s.replace(/\./g, "");
  }
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(fracPart) || (!intPart && !fracPart)) return null;
  const cents = Number(intPart || "0") * 100 + Number(fracPart.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Apenas para exibição. */
export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100);
}

export function formatBRLCompact(cents: Cents): string {
  return brlCompact.format(cents / 100);
}

/**
 * Divide um total em n parcelas. A última parcela absorve a diferença de centavos,
 * de modo que a soma é sempre exatamente o total.
 */
export function splitInstallments(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Número de parcelas inválido");
  const base = Math.floor(total / n);
  const parts = Array<Cents>(n).fill(base);
  parts[n - 1] = total - base * (n - 1);
  return parts;
}

/** Centavos → texto editável ("1234,56"), sem float. */
export function formatMoneyInput(cents: Cents): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
