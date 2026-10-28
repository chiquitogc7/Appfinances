"use client";

import { useRef, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, Segmented, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { formatMoneyInput, parseMoneyInput } from "@/domain/money";
import type { Frequency, Goal, PaymentMethod } from "@/domain/types";
import { MAX_CENTS, validateBudgetInput, validateGoalInput, validateRecurrenceInput, type RecurrenceErrors, type RecurrenceInput } from "@/domain/validation";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

const footer = (formId: string, label: string, onClose: () => void) => (
  <div className="flex justify-end gap-2">
    <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
    <button type="submit" form={formId} className={primaryBtn}>{label}</button>
  </div>
);
const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

/* ───────────── Orçamento ───────────── */
export function BudgetDrawer({ categoryId, onClose }: { categoryId?: string; onClose: () => void }) {
  const { data, actions } = useAppData();
  const toast = useToast();
  const current = data?.budgets.find((b) => b.categoryId === categoryId);
  const [input, setInput] = useState({ categoryId: categoryId ?? "", limitText: current ? formatMoneyInput(current.monthlyLimit) : "" });
  const [errors, setErrors] = useState<Partial<Record<"category" | "limit", string>>>({});
  if (!data) return null;
  const options = data.categories.filter((c) => c.kind === "expense" && (c.id === categoryId || !data.budgets.some((b) => b.categoryId === c.id)));

  const submit = () => {
    const { errors: found, limit } = validateBudgetInput(input, data.categories);
    setErrors(found);
    if (found.category) return focusLater("bud-category");
    if (found.limit || limit === null) return focusLater("bud-limit");
    actions.setBudget(input.categoryId, limit);
    toast(t("planning.toast.budget"));
    onClose();
  };

  return (
    <Drawer title={categoryId ? t("planning.budgetEdit") : t("planning.budgetNew")} onClose={onClose} footer={footer("bud-form", t("common.save"), onClose)}>
      <form id="bud-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field id="bud-category" label={t("tx.field.category")} error={errors.category ? t(errors.category) : undefined} hint={options.length === 0 ? t("planning.allBudgeted") : undefined}>
          {(a) => (
            <select {...a} className={inputCls} disabled={Boolean(categoryId)} value={input.categoryId} onChange={(e) => setInput({ ...input, categoryId: e.target.value })}>
              <option value="">{t("tx.select")}</option>
              {options.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}
        </Field>
        <Field id="bud-limit" label={t("planning.monthlyLimit")} error={errors.limit ? t(errors.limit) : undefined}>
          {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.limitText} onChange={(e) => setInput({ ...input, limitText: e.target.value })} />}
        </Field>
      </form>
    </Drawer>
  );
}

/* ───────────── Meta (criar, editar, aporte) ───────────── */
export function GoalDrawer({ mode, goal, onClose }: { mode: "create" | "edit" | "contribute"; goal?: Goal; onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const id = useRef(newId());
  const [input, setInput] = useState({ name: goal?.name ?? "", targetText: goal ? formatMoneyInput(goal.target) : "", savedText: "", deadline: goal?.deadline ?? today, amountText: "", date: today });
  const [errors, setErrors] = useState<Partial<Record<"name" | "target" | "saved" | "deadline" | "amount" | "date", string>>>({});
  if (!data) return null;
  const set = (patch: Partial<typeof input>) => setInput((p) => ({ ...p, ...patch }));
  const err = (k: keyof typeof errors) => (errors[k] ? t(errors[k]!) : undefined);

  const submit = () => {
    if (mode === "contribute" && goal) {
      const cents = parseMoneyInput(input.amountText);
      const e: typeof errors = {};
      if (cents === null) e.amount = "errors.amountInvalid";
      else if (cents <= 0) e.amount = "errors.amountPositive";
      else if (cents > MAX_CENTS) e.amount = "errors.amountTooLarge";
      setErrors(e);
      if (e.amount || cents === null) return focusLater("goal-amount");
      const r = actions.addGoalContribution(goal.id, id.current, cents, input.date);
      if (!r.ok) return toast(t(r.error), "error");
      toast(t("planning.toast.contribution"));
      return onClose();
    }
    const { errors: found, target, saved } = validateGoalInput({ name: input.name, targetText: input.targetText, savedText: input.savedText, deadline: input.deadline }, mode === "create");
    setErrors(found);
    const first = (["name", "target", "saved", "deadline"] as const).find((k) => found[k]);
    if (first || target === null) return focusLater(`goal-${first ?? "target"}`);
    if (mode === "create") actions.createGoal(id.current, { name: input.name, target, saved, deadline: input.deadline });
    else if (goal) actions.updateGoal(goal.id, { name: input.name, target, deadline: input.deadline });
    toast(t("planning.toast.goal"));
    onClose();
  };

  const title = mode === "create" ? t("planning.goalNew") : mode === "edit" ? t("planning.goalEdit") : t("planning.contribute", { name: goal?.name ?? "" });
  return (
    <Drawer title={title} onClose={onClose} footer={footer("goal-form", t("common.save"), onClose)}>
      <form id="goal-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {mode === "contribute" ? (
          <>
            <Field id="goal-amount" label={t("tx.field.amount")} error={err("amount")} hint={t("planning.contributeHint")}>
              {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.amountText} onChange={(e) => set({ amountText: e.target.value })} />}
            </Field>
            <Field id="goal-date" label={t("tx.field.date")} error={err("date")}>
              {(a) => <input {...a} type="date" className={inputCls} max={today} value={input.date} onChange={(e) => set({ date: e.target.value })} />}
            </Field>
          </>
        ) : (
          <>
            <Field id="goal-name" label={t("planning.goalName")} error={err("name")}>
              {(a) => <input {...a} className={inputCls} maxLength={60} value={input.name} onChange={(e) => set({ name: e.target.value })} />}
            </Field>
            <Field id="goal-target" label={t("planning.goalTarget")} error={err("target")}>
              {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.targetText} onChange={(e) => set({ targetText: e.target.value })} />}
            </Field>
            {mode === "create" && (
              <Field id="goal-saved" label={t("planning.goalSaved")} error={err("saved")} hint={t("planning.goalSavedHint")}>
                {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.savedText} onChange={(e) => set({ savedText: e.target.value })} />}
              </Field>
            )}
            <Field id="goal-deadline" label={t("planning.goalDeadline")} error={err("deadline")}>
              {(a) => <input {...a} type="date" className={inputCls} value={input.deadline} onChange={(e) => set({ deadline: e.target.value })} />}
            </Field>
          </>
        )}
      </form>
    </Drawer>
  );
}

