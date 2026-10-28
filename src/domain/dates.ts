/** Datas são strings ISO "YYYY-MM-DD" (sem fuso), evitando erros de timezone. */
export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Monta uma data ISO ajustando o dia ao último dia do mês quando necessário. */
export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
}

export function parseISO(s: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** "YYYY-MM" */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function addMonthsToKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Soma meses preservando o dia quando possível (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(iso: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const [ny, nm] = addMonthsToKey(`${y}-${pad(m)}`, n).split("-").map(Number);
  return toISO(ny, nm, d);
}

export function monthStart(key: string): ISODate {
  return `${key}-01`;
}

export function monthEnd(key: string): ISODate {
  const [y, m] = key.split("-").map(Number);
  return toISO(y, m, daysInMonth(y, m));
}

export function addDays(iso: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseISO(s);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}
