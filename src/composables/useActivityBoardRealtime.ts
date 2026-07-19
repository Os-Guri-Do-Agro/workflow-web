import { onMounted, onUnmounted } from 'vue'
import realtimeService, {
  type ActivityEventPayload,
  type ActivityMovedPayload,
} from '@/service/realtime/realtime-service'
import { getUserToken } from '@/utils/authContent'
import { useToast } from '@/composables/useToast'

/** Agrupa rajadas num refresh só (várias edições seguidas = 1 requisição). */
function debounce(fn: () => void, wait: number): { (): void; cancel: () => void } {
  let timer: number | null = null
  const wrapped = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      timer = null
      fn()
    }, wait)
  }
  return Object.assign(wrapped, {
    cancel: () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    },
  })
}

/** Tempo escondida a partir do qual a aba é considerada desatualizada. */
const STALE_HIDDEN_MS = 30 * 1000

/**
 * Realtime do kanban: escuta os eventos de atividade e mantém o board vivo.
 *
 * - `onMove` recebe cada `activity:moved` válido (idempotente — mover pra
 *   status/posição onde o card já está é no-op; o eco do próprio ator é
 *   inofensivo e ainda sincroniza OUTRAS abas dele).
 * - `onRefresh` (opcional) recarrega a lista inteira. Roda quando o movimento
 *   não é aplicável incrementalmente: criação, edição, remoção e anexo de
 *   atividade, reconexão do socket e volta do foco depois de um tempo fora.
 *   Antes ele estava plugado no `connect`, que dispara TAMBÉM na primeira
 *   conexão — isso duplicava o carregamento inicial do board.
 *
 * Reconciliação last-write-wins: guarda o último `updatedAt` aplicado por
 * atividade e descarta eventos com updatedAt <= o já aplicado (writes obsoletos).
 * updatedAt é ISO de tamanho fixo → comparação lexicográfica == cronológica.
 */
export function useActivityBoardRealtime(
  onMove: (payload: ActivityMovedPayload) => void,
  onRefresh?: () => void,
) {
  const { info } = useToast()
  let unsubscribe: (() => boolean) | null = null

  // activityId -> último updatedAt (ISO) aplicado.
  const applied = new Map<string, string>()
  const myId = getUserToken()?.sub ?? null

  const refresh = debounce(() => onRefresh?.(), 600)

  /** Evento de outra empresa (o socket ouve todas) não mexe no board atual. */
  function isActiveCompany(companyId: string) {
    const active = localStorage.getItem('activeCompany')
    return !active || companyId === active
  }

  function handleMove(payload: ActivityMovedPayload) {
    if (!isActiveCompany(payload.companyId)) return

    const last = applied.get(payload.activityId)
    if (last && payload.updatedAt <= last) return // descarta write obsoleto
    applied.set(payload.activityId, payload.updatedAt)

    onMove(payload)

    // Toast só quando OUTRO usuário moveu — a aba que arrastou já deu feedback.
    if (myId && payload.actorId !== myId) {
      info('Uma atividade foi movida por outro usuário')
    }
  }

  function handleChange(payload: ActivityEventPayload) {
    if (!isActiveCompany(payload.companyId)) return
    // Criar/editar/apagar mexe em campos que o board não sabe reconstruir a
    // partir do payload magro — recarrega em vez de adivinhar.
    refresh()
  }

  let hiddenSince: number | null = null

  function handleVisibility() {
    if (document.hidden) {
      hiddenSince = Date.now()
      return
    }
    const away = hiddenSince === null ? 0 : Date.now() - hiddenSince
    hiddenSince = null
    // Alt-tab rápido não justifica recarregar o board inteiro.
    if (away >= STALE_HIDDEN_MS) refresh()
  }

  onMounted(() => {
    unsubscribe = realtimeService.connect({
      activityMoved: handleMove,
      activityChanged: handleChange,
      reconnect: () => refresh(),
    })
    document.addEventListener('visibilitychange', handleVisibility)
  })

  onUnmounted(() => {
    refresh.cancel()
    document.removeEventListener('visibilitychange', handleVisibility)
    unsubscribe?.()
  })
}
