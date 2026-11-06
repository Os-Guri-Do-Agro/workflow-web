import api from '../api'
import { mkt } from './marketing-core'
import type { CalendarCard } from './marketing-calendar-api'
import type { CardStatus } from '@/features/marketing/marketing-labels'

/** Cliente do Painel inicial da ala (M1-B). */

export interface HomeActivity {
  id: string
  companyId: string | null
  verb: string
  entityType: string
  entityId: string
  summary: string
  createdAt: string
  /** `system: true` = ação do próprio Nevo (aviso de prazo) */
  actor: { id: string; name: string; system?: boolean } | null
}

export interface MarketingHome {
  now: string
  timeZone: string
  /** 'YYYY-MM-DD' em Brasília */
  today: string
  /** Segunda-feira da semana atual */
  weekStart: string
  isAdmin: boolean
  /** Admin: tudo das marcas visíveis; os outros: os seus */
  awaitingApproval: CalendarCard[]
  /** Do responsável (a pessoa) */
  changesRequested: CalendarCard[]
  overdue: CalendarCard[]
  dueSoon: CalendarCard[]
  week: CalendarCard[]
  countsByStatus: Partial<Record<CardStatus, number>>
  /**
   * A mesma contagem separada por trilha: `print` = peça impressa (Gráfica),
   * `digital` = o resto. Ausente em API antiga (aí o painel conta tudo junto).
   */
  countsByTrack?: {
    digital: Partial<Record<CardStatus, number>>
    print: Partial<Record<CardStatus, number>>
  }
  recent: HomeActivity[]
}

export async function getMarketingHome(groupId: string, companyId?: string | null): Promise<MarketingHome> {
  const { data } = await api.get<MarketingHome>(mkt(groupId, '/home'), {
    params: companyId ? { companyId } : {},
  })
  return data
}
