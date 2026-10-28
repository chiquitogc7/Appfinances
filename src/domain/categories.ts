import type { AppData, Category } from "./types";

/** Categorias iniciais: sempre disponíveis, nunca removidas. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat_moradia", name: "Moradia", kind: "expense", color: "#6334C4" },
  { id: "cat_alimentacao", name: "Alimentação", kind: "expense", color: "#E86314" },
  { id: "cat_transporte", name: "Transporte", kind: "expense", color: "#8B5CF6" },
  { id: "cat_saude", name: "Saúde", kind: "expense", color: "#F59E0B" },
  { id: "cat_educacao", name: "Educação", kind: "expense", color: "#4C1D95" },
  { id: "cat_lazer", name: "Lazer", kind: "expense", color: "#C2410C" },
  { id: "cat_assinaturas", name: "Assinaturas", kind: "expense", color: "#A78BFA" },
  { id: "cat_compras", name: "Compras", kind: "expense", color: "#FB923C" },
  { id: "cat_impostos", name: "Impostos e serviços financeiros", kind: "expense", color: "#7C3AED" },
  { id: "cat_pets", name: "Pets", kind: "expense", color: "#9A3412" },
  { id: "cat_viagens", name: "Viagens", kind: "expense", color: "#C4B5FD" },
  { id: "cat_salario", name: "Salário", kind: "income", color: "#16805A" },
  { id: "cat_outras_receitas", name: "Outras receitas", kind: "income", color: "#16805A" },
];

/** Dados vazios para uma conta nova de verdade (sem nenhum dado fictício). */
export function emptyAppData(): AppData {
  return { isDemo: false, accounts: [], cards: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), transactions: [], budgets: [], goals: [], investments: [], recurrences: [] };
}

/** Garante que as categorias iniciais existam (os dados na nuvem guardam só o que mudou). */
export function withDefaultCategories(data: AppData): AppData {
  const have = new Set(data.categories.map((c) => c.id));
  const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.id));
  return missing.length === 0 ? data : { ...data, categories: [...missing.map((c) => ({ ...c })), ...data.categories] };
}
