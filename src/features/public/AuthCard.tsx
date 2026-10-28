"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { validateCredentials, type CredentialErrors } from "@/auth/errors";
import { firebaseConfigured } from "@/config/env";
import { LogoMark } from "@/components/Logo";
import { Field, ghostBtn, inputCls, primaryBtn } from "@/components/form";
import { t } from "@/i18n";

type Variant = "login" | "signup" | "reset";

/**
 * Com o Firebase configurado, é um login real. Sem ele, o formulário fica desabilitado de propósito:
 * não simulamos login seguro com verificação visual.
 */
export function AuthCard({ variant }: { variant: Variant }) {
  const router = useRouter();
  const auth = useAuth();
  const live = firebaseConfigured;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (live && auth.status === "signedIn") router.replace("/dashboard");
  }, [live, auth.status, router]);

  const fail = (e: unknown) => {
    const key = (e as Error).message;
    if (key) setFormError(t(key));
  };

  const submit = async () => {
    setFormError(undefined);
    setNotice(undefined);
    const found = validateCredentials(variant, { email, password, confirm });
    setErrors(found);
    const first = (["email", "password", "confirm"] as const).find((k) => found[k]);
    if (first) return void requestAnimationFrame(() => document.getElementById(`auth-${first}`)?.focus());
    setBusy(true);
    try {
      if (variant === "login") await auth.signIn(email, password);
      else if (variant === "signup") await auth.signUp(email, password);
      else {
        await auth.sendReset(email);
        setNotice(t("auth.resetSent"));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setFormError(undefined);
    setBusy(true);
    try {
      await auth.signInWithGoogle();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: keyof CredentialErrors) => (errors[k] ? t(errors[k]!) : undefined);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5" aria-label="Appfinances">
          <LogoMark size={32} />
          <span className="text-lg font-semibold tracking-tight">Appfinances</span>
        </Link>
        <div className="rounded-xl border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold tracking-tight">{t(`auth.${variant}.title`)}</h1>
          <p className="mt-1 text-sm text-muted">{t(`auth.${variant}.subtitle`)}</p>

          {!live && (
            <div role="status" className="mt-4 rounded-lg border border-dashed border-brand-orange/70 bg-brand-orange/[0.08] p-3 text-xs">
              <strong className="text-brand-orange">{t("auth.unavailableTitle")}</strong> {t("auth.unavailableNotConfigured")}
            </div>
          )}

          <form
            className="mt-4 space-y-3"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={!live || busy} className={`space-y-3 ${live ? "" : "opacity-60"}`}>
              <Field id="auth-email" label={t("auth.email")} error={err("email")}>
                {(a) => <input {...a} type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />}
              </Field>
              {variant !== "reset" && (
                <Field id="auth-password" label={t("auth.password")} error={err("password")} hint={variant === "signup" ? t("auth.passwordHint") : undefined}>
                  {(a) => <input {...a} type="password" autoComplete={variant === "signup" ? "new-password" : "current-password"} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />}
                </Field>
              )}
              {variant === "signup" && (
                <Field id="auth-confirm" label={t("auth.confirm")} error={err("confirm")}>
                  {(a) => <input {...a} type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
                </Field>
              )}
              {formError && <p role="alert" className="text-sm text-neg">{formError}</p>}
              {notice && <p role="status" className="text-sm text-pos">{notice}</p>}
              <button type="submit" className={`${primaryBtn} w-full`}>{busy ? t("auth.submitting") : t(`auth.${variant}.submit`)}</button>
              {variant !== "reset" && (
                <>
                  <p className="text-center text-xs text-muted">{t("auth.or")}</p>
                  <button type="button" onClick={() => void google()} className={`${ghostBtn} w-full`}>{t("auth.google")}</button>
                </>
              )}
            </fieldset>
          </form>

          {!live && (
            <Link href="/dashboard" className="mt-4 flex h-10 items-center justify-center rounded-lg border border-brand-purple text-sm font-medium text-brand-purple hover:bg-brand-purple/[0.08]">
              {t("auth.explore")}
            </Link>
          )}
        </div>
        <p className="mt-5 text-center text-sm text-muted">
          {variant !== "login" && <Link className="underline" href="/login">{t("auth.toLogin")}</Link>}
          {variant === "login" && (
            <>
              <Link className="underline" href="/cadastro">{t("auth.toSignup")}</Link> · <Link className="underline" href="/recuperar-senha">{t("auth.toReset")}</Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
