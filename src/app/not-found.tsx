import Link from "next/link";
import { t } from "@/i18n";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t("common.notFoundTitle")}</h1>
      <p className="max-w-md text-sm text-muted">{t("common.notFoundBody")}</p>
      <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-brand-purple px-4 text-sm font-medium text-on-brand">
        {t("common.backHome")}
      </Link>
    </main>
  );
}
