"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/Drawer";
import { Field, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { formatBRL } from "@/domain/money";
import type { Card, Transaction } from "@/domain/types";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";

export function AnticipateDrawer({ card, onClose }: { card: Card; onClose: () => void }) {
  const { data, today, actions } = useAppData();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string>();

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const x of data?.transactions ?? []) {
      if (x.deletedAt || x.cardId !== card.id || !x.installment || x.status !== "planned" || x.reversedBy) continue;
      map.set(x.installment.groupId, [...(map.get(x.installment.groupId) ?? []), x]);
    }
    return [...map.entries()].map(([groupId, items]) => ({ groupId, items: items.sort((a, b) => a.installment!.index - b.installment!.index) }));
  }, [data?.transactions, card.id]);

  if (!data) return null;
  const all = groups.flatMap((g) => g.items);
  const total = all.filter((x) => picked.has(x.id)).reduce((s, x) => s + x.amount, 0);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const submit = () => {
    if (picked.size === 0) return setError(t("anticipate.pickOne"));
    for (const g of groups) {
      const indexes = g.items.filter((x) => picked.has(x.id)).map((x) => x.installment!.index);
      if (indexes.length === 0) continue;
      const r = actions.anticipateInstallments(g.groupId, indexes, date);
      if (!r.ok) return setError(t(r.error));
    }
    toast(t("anticipate.toast"));
    onClose();
  };

  return (
    <Drawer
      title={t("anticipate.title", { card: card.name })}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm tabular-nums">{t("anticipate.total", { value: formatBRL(total) })}</span>
          <div className="flex gap-2">
            <button type="button" className={ghostBtn} onClick={onClose}>{t("common.cancel")}</button>
            <button type="button" className={primaryBtn} onClick={submit}>{t("anticipate.action")}</button>
          </div>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">{t("anticipate.intro")}</p>
      <Field id="ant-date" label={t("anticipate.date")} error={error}>
        {(a) => <input {...a} type="date" max={today} className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); setError(undefined); }} />}
      </Field>
      {groups.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{t("anticipate.none")}</p>
      ) : (
        <div className="mt-5 space-y-5">
          {groups.map((g) => (
            <fieldset key={g.groupId}>
              <legend className="mb-2 text-sm font-semibold">{g.items[0].description}</legend>
              <ul className="space-y-1">
                {g.items.map((x) => (
                  <li key={x.id}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-sunken">
                      <span className="flex items-center gap-3">
                        <input type="checkbox" checked={picked.has(x.id)} onChange={() => { toggle(x.id); setError(undefined); }} />
                        {t("anticipate.installment", { index: x.installment!.index, total: x.installment!.total, date: formatDateBR(x.date) })}
                      </span>
                      <span className="tabular-nums">{formatBRL(x.amount)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
      )}
    </Drawer>
  );
}
