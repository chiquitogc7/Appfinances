"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayISO, type ISODate } from "@/domain/dates";
import {
  applyCreate, buildTransactions, createAccount as opCreateAccount, createCategory as opCreateCategory, deleteTransaction as opDelete,
  editTransaction as opEdit, restoreTransaction as opRestore, reverseTransaction as opReverse, settleTransaction as opSettle,
  updateAccount as opUpdateAccount, type EditPatch, type OpResult,
  addGoalContribution as opAddContribution, addInvoiceAdjustment as opAdjust, anticipateInstallments as opAnticipate, archiveGoal as opArchiveGoal,
  createCard as opCreateCard, createGoal as opCreateGoal, createRecurrence as opCreateRecurrence, endRecurrence as opEndRecurrence,
  materializeRecurrences, payInvoice as opPay, removeBudget as opRemoveBudget, restoreGoal as opRestoreGoal, setBudget as opSetBudget,
  updateCard as opUpdateCard, updateGoal as opUpdateGoal, type CardFields,
  archiveInvestment as opArchiveInv, createInvestment as opCreateInv, deleteCategory as opDeleteCategory, renameCategory as opRenameCategory,
  restoreInvestment as opRestoreInv, updateInvestment as opUpdateInv, type InvestmentFields,
} from "@/domain/ops";
import { DEFAULT_NOTIFICATIONS, type NotificationSettings } from "@/domain/alerts";
import type { Cents } from "@/domain/money";
import type { AccountType, AppData, Category, ChargeType, Recurrence } from "@/domain/types";
import type { TxInput } from "@/domain/validation";
import type { FinanceRepository } from "./repository";

export type ThemeMode = "auto" | "light" | "dark";
export type WidgetId = "cards" | "installments" | "upcoming" | "goals" | "investments" | "budgets";
export const ALL_WIDGETS: WidgetId[] = ["upcoming", "cards", "installments", "budgets", "goals", "investments"];

export interface Prefs {
  userName: string;
  notifications: NotificationSettings;
  theme: ThemeMode;
  widgets: WidgetId[];
  sidebarCollapsed: boolean;
}

export const DEFAULT_PREFS: Prefs = { userName: "Usuário", notifications: DEFAULT_NOTIFICATIONS, theme: "auto", widgets: [...ALL_WIDGETS], sidebarCollapsed: false };
const KEY = "appfinances:prefs:v1";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      userName: typeof p.userName === "string" && p.userName.trim() ? p.userName : DEFAULT_PREFS.userName,
      theme: p.theme === "light" || p.theme === "dark" ? p.theme : "auto",
      sidebarCollapsed: Boolean(p.sidebarCollapsed),
      notifications: {
        invoiceDue: p.notifications?.invoiceDue ?? true,
        budgetLimit: p.notifications?.budgetLimit ?? true,
        goalLate: p.notifications?.goalLate ?? true,
        daysBefore: Number.isInteger(p.notifications?.daysBefore) && (p.notifications?.daysBefore as number) >= 0 && (p.notifications?.daysBefore as number) <= 30 ? (p.notifications?.daysBefore as number) : 5,
      },
      widgets: Array.isArray(p.widgets) ? p.widgets.filter((w): w is WidgetId => ALL_WIDGETS.includes(w as WidgetId)) : DEFAULT_PREFS.widgets,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface Actions {
  createTransactions: (input: TxInput, amount: Cents, operationId: string) => void;
  editTransaction: (id: string, patch: EditPatch) => ActionResult;
  settleTransaction: (id: string, date: ISODate) => ActionResult;
  deleteTransaction: (id: string) => ActionResult;
  restoreTransaction: (id: string) => ActionResult;
  reverseTransaction: (id: string, operationId: string, date: ISODate) => ActionResult;
  createAccount: (id: string, input: { name: string; type: AccountType; initialBalance: Cents; referenceDate: ISODate }) => void;
  updateAccount: (id: string, patch: { name?: string; type?: AccountType }) => void;
  createCategory: (id: string, name: string, kind: Category["kind"]) => { ok: true; category: Category } | { ok: false; error: string };
  resetData: () => void;
  createCard: (id: string, f: CardFields) => void;
  updateCard: (id: string, f: CardFields) => void;
  payInvoice: (operationId: string, p: { cardId: string; invoiceKey: string; amount: Cents; date: ISODate; accountId: string }) => ActionResult;
  addInvoiceAdjustment: (operationId: string, p: { cardId: string; invoiceKey: string; type: ChargeType | "refund"; amount: Cents; date: ISODate; categoryId?: string; description: string }) => ActionResult;
  anticipateInstallments: (groupId: string, indexes: number[], date: ISODate) => ActionResult;
  createRecurrence: (id: string, f: Omit<Recurrence, "id" | "active" | "createdAt">) => void;
  endRecurrence: (id: string) => ActionResult;
  setBudget: (categoryId: string, limit: Cents) => void;
  removeBudget: (categoryId: string) => void;
  createGoal: (id: string, f: { name: string; target: Cents; saved: Cents; deadline: ISODate }) => void;
  updateGoal: (id: string, f: { name: string; target: Cents; deadline: ISODate }) => void;
  addGoalContribution: (goalId: string, contributionId: string, amount: Cents, date: ISODate) => ActionResult;
  archiveGoal: (id: string) => void;
  restoreGoal: (id: string) => void;
  createInvestment: (id: string, f: InvestmentFields) => void;
  updateInvestment: (id: string, f: InvestmentFields) => void;
  archiveInvestment: (id: string) => void;
  restoreInvestment: (id: string) => void;
  renameCategory: (id: string, name: string) => ActionResult;
  deleteCategory: (id: string) => ActionResult;
  /** Substitui todos os dados (já validados) por um backup. */
  importData: (data: AppData) => void;
}

