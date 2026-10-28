/** Traduz códigos de erro do Firebase Auth em chaves de texto. Mensagens de login são genéricas de propósito (não revelam se o e-mail existe). */
export function mapAuthError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-login-credentials":
      return "authErrors.invalidCredentials";
    case "auth/invalid-email":
      return "authErrors.invalidEmail";
    case "auth/email-already-in-use":
      return "authErrors.emailInUse";
    case "auth/weak-password":
      return "authErrors.weakPassword";
    case "auth/too-many-requests":
      return "authErrors.tooManyRequests";
    case "auth/network-request-failed":
      return "authErrors.network";
    case "auth/popup-blocked":
      return "authErrors.popupBlocked";
    case "auth/user-disabled":
      return "authErrors.disabled";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return ""; // o próprio usuário desistiu: sem mensagem
    default:
      return "authErrors.generic";
  }
}

export interface CredentialInput {
  email: string;
  password: string;
  confirm?: string;
}
export type CredentialErrors = Partial<Record<"email" | "password" | "confirm", string>>;

export const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCredentials(kind: "login" | "signup" | "reset", input: CredentialInput): CredentialErrors {
  const errors: CredentialErrors = {};
  if (!input.email.trim()) errors.email = "authErrors.emailRequired";
  else if (!EMAIL.test(input.email.trim())) errors.email = "authErrors.invalidEmail";
  if (kind === "reset") return errors;
  if (!input.password) errors.password = "authErrors.passwordRequired";
  else if (kind === "signup" && input.password.length < MIN_PASSWORD) errors.password = "authErrors.passwordShort";
  if (kind === "signup" && !errors.password && input.password !== (input.confirm ?? "")) errors.confirm = "authErrors.passwordMismatch";
  return errors;
}
