import {
  CalendarDays,
  ClipboardCheck,
  FileImage,
  KeyRound,
  Lightbulb,
  LayoutDashboard,
  Link2,
  PartyPopper,
  Printer,
  Settings2,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-vue-next'
import type { MarketingGroupSummary, MarketingRole } from '@/service/marketing/marketing-core'
import { hasMarketingRole } from '@/service/marketing/marketing-core'

/**
 * Seções da ala Marketing, UMA lista para as abas do layout, o breadcrumb e o
 * Ctrl+K. Cada fase é dona das suas linhas (campo `phase`); a rota de cada
 * uma está em `routes.ts`.
 */
export interface MarketingSection {
  key: string
  title: string
  icon: LucideIcon
  /** Nome da rota (routes.ts) */
  route: string
  /** Caminho, para o breadcrumb */
  path: string
  group: 'Produção' | 'Divulgação' | 'Eventos e dinheiro' | 'Base'
  phase: 'M1' | 'M2' | 'M3' | 'Fundação'
  minRole?: MarketingRole
  /** Regra extra (ex.: financeiro conforme a configuração do grupo) */
  visible?: (group: MarketingGroupSummary) => boolean
}

export const MARKETING_SECTIONS: MarketingSection[] = [
  { key: 'home', title: 'Painel', icon: LayoutDashboard, route: 'marketing', path: '/marketing', group: 'Produção', phase: 'M1' },
  { key: 'approvals', title: 'Aprovações', icon: ClipboardCheck, route: 'marketing-approvals', path: '/marketing/aprovacoes', group: 'Produção', phase: 'M1' },
  { key: 'calendar', title: 'Calendário', icon: CalendarDays, route: 'marketing-calendar', path: '/marketing/calendario', group: 'Produção', phase: 'M1' },
  { key: 'ideas', title: 'Ideias', icon: Lightbulb, route: 'marketing-ideas', path: '/marketing/ideias', group: 'Produção', phase: 'M2' },
  { key: 'campaigns', title: 'Campanhas', icon: Target, route: 'marketing-campaigns', path: '/marketing/campanhas', group: 'Divulgação', phase: 'M2' },
  { key: 'utm', title: 'UTMs e QR', icon: Link2, route: 'marketing-utm', path: '/marketing/utm', group: 'Divulgação', phase: 'M2' },
  { key: 'print', title: 'Gráfica', icon: Printer, route: 'marketing-print', path: '/marketing/grafica', group: 'Divulgação', phase: 'M2' },
  { key: 'activations', title: 'Ativações', icon: PartyPopper, route: 'marketing-activations', path: '/marketing/ativacoes', group: 'Eventos e dinheiro', phase: 'M3' },
  { key: 'partners', title: 'Parceiros', icon: Users, route: 'marketing-partners', path: '/marketing/parceiros', group: 'Eventos e dinheiro', phase: 'M3' },
  {
    key: 'finance',
    title: 'Financeiro',
    icon: Wallet,
    route: 'marketing-finance',
    path: '/marketing/financeiro',
    group: 'Eventos e dinheiro',
    phase: 'M3',
    visible: (g) => g.permissions.seeFinance,
  },
  { key: 'links', title: 'Links', icon: KeyRound, route: 'marketing-links', path: '/marketing/links', group: 'Base', phase: 'M1' },
  { key: 'settings', title: 'Configurações', icon: Settings2, route: 'marketing-settings', path: '/marketing/configuracoes', group: 'Base', phase: 'Fundação' },
]

/** Ícone genérico de arquivo da ala (usado no card e nas listas). */
export const MARKETING_FILE_ICON = FileImage

export function visibleSections(group: MarketingGroupSummary | null): MarketingSection[] {
  if (!group) return []
  return MARKETING_SECTIONS.filter(
    (s) => (!s.minRole || hasMarketingRole(group.role, s.minRole)) && (!s.visible || s.visible(group)),
  )
}

/** Título da seção pelo caminho (breadcrumb). Card aberto conta como Aprovações. */
export function marketingSectionTitle(path: string): string | null {
  if (path.startsWith('/marketing/cards/')) return 'Aprovações'
  const exact = MARKETING_SECTIONS.find((s) => s.path === path)
  if (exact) return exact.key === 'home' ? null : exact.title
  const prefix = MARKETING_SECTIONS.filter((s) => s.key !== 'home').find((s) => path.startsWith(`${s.path}/`))
  return prefix?.title ?? null
}
