import type { ISODate } from "@/domain/dates";
import type { AppData } from "@/domain/types";
import { validateAppData } from "@/domain/backup";
import { buildDemoData } from "./demo";

/**
 * Fronteira de acesso a dados. A UI só conhece esta interface.
 * Hoje: persistência LOCAL (localStorage do navegador), sobre os dados de demonstração.
 * Próximo passo: implementação com Cloud Firestore atrás da mesma interface, depois de existir login real.
 */
export interface FinanceRepository {
  readonly mode: "local" | "cloud";
  load(today: ISODate): Promise<AppData>;
  /** Lança erro (ou rejeita) se não conseguir gravar: armazenamento cheio, sem rede, sem permissão. */
  save(data: AppData): void | Promise<void>;
  /** Descarta tudo e volta aos dados de demonstração. */
  reset(today: ISODate): AppData;
}

const KEY = "appfinances:data:v2";
const VERSION = 2;

/** Dados salvos antes da Etapa 3 não têm `recurrences`: completa campos novos sem perder nada. */
function normalize(d: AppData): AppData {
  return { ...d, recurrences: Array.isArray(d.recurrences) ? d.recurrences : [] };
}

const isAppData = validateAppData;

export const localRepository: FinanceRepository = {
  mode: "local",
  async load(today) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number; data?: unknown };
        if (parsed.version === VERSION && isAppData(parsed.data)) return normalize(parsed.data);
      }
    } catch {
      /* dados corrompidos ou armazenamento indisponível: recomeça da demonstração */
    }
    return buildDemoData(today);
  },
  save(data) {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, data }));
  },
  reset(today) {
    const fresh = buildDemoData(today);
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, data: fresh }));
    return fresh;
  },
};

