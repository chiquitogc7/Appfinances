"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, Segmented, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { cardUsage, computeInvoices } from "@/domain/finance";
import { splitInstallments, formatBRL, formatMoneyInput, parseMoneyInput } from "@/domain/money";
import { MAX_INSTALLMENTS, validateTxInput, type TxErrors, type TxField, type TxFormKind, type TxInput } from "@/domain/validation";
import type { EditPatch } from "@/domain/ops";
import type { AppData, PaymentMethod, Transaction } from "@/domain/types";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

export type DrawerMode = { type: "create"; kind: TxFormKind } | { type: "edit"; tx: Transaction };

const EXPENSE_METHODS: PaymentMethod[] = ["pix", "debit", "cash", "boleto", "credit_card", "other"];
const INCOME_METHODS: PaymentMethod[] = ["pix", "transfer", "cash", "boleto", "other"];
const FOCUS_ORDER: TxField[] = ["amount", "description", "date", "category", "paymentMethod", "account", "toAccount", "card", "installments"];

function initialInput(mode: DrawerMode, data: AppData, today: string): TxInput {
  if (mode.type === "edit") {
    const tx = mode.tx;
    return {
      kind: tx.kind as TxFormKind,
      amountText: formatMoneyInput(tx.amount),
      description: tx.description,
      date: tx.date,
      status: tx.status,
      categoryId: tx.categoryId,
      paymentMethod: tx.paymentMethod,
      accountId: tx.accountId,
      toAccountId: tx.toAccountId,
      cardId: tx.cardId,
      installments: 1,
      notes: tx.notes ?? "",
    };
  }
  return {
    kind: mode.kind,
    amountText: "",
    description: "",
    date: today,
    status: "realized",
    categoryId: "",
    paymentMethod: mode.kind === "transfer" ? undefined : "pix",
    accountId: data.accounts[0]?.id ?? "",
    toAccountId: "",
    cardId: data.cards[0]?.id ?? "",
    installments: 1,
    notes: "",
  };
}

