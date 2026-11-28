import { getCalendar, type CalendarCard } from '@/service/marketing/marketing-calendar-api'
import type { MarketingCalendarRange, MarketingCalendarSource } from '../marketing-calendar'
import { CARD_KIND_LABEL, CARD_STATUS_TONE, cardStatusLabel, type CardStatus } from '../marketing-labels'
import type { CalendarItemView } from './calendar-layout'

/**
 * Fonte de CARDS do calendário (a única da M1). O card aparece pela data de
 * publicação; arrasta enquanto não está finalizado.
 *
 * O `GET /calendar` também conta os cards abertos sem data (`undated`). O
 * contrato da fonte devolve só itens, então a contagem fica guardada aqui por
 * grupo, intervalo e marca, e o calendário lê com `undatedFor` depois.
 */

const FINAL: CardStatus[] = ['PUBLISHED', 'DELIVERED']
const BEFORE_APPROVED: CardStatus[] = ['IDEA', 'IN_PRODUCTION', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED']

export function cardIsLate(card: Pick<CalendarCard, 'dueAt' | 'status'>, now = Date.now()): boolean {
  return !!card.dueAt && new Date(card.dueAt).getTime() < now && BEFORE_APPROVED.includes(card.status)
}

export function cardToItem(card: CalendarCard): CalendarItemView {
  return {
    id: `card:${card.id}`,
    source: 'card',
    entityId: card.id,
    title: card.title,
    companyId: card.companyId,
    start: card.publishAt!,
    end: null,
    allDay: false,
    tone: CARD_STATUS_TONE[card.status] ?? 'slate',
    status: card.status,
    statusLabel: cardStatusLabel(card.status, card.kind),
    kindLabel: CARD_KIND_LABEL[card.kind] ?? card.kind,
    to: { name: 'marketing-card', params: { cardId: card.id } },
    draggable: !FINAL.includes(card.status),
    flag: cardIsLate(card) ? 'late' : card.status === 'AWAITING_APPROVAL' ? 'awaiting' : null,
    networks: card.networks,
    assigneeName: card.assignee?.name ?? null,
  }
}

const undated = new Map<string, number>()
const undatedKey = (groupId: string, range: MarketingCalendarRange, brandId: string | null) =>
  `${groupId}|${range.from}|${range.to}|${brandId ?? ''}`

export function undatedFor(groupId: string, range: MarketingCalendarRange, brandId: string | null): number | null {
  return undated.get(undatedKey(groupId, range, brandId)) ?? null
}

export const cardCalendarSource: MarketingCalendarSource = async (groupId, range, brandId) => {
  const res = await getCalendar(groupId, { from: range.from, to: range.to, companyId: brandId })
  undated.set(undatedKey(groupId, range, brandId), res.undated)
  return res.cards.filter((c) => !!c.publishAt).map(cardToItem)
}
