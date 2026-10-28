import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { firebaseConfig } from "@/config/env";

export interface FirebaseHandles {
  auth: Auth;
  db: Firestore;
}

let cached: Promise<FirebaseHandles> | null = null;

/** Carrega o SDK só quando o Firebase está configurado (o modo demonstração não baixa nada disso). */
export function getFirebase(): Promise<FirebaseHandles> {
  if (!cached) {
    cached = (async () => {
      const [{ initializeApp, getApps }, { getAuth }, { getFirestore }] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      return { auth: getAuth(app), db: getFirestore(app) };
    })();
    cached.catch(() => {
      cached = null; // permite tentar de novo
    });
  }
  return cached;
}
