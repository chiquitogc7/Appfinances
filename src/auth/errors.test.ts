import { describe, expect, it } from "vitest";
import { t } from "@/i18n";
import { mapAuthError, validateCredentials } from "./errors";

describe("erros de login", () => {
  it("não revela se o e-mail existe: usuário inexistente e senha errada têm a mesma mensagem", () => {
    const a = mapAuthError("auth/user-not-found");
    expect(a).toBe(mapAuthError("auth/wrong-password"));
    expect(a).toBe(mapAuthError("auth/invalid-credential"));
    expect(t(a)).toBe("E-mail ou senha incorretos.");
  });
  it("desistir da janela do Google não gera mensagem; código desconhecido vira mensagem genérica", () => {
    expect(mapAuthError("auth/popup-closed-by-user")).toBe("");
    expect(mapAuthError("auth/algo-novo")).toBe("authErrors.generic");
  });
  it("todas as chaves existem no dicionário", () => {
    for (const code of ["auth/invalid-email", "auth/email-already-in-use", "auth/weak-password", "auth/too-many-requests", "auth/network-request-failed", "auth/popup-blocked", "auth/user-disabled", "x"]) {
      const key = mapAuthError(code);
      expect(t(key), key).not.toBe(key);
    }
  });
});

describe("validação de credenciais", () => {
  it("login pede e-mail válido e senha", () => {
    expect(validateCredentials("login", { email: "", password: "" })).toEqual({ email: "authErrors.emailRequired", password: "authErrors.passwordRequired" });
    expect(validateCredentials("login", { email: "ana@", password: "x" })).toEqual({ email: "authErrors.invalidEmail" });
    expect(validateCredentials("login", { email: "ana@exemplo.com", password: "x" })).toEqual({});
  });
  it("cadastro exige 8+ caracteres e confirmação igual", () => {
    expect(validateCredentials("signup", { email: "ana@exemplo.com", password: "1234567", confirm: "1234567" }).password).toBe("authErrors.passwordShort");
    expect(validateCredentials("signup", { email: "ana@exemplo.com", password: "12345678", confirm: "12345679" }).confirm).toBe("authErrors.passwordMismatch");
    expect(validateCredentials("signup", { email: "ana@exemplo.com", password: "12345678", confirm: "12345678" })).toEqual({});
  });
  it("recuperar senha só pede o e-mail", () => {
    expect(validateCredentials("reset", { email: "ana@exemplo.com", password: "" })).toEqual({});
    expect(validateCredentials("reset", { email: "nao-e-email", password: "" })).toEqual({ email: "authErrors.invalidEmail" });
  });
});
