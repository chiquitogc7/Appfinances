"use client";

import { useState } from "react";
import { ChevronDown, FastForward, Pencil, Plus } from "lucide-react";
import { Chip, EmptyState, Meter, PageHeader, Panel } from "@/components/ui";
import { ghostBtn, primaryBtn } from "@/components/form";
import { useAppData } from "@/data/store";
import { cardUsage, computeInvoices, invoiceTransactions, type Invoice } from "@/domain/finance";
import { formatBRL } from "@/domain/money";
import type { AppData, Card, Transaction } from "@/domain/types";
import { formatDateBR, formatMonthTitle } from "@/lib/format";
import { t } from "@/i18n";
import { AnticipateDrawer } from "./AnticipateDrawer";
import { CardDrawer } from "./CardDrawer";
import { InvoiceActionDrawer } from "./InvoiceActionDrawer";

const TONE = { open: "neutral", closed: "warn", overdue: "neg", paid: "pos" } as const;
const FIRST = 4;

type PanelState =
  | { kind: "card"; card?: Card; key: number }
  | { kind: "invoice"; card: Card; invoice: Invoice; type: "pay" | "interest"; key: number }
  | { kind: "anticipate"; card: Card; key: number }
  | null;

export function CardsView() {
  const { ready, data, today } = useAppData();
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-40 animate-pulse rounded-xl bg-sunken" />;
  return <Cards data={data} today={today} />;
}

function Cards({ data, today }: { data: AppData; today: string }) {
  const [panel, setPanel] = useState<PanelState>(null);
  const invoices = computeInvoices(data, today);
  const accounts = new Map(data.accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader
        title={t("nav.cartoes")}
        subtitle={t("cards.subtitle")}
        actions={
          <button type="button" className={primaryBtn} onClick={() => setPanel({ kind: "card", key: Date.now() })}>
            <Plus size={16} aria-hidden="true" /> {t("cards.new")}
          </button>
        }
      />

      {data.cards.length === 0 ? (
        <EmptyState>{t("cards.empty")}</EmptyState>
      ) : (
        <div className="space-y-6">
          {data.cards.map((card) => (
            <CardPanel key={card.id} card={card} data={data} invoices={invoices.filter((i) => i.cardId === card.id)} payAccount={accounts.get(card.payAccountId) ?? "—"} setPanel={setPanel} />
          ))}
        </div>
      )}

      {panel?.kind === "card" && <CardDrawer key={panel.key} card={panel.card} onClose={() => setPanel(null)} />}
      {panel?.kind === "invoice" && <InvoiceActionDrawer key={panel.key} card={panel.card} invoice={panel.invoice} initialType={panel.type} onClose={() => setPanel(null)} />}
      {panel?.kind === "anticipate" && <AnticipateDrawer key={panel.key} card={panel.card} onClose={() => setPanel(null)} />}
    </>
  );
}

