import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/uiStores'
import { useSystemNotification } from '@/composables/useSystemNotification'
import {
  idleDetectionState,
  idleDetectorSupported,
  requestIdleDetectionPermission,
} from '@/composables/useIdleDetection'

/**
 * Permissões do aviso de ociosidade, sempre ancoradas num gesto (spec
 * timer-ociosidade).
 *
 * São DUAS, e o navegador mostra um prompt para cada: notificação (a peça
 * central, é o que alcança quem está com o navegador minimizado) e detecção de
 * ociosidade do sistema (o que diferencia "saiu do computador" de "está
 * trabalhando em outro app").
 *
 * **Um pedido por clique.** A ativação transitória do gesto é consumida pelo
 * primeiro prompt; encadear o segundo logo depois faz o navegador recusá-lo sem
 * mostrar nada. Por isso `requestNext()` resolve UM passo por vez, e o convite
 * continua visível enquanto sobrar passo — notificação primeiro, porque sem ela
 * o aviso não sai do navegador.
 *
 * O pedido acontece no card do primeiro acesso e no clique de "Iniciar" do
 * timer, que é quando a pessoa demonstra que vai usar o recurso. Nunca no boot:
 * o navegador recusa (ou pune) prompt sem interação.
 */

/** Qual passo falta agora (ou nenhum). */
export type IdlePermissionStep = 'notification' | 'detection' | null

// "Uma vez por sessão" POR PASSO: pedir a cada start viraria perseguição.
const askedThisSession = new Set<string>()

const requesting = ref(false)

export function useIdleAlerts() {
  const store = useUiStore()
  const { idleGuard, idlePermissionPrompt } = storeToRefs(store)
  const { permission, requestPermission, supported } = useSystemNotification()

  const granted = computed(() => permission.value === 'granted')
  const blocked = computed(() => permission.value === 'denied')

  /** Detecção de sistema: concedida, ou inexistente neste navegador. */
  const detectionResolved = computed(
    () =>
      !idleDetectorSupported() ||
      idleDetectionState.value === 'granted' ||
      idleDetectionState.value === 'denied' ||
      idleDetectionState.value === 'unsupported',
  )

  /** Próximo passo pendente, na ordem de importância. */
  const nextStep = computed<IdlePermissionStep>(() => {
    if (supported && permission.value === 'default') return 'notification'
    if (!detectionResolved.value) return 'detection'
    return null
  })

  /** Deve aparecer o convite (card / linha no widget)? */
  const needsPermission = computed(() => idleGuard.value && nextStep.value !== null)

  /** Card do primeiro acesso: só enquanto a pessoa não dispensou. */
  const shouldShowPrompt = computed(() => needsPermission.value && idlePermissionPrompt.value)

  /** Texto do passo atual, para o convite não mentir sobre o que vai abrir. */
  const stepLabel = computed(() =>
    nextStep.value === 'detection' ? 'Permitir detecção de atividade' : 'Ativar avisos',
  )

  /**
   * Resolve UM passo de permissão. DEVE ser chamada direto do handler do clique:
   * a ativação do gesto expira e não sobrevive a um `await` de rede.
   */
  async function requestNext(): Promise<void> {
    const step = nextStep.value
    if (requesting.value || !step) return
    requesting.value = true
    askedThisSession.add(step)
    try {
      if (step === 'notification') await requestPermission()
      else await requestIdleDetectionPermission()
    } finally {
      requesting.value = false
      // O card do primeiro acesso some quando não sobra passo; enquanto sobrar,
      // o convite continua no widget e em /settings.
      if (!nextStep.value) store.idlePermissionPrompt = false
    }
  }

  /**
   * Chamado no clique de "Iniciar" do timer. Silencioso quando não há passo
   * pendente, quando esse passo já foi pedido nesta sessão ou com o recurso
   * desligado.
   */
  function askOnStart(): void {
    const step = nextStep.value
    if (!step || !idleGuard.value || askedThisSession.has(step)) return
    void requestNext()
  }

  /** Dispensa o card sem pedir nada. */
  function dismissPrompt(): void {
    store.idlePermissionPrompt = false
  }

  return {
    supported,
    permission,
    granted,
    blocked,
    requesting,
    nextStep,
    stepLabel,
    needsPermission,
    shouldShowPrompt,
    requestNext,
    askOnStart,
    dismissPrompt,
  }
}
