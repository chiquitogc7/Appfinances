"use client";

import { useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import { Chip, EmptyState, PageHeader, Panel } from "@/components/ui";
import { ghostBtn, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { netWorth } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import type { AppData, Investment } from "@/domain/types";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";
import { InvestmentDrawer } from "./InvestmentDrawer";

export function PatrimonyView() {
  const { ready, data, today } = useAppData();
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-40 animate-pulse rounded-xl bg-sunken" />;
  return <Patrimony data={data} today={today} />;
}

type Row = { label: string; value: number; tone: "purple" | "orange" | "neg" };

function Patrimony({ data, today }: { data: AppData; today: string }) {
  const { actions } = useAppData();
  const toast = useToast();
  const [panel, setPanel] = useState<{ asset?: Investment; key: number } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const nw = netWorth(data, today);
  const archived = data.investments.filter((i) => i.archivedAt);

  const rows: Row[] = [
    ...nw.accounts.map((a) => ({ label: a.name, value: a.value, tone: "purple" as const })),
    ...nw.investmentsByCategory.map((c) => ({ label: c.category, value: c.amount, tone: "orange" as const })),
    ...(nw.liabilities > 0 ? [{ label: t("patrimony.liabilities"), value: -nw.liabilities, tone: "neg" as const }] : []),
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const color = { purple: "bg-brand-purple", orange: "bg-brand-orange", neg: "bg-neg" } as const;

  const assetRow = (i: Investment, isArchived: boolean) => {
    const result = i.current - i.applied;
    const pct = i.applied > 0 ? (result / i.applied) * 100 : null;
    return (
      <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">{i.name} <Chip tone="neutral">{i.category}</Chip></p>
          <p className="text-xs text-muted">
            {t("patrimony.applied")} {formatBRL(i.applied)} · {t("patrimony.asOf", { date: formatDateBR(i.referenceDate, true) })}
            {(i.updates?.length ?? 0) > 1 && ` · ${t("patrimony.updates", { count: i.updates!.length })}`}
          </p>
          {i.notes && <p className="mt-0.5 text-xs text-muted">{i.notes}</p>}
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-2 text-right">
            <p className="text-sm font-semibold tabular-nums">{formatBRL(i.current)}</p>
            <p className={`text-xs tabular-nums ${result >= 0 ? "text-pos" : "text-neg"}`}>
              {result >= 0 ? "+" : "−"} {formatBRL(Math.abs(result))}
              {pct !== null && ` (${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`}
            </p>
          </div>
          {isArchived ? (
            <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => { actions.restoreInvestment(i.id); toast(t("patrimony.toast.restored")); }}>{t("tx.restore")}</button>
          ) : (
            <>
              <button type="button" onClick={() => setPanel({ asset: i, key: Date.now() })} aria-label={t("patrimony.edit", { name: i.name })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg"><Pencil size={16} aria-hidden="true" /></button>
              <button type="button" onClick={() => { actions.archiveInvestment(i.id); toast(t("patrimony.toast.archived")); }} aria-label={t("patrimony.archive", { name: i.name })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg"><Archive size={16} aria-hidden="true" /></button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t("nav.patrimonio")}
        subtitle={t("patrimony.subtitle")}
        actions={<button type="button" className={primaryBtn} onClick={() => setPanel({ key: Date.now() })}><Plus size={16} aria-hidden="true" /> {t("patrimony.new")}</button>}
      />

      <section aria-label={t("patrimony.total")} className="mb-4 rounded-xl border border-line border-l-4 border-l-brand-purple bg-surface p-5">
        <p className="text-xs font-medium text-muted">{t("patrimony.total")}</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${nw.total < 0 ? "text-neg" : ""}`}>{formatBRL(nw.total)}</p>
        <p className="mt-1 text-xs text-muted">{t("patrimony.totalHint")}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div><dt className="text-xs text-muted">{t("patrimony.accounts")}</dt><dd className="text-lg font-semibold tabular-nums">{formatBRL(nw.accountsTotal)}</dd></div>
          <div><dt className="text-xs text-muted">{t("patrimony.investments")}</dt><dd className="text-lg font-semibold tabular-nums">{formatBRL(nw.investmentsTotal)}</dd></div>
          <div><dt className="text-xs text-muted">{t("patrimony.liabilities")}</dt><dd className="text-lg font-semibold tabular-nums">{nw.liabilities > 0 ? `− ${formatBRL(nw.liabilities)}` : formatBRL(0)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">{t("patrimony.liabilitiesNote")}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("patrimony.composition")}>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={`${r.tone}-${r.label}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{r.label}</span>
                  <span className={`shrink-0 tabular-nums ${r.value < 0 ? "text-neg" : ""}`}>{r.value < 0 ? `− ${formatBRL(-r.value)}` : formatBRL(r.value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <div className={`h-full rounded-full ${color[r.tone]}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-purple" aria-hidden="true" />{t("patrimony.accounts")}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-orange" aria-hidden="true" />{t("patrimony.investments")}</span>
          </p>
        </Panel>

        <Panel title={t("patrimony.assets")} subtitle={t("patrimony.manualNote")}>
          {nw.investments.length === 0 ? <EmptyState>{t("patrimony.empty")}</EmptyState> : <ul className="divide-y divide-line">{nw.investments.map((i) => assetRow(i, false))}</ul>}
          {nw.investments.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-sm">
              <span className="text-muted">{t("patrimony.result")}: </span>
              <span className={`font-semibold tabular-nums ${nw.investmentsTotal - nw.investmentsApplied >= 0 ? "text-pos" : "text-neg"}`}>
                {nw.investmentsTotal - nw.investmentsApplied >= 0 ? "+" : "−"} {formatBRL(Math.abs(nw.investmentsTotal - nw.investmentsApplied))}
              </span>
            </p>
          )}
          {archived.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <button type="button" aria-expanded={showArchived} className="text-sm text-muted underline" onClick={() => setShowArchived((s) => !s)}>{showArchived ? t("patrimony.hideArchived") : t("patrimony.showArchived", { count: archived.length })}</button>
              {showArchived && <ul className="mt-3 divide-y divide-line opacity-80">{archived.map((i) => assetRow(i, true))}</ul>}
            </div>
          )}
        </Panel>
      </div>

      {panel && <InvestmentDrawer key={panel.key} asset={panel.asset} onClose={() => setPanel(null)} />}
    </>
  );
}
