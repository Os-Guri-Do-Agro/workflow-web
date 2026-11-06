import type { MarketingRole } from '@/service/marketing/marketing-core'
import { hasMarketingRole } from '@/service/marketing/marketing-core'
import type { CampaignStatus, PaceState } from '@/service/marketing/marketing-campaigns'

/**
 * Rótulos e regras de interface da campanha. A regra de verdade mora no
 * servidor (`workflow-api/src/marketing/campaigns/campaign-status.ts`); o
 * espelho abaixo só decide QUAIS BOTÕES mostrar, e o servidor responde 403/400
 * se algum dia os dois divergirem.
 */

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Rascunho',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  APPROVED: 'Aprovada',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  ENDED: 'Encerrada',
  CANCELED: 'Cancelada',
}

/** Cor do status (chave de `--tag-*`). */
export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, string> = {
  DRAFT: 'slate',
  AWAITING_APPROVAL: 'amber',
  APPROVED: 'blue',
  ACTIVE: 'green',
  PAUSED: 'orange',
  ENDED: 'teal',
  CANCELED: 'red',
}

export const CAMPAIGN_STATUS_ORDER: CampaignStatus[] = [
  'DRAFT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'CANCELED',
]

/** Texto do botão que leva PARA o status (verbo, não o nome do status). */
export const CAMPAIGN_ACTION_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Voltar para Rascunho',
  AWAITING_APPROVAL: 'Enviar para aprovação',
  APPROVED: 'Aprovar',
  ACTIVE: 'Ativar',
  PAUSED: 'Pausar',
  ENDED: 'Encerrar',
  CANCELED: 'Cancelar campanha',
}

const EDITOR_MOVES: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['AWAITING_APPROVAL'],
  AWAITING_APPROVAL: ['DRAFT'],
  APPROVED: ['ACTIVE'],
  ACTIVE: ['PAUSED', 'ENDED'],
  PAUSED: ['ACTIVE', 'ENDED'],
  ENDED: [],
  CANCELED: [],
}

/** Destinos que o papel pode escolher a partir de `from` (espelho do servidor). */
export function nextCampaignStatuses(
  from: CampaignStatus,
  role: MarketingRole | null,
  needsApproval: boolean,
): CampaignStatus[] {
  if (!hasMarketingRole(role, 'EDITOR')) return []
  const admin = hasMarketingRole(role, 'ADMIN')
  const out: CampaignStatus[] = []
  for (const to of CAMPAIGN_STATUS_ORDER) {
    if (to === from) continue
    let ok = false
    if (to === 'CANCELED') ok = admin
    else if (from === 'CANCELED') ok = to === 'DRAFT' && admin
    else if (to === 'APPROVED') ok = from === 'AWAITING_APPROVAL' && admin
    else if (to === 'DRAFT' && admin) ok = true
    else if (from === 'DRAFT' && to === 'ACTIVE') ok = !needsApproval
    else ok = EDITOR_MOVES[from].includes(to)
    if (ok) out.push(to)
  }
  // Aprovar vem primeiro: é a ação principal de quem abre a campanha.
  return out.sort((a, b) => (a === 'APPROVED' ? -1 : b === 'APPROVED' ? 1 : 0))
}

export const PACE_LABEL: Record<PaceState, string> = {
  none: 'Sem período ou orçamento para comparar',
  not_started: 'Ainda não começou',
  on_track: 'No ritmo',
  over: 'Gastando acima do esperado',
  under: 'Gastando abaixo do esperado',
}

export const PACE_TONE: Record<PaceState, string> = {
  none: 'slate',
  not_started: 'slate',
  on_track: 'green',
  over: 'red',
  under: 'amber',
}

/** Sugestões de canal (o campo aceita qualquer texto). */
export const CHANNEL_SUGGESTIONS = [
  'Instagram',
  'TikTok',
  'Facebook',
  'Google Ads',
  'Meta Ads',
  'E-mail',
  'WhatsApp',
  'Impresso',
  'Eventos',
  'Parceiros',
]

/** 'YYYY-MM-DD' -> '05/11/2026' (sem passar por Date, que erra o fuso) */
export function formatYmd(ymd: string | null | undefined): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/** '05/11' curto, para a lista */
export function formatYmdShort(ymd: string | null | undefined): string {
  if (!ymd) return ''
  const [, m, d] = ymd.split('-')
  return `${d}/${m}`
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (start && end) return `${formatYmdShort(start)} a ${formatYmd(end)}`
  if (start) return `a partir de ${formatYmd(start)}`
  if (end) return `até ${formatYmd(end)}`
  return 'Sem período'
}

/** Centavos -> "1.234,56" (campo de valor, sem o R$) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
