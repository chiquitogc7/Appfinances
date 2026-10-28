"use client";

import { t } from "@/i18n";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold">{t("common.errorTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("common.errorBody")}</p>
      <button type="button" onClick={reset} className="mt-4 h-10 rounded-lg bg-brand-purple px-4 text-sm font-medium text-on-brand">
        {t("common.retry")}
      </button>
    </div>
  );
}
