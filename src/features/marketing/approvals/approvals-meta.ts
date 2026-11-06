import { hasMarketingRole, type MarketingRole } from '@/service/marketing/marketing-core'
import type { MarketingCardAsset, MarketingCardCover } from '@/service/marketing/marketing-cards'
import { statusesFor, type CardKind, type CardStatus } from '../marketing-labels'
import { MARKETING_TIME_ZONE } from '../calendar/calendar-time'

/**
 * Peças da Aprovação (M1-A) que várias telas usam: chaves do Vue Query, datas,
 * o espelho mínimo da regra de mover (só para adiantar a frase na folha do
 * celular; quem decide é o servidor) e o tipo de cada arquivo.
 */

/** Chaves SEMPRE sob `['marketing', groupId, ...]`: o socket invalida o grupo inteiro. */
export const cardKeys = {
  all: (groupId: string) => ['marketing', groupId, 'cards'] as const,
  list: (groupId: string, filters: unknown) => ['marketing', groupId, 'cards', 'list', filters] as const,
  detail: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'detail', cardId] as const,
  comments: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'comments', cardId] as const,
  history: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'history', cardId] as const,
}

export type Track = 'digital' | 'print'

/** Colunas do board para a trilha. */
export function trackStatuses(track: Track): CardStatus[] {
  return statusesFor(track === 'print' ? 'PRINT' : 'POST')
}

// ── Datas (SEMPRE em Brasília, como o calendário e a API) ───────────────────
// Campo `datetime-local`: `spLocalInput` / `spLocalInputToIso` de calendar-time.

const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: MARKETING_TIME_ZONE, day: '2-digit', month: 'short' })
const dayTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: MARKETING_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const fullFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: MARKETING_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "12 de nov." vira "12 nov" (curto e sem ponto). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return dayFmt.format(new Date(iso)).replace(/\./g, '').replace(' de ', ' ')
}

export function formatDayTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return dayTimeFmt.format(new Date(iso)).replace(/\./g, '').replace(' de ', ' ').replace(',', ' às')
}

export function formatFull(iso: string | null | undefined): string {
  if (!iso) return ''
  return fullFmt.format(new Date(iso)).replace(',', ' às')
}

/** 7.4 -> "0:07"; 75 -> "1:15". */
export function formatSeconds(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(sec ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "há 3 min", "há 2 h", senão a data. */
export function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return formatDayTime(iso)
}

// ── Arquivos ────────────────────────────────────────────────────────────────

export function isImageMime(mime: string | null | undefined) {
  return !!mime && mime.startsWith('image/')
}

export function isVideoMime(mime: string | null | undefined) {
  return !!mime && mime.startsWith('video/')
}

/** O que o navegador desenha: a prévia RGB quando existe, senão o original. */
export function displayUrl(asset: Pick<MarketingCardAsset, 'url' | 'previewUrl'> | MarketingCardCover | null) {
  if (!asset) return null
  return asset.previewUrl ?? asset.url ?? null
}

/** Imagem que o navegador mostra (com prévia ou formato comum). */
export function isViewableImage(asset: Pick<MarketingCardAsset, 'mimeType' | 'hasPreview'>) {
  if (asset.hasPreview) return true
  return isImageMime(asset.mimeType) && !/tiff|heic|heif/i.test(asset.mimeType)
}

// ── Espelho da regra de mover (só para a interface) ────────────────────────

/**
 * Motivo previsível de recusa, para adiantar na folha "Mover para". O servidor
 * confere tudo de novo (conteúdo, aprovação, data) e manda a frase dele.
 */
export function moveHint(
  kind: CardKind | string,
  from: CardStatus,
  to: CardStatus,
  role: MarketingRole | null,
): string | null {
  if (from === to) return null
  if (!hasMarketingRole(role, 'EDITOR')) return 'Visualizador não muda o status do card.'
  if (!statusesFor(kind).includes(to)) return 'Esse status é de outra trilha.'
  if (to === 'APPROVED' && from === 'AWAITING_APPROVAL') return 'Para aprovar, use o botão Aprovar na página do card.'
  if (to === 'CHANGES_REQUESTED') return 'Para pedir ajuste, use o botão Pedir ajuste na página do card.'
  return null
}
