import { computed, unref, type MaybeRef } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import activityService, {
  type PickerActivity,
  type PickerTree,
} from '@/service/activities/activity-service'

/**
 * Dados do seletor de tarefa do Meu tempo (spec time-selecao-de-tarefa-e-som).
 *
 * Traz a árvore da empresa inteira numa requisição e faz TODA a navegação e a
 * busca no cliente: trocar de mês ou digitar precisa ser instantâneo, e o
 * payload é só de títulos. Cache curto (30s) porque tarefa nova criada no board
 * precisa aparecer aqui sem recarregar a página — a causa nº1 de "não acho
 * minha tarefa" era justamente o cache eterno do workspace do dashboard.
 */

export const taskPickerKeys = {
  all: ['activity', 'picker'] as const,
  forCompany: (companyId: string | null) => ['activity', 'picker', companyId] as const,
}

/** Tarefa com o caminho onde ela vive, para a busca global e o rótulo. */
export interface FlatTask extends PickerActivity {
  quarterId: string
  quarterLabel: string
  monthId: string
  monthName: string
  monthNumber: number
}

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

/** Nome do mês em português a partir do número (1–12), com o cru de reserva. */
export function monthLabel(number: number, fallback: string): string {
  return MONTHS_PT[number - 1] ?? fallback
}

/** Minúsculas sem acento: "relatorio" acha "Relatório". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

const RECENTS_KEY = 'nevo.time.recentTasks'
const RECENTS_MAX = 5

type RecentMap = Record<string, string[]>

function readRecents(): RecentMap {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as RecentMap) : {}
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

/** Ids usados recentemente naquela empresa (mais novo primeiro). */
export function recentTaskIds(companyId: string | null): string[] {
  if (!companyId) return []
  return readRecents()[companyId] ?? []
}

/** Guarda a escolha: apontar tempo é repetitivo, e repetir tem que ser 1 clique. */
export function rememberTask(companyId: string | null, activityId: string | null): void {
  if (!companyId || !activityId) return
  try {
    const all = readRecents()
    const list = [activityId, ...(all[companyId] ?? []).filter((id) => id !== activityId)]
    all[companyId] = list.slice(0, RECENTS_MAX)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(all))
  } catch {
    // Sem persistência a lista de recentes só não existe; nada quebra.
  }
}

export function useTaskPicker(companyId: MaybeRef<string | null>) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: computed(() => taskPickerKeys.forCompany(unref(companyId))),
    queryFn: () => activityService.getPickerTree(unref(companyId) as string),
    enabled: computed(() => !!unref(companyId)),
    staleTime: 1000 * 30,
  })

  const tree = computed<PickerTree | null>(() => query.data.value ?? null)

  /** Todas as tarefas com o caminho embutido (base da busca e dos atalhos). */
  const flat = computed<FlatTask[]>(() => {
    const result: FlatTask[] = []
    for (const quarter of tree.value?.quarters ?? []) {
      for (const month of quarter.months) {
        for (const activity of month.activities) {
          result.push({
            ...activity,
            quarterId: quarter.id,
            quarterLabel: quarter.label,
            monthId: month.id,
            monthName: monthLabel(month.number, month.name),
            monthNumber: month.number,
          })
        }
      }
    }
    return result
  })

  const byId = computed(() => new Map(flat.value.map((t) => [t.id, t])))

  /** Revalida ao abrir o menu: tarefa criada agora tem que estar lá. */
  function refresh() {
    if (!unref(companyId)) return
    void queryClient.invalidateQueries({
      queryKey: taskPickerKeys.forCompany(unref(companyId)),
    })
  }

  return {
    query,
    tree,
    flat,
    byId,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refresh,
  }
}
