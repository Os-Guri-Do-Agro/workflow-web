import { onScopeDispose, ref, watch } from 'vue'
import timeService from '@/service/time/time-service'
import { useTimeTracking } from '@/composables/useTimeTracking'
import {
  IDLE_DEBUG,
  adoptRemoteActivity,
  detectionSource,
  lastActivityAt,
} from '@/composables/idle-state'

/**
 * Sinal de vida do cronômetro (spec timer-confiavel, P2).
 *
 * Enquanto o timer roda, este composable conta ao servidor ATÉ QUANDO viu
 * atividade e adota de volta o que o servidor souber de mais recente. É o que
 * transforma a entrada aberta, que era uma caixa-preta entre start e stop, em
 * algo reconstruível — e resolve três exceções que antes comiam ou inventavam
 * tempo:
 *
 * 1. **Dois dispositivos.** O servidor devolve a maior atividade conhecida; o
 *    notebook parado adota a atividade do desktop e não corta o que a outra
 *    máquina está produzindo.
 * 2. **Cliente que some** (reboot, navegador morto, queda longa). O servidor
 *    fica sabendo até onde havia atividade e pergunta à pessoa na volta, em vez
 *    de inventar 12h ou apagar tudo.
 * 3. **Suspensão da máquina.** O relógio salta entre dois tiques; o salto é
 *    detectado aqui e NÃO conta como atividade — dormir das 18h às 9h não pode
 *    virar jornada.
 *
 * Offline não exige fila: `lastActivityAt` é monotônico e sempre reenviado
 * inteiro, então o próximo heartbeat que passar já corrige o servidor.
 */

/**
 * Frequência do sinal. Um minuto é barato e mantém o servidor perto da verdade,
 * com folga confortável para o menor limiar de aviso configurável (5 min).
 *
 * No modo de depuração o limiar cai para segundos, então o batimento acompanha:
 * senão a arbitragem entre dispositivos chegaria depois do alerta e o roteiro
 * de teste não representaria o comportamento real.
 */
const BEAT_MS = IDLE_DEBUG ? 10_000 : 60_000

/**
 * Acima disto entre dois tiques, a máquina dormiu (ou a aba foi congelada com
 * agressividade). O `setInterval` é estrangulado em aba oculta, mas nunca perto
 * desta ordem de grandeza.
 */
const SLEEP_GAP_MS = 5 * 60_000

/** Última suspensão detectada, para a UI poder explicar o que houve. */
export const lastSleepAt = ref<number | null>(null)

/**
 * Último batimento aceito pelo servidor. É a prova, na tela de diagnóstico, de
 * que a entrada aberta está sendo acompanhada de verdade — sem isso, "está
 * sincronizado" seria só uma promessa do código.
 */
export const lastBeatAt = ref<number | null>(null)

let installed = false

export function useTimerHeartbeat() {
  const { isRunning, invalidateAll } = useTimeTracking()

  if (installed || typeof window === 'undefined') {
    return { lastSleepAt, lastBeatAt }
  }
  installed = true

  let timer: number | null = null
  let lastTick = Date.now()

  async function beat() {
    const now = Date.now()

    // Salto de relógio = a máquina esteve suspensa. O tempo dormido não é
    // atividade; `lastActivityAt` continua onde estava, e é isso que o servidor
    // precisa saber.
    if (now - lastTick > SLEEP_GAP_MS) {
      lastSleepAt.value = now
    }
    lastTick = now

    if (!isRunning.value) return

    try {
      const result = await timeService.heartbeat(
        new Date(lastActivityAt.value).toISOString(),
        detectionSource.value,
      )
      if (!result.running) {
        // O timer foi encerrado em outro lugar (outra aba, outro aparelho, o
        // próprio servidor). Sincroniza em vez de seguir contando sozinho.
        void invalidateAll()
        return
      }
      // A verdade do servidor pode ser MAIS recente que a nossa: outro
      // dispositivo da pessoa está ativo. Adotar é o que impede este cliente de
      // cortar tempo que não é dele.
      lastBeatAt.value = Date.now()
      const remote = new Date(result.lastActivityAt).getTime()
      if (Number.isFinite(remote)) adoptRemoteActivity(remote)
    } catch {
      // Offline ou servidor fora: o próximo tique reenvia o valor inteiro.
    }
  }

  function start() {
    if (timer !== null) return
    lastTick = Date.now()
    void beat()
    timer = window.setInterval(() => void beat(), BEAT_MS)
  }

  function stop() {
    if (timer === null) return
    window.clearInterval(timer)
    timer = null
  }

  watch(isRunning, (running) => (running ? start() : stop()), { immediate: true })

  // Voltar da aba oculta é o momento mais provável de descobrir uma suspensão:
  // o intervalo pode ter sido congelado o tempo todo.
  const onVisible = () => {
    if (!document.hidden) void beat()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', () => void beat())

  onScopeDispose(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisible)
    installed = false
  })

  return { lastSleepAt, lastBeatAt }
}
