import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/uiStores'
import { useSystemNotification } from '@/composables/useSystemNotification'
import { protectionLevel } from '@/composables/idle-state'
import {
  idleDetectionState,
  idleDetectorSupported,
  requestIdleDetectionPermission,
} from '@/composables/useIdleDetection'

/**
 * Permissões do aviso de ociosidade, sempre ancoradas num gesto.
 *
 * São DUAS, e elas são INDEPENDENTES — foi a dependência entre elas que fez
 * gente nunca ver o pedido: antes a detecção só era oferecida depois que a
 * notificação fosse resolvida, e o Chrome com "silenciar solicitações de
 * notificação" (ligado em muita máquina) resolve para negado sem mostrar nada.
 * Resultado: a detecção jamais era pedida, o app ficava em modo limitado e o
 * cronômetro parava de quem só havia minimizado o navegador.
 *
 * Ordem de importância, e por quê:
 *
 * 1. **Detecção de atividade** (`IdleDetector`): é ela que distingue "saiu do
 *    computador" de "está no VS Code". Sem ela não existe corte automático.
 * 2. **Notificação**: faz o aviso alcançar quem está com o navegador
 *    minimizado. Importante, mas não muda o que o app FAZ com o tempo.
 *
 * Um pedido por clique: a ativação transitória do gesto é consumida pelo
 * primeiro prompt, e o segundo, disparado depois do `await`, seria recusado sem
 * aparecer.
 */

export type IdlePermissionStep = 'detection' | 'notification' | null

/** Adiamento do lembrete de proteção limitada (o "agora não" do diálogo). */
const SNOOZE_KEY = 'nevo.idle.protectionSnoozedUntil'
const SNOOZE_MS = 24 * 60 * 60 * 1000

const requesting = ref(false)
/** Reativo para o diálogo fechar/reabrir sem depender de reload. */
const snoozedUntil = ref(readSnooze())

function readSnooze(): number {
  try {
    const raw = Number(localStorage.getItem(SNOOZE_KEY))
    return Number.isFinite(raw) ? raw : 0
  } catch {
    return 0
  }
}

export function useIdleAlerts() {
  const store = useUiStore()
  const { idleGuard, idlePermissionPrompt } = storeToRefs(store)
  const { permission, requestPermission, supported } = useSystemNotification()

  const granted = computed(() => permission.value === 'granted')
  const blocked = computed(() => permission.value === 'denied')

  /** Detecção de sistema resolvida (concedida, negada ou inexistente aqui). */
  const detectionResolved = computed(
    () =>
      !idleDetectorSupported() ||
      idleDetectionState.value === 'granted' ||
      idleDetectionState.value === 'denied' ||
      idleDetectionState.value === 'unsupported',
  )

  /** A detecção do sistema está ativa? É o que autoriza o corte automático. */
  const detectionActive = computed(() => idleDetectionState.value === 'granted')

  /** Detecção pedida e NEGADA: só o cadeado do navegador reverte. */
  const detectionBlocked = computed(() => idleDetectionState.value === 'denied')

  /**
   * Próximo passo pendente. Detecção primeiro: ela muda o comportamento do
   * produto, a notificação só muda o alcance do aviso.
   */
  const nextStep = computed<IdlePermissionStep>(() => {
    if (!detectionResolved.value) return 'detection'
    if (supported && permission.value === 'default') return 'notification'
    return null
  })

  const stepLabel = computed(() =>
    nextStep.value === 'detection' ? 'Permitir detecção' : 'Ativar avisos',
  )

  /** Proteção limitada: o app avisa, mas não encerra a entrada sozinho. */
  const limited = computed(() => protectionLevel.value === 'limited')

  const snoozed = computed(() => snoozedUntil.value > Date.now())

  /**
   * Deve cobrar a permissão AGORA? Diferente do card de boas-vindas, isto não
   * é dispensável para sempre: enquanto a proteção estiver limitada e o recurso
   * ligado, o Nevo volta a pedir (respeitando o adiamento de 24h).
   *
   * Inclui o caso BLOQUEADO de propósito. Ele parecia "resolvido" (não há o que
   * pedir, o prompt não reabre), mas é o pior estado possível: proteção
   * limitada para sempre, sem ninguém saber por quê. O diálogo é o único lugar
   * que ensina o caminho do cadeado.
   *
   * Já navegador SEM a API (Firefox, Safari) não entra: ali não existe ação
   * possível, e interromper alguém com um problema insolúvel é só ruído.
   */
  const needsAttention = computed(() => {
    if (!idleGuard.value || !limited.value || snoozed.value) return false
    return nextStep.value !== null || detectionBlocked.value
  })

  /** Convite discreto (widget, /settings): aparece enquanto faltar algum passo. */
  const needsPermission = computed(() => idleGuard.value && nextStep.value !== null)

  /** Card de boas-vindas do primeiro acesso (dispensável). */
  const shouldShowPrompt = computed(() => needsPermission.value && idlePermissionPrompt.value)

  /**
   * Resolve UM passo. DEVE ser chamada direto do handler do clique: a ativação
   * do gesto expira e não sobrevive a um `await` de rede.
   */
  async function requestNext(): Promise<void> {
    const step = nextStep.value
    if (requesting.value || !step) return
    requesting.value = true
    try {
      if (step === 'detection') await requestIdleDetectionPermission()
      else await requestPermission()
    } finally {
      requesting.value = false
      if (!nextStep.value) store.idlePermissionPrompt = false
    }
  }

  /** Adia a cobrança por 24h (o "agora não" do diálogo). */
  function snooze(): void {
    const until = Date.now() + SNOOZE_MS
    snoozedUntil.value = until
    try {
      localStorage.setItem(SNOOZE_KEY, String(until))
    } catch {
      // Sem persistência o adiamento vale só nesta sessão.
    }
  }

  function dismissPrompt(): void {
    store.idlePermissionPrompt = false
  }

  return {
    supported,
    permission,
    granted,
    blocked,
    detectionActive,
    detectionBlocked,
    detectionSupported: idleDetectorSupported(),
    limited,
    requesting,
    nextStep,
    stepLabel,
    needsAttention,
    needsPermission,
    shouldShowPrompt,
    requestNext,
    snooze,
    dismissPrompt,
  }
}
