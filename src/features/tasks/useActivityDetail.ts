import { computed, reactive, ref, watch, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import activityService from '@/service/activities/activity-service'
import { getApiErrorMessage } from '@/service/api'
import { useToast } from '@/composables/useToast'
import { getUserToken } from '@/utils/authContent'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import type { SaveState } from '@/components/ui/save-state'
import type { ActivityDetail, ActivityPatchPayload } from './activity-types'

/** Campos com estado de gravação próprio (um `saving` global mentiria). */
export type ActivityField =
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'responsibles'
  | 'month'

function pick<T extends object>(source: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const key of keys) {
    if (key in source) out[key] = source[key]
  }
  return out
}

/**
 * Camada de dados do painel de detalhe: uma query por atividade e uma gravação
 * por campo, com update otimista e rollback.
 *
 * Decisões que importam:
 * - O snapshot do rollback guarda APENAS as chaves que a gravação tocou. Restaurar
 *   a atividade inteira desfaria edições de outros campos que estivessem no ar.
 * - A resposta do servidor também é aplicada só nas chaves tocadas, pelo mesmo
 *   motivo: mesclar o objeto inteiro sobrescreveria o que o usuário digitou
 *   enquanto a request voltava.
 * - O card do board vive na store do workspace (Pinia), não no cache do Vue
 *   Query. Por isso cada gravação espelha o resultado lá: é o que faz o card
 *   refletir a mudança na hora, sem refetch.
 */
