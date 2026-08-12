import { onScopeDispose, ref } from 'vue'
import {
  IDLE_DEBUG,
  IDLE_KEYS,
  adoptRemoteActivity,
  detectionSource,
  lastActivityAt,
  markActivity,
  regressActivity,
  screenLocked,
} from '@/composables/idle-state'

/**
 * Sensores de ociosidade (spec timer-ociosidade). Alimenta `idle-state`; não
 * decide nada — a política de avisar/cortar é do `useTimerIdleGuard`.
 *
 * Dois níveis de sinal:
 *
 * 1. **`IdleDetector`** (Chromium/Edge, com permissão): enxerga o SISTEMA
 *    inteiro. É o que diferencia "saiu do computador" de "está trabalhando no
 *    VS Code com o Nevo em segundo plano" — distinção impossível só com eventos
 *    de DOM, e é dela que depende não cortar tempo de quem está trabalhando.
 * 2. **Eventos de DOM** (todo browser): mouse, teclado, toque, foco. Vale
 *    sozinho onde a API não existe (Firefox/Safari) ou a permissão foi negada.
 *
 * A última atividade é da ORIGEM, não da aba: vai para `localStorage` e volta
 * pelo evento `storage`. Sem isso, a aba esquecida em segundo plano mataria o
 * timer de quem está trabalhando na outra aba do Nevo.
 *
 * Instalado uma vez (AppShell). Chamadas repetidas são inofensivas.
 */

// ─── Tipos da IdleDetector (ainda fora do lib.dom do TS) ─────────────────────
type IdleUserState = 'active' | 'idle'
type IdleScreenState = 'locked' | 'unlocked'

interface IdleDetectorInstance extends EventTarget {
  userState: IdleUserState | null
  screenState: IdleScreenState | null
  start(options: { threshold: number; signal?: AbortSignal }): Promise<void>
}

interface IdleDetectorCtor {
  new (): IdleDetectorInstance
  requestPermission(): Promise<PermissionState>
}

function getIdleDetector(): IdleDetectorCtor | null {
  const ctor = (window as unknown as { IdleDetector?: IdleDetectorCtor }).IdleDetector
  return typeof ctor === 'function' ? ctor : null
}

export const idleDetectorSupported = (): boolean =>
  typeof window !== 'undefined' && getIdleDetector() !== null

/**
 * Estado reativo da permissão de detecção do sistema, para a UI saber se ainda
 * falta pedir. `unknown` = ainda não consultado.
 */
export const idleDetectionState = ref<PermissionState | 'unsupported' | 'unknown'>('unknown')

/** Mínimo aceito pela API. Os limiares do produto (15/5 min) são medidos por nós. */
const DETECTOR_THRESHOLD_MS = 60_000

// Eventos que contam como "a pessoa está aí". `pointermove` cobre mouse e
// caneta; `wheel` cobre quem só rola a página lendo.
const ACTIVITY_EVENTS = [
  'pointermove',
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
] as const

let installed = false
let detectorAbort: AbortController | null = null
/** Trava contra duas partidas concorrentes do detector (ver startSystemDetector). */
let starting = false

/**
 * Pede a permissão de detecção do sistema. DEVE ser chamada dentro de um clique,
 * e num gesto SÓ DELA: a ativação transitória é consumida pelo primeiro prompt,
 * então encadear este pedido depois do de notificação faz o navegador recusar
 * sem mostrar nada (ver `useIdleAlerts`, que pede um de cada vez).
 */
export async function requestIdleDetectionPermission(): Promise<PermissionState> {
  const ctor = getIdleDetector()
  if (!ctor) {
    idleDetectionState.value = 'unsupported'
    return 'denied'
  }
  try {
    const state = await ctor.requestPermission()
    idleDetectionState.value = state
    if (state === 'granted') void startSystemDetector()
    return state
  } catch {
    idleDetectionState.value = 'denied'
    return 'denied'
  }
}

