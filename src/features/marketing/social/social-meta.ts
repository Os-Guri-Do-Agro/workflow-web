import type { PublicationStatus, SocialNetwork, SocialProvider } from '@/service/marketing/marketing-social'

/**
 * Rótulos, cores e chaves da publicação nas redes (R2, parte A). Cor é chave
 * da paleta de tags (`--tag-<chave>`), nunca hex.
 */

export const socialKeys = {
  all: (g: string) => ['marketing', g, 'social'] as const,
  status: (g: string) => ['marketing', g, 'social', 'status'] as const,
  accounts: (g: string) => ['marketing', g, 'social', 'accounts'] as const,
  card: (g: string, cardId: string) => ['marketing', g, 'social', 'card', cardId] as const,
  campaign: (g: string, campaignId: string) => ['marketing', g, 'social', 'campaign', campaignId] as const,
  adCampaigns: (g: string, campaignId: string, accountId: string) =>
    ['marketing', g, 'social', 'ad-campaigns', campaignId, accountId] as const,
}

export const SOCIAL_NETWORK_LABEL: Record<SocialNetwork, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Página do Facebook',
  META_ADS: 'Conta de anúncio',
  YOUTUBE: 'YouTube',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
}

export const PROVIDER_SHORT: Record<SocialProvider, string> = {
  meta: 'Meta',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
}

export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Conectada',
  EXPIRED: 'Precisa reconectar',
  ERROR: 'Com erro',
  REVOKED: 'Desconectada',
}

export const ACCOUNT_STATUS_TONE: Record<string, string> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  ERROR: 'amber',
  REVOKED: 'slate',
}

export const PUBLICATION_STATUS_TONE: Record<PublicationStatus, string> = {
  SCHEDULED: 'indigo',
  PUBLISHING: 'blue',
  PUBLISHED: 'teal',
  DRAFT_SENT: 'purple',
  WAITING_MANUAL: 'amber',
  FAILED: 'red',
  CANCELED: 'slate',
}

export const MODE_SHORT: Record<string, string> = {
  AUTO: 'Sozinho',
  DRAFT: 'Rascunho',
  MANUAL: 'À mão',
}

/** Frase do resultado do OAuth (`?conectado=` ou `?erro=` na volta da rede). */
export const CONNECT_ERROR_TEXT: Record<string, string> = {
  negado: 'A conexão foi cancelada na rede. Nada mudou.',
  expirou: 'O pedido de conexão venceu (vale 10 minutos). Clique em Conectar de novo.',
  invalido: 'A volta da rede não veio completa. Clique em Conectar de novo.',
  repetido: 'Esse retorno da rede já foi usado. Se a conta não apareceu, conecte de novo.',
  sem_permissao: 'Só Dono e Admin conectam contas, e só nas marcas que veem.',
  sem_contas: 'A rede não devolveu nenhuma página ou conta para esta pessoa.',
  rede: 'Rede desconhecida.',
  falhou: 'A rede recusou a conexão.',
}

export const socialPendingKey = (g: string, key: string) => ['marketing', g, 'social', 'pending', key] as const

/** Formato do post, para quem não recebe o plano (o Visualizador). */
export const PLACEMENT_LABEL: Record<string, string> = {
  FEED: 'Feed',
  CAROUSEL: 'Carrossel',
  REEL: 'Reels',
  STORY: 'Story',
  VIDEO: 'Vídeo',
  SHORT: 'Shorts',
  POST: 'Post',
}

/**
 * Link que veio da rede (ou de quem marcou "publicado") só vira `href` se for
 * http(s): `javascript:` e companhia ficam sem link.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * Texto que chegou pela URL (`?motivo=` na volta do OAuth): só texto curto,
 * sem quebra de linha e sem nada que pareça endereço (a URL pode ter sido
 * montada por outra pessoa).
 */
export function cleanMotivo(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const text = raw.replace(/[\r\n\t]+/g, ' ').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 160)
}

/** Objetivo da campanha de anúncio da Meta, em português. */
export const AD_OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_LEADS: 'Leads',
  OUTCOME_SALES: 'Vendas',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_APP_PROMOTION: 'Promoção do app',
  OUTCOME_AWARENESS: 'Reconhecimento',
  LEAD_GENERATION: 'Leads',
  CONVERSIONS: 'Conversões',
  LINK_CLICKS: 'Cliques no link',
}

/** Status da campanha de anúncio da Meta, em português. */
export const AD_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  ARCHIVED: 'Arquivada',
  DELETED: 'Apagada',
  IN_PROCESS: 'Em análise',
  WITH_ISSUES: 'Com problema',
  CAMPAIGN_PAUSED: 'Pausada',
  ADSET_PAUSED: 'Conjunto pausado',
}

/** Valor em centavos na moeda da CONTA de anúncio (a Meta manda na moeda da conta). */
export function formatMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof cents !== 'number') return '-'
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : 'BRL'
  try {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: code })
  } catch {
    return `${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${code}`
  }
}

/** "1.234" ou "sem dado" (null). */
export function fmtNum(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('pt-BR') : '-'
}

/** Rótulo e campo dos números do post, na ordem da tela. */
export const METRIC_LABELS: Array<{ key: 'reach' | 'views' | 'impressions' | 'likes' | 'comments' | 'shares' | 'saves' | 'clicks'; label: string }> = [
  { key: 'reach', label: 'Alcance' },
  { key: 'views', label: 'Visualizações' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'likes', label: 'Curtidas' },
  { key: 'comments', label: 'Comentários' },
  { key: 'shares', label: 'Compartilhamentos' },
  { key: 'saves', label: 'Salvos' },
  { key: 'clicks', label: 'Cliques' },
]