function CardPanel({ card, data, invoices, payAccount, setPanel }: { card: Card; data: AppData; invoices: Invoice[]; payAccount: string; setPanel: (p: PanelState) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { used, available } = cardUsage(card, invoices);
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const paid = invoices.filter((i) => i.status === "paid").sort((a, b) => b.due.localeCompare(a.due)).slice(0, 6);
  const shown = showAll ? unpaid : unpaid.slice(0, FIRST);
  const hasPlanned = data.transactions.some((x) => !x.deletedAt && x.cardId === card.id && x.installment && x.status === "planned" && !x.reversedBy);

  const row = (inv: Invoice) => {
    const isOpen = open === inv.key;
    const items = isOpen ? invoiceTransactions(data, card.id, inv.key) : [];
    return (
      <li key={inv.key} className="py-3 first:pt-0 last:pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span>{formatMonthTitle(inv.key)}</span>
              <Chip tone={TONE[inv.status]}>{t(`invoiceStatus.${inv.status}`)}</Chip>
            </p>
            <p className="text-xs text-muted">{t("cards.invoiceDates", { closing: formatDateBR(inv.closing), due: formatDateBR(inv.due) })}</p>
          </div>
          <div className="text-right text-sm tabular-nums">
            <p className="font-semibold">{formatBRL(inv.remaining)}</p>
            <p className="text-xs text-muted">{t("cards.invoiceOf", { total: formatBRL(inv.total), paid: formatBRL(inv.paid) })}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : inv.key)} className={`${ghostBtn} !h-8 !px-3 text-xs`}>
            <ChevronDown size={14} aria-hidden="true" className={isOpen ? "rotate-180" : ""} /> {t("cards.purchases")}
          </button>
          {inv.remaining > 0 && (
            <button type="button" className={`${inv.status === "open" ? ghostBtn : primaryBtn} !h-8 !px-3 text-xs`} onClick={() => setPanel({ kind: "invoice", card, invoice: inv, type: "pay", key: Date.now() })}>
              {t("cards.pay")}
            </button>
          )}
          <button type="button" className={`${ghostBtn} !h-8 !px-3 text-xs`} onClick={() => setPanel({ kind: "invoice", card, invoice: inv, type: "interest", key: Date.now() })}>
            {t("cards.adjust")}
          </button>
        </div>
        {isOpen && (
          <ul className="mt-3 space-y-1.5 rounded-lg bg-sunken p-3">
            {items.length === 0 ? (
              <li className="text-xs text-muted">{t("cards.noPurchases")}</li>
            ) : (
              items.map((x) => <InvoiceLine key={x.id} x={x} />)
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <Panel
      title={card.name}
      subtitle={`${card.issuer} · ${t("cards.closesDue", { closing: card.closingDay, due: card.dueDay })} · ${t("cards.paidWith", { account: payAccount })}`}
      action={
        <div className="flex gap-1">
          <button type="button" disabled={!hasPlanned} onClick={() => setPanel({ kind: "anticipate", card, key: Date.now() })} className={`${ghostBtn} !h-8 !px-3 text-xs`}>
            <FastForward size={14} aria-hidden="true" /> {t("cards.anticipate")}
          </button>
          <button type="button" onClick={() => setPanel({ kind: "card", card, key: Date.now() })} aria-label={t("cards.edit", { name: card.name })} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-fg">
            <Pencil size={16} aria-hidden="true" />
          </button>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div><p className="text-xs text-muted">{t("cards.limit")}</p><p className="text-lg font-semibold tabular-nums">{formatBRL(card.limit)}</p></div>
        <div><p className="text-xs text-muted">{t("cards.used")}</p><p className="text-lg font-semibold tabular-nums">{formatBRL(used)}</p></div>
        <div><p className="text-xs text-muted">{t("cards.available")}</p><p className={`text-lg font-semibold tabular-nums ${available < 0 ? "text-neg" : ""}`}>{formatBRL(available)}</p></div>
      </div>
      <div className="mb-5"><Meter ratio={card.limit > 0 ? used / card.limit : 0} tone={used > card.limit ? "neg" : used / card.limit > 0.8 ? "warn" : "purple"} label={t("widgets.cards.usage", { name: card.name })} /></div>

      <h3 className="mb-2 text-sm font-semibold">{t("cards.invoices")}</h3>
      {unpaid.length === 0 ? <EmptyState>{t("cards.noOpen")}</EmptyState> : <ul className="divide-y divide-line">{shown.map(row)}</ul>}
      {unpaid.length > FIRST && (
        <button type="button" className="mt-3 text-sm text-brand-purple underline" onClick={() => setShowAll((s) => !s)}>
          {showAll ? t("cards.showLess") : t("cards.showMore", { count: unpaid.length - FIRST })}
        </button>
      )}
      {paid.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <button type="button" aria-expanded={showPaid} className="text-sm text-muted underline" onClick={() => setShowPaid((s) => !s)}>
            {showPaid ? t("cards.hidePaid") : t("cards.showPaid", { count: paid.length })}
          </button>
          {showPaid && <ul className="mt-3 divide-y divide-line">{paid.map(row)}</ul>}
        </div>
      )}
    </Panel>
  );
}

function InvoiceLine({ x }: { x: Transaction }) {
  const label =
    x.kind === "invoice_payment" ? t("cards.line.payment") : x.kind === "card_refund" ? t("cards.line.refund") : x.chargeType ? t(`invoiceAction.types.${x.chargeType}`) : x.installment ? `${x.installment.index}/${x.installment.total}` : null;
  const credit = x.kind === "card_refund" || x.kind === "invoice_payment" || Boolean(x.reversalOf);
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate">
        <span className="mr-2 text-xs text-muted tabular-nums">{formatDateBR(x.date)}</span>
        {x.description} {label && <Chip tone={x.kind === "invoice_payment" ? "pos" : "neutral"}>{label}</Chip>} {x.reversalOf && <Chip tone="warn">{t("tx.badge.reversal")}</Chip>} {x.status === "planned" && <Chip tone="planned">{t("status.planned")}</Chip>}
      </span>
      <span className={`shrink-0 tabular-nums ${credit ? "text-pos" : ""}`}>{`${credit ? "− " : ""}${formatBRL(x.amount)}`}</span>
    </li>
  );
}
