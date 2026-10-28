"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useAppData } from "@/data/store";
import { buildAlerts } from "@/domain/alerts";
import { formatBRL } from "@/domain/money";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";

/** Avisos calculados dos dados, conforme as preferências de notificação. Só dentro do app. */
export function AlertsPanel() {
  const { data, today, prefs } = useAppData();
  if (!data) return null;
  const items = buildAlerts(data, today, prefs.notifications);
  if (items.length === 0) return null;
  const urgent = (type: string) => type === "invoiceOverdue" || type === "budgetOver" || type === "goalLate";
  return (
    <section aria-label={t("alerts.title")} className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={16} className="text-warn" aria-hidden="true" /> {t("alerts.title")}
      </h2>
      <ul className="space-y-1.5 text-sm">
        {items.slice(0, 6).map((a) => (
          <li key={a.id}>
            <Link href={a.href} className={`underline-offset-2 hover:underline ${urgent(a.type) ? "text-neg" : "text-warn"}`}>
              {t(`alerts.${a.type}`, { name: a.name, date: a.date ? formatDateBR(a.date, true) : "", amount: a.amount !== undefined ? formatBRL(a.amount) : "" })}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 6 && <p className="mt-2 text-xs text-muted">+ {items.length - 6}</p>}
    </section>
  );
}
