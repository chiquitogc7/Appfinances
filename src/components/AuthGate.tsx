"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { getFirebase } from "@/auth/firebaseClient";
import { AppDataProvider } from "@/data/store";
import { createCloudRepository } from "@/data/cloudRepository";
import { createFirestoreRemote } from "@/data/firestoreRemote";
import { localRepository, type FinanceRepository } from "@/data/repository";
import { useToast } from "@/components/Toast";
import { LogoMark } from "@/components/Logo";
import { ghostBtn, primaryBtn } from "@/components/form";
import { t } from "@/i18n";

function Splash({ children }: { children?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <LogoMark size={36} />
      {children ?? <p role="status" aria-busy="true" className="text-sm text-muted">{t("auth.loading")}</p>}
    </main>
  );
}

function VerifyEmail() {
  const { user, refresh, resendVerification, signOut } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const check = async () => {
    setBusy(true);
    try {
      await refresh();
      toast(t("auth.verify.notYet"), "error"); // se confirmou, o gate troca de tela e este aviso some junto
    } catch (e) {
      toast(t((e as Error).message || "authErrors.generic"), "error");
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    try {
      await resendVerification();
      setCooldown(60);
      toast(t("auth.verify.resent"));
    } catch (e) {
      toast(t((e as Error).message || "authErrors.generic"), "error");
    }
  };

  return (
    <Splash>
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-semibold">{t("auth.verify.title")}</h1>
        <p className="text-sm text-muted">{t("auth.verify.body", { email: user?.email ?? "" })}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={primaryBtn} disabled={busy} onClick={check}>{t("auth.verify.done")}</button>
          <button type="button" className={ghostBtn} disabled={cooldown > 0} onClick={resend}>{cooldown > 0 ? t("auth.verify.wait", { seconds: cooldown }) : t("auth.verify.resend")}</button>
          <button type="button" className={ghostBtn} onClick={() => void signOut()}>{t("auth.signOut")}</button>
        </div>
      </div>
    </Splash>
  );
}

/**
 * Protege as rotas privadas:
 *  - sem Firebase configurado → modo demonstração local (dados fictícios, no navegador);
 *  - sem login → vai para /login; com login mas e-mail não confirmado → tela de confirmação;
 *  - confirmado → abre os dados da conta na nuvem.
 * Isto é só experiência de uso: quem protege os dados de verdade são as regras do Firestore.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const router = useRouter();
  const [repo, setRepo] = useState<FinanceRepository | null>(null);
  const [repoError, setRepoError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const uid = user?.uid;
  const verified = Boolean(user?.emailVerified);

  useEffect(() => {
    if (status === "signedOut") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    let alive = true;
    setRepo(null);
    setRepoError(false);
    if (status !== "signedIn" || !uid || !verified) return;
    (async () => {
      const { db } = await getFirebase();
      const remote = await createFirestoreRemote(db, uid);
      if (alive) setRepo(createCloudRepository(remote));
    })().catch(() => alive && setRepoError(true));
    return () => {
      alive = false;
    };
  }, [status, uid, verified, attempt]);

  if (status === "demo") return <AppDataProvider repository={localRepository}>{children}</AppDataProvider>;
  if (status === "loading" || status === "signedOut") return <Splash />;
  if (!verified) return <VerifyEmail />;
  if (repoError) {
    return (
      <Splash>
        <div role="alert" className="max-w-md space-y-3">
          <p className="text-sm">{t("auth.cloudError")}</p>
          <button type="button" className={primaryBtn} onClick={() => setAttempt((a) => a + 1)}>{t("common.retry")}</button>
        </div>
      </Splash>
    );
  }
  if (!repo) return <Splash />;
  return <AppDataProvider key={uid} repository={repo}>{children}</AppDataProvider>;
}
