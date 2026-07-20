import { useQueryClient } from '@tanstack/vue-query'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { getUserToken } from '@/utils/authContent'
import type { ActivityDetail, ActivityResponsible } from './activity-types'

/**
 * Publica o resultado de uma gravação em TODAS as fontes que desenham o card.
 *
 * Existem três, e invalidar só uma deixa a volta pro board mostrando o valor
 * antigo:
 * - `['boards', monthId]` (Vue Query) — o kanban de `/tasks/:month`;
 * - `['activity', id]` (Vue Query) — o painel de detalhe que abre sobre o board;
 * - `workspace.workspaceData.activities` (Pinia) — o `/board` agregado, que não
 *   passa pelo Vue Query.
 *
 * Escrever o valor novo no cache ANTES de invalidar é o que importa para o
 * usuário: invalidação sozinha só corrige depois que a request volta, e até lá
 * o board repinta o card com o dado antigo (visível em qualquer rede real).
 */

type BoardStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

/** Card como o `GET /month/:id/board` devolve (campos usados pelo KanbanBoard). */
interface BoardCard {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  responsibles?: ActivityResponsible[]
  subtasks?: unknown[]
  attachments?: unknown[]
}

type BoardColumns = Record<BoardStatus, BoardCard[]>

const BOARD_STATUSES: BoardStatus[] = ['TODO', 'IN_PROGRESS', 'IN_TESTING', 'DONE']

/**
 * Campos do card que uma edição de atividade pode mudar. `status` fica de fora
 * de propósito: a coluna do kanban vem da chave do objeto, então mexer no status
 * aqui deixaria o card com um valor que não bate com a coluna em que ele está.
 */
function cardPatch(activity: ActivityDetail): Partial<BoardCard> {
  const patch: Partial<BoardCard> = {}
  if (activity.title !== undefined) patch.title = activity.title
  if (activity.priorityNumber !== undefined) patch.priorityNumber = activity.priorityNumber
  if (activity.dueDate !== undefined) patch.dueDate = activity.dueDate
  // Listas vão COPIADAS: a atividade de origem é o estado reativo da tela de
  // detalhe, que continua sendo mutado no lugar (o toggle otimista de subtarefa
  // escreve `task.status` antes do await). Guardar a mesma referência no cache
  // faria essa mutação vazar para o board sem passar por `setQueryData`, e sem
  // volta quando a gravação falha.
  if (activity.responsibles !== undefined) patch.responsibles = [...activity.responsibles]
  if (activity.subtasks !== undefined) patch.subtasks = [...activity.subtasks]
  if (activity.attachments !== undefined) patch.attachments = [...activity.attachments]
  return patch
}

export function useActivityPublish() {
  const queryClient = useQueryClient()
  const workspace = useWorkspaceStore()

  function patchBoardCache(monthId: string | null, activity: ActivityDetail) {
    if (!monthId) return
    queryClient.setQueryData<BoardColumns>(['boards', monthId], (old) => {
      if (!old) return old
      const patch = cardPatch(activity)
      let found = false
      // `{ ...old }` e não `{}`: a resposta do board vem como
      // `{ monthId, TODO, IN_PROGRESS, ... }`, e reconstruir só as colunas
      // apagaria o `monthId` do cache até o próximo refetch.
      const next = { ...old }
      for (const status of BOARD_STATUSES) {
        next[status] = (old[status] ?? []).map((card) => {
          if (card.id !== activity.id) return card
          found = true
          return { ...card, ...patch }
        })
      }
      return found ? next : old
    })
  }

  /** Card que mudou de mês precisa sumir do board de origem na hora. */
  function removeFromBoardCache(monthId: string | null, activityId: string) {
    if (!monthId) return
    queryClient.setQueryData<BoardColumns>(['boards', monthId], (old) => {
      if (!old) return old
      let found = false
      const next = { ...old }
      for (const status of BOARD_STATUSES) {
        const list = old[status] ?? []
        const filtered = list.filter((card) => card.id !== activityId)
        if (filtered.length !== list.length) found = true
        next[status] = filtered
      }
      return found ? next : old
    })
  }

  /** Espelha a mudança no card do `/board`, que lê da store do workspace. */
  function syncWorkspaceCard(activity: ActivityDetail) {
    const card = workspace.workspaceData?.activities.find((a) => a.id === activity.id)
    if (!card) return
    if (activity.title !== undefined) card.title = activity.title
    if (activity.priorityNumber !== undefined) card.priority = activity.priorityNumber
    if (activity.dueDate !== undefined) card.dueDate = activity.dueDate
    if (activity.monthId) card.monthId = activity.monthId
    if (activity.month?.name) card.month = activity.month.name
    if (activity.responsibles !== undefined) {
      const myId = getUserToken()?.sub ?? null
      card.responsibles = activity.responsibles.map((r) => {
        const id = r.userId ?? r.user.id
        return { id, name: r.user.name, isMe: id === myId }
      })
      card.isMine = card.responsibles.some((r) => r.isMe)
    }
  }

  function invalidateBoards(monthIds: (string | null | undefined)[]) {
    for (const id of new Set(monthIds.filter(Boolean))) {
      void queryClient.invalidateQueries({ queryKey: ['boards', id] })
    }
    // Dashboard e backlog leem os mesmos números do card.
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'workspace'] })
    void queryClient.invalidateQueries({ queryKey: ['backlog'] })
  }

  /**
   * @param activity resposta do servidor (ou a atividade recém-buscada)
   * @param previousMonthId mês de onde o card saiu, quando a gravação moveu ele
   */
  function publishActivity(
    activity: ActivityDetail | null | undefined,
    previousMonthId?: string | null,
  ) {
    if (!activity?.id) return
    const monthId = activity.monthId ?? activity.month?.id ?? null

    queryClient.setQueryData<ActivityDetail>(['activity', activity.id], (old) =>
      old ? { ...old, ...activity } : activity,
    )

    if (previousMonthId && previousMonthId !== monthId) {
      removeFromBoardCache(previousMonthId, activity.id)
    }
    patchBoardCache(monthId, activity)
    syncWorkspaceCard(activity)
    invalidateBoards([previousMonthId, monthId])
  }

  return { publishActivity }
}
