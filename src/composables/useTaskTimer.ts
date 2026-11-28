import { computed } from 'vue'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useTimerSounds } from '@/composables/useTimerSounds'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { openProtectionDialog } from '@/composables/idle-protection-dialog'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export interface TimerTask {
  id: string
  title: string
  companyId?: string | null
}

/**
 * Timer ligado direto na tarefa (spec v2-uteis, U3): no "Meu dia" e no painel
 * da tarefa, sem abrir o widget do topo nem escolher a tarefa num menu.
 *
 * Só existe um timer por pessoa (índice único na API). Ligar em outra tarefa
 * PARA o atual antes e liga o novo, com o mesmo cuidado do widget do topo: o
 * aviso de proteção limitada do cronômetro e o som de início e de parada.
 */
export function useTaskTimer() {
  const { running, isRunning, elapsedSec, start, stop } = useTimeTracking()
  const { playStart, playStop } = useTimerSounds()
  const alerts = useIdleAlerts()
  const { error: showError } = useToast()

  const busy = computed(() => start.isPending.value || stop.isPending.value)

  function isRunningFor(activityId: string): boolean {
    return isRunning.value && running.value?.activityId === activityId
  }

  async function startFor(task: TimerTask): Promise<void> {
    if (busy.value || isRunningFor(task.id)) return
    if (alerts.needsAttention.value) openProtectionDialog()
    try {
      if (isRunning.value) await stop.mutateAsync()
      await start.mutateAsync({
        activityId: task.id,
        companyId: task.companyId ?? null,
        description: task.title,
      })
      playStart()
    } catch (err) {
      showError(getApiErrorMessage(err, 'Não deu para ligar o timer'))
    }
  }

  async function stopNow(): Promise<void> {
    if (busy.value || !isRunning.value) return
    try {
      await stop.mutateAsync()
      playStop()
    } catch (err) {
      showError(getApiErrorMessage(err, 'Não deu para parar o timer'))
    }
  }

  async function toggleFor(task: TimerTask): Promise<void> {
    if (isRunningFor(task.id)) await stopNow()
    else await startFor(task)
  }

  return { running, isRunning, elapsedSec, busy, isRunningFor, startFor, stopNow, toggleFor }
}
