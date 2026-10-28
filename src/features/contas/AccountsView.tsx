"use client";

import { useState } from "react";
import { ArrowLeftRight, History, Pencil, Plus } from "lucide-react";
import { Chip, EmptyState, PageHeader, Panel } from "@/components/ui";
import { ghostBtn, primaryBtn } from "@/components/form";
import { useAppData } from "@/data/store";
import { accountBalance, accountEffect, totalBalance } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import type { Account, AppData } from "@/domain/types";
import { formatDateBR } from "@/lib/format";
import { t } from "@/i18n";
import { TransactionDrawer } from "../transactions/TransactionDrawer";
import { AccountDrawer } from "./AccountDrawer";

type PanelState = { kind: "account"; account?: Account; key: number } | { kind: "transfer"; key: number } | null;

export function AccountsView() {
  const { ready, data, today } = useAppData();
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-40 animate-pulse rounded-xl bg-sunken" />;
  return <Accounts data={data} today={today} />;
}

function Accounts({ data, today }: { data: AppData; today: string }) {
  const [panel, setPanel] = useState<PanelState>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const history = (acc: Account) =>
    data.transactions
      .filter((x) => !x.deletedAt && x.date >= acc.referenceDate && accountEffect(x, acc.id) !== 0)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 15);

  return (
    <>
      <PageHeader
        title={t("nav.contas")}
        subtitle={t("accounts.subtitle", { total: formatBRL(totalBalance(data, today)) })}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghostBtn} disabled={data.accounts.length < 2} onClick={() => setPanel({ kind: "transfer", key: Date.now() })}>
              <ArrowLeftRight size={16} aria-hidden="true" /> {t("accounts.transfer")}
            </button>
            <button type="button" className={primaryBtn} onClick={() => setPanel({ kind: "account", key: Date.now() })}>
              <Plus size={16} aria-hidden="true" /> {t("accounts.new")}
            </button>
          </div>
        }
      />

      {data.accounts.length === 0 ? (
        <EmptyState>{t("accounts.empty")}</EmptyState>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {data.accounts.map((a) => {
              const open = expanded === a.id;
              const items = open ? history(a) : [];
              return (
                <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted">
                        {t(`accountType.${a.type}`)} · {t("accounts.since", { date: formatDateBR(a.referenceDate, true) })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-2 text-base font-semibold tabular-nums">{formatBRL(accountBalance(a, data.transactions, today))}</span>
                      <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : a.id)} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg" aria-label={t("accounts.history", { name: a.name })}>
                        <History size={16} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setPanel({ kind: "account", account: a, key: Date.now() })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg" aria-label={t("accounts.edit", { name: a.name })}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 rounded-lg bg-sunken p-3">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted">{t("accounts.historyEmpty")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {items.map((x) => {
                            const effect = accountEffect(x, a.id);
                            return (
                              <li key={x.id} className="flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate">
                                  <span className="mr-2 text-xs text-muted tabular-nums">{formatDateBR(x.date)}</span>
                                  {x.description} {x.status === "planned" && <Chip tone="planned">{t("status.planned")}</Chip>} {x.reversalOf && <Chip tone="warn">{t("tx.badge.reversal")}</Chip>}
                                </span>
                                <span className={`shrink-0 tabular-nums ${effect > 0 ? "text-pos" : ""} ${x.status === "planned" ? "opacity-60" : ""}`}>
                                  {effect > 0 ? "+ " : "− "}
                                  {formatBRL(Math.abs(effect))}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <p className="mt-2 text-xs text-muted">{t("accounts.historyNote")}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <p className="mt-4 text-xs text-muted">{t("accounts.note")}</p>

      {panel?.kind === "account" && <AccountDrawer key={panel.key} account={panel.account} onClose={() => setPanel(null)} />}
      {panel?.kind === "transfer" && <TransactionDrawer key={panel.key} mode={{ type: "create", kind: "transfer" }} onClose={() => setPanel(null)} />}
    </>
  );
}
