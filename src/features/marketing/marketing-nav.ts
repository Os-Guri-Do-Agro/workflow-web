import {
  BarChart3,
  BellRing,
  CalendarDays,
  ClipboardCheck,
  FileImage,
  Images,
  KeyRound,
  Lightbulb,
  LayoutDashboard,
  Link2,
  PartyPopper,
  Printer,
  Settings2,
  Target,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-vue-next'
import type { MarketingGroupSummary, MarketingRole } from '@/service/marketing/marketing-core'
import { hasMarketingRole } from '@/service/marketing/marketing-core'

/**
 * Seções da ala Marketing, UMA lista para as abas do layout, os atalhos do
 * cabeçalho, o breadcrumb e o Ctrl+K. Cada fase é dona das suas linhas (campo
 * `phase`); a rota de cada uma está em `routes.ts`.
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
  phase: 'M1' | 'M2' | 'M3' | 'R1' | 'R2' | 'Fundação'
  /**
   * Onde a seção aparece no layout: `tabs` (padrão) na fita de abas, `header`
   * como atalho de ícone e rótulo no cabeçalho, ao lado de "Meus avisos" (o que
   * não é do dia a dia: a fita de 13 abas cabe em 1440 px). As duas seguem no
   * breadcrumb e no Ctrl+K.
   */
  placement?: 'tabs' | 'header'
  /** Dica do atalho do cabeçalho (`title`); o nome acessível é o `title` da seção. */
  hint?: string
  minRole?: MarketingRole
  /** Regra extra (ex.: financeiro conforme a configuração do grupo) */
  visible?: (group: MarketingGroupSummary) => boolean
}

export const MARKETING_SECTIONS: MarketingSection[] = [
  { key: 'home', title: 'Painel', icon: LayoutDashboard, route: 'marketing', path: '/marketing', group: 'Produção', phase: 'M1' },
  { key: 'approvals', title: 'Aprovações', icon: ClipboardCheck, route: 'marketing-approvals', path: '/marketing/aprovacoes', group: 'Produção', phase: 'M1' },
  { key: 'calendar', title: 'Calendário', icon: CalendarDays, route: 'marketing-calendar', path: '/marketing/calendario', group: 'Produção', phase: 'M1' },
  { key: 'ideas', title: 'Ideias', icon: Lightbulb, route: 'marketing-ideas', path: '/marketing/ideias', group: 'Produção', phase: 'M2' },
  { key: 'library', title: 'Acervo', icon: Images, route: 'marketing-library', path: '/marketing/acervo', group: 'Produção', phase: 'R1' },
  { key: 'campaigns', title: 'Campanhas', icon: Target, route: 'marketing-campaigns', path: '/marketing/campanhas', group: 'Divulgação', phase: 'M2' },
  { key: 'utm', title: 'UTMs e QR', icon: Link2, route: 'marketing-utm', path: '/marketing/utm', group: 'Divulgação', phase: 'M2' },
  { key: 'print', title: 'Gráfica', icon: Printer, route: 'marketing-print', path: '/marketing/grafica', group: 'Divulgação', phase: 'M2' },
  // R2 (B, M4): números do app, funil por UTM e quem trouxe o cadastro. Visualizador vê.
  { key: 'app-data', title: 'Dados', icon: BarChart3, route: 'marketing-app-data', path: '/marketing/dados', group: 'Divulgação', phase: 'R2' },
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
  // Cabeçalho, nesta ordem. R2 (C3): "Meus avisos" é da pessoa (qualquer papel), não da equipe.
  {
    key: 'notify',
    title: 'Meus avisos',
    icon: BellRing,
    route: 'marketing-notify',
    path: '/marketing/avisos',
    group: 'Base',
    phase: 'R2',
    placement: 'header',
    hint: 'Meus avisos: push e e-mail',
  },
  // R2 (C6): o Visualizador não apaga nada, então não tem lixeira.
  {
    key: 'trash',
    title: 'Lixeira',
    icon: Trash2,
    route: 'marketing-trash',
    path: '/marketing/lixeira',
    group: 'Base',
    phase: 'R2',
    placement: 'header',
    hint: 'Lixeira: o que foi apagado volta em até 30 dias',
    minRole: 'EDITOR',
  },
  {
    key: 'settings',
    title: 'Configurações',
    icon: Settings2,
    route: 'marketing-settings',
    path: '/marketing/configuracoes',
    group: 'Base',
    phase: 'Fundação',
    placement: 'header',
    hint: 'Configurações da ala: equipe, redes, cadência e conexão com o app',
  },
]

/** Onde a seção mora no layout (`tabs` quando a linha não diz). */
export function sectionPlacement(section: MarketingSection): 'tabs' | 'header' {
  return section.placement ?? 'tabs'
}

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
