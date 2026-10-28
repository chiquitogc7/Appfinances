"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, Segmented, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import type { Invoice } from "@/domain/finance";
import { formatBRL, formatMoneyInput } from "@/domain/money";
import type { Card } from "@/domain/types";
import { validateInvoiceAction, type InvoiceActionErrors, type InvoiceActionInput } from "@/domain/validation";
import { formatMonthTitle } from "@/lib/format";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

type ActionType = InvoiceActionInput["type"];
const ADJUST: ActionType[] = ["interest", "fine", "fee", "refund"];

export function InvoiceActionDrawer({ card, invoice, initialType, onClose }: { card: Card; invoice: Invoice; initialType: ActionType; onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const operationId = useRef(newId());
  const defaultCategory = data?.categories.find((c) => c.id === "cat_impostos")?.id ?? data?.categories.find((c) => c.kind === "expense")?.id ?? "";
  const [input, setInput] = useState<InvoiceActionInput>({
    type: initialType,
    amountText: initialType === "pay" ? formatMoneyInput(invoice.remaining) : "",
    date: today,
    accountId: card.payAccountId,
    categoryId: defaultCategory,
    description: initialType === "pay" ? "" : t(`invoiceAction.defaultDescription.${initialType}`),
  });
  const [errors, setErrors] = useState<InvoiceActionErrors>({});
  if (!data) return null;
  const set = (patch: Partial<InvoiceActionInput>) => setInput((p) => ({ ...p, ...patch }));
  const err = (k: keyof InvoiceActionErrors) => (errors[k] ? t(errors[k]!) : undefined);
  const isPay = input.type === "pay";
  const categories = data.categories.filter((c) => c.kind === "expense");

  const submit = () => {
    const { errors: found, amount } = validateInvoiceAction(input, { today, accounts: data.accounts, categories: data.categories, remaining: invoice.remaining });
    setErrors(found);
    const first = (["amount", "date", "account", "description", "category"] as const).find((k) => found[k]);
    if (first || amount === null) return void requestAnimationFrame(() => document.getElementById(`inv-${first ?? "amount"}`)?.focus());
    const r = isPay
      ? actions.payInvoice(operationId.current, { cardId: card.id, invoiceKey: invoice.key, amount, date: input.date, accountId: input.accountId ?? card.payAccountId })
      : actions.addInvoiceAdjustment(operationId.current, { cardId: card.id, invoiceKey: invoice.key, type: input.type as "interest" | "fine" | "fee" | "refund", amount, date: input.date, categoryId: input.categoryId || undefined, description: input.description });
    if (!r.ok) return toast(t(r.error), "error");
    toast(isPay ? (amount < invoice.remaining ? t("invoiceAction.toast.partial") : t("invoiceAction.toast.paid")) : t(`invoiceAction.toast.${input.type}`));
    onClose();
  };

  const changeType = (type: ActionType) => set({ type, description: t(`invoiceAction.defaultDescription.${type}`) });

  return (
    <Drawer
      title={isPay ? t("invoiceAction.payTitle") : t("invoiceAction.adjustTitle")}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" form="inv-form" className={primaryBtn}>{isPay ? t("invoiceAction.payAction") : t("common.save")}</button>
        </div>
      }
    >
      <dl className="mb-4 rounded-lg bg-sunken p-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">{card.name}</dt><dd>{formatMonthTitle(invoice.key)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{t("invoiceAction.total")}</dt><dd className="tabular-nums">{formatBRL(invoice.total)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">{t("invoiceAction.paid")}</dt><dd className="tabular-nums">{formatBRL(invoice.paid)}</dd></div>
        <div className="flex justify-between font-medium"><dt>{t("invoiceAction.remaining")}</dt><dd className="tabular-nums">{formatBRL(invoice.remaining)}</dd></div>
      </dl>

      <form id="inv-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {!isPay && (
          <Segmented<ActionType>
            label={t("invoiceAction.type")}
            value={input.type}
            onChange={changeType}
            options={ADJUST.map((k) => ({ value: k, label: t(`invoiceAction.types.${k}`) }))}
          />
        )}
        <Field id="inv-amount" label={t("tx.field.amount")} error={err("amount")} hint={isPay ? t("invoiceAction.payHint") : undefined}>
          {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.amountText} onChange={(e) => set({ amountText: e.target.value })} />}
        </Field>
        <Field id="inv-date" label={isPay ? t("invoiceAction.payDate") : t("tx.field.date")} error={err("date")}>
          {(a) => <input {...a} type="date" max={today} className={inputCls} value={input.date} onChange={(e) => set({ date: e.target.value })} />}
        </Field>
        {isPay ? (
          <Field id="inv-account" label={t("invoiceAction.payAccount")} error={err("account")}>
            {(a) => (
              <select {...a} className={inputCls} value={input.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                {data.accounts.map((acc) => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
              </select>
            )}
          </Field>
        ) : (
          <>
            <Field id="inv-description" label={t("tx.field.description")} error={err("description")}>
              {(a) => <input {...a} className={inputCls} maxLength={80} value={input.description} onChange={(e) => set({ description: e.target.value })} />}
            </Field>
            <Field id="inv-category" label={t("tx.field.category")} error={err("category")} hint={input.type === "refund" ? t("invoiceAction.refundCategoryHint") : undefined}>
              {(a) => (
                <select {...a} className={inputCls} value={input.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                  {input.type === "refund" && <option value="">{t("common.uncategorized")}</option>}
                  {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
              )}
            </Field>
            <p className="rounded-lg border border-line bg-sunken p-3 text-xs text-muted">{input.type === "refund" ? t("invoiceAction.refundNote") : t("invoiceAction.chargeNote")}</p>
          </>
        )}
      </form>
    </Drawer>
  );
}
