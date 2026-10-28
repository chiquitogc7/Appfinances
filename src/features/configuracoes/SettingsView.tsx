"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Panel, PageHeader } from "@/components/ui";
import { ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { useToast } from "@/components/Toast";
import { ALL_WIDGETS, useAppData, type ThemeMode, type WidgetId } from "@/data/store";
import { exportBackup, parseBackup } from "@/domain/backup";
import type { AppData } from "@/domain/types";
import { downloadText } from "@/lib/export";
import { t } from "@/i18n";
import { CategoriesSection } from "./CategoriesSection";

const THEMES: ThemeMode[] = ["auto", "light", "dark"];
const SECTIONS = ["profile", "appearance", "currency", "categories", "notifications", "dashboard", "data", "accountsCards"] as const;

export function SettingsView() {
  const { ready, data, prefs, setPrefs, resetPrefs, actions, mode } = useAppData();
  const auth = useAuth();
  const toast = useToast();
  const [confirmPrefs, setConfirmPrefs] = useState(false);
  const [confirmData, setConfirmData] = useState(false);
  const [pending, setPending] = useState<{ file: string; data: AppData } | null>(null);
  if (!ready || !data) return <div role="status" aria-busy="true" aria-label={t("common.loading")} className="h-40 animate-pulse rounded-xl bg-sunken" />;

  const toggleWidget = (id: WidgetId, on: boolean) => setPrefs({ widgets: on ? [...prefs.widgets, id] : prefs.widgets.filter((w) => w !== id) });
  const notif = (patch: Partial<typeof prefs.notifications>) => setPrefs({ notifications: { ...prefs.notifications, ...patch } });

  const pickBackup = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return toast(t("errors.backupTooBig"), "error");
    const r = parseBackup(await file.text());
    if (!r.data) return toast(t(r.error ?? "errors.backupInvalid"), "error");
    setPending({ file: file.name, data: r.data });
  };

  return (
    <>
      <PageHeader title={t("nav.configuracoes")} subtitle={t("settings.subtitle")} />
      <nav aria-label={t("settings.sections")} className="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s} href={`#sec-${s}`} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-sunken">{t(`settings.nav.${s}`)}</a>
        ))}
      </nav>

      <div className="grid max-w-3xl gap-4">
        <div id="sec-profile" className="scroll-mt-4">
          <Panel title={t("settings.profile.title")}>
            <label htmlFor="userName" className="mb-1 block text-sm font-medium">{t("settings.profile.name")}</label>
            <input id="userName" value={prefs.userName} maxLength={40} onChange={(e) => setPrefs({ userName: e.target.value })} onBlur={(e) => !e.target.value.trim() && setPrefs({ userName: "Usuário" })} className={inputCls} />
            <p className="mt-1 text-xs text-muted">{t("settings.profile.hint")}</p>
          </Panel>
        </div>

        <div id="sec-appearance" className="scroll-mt-4">
          <Panel title={t("settings.theme.title")}>
            <div role="radiogroup" aria-label={t("settings.theme.title")} className="grid grid-cols-3 gap-2">
              {THEMES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={prefs.theme === m} onClick={() => setPrefs({ theme: m })} className={`h-10 rounded-lg border text-sm ${prefs.theme === m ? "border-brand-purple bg-brand-purple/[0.1] font-medium text-brand-purple" : "border-line hover:bg-sunken"}`}>
                  {t(`settings.theme.${m}`)}
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div id="sec-currency" className="scroll-mt-4">
          <Panel title={t("settings.currency.title")}>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium">{t("settings.currency.base")}</dt>
                <dd>{t("settings.currency.baseValue")}</dd>
                <dd className="mt-1 text-xs text-muted">{t("settings.currency.baseNote")}</dd>
              </div>
              <div>
                <dt className="font-medium">{t("settings.currency.fxTitle")}</dt>
                <dd className="mt-1 text-xs text-muted">{t("settings.currency.fxUnavailable")}</dd>
              </div>
              <div>
                <dt className="font-medium">{t("settings.currency.language")}</dt>
                <dd>{t("settings.currency.languageValue")}</dd>
                <dd className="mt-1 text-xs text-muted">{t("settings.currency.languageNote")}</dd>
              </div>
            </dl>
          </Panel>
        </div>

        <div id="sec-categories" className="scroll-mt-4"><CategoriesSection /></div>

        <div id="sec-notifications" className="scroll-mt-4">
          <Panel title={t("settings.notifications.title")} subtitle={t("settings.notifications.hint")}>
            <div className="space-y-3 text-sm">
              {(["invoiceDue", "budgetLimit", "goalLate"] as const).map((k) => (
                <label key={k} className="flex items-center gap-3">
                  <input type="checkbox" checked={prefs.notifications[k]} onChange={(e) => notif({ [k]: e.target.checked })} />
                  {t(`settings.notifications.${k}`)}
                </label>
              ))}
              <div className="max-w-xs">
                <label htmlFor="daysBefore" className="mb-1 block font-medium">{t("settings.notifications.daysBefore")}</label>
                <input id="daysBefore" type="number" min={0} max={30} className={inputCls} disabled={!prefs.notifications.invoiceDue} value={prefs.notifications.daysBefore} onChange={(e) => notif({ daysBefore: Math.min(30, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} />
              </div>
            </div>
          </Panel>
        </div>

        <div id="sec-dashboard" className="scroll-mt-4">
          <Panel title={t("settings.dashboardPrefs.title")} subtitle={t("settings.dashboardPrefs.hint")}>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_WIDGETS.map((id) => (
                <label key={id} className="flex items-center gap-3 text-sm">
                  <input type="checkbox" checked={prefs.widgets.includes(id)} onChange={(e) => toggleWidget(id, e.target.checked)} />
                  {t(`widgets.${id}.title`)}
                </label>
              ))}
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-xs text-muted">{t("settings.dashboard.hint")}</p>
              {confirmPrefs ? (
                <div role="alertdialog" aria-label={t("settings.dashboard.confirm")} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{t("settings.dashboard.confirm")}</span>
                  <button type="button" onClick={() => { resetPrefs(); setConfirmPrefs(false); }} className="h-9 rounded-lg bg-neg px-3 text-sm font-medium text-on-brand">{t("settings.dashboard.yes")}</button>
                  <button type="button" onClick={() => setConfirmPrefs(false)} className={`${ghostBtn} !h-9`}>{t("common.cancel")}</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmPrefs(true)} className={`${ghostBtn} !h-9`}>{t("settings.dashboard.reset")}</button>
              )}
            </div>
          </Panel>
        </div>

        <div id="sec-data" className="scroll-mt-4">
          <Panel title={t("settings.security.title")}>
            {mode === "cloud" ? (
              <>
                <p className="rounded-lg border border-line bg-sunken p-3 text-sm">{t("settings.security.cloud")}</p>
                <p className="mt-2 text-sm">{t("settings.security.signedAs", { email: auth.user?.email ?? "" })}</p>
                <button type="button" className={`${ghostBtn} mt-3`} onClick={() => void auth.signOut()}>{t("settings.security.signOut")}</button>
              </>
            ) : (
              <>
                <p className="rounded-lg border border-dashed border-brand-orange/70 bg-brand-orange/[0.08] p-3 text-sm">{t("settings.security.noLogin")}</p>
                <p className="mt-2 text-xs text-muted">{t("settings.security.session")}</p>
                <p className="mt-1 text-xs text-muted">{t("settings.security.tip")}</p>
              </>
            )}

            <div className="mt-5 grid gap-5 border-t border-line pt-5">
              <div>
                <button type="button" className={ghostBtn} onClick={() => { downloadText(`appfinances-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(data, new Date().toISOString()), "application/json"); toast(t("settings.data.exportDone")); }}>{t("settings.data.export")}</button>
                <p className="mt-1 text-xs text-muted">{t("settings.data.exportHint")}</p>
              </div>
              <div>
                <label htmlFor="backup-file" className="mb-1 block text-sm font-medium">{t("settings.data.importFile")}</label>
                <input id="backup-file" type="file" accept="application/json,.json" className="block w-full text-sm file:mr-3 file:h-10 file:rounded-lg file:border file:border-line file:bg-surface file:px-4 file:text-sm" onChange={(e) => { void pickBackup(e.target.files?.[0]); e.target.value = ""; }} />
                <p className="mt-1 text-xs text-muted">{mode === "cloud" ? t("settings.security.cloudImport") : t("settings.data.importHint")}</p>
                {pending && (
                  <div role="alertdialog" aria-label={t("settings.data.importConfirm", { file: pending.file })} className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-sunken p-3">
                    <span className="text-sm">{t("settings.data.importConfirm", { file: pending.file })}</span>
                    <button type="button" className="h-9 rounded-lg bg-neg px-3 text-sm font-medium text-on-brand" onClick={() => { actions.importData(pending.data); setPending(null); toast(t("settings.data.importDone")); }}>{t("settings.data.importYes")}</button>
                    <button type="button" className={`${ghostBtn} !h-9`} onClick={() => setPending(null)}>{t("common.cancel")}</button>
                  </div>
                )}
              </div>
              {mode === "local" && (
              <div>
                  <p className="mb-1 text-sm font-medium">{t("settings.data.title")}</p>
                  <p className="mb-2 text-xs text-muted">{t("settings.data.hint")}</p>
                  {confirmData ? (
                    <div role="alertdialog" aria-label={t("settings.data.confirm")} className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{t("settings.data.confirm")}</span>
                      <button type="button" onClick={() => { actions.resetData(); setConfirmData(false); toast(t("settings.data.done")); }} className="h-9 rounded-lg bg-neg px-3 text-sm font-medium text-on-brand">{t("settings.data.yes")}</button>
                      <button type="button" onClick={() => setConfirmData(false)} className={`${ghostBtn} !h-9`}>{t("common.cancel")}</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmData(true)} className={`${ghostBtn} !h-9`}>{t("settings.data.reset")}</button>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div id="sec-accountsCards" className="scroll-mt-4">
          <Panel title={t("settings.accountsCards.title")} subtitle={t("settings.accountsCards.hint")}>
            <div className="flex flex-wrap gap-2">
              <Link href="/contas" className={ghostBtn}>{t("settings.accountsCards.accounts")}</Link>
              <Link href="/cartoes" className={ghostBtn}>{t("settings.accountsCards.cards")}</Link>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
