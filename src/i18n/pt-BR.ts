import { etapa3 } from "./pt-BR.etapa3";
import { etapa4 } from "./pt-BR.etapa4";
import { etapa5 } from "./pt-BR.etapa5";
import { extras } from "./pt-BR.transactions";

/** Todos os textos da interface. Para novos idiomas, crie outro arquivo com a mesma estrutura. */
const core = {
  nav: {
    main: "Navegação principal",
    expand: "Expandir menu lateral",
    collapse: "Recolher menu",
    more: "Mais",
    dashboard: "Dashboard",
    movimentacoes: "Movimentações",
    contas: "Contas",
    cartoes: "Cartões",
    planejamento: "Planejamento",
    patrimonio: "Patrimônio",
    relatorios: "Relatórios",
    configuracoes: "Configurações",
    dashboardShort: "Início",
    movimentacoesShort: "Extrato",
    cartoesShort: "Cartões",
    planejamentoShort: "Plano",
  },
  demo: {
    title: "Modo demonstração.",
    body: "Todos os dados são fictícios e ficam apenas neste navegador. Nada é enviado à nuvem.",
  },
  common: {
    loadError: "Não foi possível carregar os dados. Atualize a página e tente novamente.",
    close: "Fechar",
    cancel: "Cancelar",
    uncategorized: "Sem categoria",
    loading: "Carregando",
    errorTitle: "Algo deu errado",
    errorBody: "Não conseguimos exibir esta página. Tente novamente.",
    retry: "Tentar novamente",
  },
  dashboard: {
    greeting: "Olá, {name}. {period}!",
    greetings: { morning: "Bom dia", afternoon: "Boa tarde", evening: "Boa noite" },
    subtitle: "Dinheiro real, compromissos e projeções ficam separados de propósito.",
    period: { label: "Período", prev: "Mês anterior", next: "Próximo mês", current: "Mês atual" },
    kpi: {
      aria: "Indicadores financeiros",
      realized: "Realizado",
      realizedNote: "Já aconteceu",
      planned: "Previsto",
      plannedNote: "Ainda não aconteceu · até {date}",
      realBalance: "Saldo real das contas",
      realBalanceHint: "Dinheiro nas contas hoje",
      income: "Receitas do período",
      expense: "Despesas do período",
      commitments: "Compromissos futuros",
      commitmentsHint: "Contas {bills} + faturas {invoices}",
      available: "Disponibilidade estimada",
      availableHint: "Saldo real − compromissos",
      projected: "Projeção de saldo",
      projectedHint: "Disponibilidade + receitas previstas até {date}",
    },
    charts: {
      flow: "Receitas versus despesas",
      flowNote: "Cor cheia: realizado. Cor clara: previsto.",
      incomeReal: "Receitas realizadas",
      incomePlanned: "Receitas previstas",
      expenseReal: "Despesas realizadas",
      expensePlanned: "Despesas previstas",
      balance: "Evolução do saldo",
      balanceNote: "Saldo real ao longo do período, até hoje.",
      balanceEmpty: "Este período ainda não começou: não há saldo realizado para mostrar.",
      day: "Dia {day}",
      categories: "Gastos por categoria",
      categoriesNote: "Despesas realizadas no período, incluindo compras no cartão. Transferências e pagamento de fatura ficam de fora.",
      categoriesEmpty: "Nenhum gasto realizado neste período.",
      projection: "Fluxo de caixa projetado",
      projectionNote: "Saldo projetado ao fim de cada mês (tracejado = previsão).",
      today: "Hoje",
    },
    widgets: {
      title: "Widgets",
      customize: "Personalizar",
      done: "Concluir",
      none: "Nenhum widget exibido. Use Personalizar para adicionar.",
      available: "Widgets disponíveis",
      moveUp: "Mover {name} para cima",
      moveDown: "Mover {name} para baixo",
      remove: "Remover {name}",
    },
  },
  widgets: {
    cards: {
      title: "Cartões",
      empty: "Nenhum cartão cadastrado.",
      available: "{value} disponíveis",
      usage: "Limite utilizado de {name}",
      closing: "Fecha dia {day} · vence dia {due}",
    },
    installments: {
      title: "Parcelas",
      empty: "Nenhum parcelamento em andamento.",
      left: "{left} de {total} restantes",
      next: "próxima {date}",
    },
    upcoming: {
      title: "Próximos vencimentos",
      empty: "Nenhum vencimento pendente.",
      invoice: "Fatura {name}",
      overdue: "Vencido",
    },
    budgets: {
      title: "Orçamentos do mês",
      empty: "Nenhum orçamento definido.",
      near: "Perto do limite definido.",
      over: "Limite ultrapassado.",
    },
    goals: {
      title: "Metas",
      empty: "Nenhuma meta definida.",
      late: "Atrasada",
      deadline: "prazo {date}",
    },
    investments: {
      title: "Investimentos",
      empty: "Nenhum investimento registrado.",
      result: "sobre o valor aplicado",
      note: "Valores de exemplo, informados manualmente. Não há integração com corretoras nem cotações de mercado.",
    },
  },
  invoiceStatus: { open: "Aberta", closed: "Fechada", overdue: "Vencida", paid: "Paga" },
  soon: {
    title: "Chega na Etapa {stage}",
    movimentacoes: "Extrato completo com filtros, nova movimentação, edição com histórico e transferências entre contas.",
    cartoes: "Faturas, compras parceladas, antecipação de parcelas e pagamento total ou parcial de fatura.",
    planejamento: "Orçamentos por categoria, metas de economia, recorrências e projeção de fluxo de caixa.",
    patrimonio: "Registro manual de investimentos e composição do patrimônio.",
    relatorios: "Relatórios com filtros e exportação para CSV (PDF e XLSX preparados na estrutura).",
  },
  accounts: {
    subtitle: "Saldo total hoje: {total}",
    readonly: "Somente leitura",
    since: "saldo inicial em {date}",
    note: "Cadastro e transferências entre contas chegam na Etapa 2. Os saldos acima são calculados pelas regras financeiras centrais a partir dos dados de demonstração.",
  },
  accountType: { checking: "Conta corrente", savings: "Poupança", cash: "Dinheiro em espécie", investment: "Conta de investimentos", wallet: "Carteira digital" },
  settings: {
    subtitle: "Preferências salvas neste navegador.",
    profile: { title: "Perfil", name: "Nome exibido na saudação", hint: "Usado em “Olá, nome”." },
    theme: { title: "Tema", auto: "Automático", light: "Claro", dark: "Escuro" },
    dashboard: {
      title: "Dashboard",
      hint: "Restaura os widgets e a ordem padrão.",
      reset: "Restaurar preferências",
      confirm: "Restaurar nome, tema e widgets ao padrão?",
      yes: "Sim, restaurar",
    },
    pending: {
      title: "Ainda não implementado",
      hint: "Estas seções estão previstas nas próximas etapas.",
      badge: "Em breve",
      currency: "Moeda-base e taxas manuais",
      language: "Idioma",
      categories: "Categorias personalizadas",
      notifications: "Notificações",
      security: "Segurança e sessão",
      accountsCards: "Gerenciar contas e cartões",
    },
  },
  auth: {
    email: "E-mail",
    password: "Senha",
    confirm: "Confirmar senha",
    unavailableTitle: "Login indisponível nesta versão.",
    unavailableConfigured: "As variáveis do Firebase foram detectadas, mas a integração de autenticação ainda não foi implementada.",
    unavailableNotConfigured: "O Firebase ainda não está configurado. Explore a demonstração, que usa apenas dados fictícios.",
    explore: "Explorar a demonstração",
    toLogin: "Já tenho conta",
    toSignup: "Criar conta",
    toReset: "Esqueci a senha",
    login: { title: "Entrar", subtitle: "Acesse sua conta Appfinances.", submit: "Entrar" },
    signup: { title: "Criar conta", subtitle: "Comece a organizar suas finanças.", submit: "Criar conta" },
    reset: { title: "Recuperar senha", subtitle: "Enviaremos um link para o seu e-mail.", submit: "Enviar link" },
  },
  landing: {
    login: "Entrar",
    signup: "Criar conta",
    eyebrow: "Controle e planejamento financeiro",
    title: "Saiba quanto você tem, quanto já deve e quanto vai sobrar.",
    subtitle: "O Appfinances separa dinheiro real, compromissos e projeções para que cada número tenha um significado claro.",
    cta: "Explorar a demonstração",
    ctaNote: "Dados fictícios, sem cadastro.",
    points: {
      separate: { title: "Realizado e previsto, sem mistura", body: "Receita prevista não aumenta o saldo antes de ser recebida. Despesa prevista não é despesa paga." },
      card: { title: "Cartão sem contar duas vezes", body: "A compra é o gasto. Pagar a fatura apenas quita a dívida e tira o dinheiro da conta." },
      planned: { title: "Parcelas que fecham o centavo", body: "Valores parcelados somam exatamente o total, com cálculo em centavos inteiros." },
      honest: { title: "Sem funcionalidade de fachada", body: "O que ainda não existe é dito com clareza. Nada simula integração bancária ou inteligência artificial." },
    },
    statusTitle: "Versão inicial.",
    status: "Hoje: dashboard calculado a partir de dados de demonstração, contas em leitura e preferências. Movimentações, cartões, planejamento e login real estão nas próximas etapas.",
  },
} as const;

type Dict = { [k: string]: string | Dict };

function merge(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = typeof v === "object" && typeof cur === "object" ? merge(cur, v) : v;
  }
  return out;
}

export const ptBR: Dict = merge(merge(merge(merge(core as unknown as Dict, extras as unknown as Dict), etapa3 as unknown as Dict), etapa4 as unknown as Dict), etapa5 as unknown as Dict);