/* ───────────── Recorrência ───────────── */
const EXPENSE_METHODS: PaymentMethod[] = ["pix", "debit", "cash", "boleto", "credit_card", "other"];
const INCOME_METHODS: PaymentMethod[] = ["pix", "transfer", "cash", "boleto", "other"];
const FREQUENCIES: Frequency[] = ["monthly", "weekly", "yearly"];

export function RecurrenceDrawer({ onClose }: { onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const id = useRef(newId());
  const [input, setInput] = useState<RecurrenceInput>({ kind: "expense", amountText: "", description: "", categoryId: "", paymentMethod: "pix", accountId: data?.accounts[0]?.id ?? "", cardId: data?.cards[0]?.id ?? "", frequency: "monthly", startDate: today, endDate: "" });
  const [errors, setErrors] = useState<RecurrenceErrors>({});
  if (!data) return null;
  const set = (patch: Partial<RecurrenceInput>) => setInput((p) => ({ ...p, ...patch }));
  const err = (k: keyof RecurrenceErrors) => (errors[k] ? t(errors[k]!) : undefined);
  const isCard = input.kind === "expense" && input.paymentMethod === "credit_card";

  const submit = () => {
    const { errors: found, amount } = validateRecurrenceInput(input, { today, accounts: data.accounts, cards: data.cards, categories: data.categories });
    setErrors(found);
    const order: [keyof RecurrenceErrors, string][] = [["amount", "rec-amount"], ["description", "rec-description"], ["category", "rec-category"], ["account", "rec-account"], ["card", "rec-card"], ["startDate", "rec-startDate"], ["endDate", "rec-endDate"]];
    const first = order.find(([k]) => found[k]);
    if (first || amount === null) return focusLater(first?.[1] ?? "rec-amount");
    actions.createRecurrence(id.current, {
      kind: input.kind, amount, description: input.description, categoryId: input.categoryId, paymentMethod: input.paymentMethod,
      ...(isCard ? { cardId: input.cardId } : { accountId: input.accountId }), frequency: input.frequency, startDate: input.startDate, ...(input.endDate ? { endDate: input.endDate } : {}),
    });
    toast(t("planning.toast.recurrence"));
    onClose();
  };

  return (
    <Drawer title={t("planning.recNew")} onClose={onClose} footer={footer("rec-form", t("common.save"), onClose)}>
      <form id="rec-form" noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Segmented<"expense" | "income">
          label={t("tx.field.kind")}
          value={input.kind}
          onChange={(kind) => set({ kind, categoryId: "", paymentMethod: "pix" })}
          options={[{ value: "expense", label: t("kind.expense") }, { value: "income", label: t("kind.income") }]}
        />
        <Field id="rec-amount" label={t("tx.field.amount")} error={err("amount")}>
          {(a) => <input {...a} className={inputCls} inputMode="decimal" placeholder="0,00" value={input.amountText} onChange={(e) => set({ amountText: e.target.value })} />}
        </Field>
        <Field id="rec-description" label={t("tx.field.description")} error={err("description")}>
          {(a) => <input {...a} className={inputCls} maxLength={80} value={input.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <Field id="rec-category" label={t("tx.field.category")} error={err("category")}>
          {(a) => (
            <select {...a} className={inputCls} value={input.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">{t("tx.select")}</option>
              {data.categories.filter((c) => c.kind === input.kind).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          )}
        </Field>
        <Field id="rec-paymentMethod" label={t("tx.field.payment")} error={err("paymentMethod")}>
          {(a) => (
            <select {...a} className={inputCls} value={input.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}>
              {(input.kind === "income" ? INCOME_METHODS : EXPENSE_METHODS).map((m) => (<option key={m} value={m}>{t(`paymentMethod.${m}`)}</option>))}
            </select>
          )}
        </Field>
        {isCard ? (
          <Field id="rec-card" label={t("tx.field.card")} error={err("card")}>
            {(a) => (
              <select {...a} className={inputCls} value={input.cardId} onChange={(e) => set({ cardId: e.target.value })}>
                <option value="">{t("tx.select")}</option>
                {data.cards.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            )}
          </Field>
        ) : (
          <Field id="rec-account" label={input.kind === "income" ? t("tx.field.accountIn") : t("tx.field.accountOut")} error={err("account")}>
            {(a) => (
              <select {...a} className={inputCls} value={input.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                <option value="">{t("tx.select")}</option>
                {data.accounts.map((acc) => (<option key={acc.id} value={acc.id}>{acc.name}</option>))}
              </select>
            )}
          </Field>
        )}
        <Field id="rec-frequency" label={t("planning.frequency")}>
          {(a) => (
            <select {...a} className={inputCls} value={input.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
              {FREQUENCIES.map((f) => (<option key={f} value={f}>{t(`frequency.${f}`)}</option>))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rec-startDate" label={t("planning.startDate")} error={err("startDate")}>
            {(a) => <input {...a} type="date" className={inputCls} value={input.startDate} onChange={(e) => set({ startDate: e.target.value })} />}
          </Field>
          <Field id="rec-endDate" label={t("planning.endDate")} error={err("endDate")}>
            {(a) => <input {...a} type="date" className={inputCls} value={input.endDate} onChange={(e) => set({ endDate: e.target.value })} />}
          </Field>
        </div>
        <p className="rounded-lg border border-line bg-sunken p-3 text-xs text-muted">{isCard ? t("planning.recCardNote") : t("planning.recNote")}</p>
      </form>
    </Drawer>
  );
}
