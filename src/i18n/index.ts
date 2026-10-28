import { ptBR } from "./pt-BR";

type Dict = { [k: string]: string | Dict };

/** Busca um texto por caminho ("nav.dashboard") e substitui {variáveis}. Novos idiomas: adicione outro arquivo e escolha aqui. */
export function t(path: string, vars?: Record<string, string | number>): string {
  let cur: string | Dict | undefined = ptBR;
  for (const part of path.split(".")) {
    if (typeof cur !== "object" || cur === undefined) return path;
    cur = cur[part];
  }
  if (typeof cur !== "string") return path;
  return vars ? cur.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : cur;
}
