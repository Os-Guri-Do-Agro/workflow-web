import type { MarketingCalendarItem, MarketingCalendarSource } from '../marketing-calendar'
import { listActivationCalendar } from '@/service/marketing/marketing-activations'
import {
  ACTIVATION_KIND_LABEL,
  ACTIVATION_STATUS_LABEL,
  ACTIVATION_STATUS_TONE,
  isAllDay,
} from './activation-meta'

/**
 * Fonte do calendário editorial para as ATIVAÇÕES (M3-B). Contrato em
 * `features/marketing/marketing-calendar.ts`. Ativação não arrasta: mudar a
 * data é pelo painel, que valida início e fim.
 */
export const activationsCalendarSource: MarketingCalendarSource = async (groupId, range, brandId) => {
  const rows = await listActivationCalendar(groupId, range, brandId)
  return rows.map<MarketingCalendarItem>((a) => ({
    id: `activation:${a.id}`,
    source: 'activation',
    entityId: a.id,
    title: a.title,
    companyId: a.companyId,
    start: a.startAt,
    end: a.endAt,
    allDay: isAllDay(a),
    tone: ACTIVATION_STATUS_TONE[a.status] ?? 'slate',
    status: a.status,
    statusLabel: ACTIVATION_STATUS_LABEL[a.status] ?? a.status,
    kindLabel: ACTIVATION_KIND_LABEL[a.kind] ?? 'Ativação',
    to: { name: 'marketing-activations', query: { ativacao: a.id } },
    draggable: false,
    flag: null,
  }))
}
