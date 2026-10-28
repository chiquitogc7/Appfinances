"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { formatMoneyInput } from "@/domain/money";
import type { Card } from "@/domain/types";
import { validateCardInput, type CardErrors, type CardInput } from "@/domain/validation";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

export function CardDrawer({ card, onClose }: { card?: Card; onClose: () => void }) {
  const { data, actions } = useAppData();
  const toast = useToast();
  const cardId = useRef(newId());
  const [input, setInput] = useState<CardInput>({
    name: card?.name ?? "",
    issuer: card?.issuer ?? "",
    limitText: card ? formatMoneyInput(card.limit) : "",
    closingDay: card?.closingDay ?? 10,
    dueDay: card?.dueDay ?? 17,
    payAccountId: card?.payAccountId ?? data?.accounts[0]?.id ?? "",
  });
  const [errors, setErrors] = useState<CardErrors>({});
  if (!data) return null;
  const set = (patch: Partial<CardInput>) => setInput((p) => ({ ...p, ...patch }));
  const err = (k: keyof CardErrors) => (errors[k] ? t(errors[k]!) : undefined);

  const submit = () => {
    const { errors: found, limit } = validateCardInput(input, data.accounts, data.cards, card?.id);
    setErrors(found);
    const first = (["name", "issuer", "limit", "closingDay", "dueDay", "payAccountId"] as const).find((k) => found[k]);
    if (first || limit === null) return void requestAnimationFrame(() => document.getElementById(`card-${first ?? "limit"}`)?.focus());
    const fields = { name: input.name, issuer: input.issuer, limit, closingDay: input.closingDay, dueDay: input.dueDay, payAccountId: input.payAccountId };
    if (card) {
      actions.updateCard(card.id, fields);
      toast(t("cards.toast.edited"));
    } else {
      actions.createCard(cardId.current, fields);
      toast(t("cards.toast.created"));
    }
    onClose();
  };

  return (
    <Drawer
      title={card ? t("cards.editTitle") : t("cards.newTitle")}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" form="card-form" className={primaryBtn}>{card ? t("common.saveChanges") : t("common.save")}</button>
        </div>
      }
    >
      <form id="card-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field id="card-name" label={t("cards.field.name")} error={err("name")}>
          {(a) => <input {...a} className={inputCls} maxLength={40} autoComplete="off" value={input.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field id="card-issuer" label={t("cards.field.issuer")} error={err("issuer")}>
          {(a) => <input {...a} className={inputCls} maxLength={40} autoComplete="off" value={input.issuer} onChange={(e) => set({ issuer: e.target.value })} />}
        </Field>
        <Field id="card-limit" label={t("cards.field.limit")} error={err("limit")}>
          {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.limitText} onChange={(e) => set({ limitText: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="card-closingDay" label={t("cards.field.closing")} error={err("closingDay")}>
            {(a) => <input {...a} type="number" min={1} max={31} className={inputCls} value={input.closingDay} onChange={(e) => set({ closingDay: Number(e.target.value) })} />}
          </Field>
          <Field id="card-dueDay" label={t("cards.field.due")} error={err("dueDay")}>
            {(a) => <input {...a} type="number" min={1} max={31} className={inputCls} value={input.dueDay} onChange={(e) => set({ dueDay: Number(e.target.value) })} />}
          </Field>
        </div>
        <p className="text-xs text-muted">{t("cards.field.daysHint")}</p>
        <Field id="card-payAccountId" label={t("cards.field.payAccount")} error={err("payAccountId")}>
          {(a) => (
            <select {...a} className={inputCls} value={input.payAccountId} onChange={(e) => set({ payAccountId: e.target.value })}>
              {data.accounts.map((acc) => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
            </select>
          )}
        </Field>
        {card && <p className="rounded-lg border border-dashed border-brand-orange/70 bg-brand-orange/[0.08] p-3 text-xs">{t("cards.editWarning")}</p>}
      </form>
    </Drawer>
  );
}
