"use client";

import Link from "next/link";
import { useAppData } from "@/data/store";
import { t } from "@/i18n";

/** Conta nova e vazia: mostra por onde começar. */
export function FirstSteps() {
  const { data } = useAppData();
  if (!data || data.accounts.length > 0) return null;
  const steps = [
    { href: "/contas", key: "account" },
    { href: "/cartoes", key: "card" },
    { href: "/movimentacoes", key: "movement" },
    { href: "/planejamento", key: "budget" },
  ] as const;
  return (
    <section aria-label={t("firstSteps.title")} className="rounded-xl border border-dashed border-brand-purple/60 bg-brand-purple/[0.05] p-5">
      <h2 className="text-base font-semibold">{t("firstSteps.title")}</h2>
      <p className="mt-1 text-sm text-muted">{t("firstSteps.body")}</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
        {steps.map((s) => (
          <li key={s.key}><Link className="text-brand-purple underline" href={s.href}>{t(`firstSteps.${s.key}`)}</Link></li>
        ))}
      </ol>
    </section>
  );
}