/** Estado atual da permissão, sem pedir nada (para /settings e para o card). */
export async function idleDetectionPermission(): Promise<PermissionState | 'unsupported'> {
  if (!idleDetectorSupported()) {
    idleDetectionState.value = 'unsupported'
    return 'unsupported'
  }
  try {
    const status = await navigator.permissions.query({
      name: 'idle-detection' as PermissionName,
    })
    idleDetectionState.value = status.state
    // Revogar/conceder pelo cadeado da barra de endereço reflete na hora.
    status.onchange = () => {
      idleDetectionState.value = status.state
      if (status.state === 'granted') void startSystemDetector()
    }
    return status.state
  } catch {
    idleDetectionState.value = 'prompt'
    return 'prompt'
  }
}

/**
 * Liga a detecção de sistema quando a permissão já está concedida. Silencioso
 * quando não está: o pedido só acontece por gesto do usuário.
 */
async function startSystemDetector(): Promise<void> {
  const ctor = getIdleDetector()
  // A trava sobe ANTES dos awaits: `requestIdleDetectionPermission` e o
  // `onchange` da permissão podem chamar isto quase junto, e cada chamada
  // criaria um detector, sobrescrevendo o AbortController do anterior (que
  // ficaria rodando para sempre).
  if (!ctor || detectorAbort || starting) return
  starting = true

  try {
    if ((await idleDetectionPermission()) !== 'granted') return
    const abort = new AbortController()
    const detector = new ctor()
    detector.addEventListener('change', () => {
      const idle = detector.userState === 'idle'
      const locked = detector.screenState === 'locked'
      // Ver IDLE_DEBUG: com limiares de segundos, o "parado há 60s" da API
      // dispararia aviso e corte de uma vez só.
      if (IDLE_DEBUG) return
      screenLocked.value = locked
      if (locked) {
        // Tela bloqueada é ausência inequívoca: a última atividade foi agora,
        // no máximo, e o guard trata bloqueio como ocioso imediato.
        regressActivity(Date.now())
        return
      }
      if (idle) {
        // A API só informa a transição, não o instante exato: o melhor que
        // sabemos é "parada há pelo menos o threshold". Arredondar a favor do
        // usuário (60s de folga) é o preço, e ele é pago em tempo contado.
        regressActivity(Date.now() - DETECTOR_THRESHOLD_MS)
      } else {
        markActivity()
      }
    })
    await detector.start({ threshold: DETECTOR_THRESHOLD_MS, signal: abort.signal })
    detectorAbort = abort
    detectionSource.value = 'system'
  } catch {
    // Permissão revogada no meio, ou API indisponível: segue no modo aba.
    detectorAbort = null
    detectionSource.value = 'tab'
  } finally {
    starting = false
  }
}

export function useIdleDetection() {
  if (typeof window === 'undefined') return { lastActivityAt, detectionSource, screenLocked }
  if (installed) return { lastActivityAt, detectionSource, screenLocked }
  installed = true

  const onActivity = () => markActivity()
  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, onActivity, { passive: true })
  }

  // Voltar para a aba é atividade. Sair dela NÃO é ociosidade: a pessoa pode
  // estar trabalhando em outro app, e quem responde por esse caso é o detector
  // do sistema.
  const onVisibility = () => {
    if (!document.hidden) markActivity()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onActivity)

  // Atividade das outras abas do Nevo.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== IDLE_KEYS.lastActivity || !e.newValue) return
    const ts = Number(e.newValue)
    if (Number.isFinite(ts)) adoptRemoteActivity(ts)
  }
  window.addEventListener('storage', onStorage)

  // Consulta o estado (também popula `idleDetectionState` para a UI) e liga o
  // detector se a permissão já estiver concedida de uma sessão anterior.
  void idleDetectionPermission().then((state) => {
    if (state === 'granted') void startSystemDetector()
  })

  onScopeDispose(() => {
    for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onActivity)
    window.removeEventListener('storage', onStorage)
    detectorAbort?.abort()
    detectorAbort = null
    installed = false
  })

  return { lastActivityAt, detectionSource, screenLocked }
}
