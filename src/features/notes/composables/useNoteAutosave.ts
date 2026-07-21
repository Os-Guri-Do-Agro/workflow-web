import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { SaveState } from '@/components/ui/save-state'

/** Espera de inatividade antes de gravar. */
const DEFAULT_DELAY = 2000
/** Backoff das tentativas automáticas depois de uma falha. */
const RETRY_DELAYS = [5000, 15000, 45000]

interface AutosaveOptions {
  /** Grava de fato. Deve rejeitar quando o servidor recusar. */
  save: () => Promise<void>
  /**
   * Gravação de emergência para quando a aba está sendo fechada: precisa ser
   * síncrona (`fetch` com `keepalive`, `sendBeacon`), porque promise nenhuma
   * sobrevive ao unload.
   */
  beacon?: () => void
  /** Enquanto retornar false, nada é agendado nem gravado. */
  enabled?: () => boolean
  delay?: number
}

/**
 * Autosave no modelo do VS Code: grava sozinho depois de uma pausa na digitação
 * e imediatamente quando o foco sai, a aba muda ou a rota troca.
 *
 * O contrato com a UI é o `SaveStatus`: nunca diz "salvo" antes do servidor
 * confirmar, e falha de rede não descarta o texto - o conteúdo continua em
 * memória e a gravação é retentada em 5s, 15s e 45s.
 */
export function useNoteAutosave(options: AutosaveOptions) {
  const delay = options.delay ?? DEFAULT_DELAY

  const state = ref<SaveState>('idle')
  const savedAt = ref<number | null>(null)
  const message = ref('')
  const isDirty = ref(false)

  const timer = shallowRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = shallowRef<ReturnType<typeof setTimeout> | null>(null)
  let inFlight: Promise<void> | null = null
  let retryAttempt = 0
  let disposed = false

  const isEnabled = () => !disposed && (options.enabled?.() ?? true)

  const clearTimer = () => {
    if (timer.value) clearTimeout(timer.value)
    timer.value = null
  }

  const clearRetry = () => {
    if (retryTimer.value) clearTimeout(retryTimer.value)
    retryTimer.value = null
  }

  async function run(): Promise<void> {
    if (!isEnabled() || !isDirty.value) return
    // Uma gravação por vez. Se chegou mudança nova durante a anterior, ela
    // continua marcada como suja e a chamada seguinte pega o texto mais novo.
    if (inFlight) {
      await inFlight.catch(() => {})
      if (!isDirty.value) return
    }

    clearTimer()
    clearRetry()
    state.value = 'saving'
    message.value = ''

    // Zera antes de gravar: o que for digitado durante a request marca de novo
    // e garante uma segunda gravação, em vez de se perder na janela da chamada.
    isDirty.value = false

    let failed = false
    const attempt = (async () => {
      try {
        await options.save()
        if (disposed) return
        state.value = 'saved'
        savedAt.value = Date.now()
        retryAttempt = 0
      } catch (error) {
        if (disposed) return
        failed = true
        isDirty.value = true
        state.value = 'error'
        message.value = error instanceof Error ? error.message : 'Falha ao salvar'
        scheduleRetry()
        throw error
      } finally {
        inFlight = null
      }
    })()

    inFlight = attempt
    await attempt.catch(() => {})

    // Digitou enquanto gravava: agenda a próxima rodada. Quando falhou, quem
    // reagenda é o backoff do `scheduleRetry`.
    if (isDirty.value && !failed) schedule()
  }

  function scheduleRetry() {
    const wait = RETRY_DELAYS[retryAttempt]
    if (wait === undefined) return // esgotou; a partir daqui só no botão
    retryAttempt += 1
    clearRetry()
    retryTimer.value = setTimeout(() => {
      void run()
    }, wait)
  }

  function schedule() {
    if (!isEnabled()) return
    clearTimer()
    timer.value = setTimeout(() => {
      void run()
    }, delay)
  }

  /** Marca conteúdo alterado e agenda a gravação. */
  function markDirty() {
    if (!isEnabled()) return
    isDirty.value = true
    schedule()
  }

  /** Grava agora, se houver algo pendente. */
  async function flush() {
    if (!isDirty.value) return
    await run().catch(() => {})
  }

  /** Botão "Tentar de novo": reinicia o backoff. */
  async function retry() {
    retryAttempt = 0
    isDirty.value = true
    await flush()
  }

  const onVisibility = () => {
    // `hidden` é o último momento confiável para uma gravação normal; o
    // `beforeunload` já não garante que a promise complete.
    if (document.visibilityState === 'hidden') void flush()
  }

  const onPageHide = () => {
    if (isDirty.value) options.beacon?.()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onPageHide)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('beforeunload', onPageHide)
    clearTimer()
    clearRetry()
    // Sem await: o componente está saindo. O flush do route leave já rodou.
    if (isDirty.value) options.beacon?.()
    disposed = true
  })

  onBeforeRouteLeave(async () => {
    await flush()
    return true
  })

  return { state, savedAt, message, isDirty, markDirty, flush, retry }
}
