import Link from "next/link";
import { ArrowRight, CalendarClock, CreditCard, Layers, ShieldCheck } from "lucide-react";
import { firebaseConfigured } from "@/config/env";
import { LogoMark } from "@/components/Logo";
import { t } from "@/i18n";

const POINTS = [
  { icon: Layers, key: "separate" },
  { icon: CreditCard, key: "card" },
  { icon: CalendarClock, key: "planned" },
  { icon: ShieldCheck, key: "honest" },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Appfinances">
          <LogoMark />
          <span className="text-base font-semibold tracking-tight">Appfinances</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm" aria-label="Acesso">
          <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-sunken">{t("landing.login")}</Link>
          <Link href="/cadastro" className="hidden rounded-lg px-3 py-2 hover:bg-sunken sm:block">{t("landing.signup")}</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:px-6 sm:pt-20">
        <p className="text-sm font-semibold text-brand-orange">{t("landing.eyebrow")}</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">{t("landing.title")}</h1>
        <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">{t("landing.subtitle")}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href={firebaseConfigured ? "/login" : "/dashboard"} className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand-purple px-5 text-sm font-medium text-on-brand">
            {firebaseConfigured ? t("landing.ctaCloud") : t("landing.cta")} <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <span className="text-xs text-muted">{firebaseConfigured ? t("landing.ctaCloudNote") : t("landing.ctaNote")}</span>
        </div>

        <ul className="mt-16 grid gap-x-10 gap-y-8 border-t border-line pt-10 sm:grid-cols-2">
          {POINTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex gap-4">
              <Icon size={22} className="mt-0.5 shrink-0 text-brand-purple" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold">{t(`landing.points.${key}.title`)}</h2>
                <p className="mt-1 text-sm text-muted">{t(`landing.points.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-16 rounded-lg border border-dashed border-brand-orange/70 bg-brand-orange/[0.06] p-4 text-sm">
          <strong className="text-brand-orange">{t("landing.statusTitle")}</strong> {t("landing.status")}
        </p>
      </main>
    </div>
  );
}
