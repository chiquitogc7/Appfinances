"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { formatBRL } from "@/domain/money";
import type { Account, AccountType } from "@/domain/types";
import { validateAccountInput, type AccountErrors, type AccountInput } from "@/domain/validation";
import { formatDateBR } from "@/lib/format";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

const TYPES: AccountType[] = ["checking", "savings", "cash", "investment", "wallet"];

export function AccountDrawer({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const operationId = useRef(newId());
  const [input, setInput] = useState<AccountInput>({ name: account?.name ?? "", type: account?.type ?? "checking", balanceText: "", referenceDate: account?.referenceDate ?? today });
  const [errors, setErrors] = useState<AccountErrors>({});
  if (!data) return null;
  const set = (patch: Partial<AccountInput>) => setInput((p) => ({ ...p, ...patch }));
  const err = (k: keyof AccountErrors) => (errors[k] ? t(errors[k]!) : undefined);

  const submit = () => {
    const { errors: found, balance } = validateAccountInput(input, data.accounts, account?.id);
    const checked = account ? { ...(found.name ? { name: found.name } : {}) } : found; // na edição só nome e tipo importam
    setErrors(checked);
    const first = (["name", "balance", "referenceDate"] as const).find((k) => checked[k]);
    if (first) return void requestAnimationFrame(() => document.getElementById(`acc-${first}`)?.focus());
    if (account) {
      actions.updateAccount(account.id, { name: input.name, type: input.type });
      toast(t("accounts.toast.edited"));
    } else {
      actions.createAccount(operationId.current, { name: input.name, type: input.type, initialBalance: balance ?? 0, referenceDate: input.referenceDate });
      toast(t("accounts.toast.created"));
    }
    onClose();
  };

  return (
    <Drawer
      title={account ? t("accounts.editTitle") : t("accounts.newTitle")}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" form="acc-form" className={primaryBtn}>{account ? t("common.saveChanges") : t("common.save")}</button>
        </div>
      }
    >
      <form id="acc-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field id="acc-name" label={t("accounts.field.name")} error={err("name")}>
          {(a) => <input {...a} className={inputCls} maxLength={40} autoComplete="off" value={input.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field id="acc-type" label={t("accounts.field.type")}>
          {(a) => (
            <select {...a} className={inputCls} value={input.type} onChange={(e) => set({ type: e.target.value as AccountType })}>
              {TYPES.map((k) => (<option key={k} value={k}>{t(`accountType.${k}`)}</option>))}
            </select>
          )}
        </Field>
        <Field id="acc-currency" label={t("tx.field.currency")} hint={t("tx.currencyHint")}>
          {(a) => <input {...a} className={inputCls} value="BRL — Real brasileiro" disabled readOnly />}
        </Field>
        {account ? (
          <p className="rounded-lg border border-line bg-sunken p-3 text-xs text-muted">
            {t("accounts.initialLocked", { value: formatBRL(account.initialBalance), date: formatDateBR(account.referenceDate, true) })}
          </p>
        ) : (
          <>
            <Field id="acc-balance" label={t("accounts.field.balance")} error={err("balance")} hint={t("accounts.field.balanceHint")}>
              {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.balanceText} onChange={(e) => set({ balanceText: e.target.value })} />}
            </Field>
            <Field id="acc-referenceDate" label={t("accounts.field.reference")} error={err("referenceDate")} hint={t("accounts.field.referenceHint")}>
              {(a) => <input {...a} type="date" className={inputCls} value={input.referenceDate} onChange={(e) => set({ referenceDate: e.target.value })} />}
            </Field>
          </>
        )}
      </form>
    </Drawer>
  );
}
