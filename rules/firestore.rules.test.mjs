// Testes das regras do Firestore. Requer o emulador:  npm run test:rules
// STATUS: escrito, mas NÃO executado até aqui (o emulador não pôde ser baixado no ambiente de desenvolvimento).
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-appfinances", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
after(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const owner = () => env.authenticatedContext("alice", { email_verified: true }).firestore();
const unverified = () => env.authenticatedContext("alice", { email_verified: false }).firestore();
const other = () => env.authenticatedContext("bob", { email_verified: true }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const tx = (over = {}) => ({ id: "t1", kind: "expense", amount: 1000, date: "2025-06-15", status: "realized", description: "Mercado", ...over });
const ref = (db, path) => doc(db, path);

describe("isolamento entre usuários", () => {
  test("sem login: nada", async () => {
    await assertFails(getDoc(ref(anon(), "users/alice/transactions/t1")));
    await assertFails(setDoc(ref(anon(), "users/alice/transactions/t1"), tx()));
  });
  test("outro usuário não lê nem escreve", async () => {
    await assertSucceeds(setDoc(ref(owner(), "users/alice/transactions/t1"), tx()));
    await assertFails(getDoc(ref(other(), "users/alice/transactions/t1")));
    await assertFails(setDoc(ref(other(), "users/alice/transactions/t2"), tx({ id: "t2" })));
    await assertFails(deleteDoc(ref(other(), "users/alice/transactions/t1")));
  });
  test("dono com e-mail confirmado lê, grava e apaga", async () => {
    await assertSucceeds(setDoc(ref(owner(), "users/alice/transactions/t1"), tx()));
    await assertSucceeds(getDoc(ref(owner(), "users/alice/transactions/t1")));
    await assertSucceeds(deleteDoc(ref(owner(), "users/alice/transactions/t1")));
  });
  test("e-mail não confirmado: negado", async () => {
    await assertFails(setDoc(ref(unverified(), "users/alice/transactions/t1"), tx()));
    await assertFails(getDoc(ref(unverified(), "users/alice/accounts/a1")));
  });
  test("caminhos fora de users/{uid} são negados", async () => {
    await assertFails(setDoc(ref(owner(), "public/x"), { a: 1 }));
    await assertFails(getDoc(ref(owner(), "users/bob/transactions/t1")));
  });
});

describe("validação dos dados", () => {
  test("movimentação válida passa", async () => {
    await assertSucceeds(setDoc(ref(owner(), "users/alice/transactions/t1"), tx()));
  });
  for (const [nome, over] of [
    ["valor negativo", { amount: -1 }],
    ["valor decimal", { amount: 10.5 }],
    ["valor gigante", { amount: 1e15 }],
    ["tipo inválido", { kind: "hack" }],
    ["situação inválida", { status: "done" }],
    ["data inválida", { date: "15/06/2025" }],
    ["id diferente do documento", { id: "outro" }],
    ["descrição enorme", { description: "x".repeat(201) }],
  ]) {
    test(`movimentação inválida é recusada: ${nome}`, async () => {
      await assertFails(setDoc(ref(owner(), "users/alice/transactions/t1"), tx(over)));
    });
  }
  test("campo obrigatório ausente é recusado", async () => {
    const { description: _d, ...semDescricao } = tx();
    await assertFails(setDoc(ref(owner(), "users/alice/transactions/t1"), semDescricao));
  });
  test("orçamento: id do documento precisa ser a categoria", async () => {
    await assertSucceeds(setDoc(ref(owner(), "users/alice/budgets/cat_a"), { categoryId: "cat_a", monthlyLimit: 5000 }));
    await assertFails(setDoc(ref(owner(), "users/alice/budgets/cat_b"), { categoryId: "cat_a", monthlyLimit: 5000 }));
  });
  test("cartão: dias de fechamento e vencimento entre 1 e 31", async () => {
    const card = { id: "c1", name: "Cartão", limit: 100000, closingDay: 10, dueDay: 17, payAccountId: "a1" };
    await assertSucceeds(setDoc(ref(owner(), "users/alice/cards/c1"), card));
    await assertFails(setDoc(ref(owner(), "users/alice/cards/c1"), { ...card, closingDay: 32 }));
  });
  test("perfil: só os campos esperados", async () => {
    await assertSucceeds(setDoc(ref(owner(), "users/alice/meta/profile"), { schemaVersion: 2, createdAt: "2025-06-15T00:00:00.000Z" }));
    await assertFails(setDoc(ref(owner(), "users/alice/meta/profile"), { schemaVersion: 2, createdAt: "x", admin: true }));
    await assertFails(setDoc(ref(owner(), "users/alice/meta/outro"), { schemaVersion: 2, createdAt: "x" }));
  });
});
