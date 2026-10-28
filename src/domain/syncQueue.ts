/**
 * Base para sincronização offline: fila de operações com reenvio e política de conflitos.
 *
 * ATENÇÃO: este módulo é só a base (puro e testado). Ele ainda NÃO está ligado ao app:
 * o modo offline completo não está pronto nem testado em campo.
 *
 * Princípios:
 *  - Cada operação tem um id estável (operationId). Enfileirar o mesmo id duas vezes não duplica.
 *  - Falhas voltam à fila com espera crescente (backoff exponencial, com teto).
 *  - Conflito comum: vale a última alteração (updatedAt). Conflito em dado financeiro crítico
 *    (movimentação realizada, pagamento de fatura, estorno) nunca é resolvido sozinho.
 */
export interface QueuedOp {
  id: string;
  kind: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  /** Só tenta de novo a partir deste instante (ISO). */
  nextAttemptAt: string;
  lastError?: string;
  /** Depois de MAX_ATTEMPTS a operação para e pede atenção do usuário. */
  failedAt?: string;
}

export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

export function backoffDelayMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
}

export function enqueue(queue: QueuedOp[], op: { id: string; kind: string; payload: unknown }, now: string): QueuedOp[] {
  if (queue.some((q) => q.id === op.id)) return queue;
  return [...queue, { ...op, createdAt: now, attempts: 0, nextAttemptAt: now }];
}

/** Próxima operação pronta, na ordem em que foram criadas. */
export function nextReady(queue: QueuedOp[], now: string): QueuedOp | undefined {
  return queue.filter((q) => !q.failedAt && q.nextAttemptAt <= now).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
}

export function markSuccess(queue: QueuedOp[], id: string): QueuedOp[] {
  return queue.filter((q) => q.id !== id);
}

export function markFailure(queue: QueuedOp[], id: string, now: string, error: string): QueuedOp[] {
  return queue.map((q) => {
    if (q.id !== id) return q;
    const attempts = q.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) return { ...q, attempts, lastError: error, failedAt: now };
    return { ...q, attempts, lastError: error, nextAttemptAt: new Date(new Date(now).getTime() + backoffDelayMs(attempts)).toISOString() };
  });
}

export function needsAttention(queue: QueuedOp[]): QueuedOp[] {
  return queue.filter((q) => q.failedAt);
}

export interface Versioned {
  updatedAt: string;
}

export type Resolution = "local" | "remote" | "manual";

/**
 * `base` é a versão que o dispositivo conhecia quando começou a editar (null se o item é novo).
 * Só há conflito se os dois lados mudaram em relação à base.
 */
/** Conteúdo sem o carimbo de tempo: só tocar no item (mudar updatedAt) não é uma alteração. */
function content(x: Versioned): string {
  const { updatedAt: _ignored, ...rest } = x;
  void _ignored;
  return JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
}

export function resolveConflict<T extends Versioned>(base: T | null, local: T, remote: T, critical: boolean): Resolution {
  const localChanged = !base || content(local) !== content(base);
  const remoteChanged = !base || content(remote) !== content(base);
  if (!localChanged) return "remote";
  if (!remoteChanged) return "local";
  if (content(local) === content(remote)) return "remote";
  if (critical) return "manual";
  return local.updatedAt >= remote.updatedAt ? "local" : "remote";
}

/** Movimentações realizadas, pagamentos de fatura e estornos são críticos: dinheiro que já saiu ou entrou. */
export function isCriticalTransaction(t: { status: string; kind: string; reversalOf?: string; reversedBy?: string }): boolean {
  return t.status === "realized" || t.kind === "invoice_payment" || Boolean(t.reversalOf) || Boolean(t.reversedBy);
}
