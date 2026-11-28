import type { RouteLocationRaw } from 'vue-router'

/**
 * Contrato do calendário editorial (spec ala-marketing/00-fundacao.md).
 *
 * A M1 desenha o calendário e é dona da fonte de CARDS. A M2 fornece a fonte
 * de CAMPANHAS (período) e a M3 a de ATIVAÇÕES. Cada fase escreve a sua fonte
 * na própria pasta, com esta assinatura; o registro das fontes mora em
 * `calendar/calendar-sources.ts` (M1) e o orquestrador acrescenta as de M2 e
 * M3 na junção.
 */
export interface MarketingCalendarItem {
  /** Único na grade: `${source}:${entityId}` */
  id: string
  source: 'card' | 'campaign' | 'activation'
  entityId: string
  title: string
  /** Marca (null = do grupo inteiro) */
  companyId: string | null
  /** ISO com hora (card, ativação) ou 'YYYY-MM-DD' (campanha) */
  start: string
  /** Fim de faixa de vários dias (campanha, ativação longa) */
  end?: string | null
  allDay: boolean
  /** Chave da paleta de tags (`var(--tag-<tone>)`) */
  tone: string
  status?: string
  statusLabel?: string
  /** Rótulo curto do tipo ("Reel", "Campanha", "Feira") */
  kindLabel?: string
  /** Para onde o clique leva */
  to: RouteLocationRaw
  /** Só card arrasta (muda a data de publicação) */
  draggable: boolean
  /** Prazo vencido, aguardando aprovação etc. (vira destaque no dia) */
  flag?: 'late' | 'awaiting' | null
}

export interface MarketingCalendarRange {
  /** 'YYYY-MM-DD' inclusivo */
  from: string
  /** 'YYYY-MM-DD' inclusivo */
  to: string
}

export type MarketingCalendarSource = (
  groupId: string,
  range: MarketingCalendarRange,
  brandId: string | null,
) => Promise<MarketingCalendarItem[]>