interface Ctx {
  ready: boolean;
  /** "local" = demonstração neste navegador · "cloud" = conta com login (Firestore). */
  mode: FinanceRepository["mode"];
  /** Tenta carregar de novo depois de uma falha. */
  reload: () => void;
  error: boolean;
  saveError: boolean;
  actions: Actions;
  data: AppData | null;
  today: ISODate;
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  resetPrefs: () => void;
}

const AppDataContext = createContext<Ctx | null>(null);

export function AppDataProvider({ repository, children }: { repository: FinanceRepository; children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [today, setToday] = useState<ISODate>("1970-01-01");
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const dataRef = useRef<AppData | null>(null);
  const todayRef = useRef<ISODate>("1970-01-01");
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    const t = todayISO();
    setError(false);
    repository
      .load(t)
      .then((loaded) => {
        if (!alive) return;
        // Recorrências: completa as ocorrências que faltam até o horizonte (idempotente).
        const d = materializeRecurrences(loaded, t, new Date().toISOString());
        if (d !== loaded) dirty.current = true;
        setToday(t);
        todayRef.current = t;
        dataRef.current = d;
        setData(d);
        setPrefsState(loadPrefs());
        setReady(true);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [repository, loadKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* armazenamento indisponível: preferências valem só nesta sessão */
    }
    applyTheme(prefs.theme);
  }, [prefs, ready]);

  useEffect(() => {
    if (prefs.theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.theme]);

  /** Salva o dado mais recente. Na nuvem as gravações são enfileiradas pelo repositório. */
  const persist = useCallback(async () => {
    const current = dataRef.current;
    if (!current) return;
    try {
      await repository.save(current);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [repository]);

  useEffect(() => {
    if (!ready || !data || !dirty.current) return;
    void persist();
  }, [data, ready, persist]);

  // Falhou ao salvar? Tenta de novo quando a rede voltar e a cada 20 s.
  useEffect(() => {
    if (!saveError) return;
    const timer = setInterval(() => void persist(), 20_000);
    const onOnline = () => void persist();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [saveError, persist]);

  const actions = useMemo<Actions>(() => {
    /** Aplica sobre o dado mais recente (ref), então cliques repetidos nunca usam estado velho. */
    const commit = (fn: (d: AppData) => OpResult): ActionResult => {
      const current = dataRef.current;
      if (!current) return { ok: false, error: "common.loadError" };
      const r = fn(current);
      if (r.error) return { ok: false, error: r.error };
      if (r.data !== current) {
        dirty.current = true;
        dataRef.current = r.data;
        setData(r.data);
      }
      return { ok: true };
    };
    const now = () => new Date().toISOString();
    return {
      createTransactions: (input, amount, operationId) => {
        commit((d) => ({ data: applyCreate(d, buildTransactions(input, amount, operationId, todayRef.current, now(), d.cards.find((c) => c.id === input.cardId))) }));
      },
      editTransaction: (id, patch) => commit((d) => opEdit(d, id, patch, now())),
      settleTransaction: (id, date) => commit((d) => opSettle(d, id, date, now(), todayRef.current)),
      deleteTransaction: (id) => commit((d) => opDelete(d, id, now())),
      restoreTransaction: (id) => commit((d) => opRestore(d, id, now())),
      reverseTransaction: (id, operationId, date) => commit((d) => opReverse(d, id, operationId, date, now(), todayRef.current)),
      createAccount: (id, input) => {
        commit((d) => ({ data: opCreateAccount(d, id, input) }));
      },
      updateAccount: (id, patch) => {
        commit((d) => ({ data: opUpdateAccount(d, id, patch) }));
      },
      createCategory: (id, name, kind) => {
        const current = dataRef.current;
        if (!current) return { ok: false, error: "common.loadError" };
        const r = opCreateCategory(current, id, name, kind);
        if (r.error || !r.category) return { ok: false, error: r.error ?? "common.loadError" };
        if (r.data !== current) {
          dirty.current = true;
          dataRef.current = r.data;
          setData(r.data);
        }
        return { ok: true, category: r.category };
      },
      createCard: (id, f) => {
        commit((d) => ({ data: opCreateCard(d, id, f) }));
      },
      updateCard: (id, f) => {
        commit((d) => ({ data: opUpdateCard(d, id, f) }));
      },
      payInvoice: (operationId, p) => commit((d) => opPay(d, operationId, p, now(), todayRef.current)),
      addInvoiceAdjustment: (operationId, p) => commit((d) => opAdjust(d, operationId, p, now(), todayRef.current)),
      anticipateInstallments: (groupId, indexes, date) => commit((d) => opAnticipate(d, groupId, indexes, date, now(), todayRef.current)),
      createRecurrence: (id, f) => {
        commit((d) => ({ data: opCreateRecurrence(d, id, f, now(), todayRef.current) }));
      },
      endRecurrence: (id) => commit((d) => opEndRecurrence(d, id, now(), todayRef.current)),
      setBudget: (categoryId, limit) => {
        commit((d) => ({ data: opSetBudget(d, categoryId, limit) }));
      },
      removeBudget: (categoryId) => {
        commit((d) => ({ data: opRemoveBudget(d, categoryId) }));
      },
      createGoal: (id, f) => {
        commit((d) => ({ data: opCreateGoal(d, id, f) }));
      },
      updateGoal: (id, f) => {
        commit((d) => ({ data: opUpdateGoal(d, id, f) }));
      },
      addGoalContribution: (goalId, contributionId, amount, date) => commit((d) => opAddContribution(d, goalId, contributionId, amount, date)),
      archiveGoal: (id) => {
        commit((d) => ({ data: opArchiveGoal(d, id, now()) }));
      },
      restoreGoal: (id) => {
        commit((d) => ({ data: opRestoreGoal(d, id) }));
      },
      createInvestment: (id, f) => {
        commit((d) => ({ data: opCreateInv(d, id, f) }));
      },
      updateInvestment: (id, f) => {
        commit((d) => ({ data: opUpdateInv(d, id, f) }));
      },
      archiveInvestment: (id) => {
        commit((d) => ({ data: opArchiveInv(d, id, now()) }));
      },
      restoreInvestment: (id) => {
        commit((d) => ({ data: opRestoreInv(d, id) }));
      },
      renameCategory: (id, name) => commit((d) => opRenameCategory(d, id, name)),
      deleteCategory: (id) => commit((d) => opDeleteCategory(d, id)),
      importData: (imported) => {
        dirty.current = true;
        dataRef.current = imported;
        setData(imported);
      },
      resetData: () => {
        try {
          const fresh = repository.reset(todayRef.current);
          dataRef.current = fresh;
          dirty.current = false;
          setData(fresh);
          setSaveError(false);
        } catch {
          setSaveError(true);
        }
      },
    };
  }, [repository]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => setPrefsState((p) => ({ ...p, ...patch })), []);
  const resetPrefs = useCallback(() => setPrefsState(DEFAULT_PREFS), []);

  const value = useMemo<Ctx>(
    () => ({ ready, mode: repository.mode, reload: () => setLoadKey((k) => k + 1), error, saveError, actions, data, today, prefs, setPrefs, resetPrefs }),
    [ready, repository.mode, error, saveError, actions, data, today, prefs, setPrefs, resetPrefs],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): Ctx {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData precisa estar dentro de AppDataProvider");
  return ctx;
}
