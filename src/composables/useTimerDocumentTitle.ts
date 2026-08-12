import { onScopeDispose, ref, watchEffect } from 'vue'
import { useTitle } from '@vueuse/core'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { idlePhase } from '@/composables/idle-state'
import { formatTimer } from '@/utils/duration'

// Fallback caso o documento não tenha título no primeiro run (SSR/edge).
const FALLBACK_TITLE = 'Nevo'
const BLINK_MS = 1200

/**
 * F1 — reflete o cronômetro no título da aba do navegador (GAP do dono).
 *
 * Enquanto houver timer rodando, o `<title>` vira "● MM:SS · descrição" (o ponto
 * vermelho de "gravando", casando com o badge do favicon — ver useFaviconBadge),
 * útil quando a aba está em segundo plano. Ao parar, restaura o título base
 * capturado na primeira execução.
 *
 * Em ociosidade (spec timer-ociosidade) o título alterna com "Ainda por aí?",
 * do jeito que WhatsApp e afins fazem com mensagem nova: é o sinal que continua
 * chamando depois que a notificação do sistema recolhe para a Central de Ações.
 * Com `prefers-reduced-motion`, o aviso fica estático.
 *
 * Deve ser montado UMA vez, num ponto sempre presente (ex.: AppShell). Consome o
 * singleton de `useTimeTracking`, então não cria interval/subscription extra.
 */
export function useTimerDocumentTitle() {
  const { isRunning, elapsedSec, running } = useTimeTracking()
  const title = useTitle()

  // Título base: o que estava no documento ao montar (antes de qualquer mutação).
  const baseTitle =
    (typeof document !== 'undefined' && document.title) || FALLBACK_TITLE

  const blinkOn = ref(true)
  let blinkTimer: number | null = null

  const reducedMotion = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  function stopBlink() {
    if (blinkTimer !== null) {
      window.clearInterval(blinkTimer)
      blinkTimer = null
    }
    blinkOn.value = true
  }

  function startBlink() {
    if (blinkTimer !== null || reducedMotion()) return
    blinkTimer = window.setInterval(() => {
      blinkOn.value = !blinkOn.value
    }, BLINK_MS)
  }

  watchEffect(() => {
    if (!isRunning.value) {
      stopBlink()
      title.value = baseTitle
      return
    }

    const desc = running.value?.description?.trim() || 'Sem descrição'
    const clock = `● ${formatTimer(elapsedSec.value)} · ${desc}`

    if (idlePhase.value === 'warning') {
      startBlink()
      title.value = blinkOn.value ? 'Ainda por aí?' : clock
      return
    }

    stopBlink()
    title.value = clock
  })

  onScopeDispose(stopBlink)
}
