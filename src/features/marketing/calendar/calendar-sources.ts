import type { MarketingCalendarSource } from '../marketing-calendar'
import { cardCalendarSource } from './card-source'
import { campaignsCalendarSource } from '../campaigns/campaigns-calendar-source'
import { activationsCalendarSource } from '../activations/activations-calendar-source'

/**
 * Registro das fontes do calendário editorial (contrato em
 * `../marketing-calendar.ts`): cards (M1), campanhas como faixa do período
 * (M2) e ativações (M3), ligadas na junção de 06/11/2026. O
 * calendário desenha qualquer fonte sem mudar: item com `end` vira faixa de
 * vários dias e `draggable: false` não arrasta.
 */
export const MARKETING_CALENDAR_SOURCES: MarketingCalendarSource[] = [
  cardCalendarSource,
  campaignsCalendarSource,
  activationsCalendarSource,
]

declare global {
  interface Window {
    /** Só em desenvolvimento: fontes de mentira que o harness injeta para provar a faixa. */
    __mkCalendarTestSources?: MarketingCalendarSource[]
  }
}

/**
 * As fontes que o calendário consulta. Em desenvolvimento (o harness), soma as
 * que o roteiro de ponta a ponta pendura em `window.__mkCalendarTestSources`:
 * é como o E2E prova a faixa de vários dias antes de a M2 e a M3 existirem. No
 * build de produção o `import.meta.env.DEV` é `false` e o ramo some.
 */
export function activeCalendarSources(): MarketingCalendarSource[] {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const extra = window.__mkCalendarTestSources
    if (Array.isArray(extra) && extra.length) return [...MARKETING_CALENDAR_SOURCES, ...extra]
  }
  return MARKETING_CALENDAR_SOURCES
}
