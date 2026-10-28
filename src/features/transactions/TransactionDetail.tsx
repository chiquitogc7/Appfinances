"use client";

import { useState } from "react";
import { Pencil, RotateCcw, Trash2, Undo2, CheckCheck } from "lucide-react";
import { Drawer } from "@/components/Drawer";
import { Field, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { Chip } from "@/components/ui";
import { useAppData } from "@/data/store";
import { displaySign } from "@/domain/filters";
import { formatBRL } from "@/domain/money";
import type { Transaction } from "@/domain/types";
import { formatDateBR } from "@/lib/format";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

type Confirm = null | "delete" | "reverse" | "settle";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function TransactionDetail({ txId, startConfirm, onClose, onEdit }: { txId: string; startConfirm?: Confirm; onClose: () => void; onEdit: (tx: Transaction) => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Confirm>(startConfirm ?? null);
  const [date, setDate] = useState(today);
  const [dateError, setDateError] = useState<string>();
  const operationId = useState(() => newId())[0];
  const tx = data?.transactions.find((x) => x.id === txId);
  if (!data || !tx) return null;

  const isCardPurchase = tx.kind === "expense" && Boolean(tx.cardId);
  const deleted = Boolean(tx.deletedAt);
  const isReversal = Boolean(tx.reversalOf);
  const canEdit = !deleted && !isReversal && !tx.reversedBy && tx.kind !== "invoice_payment" && tx.kind !== "card_refund";
  const canSettle = !deleted && tx.status === "planned" && !isCardPurchase;
  const canReverse = !deleted && tx.status === "realized" && !tx.reversedBy && !isReversal && tx.kind !== "card_refund";
  const canDelete = !deleted && tx.status === "planned" && !tx.installment;

  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]));
  const category = data.categories.find((c) => c.id === tx.categoryId)?.name;
  const card = data.cards.find((c) => c.id === tx.cardId)?.name;
  const sign = displaySign(tx);
  const where = tx.kind === "transfer" ? `${accounts.get(tx.accountId ?? "") ?? "—"} → ${accounts.get(tx.toAccountId ?? "") ?? "—"}` : (card ?? accounts.get(tx.accountId ?? "") ?? "—");

  const run = (r: { ok: true } | { ok: false; error: string }, okMsg: string) => {
    if (!r.ok) {
      setDateError(t(r.error));
      toast(t(r.error), "error");
      return;
    }
    toast(okMsg);
    setConfirm(null);
    setDateError(undefined);
  };

  const history = [...(tx.history ?? [])].reverse();

  return (
    <Drawer title={t("tx.detailTitle")} onClose={onClose}>
      <div className="mb-4">
        <p className="text-sm text-muted">{tx.description}</p>
        <p className={`text-3xl font-semibold tabular-nums ${sign > 0 ? "text-pos" : sign < 0 ? "" : ""}`}>
          {sign > 0 ? "+ " : sign < 0 ? "− " : ""}
          {formatBRL(tx.amount)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone="neutral">{t(`kind.${tx.kind}`)}</Chip>
          <Chip tone={tx.status === "planned" ? "planned" : "real"}>{t(`status.${tx.status}`)}</Chip>
          {isReversal && <Chip tone="warn">{t("tx.badge.reversal")}</Chip>}
          {tx.reversedBy && <Chip tone="warn">{t("tx.badge.reversed")}</Chip>}
          {deleted && <Chip tone="neg">{t("tx.badge.deleted")}</Chip>}
          {tx.installment && <Chip tone="neutral">{`${tx.installment.index}/${tx.installment.total}`}</Chip>}
        </div>
      </div>

      <dl>
        <Row label={t("tx.field.date")}>{formatDateBR(tx.date, true)}</Row>
        <Row label={tx.kind === "transfer" ? t("tx.field.accounts") : card ? t("tx.field.card") : t("tx.field.account")}>{where}</Row>
        {category && <Row label={t("tx.field.category")}>{category}</Row>}
        {tx.paymentMethod && <Row label={t("tx.field.payment")}>{t(`paymentMethod.${tx.paymentMethod}`)}</Row>}
        <Row label={t("tx.field.currency")}>{tx.currency ?? "BRL"}</Row>
        {tx.notes && <Row label={t("tx.field.notes")}>{tx.notes}</Row>}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        {canEdit && (
          <button type="button" className={ghostBtn} onClick={() => onEdit(tx)}>
            <Pencil size={16} aria-hidden="true" /> {t("common.edit")}
          </button>
        )}
        {canSettle && (
          <button type="button" className={ghostBtn} onClick={() => setConfirm("settle")}>
            <CheckCheck size={16} aria-hidden="true" /> {t(`tx.settle.${tx.kind === "income" ? "income" : "other"}`)}
          </button>
        )}
        {canReverse && (
          <button type="button" className={ghostBtn} onClick={() => setConfirm("reverse")}>
            <Undo2 size={16} aria-hidden="true" /> {t("tx.reverse")}
          </button>
        )}
        {canDelete && (
          <button type="button" className={`${ghostBtn} text-neg`} onClick={() => setConfirm("delete")}>
            <Trash2 size={16} aria-hidden="true" /> {t("common.delete")}
          </button>
        )}
        {deleted && (
          <button type="button" className={primaryBtn} onClick={() => run(actions.restoreTransaction(tx.id), t("tx.toast.restored"))}>
            <RotateCcw size={16} aria-hidden="true" /> {t("tx.restore")}
          </button>
        )}
      </div>
      {!canDelete && !deleted && tx.status === "realized" && !isReversal && !tx.reversedBy && <p className="mt-2 text-xs text-muted">{t("tx.reverseHint")}</p>}

      {confirm && (
        <div role="alertdialog" aria-label={t(`tx.confirm.${confirm}.title`)} className="mt-4 space-y-3 rounded-lg border border-line bg-sunken p-4">
          <p className="text-sm font-medium">{t(`tx.confirm.${confirm}.title`)}</p>
          <p className="text-xs text-muted">{t(`tx.confirm.${confirm}.body`)}</p>
          {(confirm === "settle" || confirm === "reverse") && (
            <Field id="tx-confirm-date" label={t(`tx.confirm.${confirm}.date`)} error={dateError}>
              {(a) => <input {...a} type="date" className={inputCls} max={today} min={confirm === "reverse" ? tx.date : undefined} value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={confirm === "delete" ? `${primaryBtn} !bg-neg` : primaryBtn}
              onClick={() => {
                if (confirm === "delete") run(actions.deleteTransaction(tx.id), t("tx.toast.deleted"));
                if (confirm === "settle") run(actions.settleTransaction(tx.id, date), t("tx.toast.settled"));
                if (confirm === "reverse") run(actions.reverseTransaction(tx.id, operationId, date), t("tx.toast.reversed"));
              }}
            >
              {t(`tx.confirm.${confirm}.action`)}
            </button>
            <button type="button" className={ghostBtn} onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <section className="mt-6" aria-labelledby="tx-history">
        <h3 id="tx-history" className="mb-2 text-sm font-semibold">
          {t("tx.history")}
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted">{t("tx.historyEmpty")}</p>
        ) : (
          <ol className="space-y-2">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-xs">
                <span className="text-muted">{new Date(h.at).toLocaleString("pt-BR")}</span> · {t(`history.${h.action}`)}
                {h.fields && h.fields.length > 0 && `: ${h.fields.map((f) => t(`fields.${f}`)).join(", ")}`}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Drawer>
  );
}
