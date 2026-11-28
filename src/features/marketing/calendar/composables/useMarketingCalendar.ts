import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import { useToast } from '@/composables/useToast'
import {
  quickCreateCard,
  rescheduleCard,
  type CalendarCard,
  type QuickCreateInput,
} from '@/service/marketing/marketing-calendar-api'
import type { MarketingCalendarRange } from '../../marketing-calendar'
import { apiErrorMessage } from '../api-error'
import type { CalendarItemView } from '../calendar-layout'
import { activeCalendarSources } from '../calendar-sources'
import { formatDayTime, spDateTimeToIso, spTime, spYmd } from '../calendar-time'
import { cardToItem, undatedFor } from '../card-source'

export interface CalendarData {
  items: CalendarItemView[]
  /** Fontes que falharam (as outras aparecem mesmo assim) */
  failed: number
  /** Cards abertos sem data de publicação (da fonte de cards) */
  undated: number | null
}

/**
 * Carga e gravações do calendário editorial. Uma query por intervalo e marca,
 * na chave `['marketing', g, 'calendar', from, to, marca]` (o socket da ala
 * invalida o grupo inteiro). Todas as fontes rodam juntas; uma fonte que cai
 * não apaga as outras.
 */
export function useMarketingCalendar(opts: {
  groupId: MaybeRefOrGetter<string | null>
  range: MaybeRefOrGetter<MarketingCalendarRange>
  brandId: MaybeRefOrGetter<string | null>
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const key = computed(() => {
    const range = toValue(opts.range)
    return ['marketing', toValue(opts.groupId) ?? '-', 'calendar', range.from, range.to, toValue(opts.brandId) ?? 'todas'] as const
  })

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<CalendarData> => {
      const groupId = toValue(opts.groupId)!
      const range = toValue(opts.range)
      const brandId = toValue(opts.brandId)
      const results = await Promise.allSettled(activeCalendarSources().map((source) => source(groupId, range, brandId)))
      const items: CalendarItemView[] = []
      let failed = 0
      let firstError: unknown = null
      for (const r of results) {
        if (r.status === 'fulfilled') items.push(...r.value)
        else {
          failed++
          firstError ??= r.reason
        }
      }
      if (results.length && failed === results.length) throw firstError
      return { items, failed, undated: undatedFor(groupId, range, brandId) }
    },
    enabled: computed(() => hasSession.value && !!toValue(opts.groupId)),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })

  function patchItems(fn: (items: CalendarItemView[]) => CalendarItemView[]) {
    const current = queryClient.getQueryData<CalendarData>(key.value)
    if (current) queryClient.setQueryData<CalendarData>(key.value, { ...current, items: fn(current.items) })
  }

  /**
   * Arrastar para outro dia: muda a data e MANTÉM a hora (Brasília). Otimista:
   * o item já aparece no dia novo e volta se a API recusar (com a frase dela).
   */
  async function moveItem(item: CalendarItemView, day: string): Promise<boolean> {
    const groupId = toValue(opts.groupId)
    if (!groupId || item.source !== 'card' || !item.draggable) return false
    if (spYmd(item.start) === day) return false
    const nextIso = spDateTimeToIso(day, spTime(item.start))
    const snapshot = queryClient.getQueryData<CalendarData>(key.value)
    const snapshotKey = key.value
    patchItems((items) => items.map((i) => (i.id === item.id ? { ...i, start: nextIso } : i)))
    try {
      const card = await rescheduleCard(groupId, item.entityId, nextIso)
      patchItems((items) => items.map((i) => (i.id === item.id ? cardToItem(card) : i)))
      toast.success(`"${item.title}" agora sai ${formatDayTime(nextIso)}.`)
      return true
    } catch (err) {
      if (snapshot) queryClient.setQueryData<CalendarData>(snapshotKey, snapshot)
      toast.error(apiErrorMessage(err, 'Não deu para mudar a data. Tente de novo.'))
      return false
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['marketing', groupId, 'calendar'] })
    }
  }

  async function createCard(input: QuickCreateInput): Promise<CalendarCard> {
    const groupId = toValue(opts.groupId)
    if (!groupId) throw new Error('Grupo não carregado')
    const card = await quickCreateCard(groupId, input)
    void queryClient.invalidateQueries({ queryKey: ['marketing', groupId, 'calendar'] })
    toast.success(`Card criado para ${formatDayTime(input.publishAt)}.`)
    return card
  }

  return { query, key, moveItem, createCard }
}
