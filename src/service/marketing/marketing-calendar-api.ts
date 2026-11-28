import api from '../api'
import { mkt } from './marketing-core'
import type { CardKind, CardNetwork, CardStatus } from '@/features/marketing/marketing-labels'

/**
 * Cliente do calendário editorial (spec m1-aprovacao-calendario.md, M1-B).
 * O calendário mostra o PRÓPRIO card pela data de publicação.
 */

export interface CalendarCard {
  id: string
  companyId: string
  kind: CardKind
  title: string
  status: CardStatus
  networks: CardNetwork[]
  /** ISO (instante) */
  publishAt: string | null
  dueAt: string | null
  approvalValid: boolean
  assignee: { id: string; name: string } | null
  updatedAt: string
}

export interface CalendarResponse {
  from: string
  to: string
  timeZone: string
  cards: CalendarCard[]
  /** Cards abertos sem data de publicação */
  undated: number
}

export async function getCalendar(
  groupId: string,
  params: { from: string; to: string; companyId?: string | null },
): Promise<CalendarResponse> {
  const { data } = await api.get<CalendarResponse>(mkt(groupId, '/calendar'), {
    params: { from: params.from, to: params.to, ...(params.companyId ? { companyId: params.companyId } : {}) },
  })
  return data
}

/** Post da prévia do feed do Instagram (R2, C5). */
export interface FeedCard extends CalendarCard {
  publishedAt: string | null
  publishedUrl: string | null
  /** Arquivos da versão aprovada (mais de 1 = carrossel) */
  fileCount: number
  /** Primeiro arquivo da versão aprovada (prévia RGB quando a arte é CMYK) */
  cover: { url: string | null; previewUrl: string | null; mimeType: string } | null
  /** Agendado e a pessoa edita: pode trocar o horário arrastando */
  canSwap: boolean
}

export interface FeedResponse {
  companyId: string
  timeZone: string
  limit: number
  cards: FeedCard[]
}

export async function getInstagramFeed(groupId: string, companyId: string): Promise<FeedResponse> {
  const { data } = await api.get<FeedResponse>(mkt(groupId, '/calendar/feed'), { params: { companyId } })
  return data
}

/**
 * Troca o horário de dois agendados do feed numa transação (R2, C5). Cada lado
 * leva o horário que a grade mostrava: se um deles já mudou (outra pessoa
 * trocou com a grade aberta), a API responde 409 com a frase e nada muda.
 */
export async function swapFeedTimes(
  groupId: string,
  a: { id: string; publishAt: string },
  b: { id: string; publishAt: string },
): Promise<{ ok: true; cards: Array<{ id: string; publishAt: string }> }> {
  const { data } = await api.post<{ ok: true; cards: Array<{ id: string; publishAt: string }> }>(
    mkt(groupId, '/calendar/feed/swap'),
    { a, b },
  )
  return data
}

export async function rescheduleCard(groupId: string, cardId: string, publishAt: string): Promise<CalendarCard> {
  const { data } = await api.patch<CalendarCard>(mkt(groupId, `/calendar/cards/${encodeURIComponent(cardId)}`), {
    publishAt,
  })
  return data
}

export interface QuickCreateInput {
  companyId: string
  title: string
  kind?: CardKind
  publishAt: string
  networks?: CardNetwork[]
}

export async function quickCreateCard(groupId: string, input: QuickCreateInput): Promise<CalendarCard> {
  const { data } = await api.post<CalendarCard>(mkt(groupId, '/calendar/cards'), input)
  return data
}
