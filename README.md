# Appfinances — Etapas 1 a 5

Next.js 14 + React 18 + TypeScript + Tailwind CSS + Recharts + lucide-react.

## Como executar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 101 testes (regras, auditoria aleatória, desempenho, nuvem simulada, textos)
npm run test:rules # regras do Firestore (exige emulador e Java; veja DEPLOY.md)
npm run typecheck
npm run build && npm start
```

Sem configuração, o app roda em **modo demonstração**: os dados iniciais são fictícios e **tudo que você lança fica salvo apenas no navegador** (localStorage). Nada vai para a nuvem.
Copie `.env.example` para `.env.local` somente quando for ligar o Firebase. **Implantação, regras e checklist: veja `DEPLOY.md`.**

## Estrutura

```
src/
  domain/      regras puras (sem React/Firebase): dinheiro em centavos, datas ISO, faturas, projeção,
               validação, operações (criar/editar/liquidar/excluir/estornar), filtros  + testes
  data/        repositório (interface), local (localStorage), nuvem (Firestore + diferenças + lotes + reenvio), demonstração, estado e ações
  auth/        login (Firebase Auth), erros traduzidos, validação de credenciais
  features/    telas: dashboard, movimentações, transações (formulário/detalhe), contas, cartões, planejamento, patrimônio, relatórios, configurações, públicas
  components/  shell de navegação, Drawer acessível, Toast, formulário, UI base
  i18n/        textos em pt-BR (novos idiomas = novo arquivo)
  app/         rotas Next.js
