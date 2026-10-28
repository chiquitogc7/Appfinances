"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { firebaseConfigured } from "@/config/env";
import { mapAuthError } from "./errors";
import { getFirebase } from "./firebaseClient";

export type AuthStatus = "demo" | "loading" | "signedOut" | "signedIn";
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

interface AuthCtx {
  status: AuthStatus;
  user: AuthUser | null;
  /** Todas as ações rejeitam com Error cuja `message` é uma chave de texto (vazia = o usuário desistiu). */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const unavailable = () => Promise.reject(new Error("authErrors.unavailable"));
const DEMO: AuthCtx = { status: "demo", user: null, signIn: unavailable, signUp: unavailable, signInWithGoogle: unavailable, sendReset: unavailable, resendVerification: unavailable, refresh: unavailable, signOut: unavailable };

const Ctx = createContext<AuthCtx>(DEMO);

const toUser = (u: { uid: string; email: string | null; emailVerified: boolean }): AuthUser => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified });

function fail(e: unknown): never {
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  throw new Error(mapAuthError(code));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(firebaseConfigured ? "loading" : "demo");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let unsubscribe: (() => void) | undefined;
    let alive = true;
    (async () => {
      const [{ auth }, { onAuthStateChanged }] = await Promise.all([getFirebase(), import("firebase/auth")]);
      unsubscribe = onAuthStateChanged(auth, (u) => {
        if (!alive) return;
        setUser(u ? toUser(u) : null);
        setStatus(u ? "signedIn" : "signedOut");
      });
    })().catch(() => alive && setStatus("signedOut"));
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([getFirebase(), import("firebase/auth")]);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      fail(e);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const [{ auth }, { createUserWithEmailAndPassword, sendEmailVerification }] = await Promise.all([getFirebase(), import("firebase/auth")]);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(cred.user);
    } catch (e) {
      fail(e);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const [{ auth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([getFirebase(), import("firebase/auth")]);
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      fail(e);
    }
  }, []);

  const sendReset = useCallback(async (email: string) => {
    try {
      const [{ auth }, { sendPasswordResetEmail }] = await Promise.all([getFirebase(), import("firebase/auth")]);
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e) {
      // Não revelamos se o e-mail existe: "usuário não encontrado" vira sucesso silencioso.
      if (typeof e === "object" && e && (e as { code?: string }).code === "auth/user-not-found") return;
      fail(e);
    }
  }, []);

  const resendVerification = useCallback(async () => {
    try {
      const { auth } = await getFirebase();
      const { sendEmailVerification } = await import("firebase/auth");
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    } catch (e) {
      fail(e);
    }
  }, []);

  /** Depois de verificar o e-mail é preciso recarregar o usuário e renovar o token (as regras do Firestore exigem e-mail verificado). */
  const refresh = useCallback(async () => {
    try {
      const { auth } = await getFirebase();
      if (!auth.currentUser) return;
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      setUser(toUser(auth.currentUser));
    } catch (e) {
      fail(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const [{ auth }, { signOut: fbSignOut }] = await Promise.all([getFirebase(), import("firebase/auth")]);
      await fbSignOut(auth);
    } catch (e) {
      fail(e);
    }
  }, []);

  const value = useMemo<AuthCtx>(() => (firebaseConfigured ? { status, user, signIn, signUp, signInWithGoogle, sendReset, resendVerification, refresh, signOut } : DEMO), [status, user, signIn, signUp, signInWithGoogle, sendReset, resendVerification, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
