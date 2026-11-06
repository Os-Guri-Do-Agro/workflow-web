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
