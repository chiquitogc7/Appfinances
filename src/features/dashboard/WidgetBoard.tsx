"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, SlidersHorizontal, Trash2, Check } from "lucide-react";
import { ALL_WIDGETS, useAppData, type WidgetId } from "@/data/store";
import { t } from "@/i18n";
import { Chip, Panel } from "@/components/ui";
import { WIDGET_REGISTRY, type WidgetProps } from "./Widgets";

const iconBtn = "rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent";

export function WidgetBoard(props: WidgetProps) {
  const { prefs, setPrefs } = useAppData();
  const [editing, setEditing] = useState(false);
  const order = prefs.widgets;
  const hidden = ALL_WIDGETS.filter((w) => !order.includes(w));

  const move = (id: WidgetId, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setPrefs({ widgets: next });
  };

  return (
    <section aria-labelledby="widgets-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="widgets-title" className="text-base font-semibold">
          {t("dashboard.widgets.title")}
        </h2>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-pressed={editing}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm hover:bg-sunken"
        >
          {editing ? <Check size={16} aria-hidden="true" /> : <SlidersHorizontal size={16} aria-hidden="true" />}
          {editing ? t("dashboard.widgets.done") : t("dashboard.widgets.customize")}
        </button>
      </div>

      {order.length === 0 && (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t("dashboard.widgets.none")}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {order.map((id, idx) => {
          const { Component, planned } = WIDGET_REGISTRY[id];
          return (
            <Panel
              key={id}
              title={t(`widgets.${id}.title`)}
              action={
                editing ? (
                  <div className="-mr-1.5 -mt-1.5 flex">
                    <button type="button" className={iconBtn} disabled={idx === 0} onClick={() => move(id, -1)} aria-label={t("dashboard.widgets.moveUp", { name: t(`widgets.${id}.title`) })}>
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={iconBtn} disabled={idx === order.length - 1} onClick={() => move(id, 1)} aria-label={t("dashboard.widgets.moveDown", { name: t(`widgets.${id}.title`) })}>
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => setPrefs({ widgets: order.filter((w) => w !== id) })} aria-label={t("dashboard.widgets.remove", { name: t(`widgets.${id}.title`) })}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <Chip tone={planned ? "planned" : "real"}>{planned ? t("dashboard.kpi.planned") : t("dashboard.kpi.realized")}</Chip>
                )
              }
            >
              <Component {...props} />
            </Panel>
          );
        })}
      </div>

      {editing && hidden.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-line p-4">
          <p className="mb-2 text-sm font-medium">{t("dashboard.widgets.available")}</p>
          <div className="flex flex-wrap gap-2">
            {hidden.map((id) => (
              <button key={id} type="button" onClick={() => setPrefs({ widgets: [...order, id] })} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm hover:bg-sunken">
                <Plus size={16} aria-hidden="true" />
                {t(`widgets.${id}.title`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
