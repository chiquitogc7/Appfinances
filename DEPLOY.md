# Implantação do Appfinances (Vercel + Firebase)

> **Leia antes:** o código de login e de nuvem foi escrito e testado com **nuvem simulada** e com credenciais falsas.
> Ele **nunca rodou contra um projeto Firebase real** nem contra o emulador do Firestore (o ambiente em que foi
> desenvolvido não conseguiu baixar o emulador). Faça o passo 4 e o teste de ponta a ponta do passo 6 antes de
> colocar dados reais de alguém.

## 1. Criar o projeto Firebase
1. https://console.firebase.google.com → **Adicionar projeto**.
2. **Authentication** → *Sign-in method*: ative **E-mail/senha** e **Google**.
3. Authentication → *Settings* → **Authorized domains**: confirme `localhost` e adicione o domínio da Vercel (ex.: `seu-app.vercel.app` e o domínio próprio, se houver).
4. Authentication → *Settings* → **User actions**: deixe ativada a **proteção contra enumeração de e-mails** (reduz a descoberta de quem tem conta).
5. Authentication → *Templates*: revise (e traduza) o e-mail de **verificação** e de **redefinição de senha**.
6. **Firestore Database** → *Criar banco de dados* em **modo de produção** (as regras abaixo é que liberam o acesso).
7. **Configurações do projeto** → *Seus apps* → adicione um **app da Web** e copie a configuração (4 valores).

## 2. Variáveis de ambiente
| Variável | Onde achar |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | configuração do app Web (`apiKey`) |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

- Local: copie `.env.example` para `.env.local` e preencha.
- Vercel: *Project → Settings → Environment Variables* → crie as 4 (Production e Preview) → **faça um novo deploy** (variáveis `NEXT_PUBLIC_*` entram no build).
- Estas chaves são públicas por design. **Nunca** use chaves de *service account* em variáveis `NEXT_PUBLIC_*`.
- Sem as 4 variáveis o app roda em **modo demonstração** (dados fictícios, só no navegador, sem login).

## 3. Publicar as regras de segurança
```bash
npm install -g firebase-tools
firebase login
firebase use --add            # escolha o projeto
firebase deploy --only firestore:rules
```
Modelo das regras (`firestore.rules`): cada pessoa só lê e escreve em `users/{seu uid}/…`, **e só com e-mail confirmado**;
os valores são validados (centavos inteiros, datas, tipos); qualquer outro caminho é negado.

## 4. Testar as regras (obrigatório antes de produção)
Requer Java 11+ e o Firebase CLI.
```bash
npm install
npm run test:rules
```
Os testes (`rules/firestore.rules.test.mjs`) cobrem: sem login, outro usuário, e-mail não confirmado, valores inválidos,
caminhos fora de `users/{uid}` e perfil. **Se algum falhar, corrija as regras antes de publicar.**

## 5. Deploy na Vercel
1. Suba o projeto para o GitHub.
2. Vercel → *Add New → Project* → importe o repositório. Framework: **Next.js** (detectado). Build padrão (`npm run build`).
3. Configure as variáveis do passo 2 e faça o deploy.
4. Domínio próprio: adicione em *Settings → Domains* **e** em Firebase → Authentication → Authorized domains.

## 6. Teste de ponta a ponta com Firebase real (faça uma vez)
1. Crie uma conta com e-mail e senha → o app mostra "Confirme seu e-mail".
2. Abra o e-mail, clique no link, volte e toque em **Já confirmei** → o dashboard abre **vazio** ("Primeiros passos"), sem dados fictícios.
3. Cadastre uma conta e uma despesa, recarregue a página → os dados continuam lá.
4. Confira no console do Firebase que os dados estão em `users/{uid}/…`.
5. Entre com **outra** conta (ou Google) → não deve ver nada da primeira.
6. A negação de acesso entre contas é o que `npm run test:rules` automatiza; o passo 5 confere o efeito visível.
7. Desligue a internet, lance uma despesa → aparece o aviso de salvamento pendente; religue → o aviso some sozinho em até 20 s.

## 7. Checklist antes de abrir para usuários
- [ ] `npm test` e `npm run test:rules` passando
- [ ] Teste do passo 6 feito
- [ ] Domínios autorizados conferidos
- [ ] Alerta de orçamento/cota no Google Cloud (evita surpresa de custo)
- [ ] Considerar **Firebase App Check** (dificulta uso da sua API por clientes não oficiais)
- [ ] Definir como cada pessoa exporta e apaga seus dados (hoje: *Configurações → Baixar backup*; não há botão de excluir conta)
- [ ] Política de privacidade e termos, se for público (o app guarda dados financeiros)

## 8. O que o servidor valida e o que não valida
As regras do Firestore garantem **quem** acessa e **a forma** dos dados. As **regras financeiras** (não pagar fatura acima do
restante, estorno, saldo) rodam no navegador. Alguém tecnicamente hábil, logado na própria conta, poderia gravar números
incoerentes **na própria conta** (não na de outra pessoa). Para impedir isso seria preciso mover as operações para
**Cloud Functions**, o que não foi feito.

Dois aparelhos usando a mesma conta ao mesmo tempo: vale a última alteração de **cada documento**. Operações críticas
repetidas com ids diferentes (ex.: pagar a mesma fatura nos dois aparelhos) **não** são barradas entre aparelhos.
`src/domain/syncQueue.ts` tem a base da política de conflitos, mas **não está ligada ao app**.

## 9. Aplicativos Android e iOS (React Native/Expo)
O app móvel **não existe** ainda. Preparação feita: `src/domain` (regras, validação, relatórios, backup, filas) não importa
React, Next, Firebase nem APIs do navegador — um teste automático (`audit.test.ts`) garante isso. Caminho sugerido:
1. Transformar o repositório em *monorepo* (`packages/core` com o conteúdo de `src/domain`, `apps/web`, `apps/mobile`).
2. No Expo, implementar `FinanceRepository` com o SDK do Firebase para React Native e reaproveitar `createCloudRepository`
   (a lógica de diferenças, lotes e reenvio já é independente do Firebase).
3. Reescrever apenas a interface; os textos (`src/i18n`) também são reaproveitáveis.
