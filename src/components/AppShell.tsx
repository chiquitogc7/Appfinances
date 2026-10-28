"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Ellipsis, LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useAppData } from "@/data/store";
import { t } from "@/i18n";
import { LogoMark } from "./Logo";
import { MOBILE_PRIMARY, NAV } from "./nav";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { prefs, setPrefs, data, error, saveError, mode, reload } = useAppData();
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  const [moreOpen, setMoreOpen] = useState(false);
  const collapsed = prefs.sidebarCollapsed;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const label = (cls: string) => (collapsed ? "hidden" : `hidden lg:inline ${cls}`);

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface md:flex ${collapsed ? "w-[72px]" : "w-[72px] lg:w-64"}`}
        aria-label={t("nav.main")}
      >
        <Link href="/dashboard" className="flex h-16 items-center gap-3 px-5" aria-label="Appfinances">
          <LogoMark />
          <span className={label("text-base font-semibold tracking-tight")}>Appfinances</span>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                title={t(key)}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${active ? "bg-brand-purple/[0.1] font-medium text-brand-purple" : "text-muted hover:bg-sunken hover:text-fg"}`}
              >
                {active && <span className="absolute -left-3 top-2 h-6 w-1 rounded-r bg-brand-orange" aria-hidden="true" />}
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span className={label("")}>{t(key)}</span>
              </Link>
            );
          })}
        </nav>
        {signedIn && (
          <button type="button" onClick={() => void auth.signOut()} title={t("auth.signOut")} className="mx-3 mb-1 flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-sunken hover:text-fg">
            <LogOut size={18} aria-hidden="true" className="shrink-0" />
            <span className={label("")}>{t("auth.signOut")}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setPrefs({ sidebarCollapsed: !collapsed })}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="mx-3 mb-4 hidden h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-sunken hover:text-fg lg:flex"
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          {!collapsed && <span>{t("nav.collapse")}</span>}
        </button>
      </aside>

      <div className={`pb-24 md:pb-0 ${collapsed ? "md:pl-[72px]" : "md:pl-[72px] lg:pl-64"}`}>
        {data?.isDemo && (
          <div role="status" className="border-b border-dashed border-brand-orange/60 bg-brand-orange/[0.08] px-4 py-2 text-center text-xs text-fg">
            <strong className="font-semibold text-brand-orange">{t("demo.title")}</strong> {t("demo.body")}
          </div>
        )}
        {saveError && (
          <div role="alert" className="border-b border-neg/50 bg-neg/[0.08] px-4 py-2 text-center text-xs text-neg">
            {mode === "cloud" ? t("cloud.saveError") : t("demo.saveError")}
          </div>
        )}
        <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <div role="alert" className="space-y-3">
              <p>{t("common.loadError")}</p>
              <button type="button" onClick={reload} className="h-10 rounded-lg bg-brand-purple px-4 text-sm font-medium text-on-brand">{t("common.retry")}</button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t("nav.main")}>
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.href)).map(({ href, key, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${active ? "font-semibold text-brand-purple" : "text-muted"}`}>
                  <Icon size={20} aria-hidden="true" />
                  {t(`${key}Short`)}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] text-muted">
              <Ellipsis size={20} aria-hidden="true" />
              {t("nav.more")}
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
          <button type="button" aria-label={t("common.close")} className="absolute inset-0 bg-fg/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t("nav.more")}</h2>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label={t("common.close")} className="rounded-lg p-2 text-muted hover:bg-sunken">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {signedIn && (
              <button type="button" onClick={() => void auth.signOut()} className="mb-2 flex h-10 w-full items-center gap-3 rounded-lg border border-line px-3 text-sm">
                <LogOut size={18} aria-hidden="true" /> {t("auth.signOut")}
              </button>
            )}
            <ul className="grid grid-cols-2 gap-2">
              {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map(({ href, key, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} aria-current={isActive(href) ? "page" : undefined} className={`flex h-12 items-center gap-3 rounded-lg border border-line px-3 text-sm ${isActive(href) ? "border-brand-purple text-brand-purple" : ""}`}>
                    <Icon size={18} aria-hidden="true" />
                    {t(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
