"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { formatMoneyInput } from "@/domain/money";
import type { Investment } from "@/domain/types";
import { INVESTMENT_CATEGORIES, validateInvestmentInput, type InvestmentErrors, type InvestmentInput } from "@/domain/validation";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

export function InvestmentDrawer({ asset, onClose }: { asset?: Investment; onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const id = useRef(newId());
  const [input, setInput] = useState<InvestmentInput>({
    name: asset?.name ?? "",
    category: asset?.category ?? INVESTMENT_CATEGORIES[0],
    appliedText: asset ? formatMoneyInput(asset.applied) : "",
    currentText: asset ? formatMoneyInput(asset.current) : "",
    referenceDate: asset ? (asset.referenceDate > today ? today : asset.referenceDate) : today,
    notes: asset?.notes ?? "",
  });
  const [errors, setErrors] = useState<InvestmentErrors>({});
  if (!data) return null;
  const set = (patch: Partial<InvestmentInput>) => setInput((p) => ({ ...p, ...patch }));
  const err = (k: keyof InvestmentErrors) => (errors[k] ? t(errors[k]!) : undefined);
  const categories: string[] = [...INVESTMENT_CATEGORIES];
  if (asset && !categories.includes(asset.category)) categories.unshift(asset.category);

  const submit = () => {
    const { errors: found, applied, current } = validateInvestmentInput(input, today);
    setErrors(found);
    const first = (["name", "category", "applied", "current", "referenceDate", "notes"] as const).find((k) => found[k]);
    if (first || applied === null || current === null) return void requestAnimationFrame(() => document.getElementById(`inv-${first ?? "applied"}`)?.focus());
    const fields = { name: input.name, category: input.category, applied, current, referenceDate: input.referenceDate, notes: input.notes };
    if (asset) {
      actions.updateInvestment(asset.id, fields);
      toast(t("patrimony.toast.edited"));
    } else {
      actions.createInvestment(id.current, fields);
      toast(t("patrimony.toast.created"));
    }
    onClose();
  };

  return (
    <Drawer
      title={asset ? t("patrimony.editTitle") : t("patrimony.newTitle")}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" form="inv-asset-form" className={primaryBtn}>{asset ? t("common.saveChanges") : t("common.save")}</button>
        </div>
      }
    >
      <form id="inv-asset-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field id="inv-name" label={t("patrimony.field.name")} error={err("name")}>
          {(a) => <input {...a} className={inputCls} maxLength={60} autoComplete="off" value={input.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field id="inv-category" label={t("patrimony.field.category")} error={err("category")}>
          {(a) => (
            <select {...a} className={inputCls} value={input.category} onChange={(e) => set({ category: e.target.value })}>
              {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="inv-applied" label={t("patrimony.field.applied")} error={err("applied")}>
            {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.appliedText} onChange={(e) => set({ appliedText: e.target.value })} />}
          </Field>
          <Field id="inv-current" label={t("patrimony.field.current")} error={err("current")}>
            {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.currentText} onChange={(e) => set({ currentText: e.target.value })} />}
          </Field>
        </div>
        <Field id="inv-referenceDate" label={t("patrimony.field.reference")} error={err("referenceDate")} hint={t("patrimony.field.referenceHint")}>
          {(a) => <input {...a} type="date" max={today} className={inputCls} value={input.referenceDate} onChange={(e) => set({ referenceDate: e.target.value })} />}
        </Field>
        <Field id="inv-notes" label={t("patrimony.field.notes")} error={err("notes")}>
          {(a) => <textarea {...a} rows={3} maxLength={300} className={`${inputCls} h-auto py-2`} value={input.notes} onChange={(e) => set({ notes: e.target.value })} />}
        </Field>
        <p className="rounded-lg border border-line bg-sunken p-3 text-xs text-muted">{t("patrimony.manualNote")}</p>
      </form>
    </Drawer>
  );
}