export function useActivityDetail(
  taskId: Ref<string | null>,
  companyId: Ref<string | null>,
) {
  const queryClient = useQueryClient()
  const workspace = useWorkspaceStore()
  const { error: showError } = useToast()

  const queryKey = computed(() => ['activity', taskId.value])

  const query = useQuery<ActivityDetail>({
    queryKey,
    queryFn: () =>
      activityService.getActivityById(taskId.value!, companyId.value ?? undefined),
    enabled: computed(() => !!taskId.value),
    staleTime: 15_000,
    retry: 1,
  })

  const fieldState = reactive<Record<string, SaveState>>({})
  const fieldError = reactive<Record<string, string>>({})
  const pendingSaves = ref(0)
  const savedAt = ref<number | null>(null)
  /** Última gravação que falhou, por campo, para o botão "Tentar de novo". */
  const retryable = new Map<ActivityField, () => Promise<void>>()

  // Trocar de tarefa (navegar de um card para outro sem desmontar) precisa
  // zerar o estado de gravação, senão o painel novo herda "erro ao salvar".
  watch(taskId, () => {
    for (const key of Object.keys(fieldState)) delete fieldState[key]
    for (const key of Object.keys(fieldError)) delete fieldError[key]
    retryable.clear()
    savedAt.value = null
  })

  function applyToCache(patch: Partial<ActivityDetail>) {
    if (!taskId.value) return
    queryClient.setQueryData<ActivityDetail>(['activity', taskId.value], (old) =>
      old ? { ...old, ...patch } : old,
    )
  }

  /** Espelha a mudança no card do board (store do workspace) sem refetch. */
  function syncBoardCard(patch: Partial<ActivityDetail>) {
    const card = workspace.workspaceData?.activities.find((a) => a.id === taskId.value)
    if (!card) return
    if (patch.title !== undefined) card.title = patch.title
    if (patch.status !== undefined) card.status = patch.status
    if (patch.priorityNumber !== undefined) card.priority = patch.priorityNumber
    if (patch.dueDate !== undefined) card.dueDate = patch.dueDate
    if (patch.monthId) card.monthId = patch.monthId
    if (patch.month?.name) card.month = patch.month.name
    if (patch.responsibles !== undefined) {
      const myId = getUserToken()?.sub ?? null
      card.responsibles = (patch.responsibles ?? []).map((r) => {
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

  async function runSave(
    field: ActivityField,
    optimistic: Partial<ActivityDetail>,
    request: () => Promise<ActivityDetail>,
  ): Promise<void> {
    const id = taskId.value
    if (!id) return

    // O contador sobe ANTES do primeiro await: quem fecha o painel logo depois
    // de digitar precisa enxergar a gravação como pendente no mesmo tick.
    fieldState[field] = 'saving'
    delete fieldError[field]
    pendingSaves.value += 1

    // Um refetch em voo poderia pousar por cima do valor otimista. O `catch`
    // existe porque isto roda FORA do try/finally: se o cancelamento rejeitasse,
    // `pendingSaves` nunca voltaria a zero e o painel travaria em "Salvando…".
    await queryClient.cancelQueries({ queryKey: ['activity', id] }).catch(() => {})

    const current = queryClient.getQueryData<ActivityDetail>(['activity', id])
    const touched = Object.keys(optimistic) as (keyof ActivityDetail)[]
    const previous = current ? pick(current, touched) : null
    const previousMonthId = current?.monthId ?? null

    applyToCache(optimistic)
    syncBoardCard(optimistic)

    try {
      const updated = await request()
      const confirmed = pick(updated, [...touched, 'updatedAt'])
      applyToCache(confirmed)
      syncBoardCard(confirmed)
      fieldState[field] = 'saved'
      savedAt.value = Date.now()
      retryable.delete(field)
      invalidateBoards([previousMonthId, updated.monthId])
    } catch (err) {
      if (previous) {
        applyToCache(previous)
        syncBoardCard(previous)
      }
      const message = getApiErrorMessage(err, 'Não foi possível salvar a alteração')
      fieldState[field] = 'error'
      fieldError[field] = message
      retryable.set(field, () => runSave(field, optimistic, request))
      showError(message)
    } finally {
      pendingSaves.value -= 1
    }
  }

  /** Grava um patch parcial (o backend aceita campo a campo). */
  function saveFields(
    field: ActivityField,
    payload: ActivityPatchPayload,
    optimistic: Partial<ActivityDetail>,
  ): Promise<void> {
    return runSave(field, optimistic, () =>
      activityService.patchActivity(taskId.value!, payload, companyId.value ?? undefined),
    )
  }

  /**
   * Status tem rota própria (`PATCH /activity/:id/status`), que grava o backlog
   * e emite `activity:moved` no realtime. Passar por `patchActivity` perderia os dois.
   */
  function saveStatus(status: string): Promise<void> {
    return runSave('status', { status }, () =>
      activityService.patchActivityStatus(
        taskId.value!,
        status,
        companyId.value ?? undefined,
      ),
    )
  }

  function retry(field: ActivityField): Promise<void> {
    const again = retryable.get(field)
    return again ? again() : Promise.resolve()
  }

  function retryAll(): Promise<void> {
    const pending = [...retryable.values()]
    return Promise.all(pending.map((fn) => fn())).then(() => undefined)
  }

  const failedFields = computed(() =>
    (Object.keys(fieldState) as ActivityField[]).filter((f) => fieldState[f] === 'error'),
  )

  /** Estado agregado para o indicador do cabeçalho. */
  const overallState = computed<SaveState>(() => {
    if (pendingSaves.value > 0) return 'saving'
    if (failedFields.value.length) return 'error'
    if (savedAt.value) return 'saved'
    return 'idle'
  })

  /**
   * Resolve quando não há mais gravação no ar. Usado antes de fechar o painel
   * para não perder o último autosave. O timeout evita travar o fechamento se
   * a rede estiver pendurada: nesse caso o erro aparece no toast.
   */
  function waitForIdle(timeoutMs = 4000): Promise<void> {
    if (pendingSaves.value === 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        stop()
        resolve()
      }, timeoutMs)
      const stop = watch(pendingSaves, (value) => {
        if (value === 0) {
          window.clearTimeout(timer)
          stop()
          resolve()
        }
      })
    })
  }

  return {
    activity: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    fieldState,
    fieldError,
    failedFields,
    overallState,
    savedAt,
    pendingSaves,
    saveFields,
    saveStatus,
    retry,
    retryAll,
    waitForIdle,
  }
}
