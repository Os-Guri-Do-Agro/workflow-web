import { watchEffect } from 'vue'
import { useTitle } from '@vueuse/core'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { formatTimer } from '@/utils/duration'

// Fallback caso o documento não tenha título no primeiro run (SSR/edge).
const FALLBACK_TITLE = 'Nevo'

/**
 * F1 — reflete o cronômetro no título da aba do navegador (GAP do dono).
 *
 * Enquanto houver timer rodando, o `<title>` vira "⏱ MM:SS · descrição", útil
 * quando a aba está em segundo plano. Ao parar, restaura o título base capturado
 * na primeira execução.
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

  watchEffect(() => {
    if (isRunning.value) {
      const desc = running.value?.description?.trim() || 'Sem descrição'
      title.value = `⏱ ${formatTimer(elapsedSec.value)} · ${desc}`
    } else {
      title.value = baseTitle
    }
  })
}