scripts/       testes ponta a ponta opcionais (Playwright): e2e_etapa2.py, e2e_etapa3.py e e2e_etapa4.py
```

`src/domain` é o que um app Expo/React Native reaproveitaria.

## Regras financeiras implementadas e testadas

- Valores em centavos inteiros; parcelas somam exatamente o total (última compensa os centavos).
- Saldo inicial não é receita. Receita/despesa **prevista** não altera o saldo real.
- Transferência entre contas não é receita nem despesa.
- Compra no cartão é o gasto; pagar a fatura tira dinheiro da conta e **não** cria nova despesa. Pagamento parcial mantém o restante em aberto.
- **Movimentação realizada não é editada em valor/data/conta**: corrige-se por **estorno** (lançamento inverso ligado ao original, preservando histórico). Estorno devolve o saldo, reduz a fatura se for cartão e não aparece como receita/despesa.
- **Exclusão lógica e recuperável**, permitida só para movimentações previstas (e não para parcelas isoladas).
- **Idempotência**: cada abertura do formulário gera um `operationId`; reenviar a mesma operação (clique duplo, retry) não duplica lançamentos. Vale para criação e estorno.
- Histórico por movimentação (criada, editada com os campos alterados, realizada, excluída, restaurada, estornada).
- **Cartões**: o fechamento define em qual fatura a compra cai; a fatura é "cravada" na compra, então mudar fechamento/vencimento do cartão depois não move compras já lançadas.
- **Fatura**: pagamento total ou parcial (nunca acima do restante; reenvio não duplica). Juros, multa e tarifa entram **uma vez** como despesa e aumentam a fatura (pagar depois não conta de novo; se lançados após quitar, a fatura reabre). Reembolso reduz fatura e gasto sem mexer em conta.
- **Antecipar parcelas**: as escolhidas passam a cair na fatura da data informada e viram realizadas; o total da compra não muda.
- **Recorrências**: geram ocorrências previstas por 12 meses com id fixo (idempotente), respeitando fim de mês (31/01 → 28/02) e data final. Encerrar exclui só as futuras previstas, de forma recuperável.
- **Orçamentos**: realizado e previsto separados, alertas perto do limite (80%) e acima. **Metas**: aporte idempotente, quanto guardar por mês, atraso, arquivar/restaurar.
- **Patrimônio** = saldo das contas + investimentos (valor atual) − faturas **fechadas ou vencidas**. Faturas abertas e parcelas futuras não são dívida exigível e ficam fora. Investimentos arquivados saem do total (e podem voltar).
- **Relatórios** usam as mesmas funções do dashboard e do extrato (testado: totais batem). O filtro "conta ou cartão" olha a origem do lançamento; estornos, transferências e pagamentos de fatura não entram nos gastos.
- **Exportação CSV**: separador `;`, vírgula decimal, BOM para o Excel, e proteção contra injeção de fórmula (texto que começa com `=`, `+`, `-` ou `@` é gravado como texto).
- **Backup**: validado antes de importar (forma dos dados, ids únicos, valores inteiros, datas reais, versão). Arquivo inválido é recusado sem mexer nos dados.
- **Categorias**: as iniciais não saem; as suas podem ser renomeadas e só removidas se não tiverem uso.
- Validação: valor, descrição, data real, realizada não pode ser futura, categoria compatível com o tipo, cartão obrigatório no crédito, parcelamento só no cartão, contas de origem e destino diferentes, nome de conta/categoria único.

## Status da especificação

**Concluído (Etapa 1)**: estrutura, identidade visual, temas, navegação responsiva, dashboard calculado a partir dos dados com 4 gráficos e 6 widgets reorganizáveis, páginas públicas.

**Concluído (Etapa 2)**: extrato com filtros, pesquisa, ordenação e resumo; nova movimentação em painel lateral (despesa, receita, transferência, compra no cartão parcelada, categorias personalizadas); edição, liquidação, exclusão recuperável e estorno com histórico; contas com saldo inicial, transferências e histórico por conta; persistência local.

**Concluído (Etapa 3)**
- Cartões (`/cartoes`): cadastro e edição (emissor, limite, fechamento, vencimento, conta pagadora), limite usado/disponível, faturas abertas, fechadas, vencidas e pagas, lançamentos de cada fatura, pagamento total/parcial, juros/multa/tarifa/reembolso, antecipação de parcelas, aviso quando a compra passa do limite.
- Planejamento (`/planejamento`): orçamentos mensais por categoria (criar, editar, remover), metas (criar, editar, aporte, arquivar/restaurar), receitas e despesas previstas e compromissos futuros separados do realizado, alertas, projeção de fluxo de caixa (gráfico e tabela por mês) e recorrências (criar, encerrar).

**Concluído (Etapa 4)**
- Patrimônio (`/patrimonio`): registro manual de ativos (nome, categoria, valor aplicado, valor atual, data de referência, observações), edição com histórico de atualizações, arquivar e restaurar, resultado por ativo e total, patrimônio total e composição.
- Relatórios (`/relatorios`): receitas e despesas por mês, gastos por categoria, evolução do saldo (gráfico e tabela), desempenho dos orçamentos, parcelamentos e compromissos futuros, patrimônio e investimentos; filtros por período, conta ou cartão e categoria; exportação para CSV.
- Configurações: perfil, tema, categorias personalizadas, notificações (avisos dentro do app, no dashboard), widgets do dashboard, backup (baixar e restaurar), restaurar dados de demonstração, e seção de segurança que informa com clareza que não há login.

**Concluído (Etapa 5), verificado aqui**
- Auditoria dos cálculos: 80 sequências aleatórias de 60 operações (≈3.100 aplicadas, de todos os tipos) conferidas a cada passo contra um cálculo independente (saldo, receitas/despesas, faturas, limite, projeção, estados, parcelas, idempotência). Nenhuma divergência.
- Desempenho: com 20 mil lançamentos, os cálculos das telas levam ≈200 ms.
- Arquitetura: teste automático garante que `src/domain` não depende de React, Next, Firebase nem navegador (pronto para React Native).
- Tratamento de erros: páginas 404, erro de rota e erro global em português, estado de carregamento, tentar de novo ao falhar ao abrir os dados, aviso e reenvio automático quando o salvamento falha.
- Segurança do app: cabeçalhos HTTP (nosniff, frame, referrer, permissions, HSTS), ids validados antes de virarem nome de documento (importar backup não consegue forjar caminhos), validação de backup, exportação CSV contra injeção de fórmula.
- Base da sincronização offline (`src/domain/syncQueue.ts`): fila com reenvio e espera crescente, política de conflitos que nunca resolve sozinha dado financeiro crítico. **Não está ligada ao app.**
- Repositório de nuvem testado com nuvem simulada: conta nova vem vazia, grava só o que mudou, lotes, falha de rede sem perda nem duplicação, tempo esgotado, salvamentos simultâneos em ordem, recusa de dados malformados.
- Modo "Firebase configurado" testado no navegador com credenciais falsas: rotas privadas redirecionam para o login, formulários validam, falha de rede vira mensagem amigável, recuperação de senha não revela se o e-mail existe.

**Escrito, mas NÃO verificado contra serviços reais** (faça o roteiro do `DEPLOY.md`)
- Login com e-mail e senha, login com Google, e-mail de verificação, e-mail de redefinição, encerrar sessão.
- Leitura e gravação reais no Cloud Firestore.
- **Regras do Firestore (`firestore.rules`) e seus testes (`rules/`)**: o emulador não pôde ser baixado no ambiente de desenvolvimento, então nem os testes das regras rodaram. Não publique em produção sem executar `npm run test:rules`.
- Comportamento real offline do Firebase.

**Parcial**
- Sem Firebase configurado, a persistência é só do navegador (não sincroniza entre dispositivos). Com Firebase, os dados vão para a conta do usuário.
- Exportação: só CSV. PDF e XLSX aparecem desabilitados ("Em breve"); a interface `Exporter` em `src/lib/export.ts` já tem o lugar deles.
- Notificações: apenas avisos dentro do app. Não há e-mail nem notificação no celular.
- Idioma: toda a interface lê textos de arquivos de tradução, mas só português existe.
- Moeda: tudo em BRL. A moeda-base fixa é informada nas configurações; escolher outra, registrar taxa manual e converter valores **não existe** (nenhuma taxa é inventada).
- Relatórios: o saldo por conta considera lançamentos realizados; "Parcelas e compromissos" e "Patrimônio" ignoram o período. Compras no cartão não têm conta: para vê-las, filtre por cartão.
- Saldo inicial e data de referência de uma conta, e a data/valor de movimentações realizadas, não são editáveis (corrige-se com lançamento ou estorno). Cartões não podem ser excluídos; recorrências não podem ser editadas (encerre e crie outra).
- Antecipação de parcelas não calcula desconto de juros. Não há agendamento de pagamento de fatura nem conciliação com extrato bancário.
- Metas e ativos usam valores informados por você; não há ligação automática com contas nem cotações.
- Operações financeiras são validadas no navegador, não no servidor (veja `DEPLOY.md`, seção 8). Dois aparelhos na mesma conta: vale a última alteração de cada documento.

**Não implementado**
- Modo offline completo (a fila de sincronização existe, mas não está integrada ao app).
- Aplicativos Android e iOS (React Native/Expo): o domínio está pronto para reaproveitamento, mas não há projeto móvel.
- Cloud Functions para validar operações financeiras no servidor; verificação em duas etapas; App Check; política de privacidade; exclusão de conta pelo app.
- Exportação PDF e XLSX; notificações por e-mail ou celular; escolha de moeda-base e conversão cambial.
- Configuração inicial guiada, questionário financeiro e demonstração interativa guiada (existe uma tela de "Primeiros passos" para contas novas).
- Antecipação de parcelas com desconto; agendamento de pagamento de fatura; conciliação bancária; integração com bancos e corretoras (nunca simulada).

## Firebase e implantação

Passo a passo completo (projeto, login, regras, testes, Vercel, checklist e limites): **`DEPLOY.md`**.

## Verificação feita

`npm test` (101 testes), `tsc --noEmit`, `next build` (modo demonstração e modo Firebase configurado) e testes ponta a ponta em Chromium headless (Etapas 2, 3, 4 e modo nuvem): validação de formulários, despesa, compra parcelada, transferência, estorno, cartão novo, juros, reembolso, pagamento parcial (e recusa de valor acima do restante), antecipação de parcelas, orçamento, meta com aporte, recorrência criada e encerrada, ativo de investimento (criar, editar, arquivar, restaurar), os seis relatórios, filtros, download real do CSV e do backup, importação de backup (válido e inválido), categorias personalizadas, avisos seguindo as preferências, persistência após recarregar e telas de celular.

Observação: nos testes ponta a ponta, o console às vezes registra "Failed to fetch RSC payload" quando o teste troca de página no meio do pré-carregamento de uma rota; não afetou nenhum fluxo. A revisão visual em outros navegadores e dispositivos reais ainda é sua.