export function TransactionDrawer({ mode, onClose }: { mode: DrawerMode; onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const editing = mode.type === "edit" ? mode.tx : null;
  const operationId = useRef(newId()); // um id por abertura: reenviar o formulário nunca duplica
  const [input, setInput] = useState<TxInput>(() => initialInput(mode, data!, today));
  const [errors, setErrors] = useState<TxErrors>({});
  const [statusTouched, setStatusTouched] = useState(false);
  const [newCat, setNewCat] = useState<{ open: boolean; name: string; error?: string }>({ open: false, name: "" });
  if (!data) return null;

  const set = (patch: Partial<TxInput>) => setInput((p) => ({ ...p, ...patch }));
  const err = (f: TxField) => (errors[f] ? t(errors[f]!) : undefined);
  const isCard = input.kind === "expense" && input.paymentMethod === "credit_card";
  const realized = editing?.status === "realized";
  const structuralLock = Boolean(editing && (realized || editing.installment || editing.cardId));
  const kindLocked = Boolean(editing);
  const categories = data.categories.filter((c) => c.kind === input.kind);
  const methods = input.kind === "income" ? INCOME_METHODS : EXPENSE_METHODS;

  const changeKind = (kind: TxFormKind) =>
    set({ kind, categoryId: "", paymentMethod: kind === "transfer" ? undefined : "pix", installments: 1, toAccountId: "", status: input.date > today ? "planned" : "realized" });
  const changeDate = (date: string) => set({ date, ...(statusTouched || isCard ? {} : { status: date > today ? ("planned" as const) : ("realized" as const) }) });
  const changeMethod = (m: PaymentMethod) => set({ paymentMethod: m, installments: 1, cardId: input.cardId || data.cards[0]?.id || "" });

  const addCategory = () => {
    if (input.kind === "transfer") return;
    const r = actions.createCategory(newId(), newCat.name, input.kind);
    if (!r.ok) return setNewCat((c) => ({ ...c, error: t(r.error) }));
    set({ categoryId: r.category.id });
    setNewCat({ open: false, name: "" });
  };

  const submit = () => {
    const { errors: found, amount } = validateTxInput(input, { today, accounts: data.accounts, cards: data.cards, categories: data.categories });
    setErrors(found);
    const first = FOCUS_ORDER.find((f) => found[f]);
    if (first || amount === null) {
      requestAnimationFrame(() => document.getElementById(`tx-${first ?? "amount"}`)?.focus());
      return;
    }
    if (editing) {
      const notes = input.notes?.trim();
      const patch: EditPatch = { description: input.description.trim(), notes: notes ? notes : editing.notes ? "" : undefined };
      if (input.kind !== "transfer") patch.categoryId = input.categoryId;
      if (!structuralLock) {
        patch.amount = amount;
        patch.date = input.date;
        patch.accountId = input.accountId;
        if (input.kind === "transfer") patch.toAccountId = input.toAccountId;
      }
      const r = actions.editTransaction(editing.id, patch);
      if (!r.ok) return toast(t(r.error), "error");
      toast(t("tx.toast.edited"));
    } else {
      actions.createTransactions(input, amount, operationId.current);
      toast(t(`tx.toast.created.${input.kind}`));
    }
    onClose();
  };

  const accountLabel = input.kind === "income" ? t("tx.field.accountIn") : input.kind === "transfer" ? t("tx.field.accountFrom") : t("tx.field.accountOut");
  const previewParts = (() => {
    const n = input.installments ?? 1;
    const cents = parseMoneyInput(input.amountText);
    if (!isCard || n < 2 || n > MAX_INSTALLMENTS || cents === null || cents <= 0) return null;
    const parts = splitInstallments(cents, n);
    return { n, first: formatBRL(parts[0]), last: formatBRL(parts[n - 1]) };
  })();

  const overLimit = (() => {
    if (!isCard || editing || !input.cardId) return false;
    const card = data.cards.find((c) => c.id === input.cardId);
    const cents = parseMoneyInput(input.amountText);
    if (!card || cents === null || cents <= 0) return false;
    return cents > cardUsage(card, computeInvoices(data, today)).available;
  })();

  const title = editing ? t("tx.editTitle") : t("tx.newTitle");

  return (
    <Drawer
      title={title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" form="tx-form" className={primaryBtn}>
            {editing ? t("common.saveChanges") : t("common.save")}
          </button>
        </div>
      }
    >
      <form
        id="tx-form"
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!kindLocked && (
          <Segmented<TxFormKind>
            label={t("tx.field.kind")}
            value={input.kind}
            onChange={changeKind}
            options={[
              { value: "expense", label: t("kind.expense") },
              { value: "income", label: t("kind.income") },
              { value: "transfer", label: t("kind.transfer") },
            ]}
          />
        )}
        {editing && structuralLock && (
          <p role="note" className="rounded-lg border border-dashed border-brand-orange/70 bg-brand-orange/[0.08] p-3 text-xs">
            {realized ? t("tx.lockedRealized") : t("tx.lockedCard")}
          </p>
        )}

        <Field id="tx-amount" label={t("tx.field.amount")} error={err("amount")}>
          {(a) => <input {...a} className={inputCls} inputMode="decimal" autoComplete="off" placeholder="0,00" value={input.amountText} disabled={structuralLock} onChange={(e) => set({ amountText: e.target.value })} />}
        </Field>
        <Field id="tx-description" label={t("tx.field.description")} error={err("description")}>
          {(a) => <input {...a} className={inputCls} maxLength={80} autoComplete="off" value={input.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <Field id="tx-date" label={isCard ? t("tx.field.purchaseDate") : t("tx.field.date")} error={err("date")}>
          {(a) => <input {...a} type="date" className={inputCls} value={input.date} disabled={structuralLock} onChange={(e) => changeDate(e.target.value)} />}
        </Field>

        {!isCard && !editing && (
          <div>
            <p className="mb-1 text-sm font-medium">{t("tx.field.status")}</p>
            <Segmented
              label={t("tx.field.status")}
              value={input.status}
              onChange={(status) => {
                setStatusTouched(true);
                set({ status });
              }}
              options={[
                { value: "realized", label: t(`tx.statusFor.${input.kind}.realized`) },
                { value: "planned", label: t(`tx.statusFor.${input.kind}.planned`) },
              ]}
            />
            <p className="mt-1 text-xs text-muted">{input.status === "planned" ? t("tx.statusHintPlanned") : t("tx.statusHintRealized")}</p>
          </div>
        )}

        {input.kind !== "transfer" && (
          <>
            <Field id="tx-category" label={t("tx.field.category")} error={err("category")}>
              {(a) => (
                <select {...a} className={inputCls} value={input.categoryId ?? ""} onChange={(e) => set({ categoryId: e.target.value })}>
                  <option value="">{t("tx.select")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {newCat.open ? (
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Field id="tx-newcat" label={t("tx.newCategoryName")} error={newCat.error}>
                    {(a) => <input {...a} className={inputCls} maxLength={40} value={newCat.name} onChange={(e) => setNewCat({ open: true, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())} />}
                  </Field>
                </div>
                <button type="button" className={`${ghostBtn} mt-6`} onClick={addCategory}>
                  {t("common.add")}
                </button>
              </div>
            ) : (
              <button type="button" className="text-sm text-brand-purple underline" onClick={() => setNewCat({ open: true, name: "" })}>
                {t("tx.newCategory")}
              </button>
            )}

            <Field id="tx-paymentMethod" label={t("tx.field.payment")} error={err("paymentMethod")}>
              {(a) => (
                <select {...a} className={inputCls} value={input.paymentMethod ?? ""} disabled={Boolean(editing)} onChange={(e) => changeMethod(e.target.value as PaymentMethod)}>
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {t(`paymentMethod.${m}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        )}

        {isCard ? (
          <>
            <Field id="tx-card" label={t("tx.field.card")} error={err("card")}>
              {(a) => (
                <select {...a} className={inputCls} value={input.cardId ?? ""} disabled={Boolean(editing)} onChange={(e) => set({ cardId: e.target.value })}>
                  <option value="">{t("tx.select")}</option>
                  {data.cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {overLimit && (
              <p role="note" className="rounded-lg border border-dashed border-warn/70 bg-warn/[0.1] p-3 text-xs">
                {t("tx.limitWarning")}
              </p>
            )}
            {!editing && (
              <Field id="tx-installments" label={t("tx.field.installments")} error={err("installments")} hint={previewParts ? t("tx.installmentPreview", previewParts) : t("tx.installmentHint")}>
                {(a) => <input {...a} type="number" min={1} max={MAX_INSTALLMENTS} className={inputCls} value={input.installments ?? 1} onChange={(e) => set({ installments: e.target.value === "" ? 0 : Number(e.target.value) })} />}
              </Field>
            )}
          </>
        ) : (
          <Field id="tx-account" label={accountLabel} error={err("account")}>
            {(a) => (
              <select {...a} className={inputCls} value={input.accountId ?? ""} disabled={structuralLock} onChange={(e) => set({ accountId: e.target.value })}>
                <option value="">{t("tx.select")}</option>
                {data.accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        {input.kind === "transfer" && (
          <Field id="tx-toAccount" label={t("tx.field.accountTo")} error={err("toAccount")}>
            {(a) => (
              <select {...a} className={inputCls} value={input.toAccountId ?? ""} disabled={structuralLock} onChange={(e) => set({ toAccountId: e.target.value })}>
                <option value="">{t("tx.select")}</option>
                {data.accounts.filter((acc) => acc.id !== input.accountId).map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field id="tx-currency" label={t("tx.field.currency")} hint={t("tx.currencyHint")}>
          {(a) => <input {...a} className={inputCls} value="BRL — Real brasileiro" disabled readOnly />}
        </Field>
        <Field id="tx-notes" label={t("tx.field.notes")}>
          {(a) => <textarea {...a} rows={3} maxLength={300} className={`${inputCls} h-auto py-2`} value={input.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
      </form>
    </Drawer>
  );
}
