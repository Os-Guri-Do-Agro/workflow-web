import { onMounted, onUnmounted } from 'vue'
import realtimeService, { type ActivityMovedPayload } from '@/service/realtime/realtime-service'
import { getUserToken } from '@/utils/authContent'
import { useToast } from '@/composables/useToast'

/**
 * Realtime do kanban: escuta `activity:moved` e aplica o movimento localmente.
 *
 * - `onMove` recebe cada evento válido (idempotente — mover pra status/posição
 *   onde o card já está é no-op; o eco do próprio ator é inofensivo e ainda
 *   sincroniza OUTRAS abas dele).
 * - `onReconnect` (opcional) roda no (re)connect do socket — use pra dar refresh
 *   e não perder eventos que passaram enquanto offline.
 *
 * Reconciliação last-write-wins: guarda o último `updatedAt` aplicado por
 * atividade e descarta eventos com updatedAt <= o já aplicado (writes obsoletos).
 * updatedAt é ISO de tamanho fixo → comparação lexicográfica == cronológica.
 */
export function useActivityBoardRealtime(
  onMove: (payload: ActivityMovedPayload) => void,
  onReconnect?: () => void,
) {
  const { info } = useToast()
  let unsubscribe: (() => boolean) | null = null

  // activityId -> último updatedAt (ISO) aplicado.
  const applied = new Map<string, string>()
  const myId = getUserToken()?.sub ?? null

  function handleMove(payload: ActivityMovedPayload) {
    const last = applied.get(payload.activityId)
    if (last && payload.updatedAt <= last) return // descarta write obsoleto
    applied.set(payload.activityId, payload.updatedAt)

    onMove(payload)

    // Toast só quando OUTRO usuário moveu — a aba que arrastou já deu feedback.
    if (myId && payload.actorId !== myId) {
      info('Uma atividade foi movida por outro usuário')
    }
  }

  onMounted(() => {
    unsubscribe = realtimeService.connect({
      activityMoved: handleMove,
      connect: onReconnect,
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
  })
}
