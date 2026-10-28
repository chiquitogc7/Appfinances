/**
 * Repositório de nuvem: lógica independente do Firebase (o acesso real entra por `RemoteStore`).
 * Isso permite testar carregamento, diferenças, lotes, falhas e reenvio sem rede.
 */
import { validateAppData } from "@/domain/backup";
import { emptyAppData, withDefaultCategories } from "@/domain/categories";
import type { AppData } from "@/domain/types";
import type { FinanceRepository } from "./repository";
import { COLLECTIONS, computeChanges, fromDocs, toSnapshot, type CollectionName, type Delete, type Snapshot, type Write } from "./sync";

export interface RemoteStore {
  /** Lê todos os documentos de uma coleção do usuário. */
  list(collection: CollectionName): Promise<unknown[]>;
  /** O usuário já tem perfil gravado? (falso = conta nova) */
  hasProfile(): Promise<boolean>;
  /** Grava e apaga documentos de forma atômica (até `maxBatch` operações por chamada). */
  commit(writes: Write[], deletes: Delete[], withProfile: boolean): Promise<void>;
  readonly maxBatch: number;
}

export const SAVE_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

export function createCloudRepository(remote: RemoteStore, opts: { timeoutMs?: number } = {}): FinanceRepository {
  const timeoutMs = opts.timeoutMs ?? SAVE_TIMEOUT_MS;
  let snapshot: Snapshot | null = null;
  let profileWritten = false;
  let chain: Promise<void> = Promise.resolve();

  return {
    mode: "cloud",
    async load() {
      profileWritten = await remote.hasProfile();
      const docs = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await remote.list(c)] as const))) as Record<CollectionName, unknown[]>;
      const loaded = profileWritten ? withDefaultCategories(fromDocs(docs)) : emptyAppData();
      if (!validateAppData(loaded)) throw new Error("Dados na nuvem com formato inesperado");
      snapshot = toSnapshot(loaded);
      return loaded;
    },
    save(data: AppData) {
      // Um salvamento por vez, sempre com o dado mais recente recebido. Falhou? O snapshot não avança,
      // então a próxima tentativa reenvia tudo que mudou (gravações são idempotentes).
      const run = async () => {
        if (!snapshot) throw new Error("Repositório não carregado");
        const { writes, deletes, snapshot: next } = computeChanges(snapshot, data);
        if (writes.length === 0 && deletes.length === 0 && profileWritten) return;
        const ops = [...writes.map((w) => ({ w })), ...deletes.map((d) => ({ d }))];
        const size = Math.max(1, remote.maxBatch - 1); // sobra uma vaga para o perfil
        for (let i = 0; i < Math.max(ops.length, 1); i += size) {
          const slice = ops.slice(i, i + size);
          await withTimeout(
            remote.commit(
              slice.flatMap((o) => ("w" in o ? [o.w] : [])),
              slice.flatMap((o) => ("d" in o ? [o.d] : [])),
              !profileWritten,
            ),
            timeoutMs,
          );
          profileWritten = true;
        }
        snapshot = next;
      };
      const result = chain.then(run, run);
      chain = result.catch(() => undefined);
      return result;
    },
    reset() {
      throw new Error("Restaurar dados de demonstração só existe no modo local");
    },
  };
}
