import type { MarketingCalendarItem, MarketingCalendarSource } from '../marketing-calendar'
import { listCampaignCalendar } from '@/service/marketing/marketing-campaigns'
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE } from './campaign-labels'

/**
 * Fonte de CAMPANHAS do calendário editorial (contrato em
 * `../marketing-calendar.ts`): uma faixa por campanha, dia inteiro, sem
 * arrastar (a data da campanha se muda no painel dela, não no calendário).
 *
 * `start` e `end` são 'YYYY-MM-DD' e o `end` é INCLUSIVO (o último dia da
 * campanha). Campanha sem data de fim vira faixa de um dia só.
 *
 * O registro desta fonte no calendário é feito na junção das fases
 * (`calendar/calendar-sources.ts`, da M1): basta importar
 * `campaignsCalendarSource` e acrescentar à lista.
 */
export const campaignsCalendarSource: MarketingCalendarSource = async (groupId, range, brandId) => {
  const rows = await listCampaignCalendar(groupId, range, brandId)
  return rows
    .filter((row): row is typeof row & { startDate: string } => !!row.startDate)
    .map<MarketingCalendarItem>((row) => ({
      id: `campaign:${row.id}`,
      source: 'campaign',
      entityId: row.id,
      title: row.name,
      companyId: row.companyId,
      start: row.startDate,
      end: row.endDate ?? row.startDate,
      allDay: true,
      tone: CAMPAIGN_STATUS_TONE[row.status] ?? 'slate',
      status: row.status,
      statusLabel: CAMPAIGN_STATUS_LABEL[row.status] ?? row.statusLabel,
      kindLabel: 'Campanha',
      to: { name: 'marketing-campaigns', query: { campanha: row.id } },
      draggable: false,
      flag: row.status === 'AWAITING_APPROVAL' ? 'awaiting' : null,
    }))
}
