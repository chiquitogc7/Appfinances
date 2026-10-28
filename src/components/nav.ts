import { ArrowLeftRight, BarChart3, CreditCard, Landmark, LayoutDashboard, Settings, Target, TrendingUp, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/movimentacoes", key: "nav.movimentacoes", icon: ArrowLeftRight },
  { href: "/contas", key: "nav.contas", icon: Landmark },
  { href: "/cartoes", key: "nav.cartoes", icon: CreditCard },
  { href: "/planejamento", key: "nav.planejamento", icon: Target },
  { href: "/patrimonio", key: "nav.patrimonio", icon: TrendingUp },
  { href: "/relatorios", key: "nav.relatorios", icon: BarChart3 },
  { href: "/configuracoes", key: "nav.configuracoes", icon: Settings },
];

/** Itens fixos na barra inferior do celular; o restante vai para "Mais". */
export const MOBILE_PRIMARY = ["/dashboard", "/movimentacoes", "/cartoes", "/planejamento"];
