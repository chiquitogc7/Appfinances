"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Chip, Panel } from "@/components/ui";
import { ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import type { Category } from "@/domain/types";
import { newId } from "@/lib/id";
import { t } from "@/i18n";

export function CategoriesSection() {
  const { data, actions } = useAppData();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Category["kind"]>("expense");
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ id: string; name: string; error?: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!data) return null;

  const add = () => {
    const r = actions.createCategory(newId(), name, kind);
    if (!r.ok) return setError(t(r.error));
    setName("");
    setError(undefined);
    toast(t("settings.categories.toast.created"));
  };
  const saveRename = () => {
    if (!editing) return;
    const r = actions.renameCategory(editing.id, editing.name);
    if (!r.ok) return setEditing({ ...editing, error: t(r.error) });
    setEditing(null);
    toast(t("settings.categories.toast.renamed"));
  };
  const remove = (id: string) => {
    const r = actions.deleteCategory(id);
    setConfirm(null);
    toast(r.ok ? t("settings.categories.toast.removed") : t(r.error), r.ok ? "ok" : "error");
  };

  const list = (k: Category["kind"]) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t(`settings.categories.${k}`)}</h3>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {data.categories.filter((c) => c.kind === k).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            {editing?.id === c.id ? (
              <div className="flex w-full flex-wrap items-start gap-2">
                <div className="min-w-40 flex-1">
                  <label htmlFor={`rename-${c.id}`} className="sr-only">{t("settings.categories.name")}</label>
                  <input id={`rename-${c.id}`} className={inputCls} maxLength={40} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value, error: undefined })} onKeyDown={(e) => e.key === "Enter" && saveRename()} aria-invalid={editing.error ? true : undefined} autoFocus />
                  {editing.error && <p role="alert" className="mt-1 text-xs text-neg">{editing.error}</p>}
                </div>
                <button type="button" className={`${primaryBtn} !h-10`} onClick={saveRename}>{t("settings.categories.save")}</button>
                <button type="button" className={`${ghostBtn} !h-10`} onClick={() => setEditing(null)}>{t("common.cancel")}</button>
              </div>
            ) : (
              <>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                  {c.name} {c.custom && <Chip tone="real">{t("settings.categories.custom")}</Chip>}
                </span>
                {c.custom && (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditing({ id: c.id, name: c.name })} aria-label={t("settings.categories.rename", { name: c.name })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg"><Pencil size={14} aria-hidden="true" /></button>
                    {confirm === c.id ? (
                      <>
                        <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs text-neg`} onClick={() => remove(c.id)}>{t("settings.categories.confirm")}</button>
                        <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => setConfirm(null)}>{t("common.cancel")}</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirm(c.id)} aria-label={t("settings.categories.remove", { name: c.name })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-neg"><Trash2 size={14} aria-hidden="true" /></button>
                    )}
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Panel title={t("settings.categories.title")} subtitle={t("settings.categories.hint")}>
      <form noValidate className="mb-5 flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <div className="min-w-48 flex-1">
          <label htmlFor="cat-name" className="mb-1 block text-sm font-medium">{t("settings.categories.add")}</label>
          <input id="cat-name" className={inputCls} maxLength={40} value={name} placeholder={t("settings.categories.name")} onChange={(e) => { setName(e.target.value); setError(undefined); }} aria-invalid={error ? true : undefined} aria-describedby={error ? "cat-name-err" : undefined} />
          {error && <p id="cat-name-err" role="alert" className="mt-1 text-xs text-neg">{error}</p>}
        </div>
        <div>
          <label htmlFor="cat-kind" className="mb-1 block text-sm font-medium">{t("settings.categories.kind")}</label>
          <select id="cat-kind" className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as Category["kind"])}>
            <option value="expense">{t("kind.expense")}</option>
            <option value="income">{t("kind.income")}</option>
          </select>
        </div>
        <button type="submit" className={`${primaryBtn} mt-6`}>{t("common.add")}</button>
      </form>
      <div className="grid gap-5 md:grid-cols-2">
        {list("expense")}
        {list("income")}
      </div>
    </Panel>
  );
}
