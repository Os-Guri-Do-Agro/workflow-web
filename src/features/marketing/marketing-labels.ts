/**
 * Rótulos da ala Marketing, UMA fonte para todas as fases (espelho dos valores
 * de `workflow-api/src/marketing/core/marketing-status.ts`). Cor é sempre chave
 * da paleta de tags (`var(--tag-<chave>)`), nunca hex.
 */

export type CardKind = 'POST' | 'CAROUSEL' | 'REEL' | 'STORY' | 'VIDEO' | 'ARTICLE' | 'EMAIL' | 'PRINT' | 'OTHER'
export type CardNetwork =
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'FACEBOOK'
  | 'LINKEDIN'
  | 'YOUTUBE'
  | 'PINTEREST'
  | 'X'
  | 'WHATSAPP'
  | 'SITE'
  | 'EMAIL'
export type CardStatus =
  | 'IDEA'
  | 'IN_PRODUCTION'
  | 'AWAITING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'SENT_TO_PRINTER'
  | 'PROOF_RECEIVED'
  | 'DELIVERED'

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  POST: 'Post',
  CAROUSEL: 'Carrossel',
  REEL: 'Reel',
  STORY: 'Story',
  VIDEO: 'Vídeo',
  ARTICLE: 'Artigo',
  EMAIL: 'E-mail',
  PRINT: 'Peça impressa',
  OTHER: 'Outro',
}

export const CARD_NETWORK_LABEL: Record<CardNetwork, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  PINTEREST: 'Pinterest',
  X: 'X',
  WHATSAPP: 'WhatsApp',
  SITE: 'Site',
  EMAIL: 'E-mail',
}

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  IDEA: 'Ideia',
  IN_PRODUCTION: 'Em produção',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  CHANGES_REQUESTED: 'Ajustes pedidos',
  APPROVED: 'Aprovado',
  SCHEDULED: 'Agendado',
  PUBLISHED: 'Publicado',
  SENT_TO_PRINTER: 'Enviado para a gráfica',
  PROOF_RECEIVED: 'Prova recebida',
  DELIVERED: 'Impresso e entregue',
}

/** Peça impressa chama o Aprovado de outro jeito. */
export function cardStatusLabel(status: CardStatus, kind?: CardKind | string): string {
  if (status === 'APPROVED' && kind === 'PRINT') return 'Aprovado para impressão'
  return CARD_STATUS_LABEL[status] ?? status
}

/** Cor do status (chave de `--tag-*`). */
export const CARD_STATUS_TONE: Record<CardStatus, string> = {
  IDEA: 'slate',
  IN_PRODUCTION: 'blue',
  AWAITING_APPROVAL: 'amber',
  CHANGES_REQUESTED: 'red',
  APPROVED: 'green',
  SCHEDULED: 'indigo',
  PUBLISHED: 'teal',
  SENT_TO_PRINTER: 'purple',
  PROOF_RECEIVED: 'orange',
  DELIVERED: 'teal',
}

const COMMON: CardStatus[] = ['IDEA', 'IN_PRODUCTION', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED']

/** Colunas do board para o tipo (mesma ordem da API). */
export function statusesFor(kind: CardKind | string): CardStatus[] {
  return kind === 'PRINT'
    ? [...COMMON, 'SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED']
    : [...COMMON, 'SCHEDULED', 'PUBLISHED']
}

/** Cor da marca: a do grupo ou uma estável derivada do id. */
const BRAND_TONES = ['teal', 'indigo', 'amber', 'pink', 'cyan', 'lime', 'purple', 'orange']
export function brandTone(brand: { companyId: string; color: string | null } | undefined): string {
  if (!brand) return 'slate'
  if (brand.color) return brand.color
  let h = 0
  for (const ch of brand.companyId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return BRAND_TONES[h % BRAND_TONES.length]!
}

/**
 * Estilo de cor para `.mk-chip[data-tone]` e `.mk-dot`:
 * `<span class="mk-chip" data-tone :style="toneStyle('teal')">`.
 */
export function toneStyle(tone: string | null | undefined): Record<string, string> {
  return { '--mk-tone': `var(--tag-${tone || 'slate'})` }
}

/** Centavos -> "R$ 1.234,56" */
export function formatCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Texto de dinheiro -> centavos (null se não for número).
 * - Com vírgula, ponto é milhar e vírgula é decimal: "1.234,56", "1500,5".
 * - Sem vírgula e no padrão de milhar, os pontos são milhar: "1.500" = R$ 1.500,00,
 *   "12.345.678" = R$ 12.345.678,00 ("0.500" não conta: ninguém escreve milhar assim).
 * - Senão, ponto é decimal: "1234.56", "1.5", "12.50".
 */
export function parseMoneyToCents(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, '').trim()
  if (!clean) return null
  let normalized: string
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.')
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, '')
  else normalized = clean
  const value = Number(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : null
}

/** Bytes legíveis: 12,4 MB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[i]}`
}
