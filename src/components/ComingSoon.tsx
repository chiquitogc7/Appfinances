import { Construction } from "lucide-react";
import { t } from "@/i18n";
import { PageHeader } from "./ui";

/** Página honesta: diz o que será entregue e em qual etapa, sem simular funcionalidade. */
export function ComingSoon({ name, stage }: { name: string; stage: 2 | 3 | 4 }) {
  return (
    <>
      <PageHeader title={t(`nav.${name}`)} />
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <Construction size={28} className="mx-auto text-brand-orange" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold">{t("soon.title", { stage })}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t(`soon.${name}`)}</p>
      </div>
    </>
  );
}
