import { ref } from 'vue'
import timeService, {
  type AbandonedEntry,
  type ResolveAction,
} from '@/service/time/time-service'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { onTabVisible } from '@/utils/tab-visibility'

/**
 * Cronômetro largado: o servidor tem uma entrada aberta cujo cliente sumiu
 * (spec timer-confiavel, P2).
 *
 * A consulta acontece ao abrir o app e toda vez que a aba volta — os dois
 * momentos em que a pessoa reaparece depois de um reboot, de uma suspensão ou
 * de um navegador que morreu. Enquanto houver pendência, o diálogo fica de pé:
 * é a única coisa nesta feature que pode APAGAR tempo, então precisa de decisão
 * explícita, não de um "ok" distraído.
 */

const pending = ref<AbandonedEntry | null>(null)
const resolving = ref(false)
let installed = false

export function useAbandonedEntry() {
  const { invalidateAll } = useTimeTracking()

  async function check(): Promise<void> {
    try {
      pending.value = await timeService.abandoned()
    } catch {
      // Offline ou backend antigo (rota inexistente): sem pendência conhecida.
      pending.value = null
    }
  }

  async function resolve(action: ResolveAction, endedAt?: string): Promise<void> {
    const entry = pending.value
    if (!entry || resolving.value) return
    resolving.value = true
    try {
      await timeService.resolveEntry(entry.entry.id, action, endedAt)
      pending.value = null
      await invalidateAll()
    } finally {
      resolving.value = false
    }
  }

  /** Fecha sem decidir: a pendência volta na próxima verificação, de propósito. */
  function dismiss(): void {
    pending.value = null
  }

  if (!installed && typeof window !== 'undefined') {
    installed = true
    void check()
    onTabVisible(() => void check())
  }

  return { pending, resolving, check, resolve, dismiss }
}
