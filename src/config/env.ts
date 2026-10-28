/**
 * Configuração pública do Firebase. Não é segredo (vai para o navegador por design);
 * a proteção real são as regras do Firestore (firestore.rules) e o login.
 * NUNCA coloque chaves privadas (service account, tokens de admin) em variáveis NEXT_PUBLIC_*.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

/** Com as 4 variáveis preenchidas o app usa login e nuvem; sem elas, roda em modo demonstração local. */
export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
