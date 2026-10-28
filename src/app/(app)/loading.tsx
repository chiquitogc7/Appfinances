import { t } from "@/i18n";

export default function Loading() {
  return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-64 animate-pulse rounded-xl bg-sunken" />;
}
