import type { Firestore } from "firebase/firestore";
import type { RemoteStore } from "./cloudRepository";

/** Acesso real ao Cloud Firestore: tudo fica em users/{uid}/..., isolado por usuário pelas regras de segurança. */
export async function createFirestoreRemote(db: Firestore, uid: string): Promise<RemoteStore> {
  const { collection, doc, getDoc, getDocs, writeBatch } = await import("firebase/firestore");
  return {
    maxBatch: 450,
    async list(name) {
      const snap = await getDocs(collection(db, "users", uid, name));
      // O id do documento manda: um campo `id` adulterado dentro dos dados não vale.
      return snap.docs.map((d) => (name === "budgets" ? { ...d.data(), categoryId: d.id } : { ...d.data(), id: d.id }));
    },
    async hasProfile() {
      return (await getDoc(doc(db, "users", uid, "meta", "profile"))).exists();
    },
    async commit(writes, deletes, withProfile) {
      const batch = writeBatch(db);
      for (const w of writes) batch.set(doc(db, "users", uid, w.collection, w.id), w.data);
      for (const d of deletes) batch.delete(doc(db, "users", uid, d.collection, d.id));
      if (withProfile) batch.set(doc(db, "users", uid, "meta", "profile"), { schemaVersion: 2, createdAt: new Date().toISOString() }, { merge: true });
      await batch.commit();
    },
  };
}
