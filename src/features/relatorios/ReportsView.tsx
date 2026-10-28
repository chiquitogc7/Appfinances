"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { useAppData } from "@/data/store";
import { addMonthsToKey, monthEnd, monthKey, monthStart } from "@/domain/dates";
import { formatBRL, formatBRLCompact } from "@/domain/money";
import { balanceDaily, buildReport, REPORT_IDS, type ReportFilters, type ReportId, type ReportTable } from "@/domain/reports";
import type { AppData } from "@/domain/types";
import { downloadText, EXPORTERS } from "@/lib/export";
import { displayCell } from "@/lib/reportCells";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";

export function ReportsView() {
  const { ready, data, today } = useAppData();
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-40 animate-pulse rounded-xl bg-sunken" />;
  return <Reports data={data} today={today} />;
}

const RIGHT = new Set(["money", "percent", "int"]);

function TableView({ table }: { table: ReportTable }) {
  const cell = (v: ReportTable["rows"][number][string], type: ReportTable["columns"][number]["type"]) => displayCell(v ?? null, type, t);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left text-sm font-semibold">{t(table.titleKey)}</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            {table.columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${RIGHT.has(c.type) ? "text-right" : "text-left"}`}>{t(c.labelKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((c, j) => {
                const v = r[c.key];
                const neg = c.type === "money" && typeof v === "number" && v < 0;
                const Tag = j === 0 ? "th" : "td";
                return (
                  <Tag key={c.key} {...(j === 0 ? { scope: "row" as const } : {})} className={`px-3 py-2 ${j === 0 ? "text-left font-normal" : ""} ${RIGHT.has(c.type) ? "text-right tabular-nums" : ""} ${neg ? "text-neg" : ""}`}>{cell(v, c.type)}</Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
        {table.footer && (
          <tfoot className="border-t-2 border-line font-semibold">
            <tr>
              {table.columns.map((c, j) => {
                const v = table.footer![c.key];
                const Tag = j === 0 ? "th" : "td";
                return <Tag key={c.key} {...(j === 0 ? { scope: "row" as const } : {})} className={`px-3 py-2 ${j === 0 ? "text-left" : ""} ${RIGHT.has(c.type) ? "text-right tabular-nums" : ""}`}>{v === undefined ? "" : cell(v, c.type)}</Tag>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Reports({ data, today }: { data: AppData; today: string }) {
  const toast = useToast();
  const [reportId, setReportId] = useState<ReportId>("incomeExpense");
  const curKey = monthKey(today);
  const [filters, setFilters] = useState<ReportFilters>({ from: monthStart(curKey), to: monthEnd(curKey), source: "", categoryId: "" });
  const set = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const range = useMemo(() => {
    const dates = data.transactions.filter((x) => !x.deletedAt).map((x) => x.date).sort();
    return { from: dates[0] ?? monthStart(curKey), to: dates.at(-1) ?? monthEnd(curKey) };
  }, [data.transactions, curKey]);

  const tables = useMemo(() => buildReport(reportId, data, filters, today), [reportId, data, filters, today]);
  const daily = useMemo(() => (reportId === "balance" ? balanceDaily(data, filters, today) : []), [reportId, data, filters, today]);
  const spendingRows = reportId === "spending" ? tables[0].rows : [];
  const usesFilters = reportId !== "netWorth" && reportId !== "commitments";
  const empty = tables.every((tb) => tb.rows.length === 0);

  const presets: { key: string; patch: Partial<ReportFilters> }[] = [
    { key: "month", patch: { from: monthStart(curKey), to: monthEnd(curKey) } },
    { key: "prevMonth", patch: { from: monthStart(addMonthsToKey(curKey, -1)), to: monthEnd(addMonthsToKey(curKey, -1)) } },
    { key: "last3", patch: { from: monthStart(addMonthsToKey(curKey, -2)), to: monthEnd(curKey) } },
    { key: "year", patch: { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` } },
    { key: "all", patch: range },
  ];

  const exportCsv = () => {
    const csv = EXPORTERS[0].run!(tables, { t });
    downloadText(`appfinances-${reportId}-${filters.from || "inicio"}_${filters.to || "fim"}.csv`, csv, EXPORTERS[0].mime);
    toast(t("reports.export.done"));
  };

  return (
    <>
      <PageHeader title={t("nav.relatorios")} subtitle={t("reports.subtitle")} />

      <div role="tablist" aria-label={t("nav.relatorios")} className="mb-4 flex flex-wrap gap-1 rounded-xl bg-sunken p-1">
        {REPORT_IDS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={reportId === id} onClick={() => setReportId(id)} className={`h-9 rounded-lg px-3 text-sm ${reportId === id ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-fg"}`}>
            {t(`reports.tab.${id}`)}
          </button>
        ))}
      </div>

      <Panel title={t("reports.filters.title")} className="mb-4">
        <fieldset disabled={!usesFilters} className={usesFilters ? "" : "opacity-50"}>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("statement.period")}>
            {presets.map((p) => (
              <button key={p.key} type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => set(p.patch)}>{t(`reports.filters.presets.${p.key}`)}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="r-from" className="mb-1 block text-sm font-medium">{t("reports.filters.from")}</label>
              <input id="r-from" type="date" className={inputCls} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div>
              <label htmlFor="r-to" className="mb-1 block text-sm font-medium">{t("reports.filters.to")}</label>
              <input id="r-to" type="date" className={inputCls} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
            <div>
              <label htmlFor="r-source" className="mb-1 block text-sm font-medium">{t("reports.filters.source")}</label>
              <select id="r-source" className={inputCls} value={filters.source} onChange={(e) => set({ source: e.target.value })}>
                <option value="">{t("reports.filters.allSources")}</option>
                <optgroup label={t("reports.filters.accounts")}>{data.accounts.map((a) => (<option key={a.id} value={`acc:${a.id}`}>{a.name}</option>))}</optgroup>
                <optgroup label={t("reports.filters.cards")}>{data.cards.map((c) => (<option key={c.id} value={`card:${c.id}`}>{c.name}</option>))}</optgroup>
              </select>
            </div>
            <div>
              <label htmlFor="r-cat" className="mb-1 block text-sm font-medium">{t("reports.filters.category")}</label>
              <select id="r-cat" className={inputCls} value={filters.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">{t("reports.filters.allCategories")}</option>
                {data.categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          </div>
        </fieldset>
        <p className="mt-3 text-xs text-muted">{t(`reports.note.${reportId}`)}</p>
        {usesFilters && filters.from && filters.to && filters.from > filters.to && <p role="alert" className="mt-2 text-xs text-neg">{t("errors.rangeInvalid")}</p>}
      </Panel>

      <Panel
        action={
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("reports.export.title")}>
            <button type="button" className={`${primaryBtn} !h-9`} onClick={exportCsv} disabled={empty}>
              <Download size={16} aria-hidden="true" /> {t("reports.export.csv")}
            </button>
            {EXPORTERS.filter((e) => !e.available).map((e) => (
              <button key={e.id} type="button" disabled title={t("reports.export.soon")} className={`${ghostBtn} !h-9`}>
                {t(`reports.export.${e.id}`)} · {t("reports.export.soon")}
              </button>
            ))}
          </div>
        }
      >
        {empty ? (
          <EmptyState>{t("reports.empty")}</EmptyState>
        ) : (
          <div className="space-y-8">
            {reportId === "balance" && daily.length > 0 && (
              <div className="h-64" role="img" aria-label={t("reports.chart.balance")}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => formatDateBR(d)} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
                    <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} width={76} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 10, fontSize: 12 }} labelFormatter={(d) => formatDateBR(String(d), true)} formatter={(v: unknown) => formatBRL(Number(v))} />
                    <Area type="monotone" dataKey="balance" name={t("reports.col.balance")} stroke="rgb(var(--purple))" fill="rgb(var(--purple))" fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {reportId === "spending" && spendingRows.length > 0 && (
              <ul className="space-y-2" aria-hidden="true">
                {spendingRows.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-40 shrink-0 truncate">{displayCell(r.category, "text", t)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-brand-purple" style={{ width: `${(r.share as number) * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
            )}
            {tables.map((tb) => (<TableView key={tb.id} table={tb} />))}
          </div>
        )}
      </Panel>
    </>
  );
}
