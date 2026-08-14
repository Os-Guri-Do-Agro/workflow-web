import { computed, ref } from 'vue'

/**
 * Estado compartilhado da ociosidade (spec timer-ociosidade).
 *
 * Módulo de estado puro, sem componente e sem dependência de nenhum outro
 * composable: quem sente (useIdleDetection) escreve, quem decide
 * (useTimerIdleGuard) escreve a fase, e quem desenha (favicon, título, widget)
 * só lê. É o que evita import circular entre eles.
 *
 * REGRA DE PRIVACIDADE: nada daqui vai para o servidor. Ociosidade é sinal do
 * dispositivo da pessoa; o backend só recebe a consequência (o fim da entrada).
 */

/** `active` = trabalhando · `warning` = avisado, contando a carência · `stopped` = timer cortado. */
export type IdlePhase = 'active' | 'warning' | 'stopped'

/**
 * De onde vem o sinal de atividade, em ordem de confiança:
 *
 * - `system`: a `IdleDetector` do navegador enxerga o computador inteiro. É a
 *   ÚNICA fonte que distingue "saiu da máquina" de "minimizou o Nevo e foi
 *   trabalhar no VS Code".
 * - `extension`: a extensão do Nevo (`chrome.idle`), que enxerga o mesmo e
 *   ainda funciona com a aba fechada.
 * - `tab`: só eventos dentro da aba. Aqui minimizar o navegador é
 *   indistinguível de sair do computador — e é por isso que este modo NUNCA
 *   autoriza corte automático.
 */
export type IdleSource = 'system' | 'extension' | 'tab'

/**
 * O corte automático exige fonte que enxergue o sistema. Foi a falta desta
 * regra que fez o cronômetro parar de gente que só tinha minimizado o
 * navegador: o guard cortava sem olhar de onde vinha o sinal.
 */
export const TRUSTED_SOURCES: readonly IdleSource[] = ['system', 'extension']

export const IDLE_KEYS = {
  /** Última atividade da ORIGEM (todas as abas), em ms. */
  lastActivity: 'nevo.idle.lastActivity',
  /** Reserva de corte, para duas abas não pararem o mesmo timer. */
  cutClaim: 'nevo.idle.cutClaim',
  /** Último corte, para oferecer a recuperação ao voltar. */
  lastCut: 'nevo.idle.lastCut',
} as const

/** Janela em que a recuperação do tempo cortado continua sendo oferecida. */
export const RECOVER_WINDOW_MS = 12 * 60 * 60 * 1000

/** Entrada cortada por ociosidade, guardada para a recuperação de um clique. */
export interface IdleCutRecord {
  entryId: string
  /** Instante em que a entrada foi fechada (última atividade real), em ms. */
  cutAt: number
  /** Quando o corte aconteceu, em ms (base da janela de recuperação). */
  at: number
  description: string
  companyId: string | null
  activityId: string | null
  billable: boolean
}

/**
 * Modo de depuração (`?idleDebug=1`, só em dev): limiares de segundos em vez de
 * minutos, para exercitar o ciclo inteiro sem esperar 20 minutos.
 *
 * Com ele ligado, o sinal de ociosidade da `IdleDetector` é ignorado: a API só
 * informa "parado há pelo menos 60s", o que atropelaria limiares menores que
 * isso e faria aviso e corte dispararem juntos. Em produção (15 min) esses 60s
 * são irrelevantes. Ou seja: o modo de depuração exercita a máquina de estados;
 * o detector do sistema se verifica no fluxo real.
 */
export const IDLE_DEBUG =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('idleDebug') === '1'

/** Identificador desta aba, só para o dono do claim de corte se reconhecer. */
export const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function readLastCut(): IdleCutRecord | null {
  try {
    const raw = localStorage.getItem(IDLE_KEYS.lastCut)
    if (!raw) return null
    const parsed = JSON.parse(raw) as IdleCutRecord
    if (!parsed?.entryId || typeof parsed.cutAt !== 'number') return null
    // Fora da janela: some sozinho, sem exigir limpeza manual.
    if (Date.now() - parsed.at > RECOVER_WINDOW_MS) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Última atividade vista NESTE dispositivo, em ms (todas as abas somadas).
 *
 * Pode andar para trás: a extensão e o detector do sistema corrigem quando
 * descobrem que a máquina está parada há mais tempo do que a aba supunha.
 */
export const lastActivityAt = ref(readNumber(IDLE_KEYS.lastActivity) ?? Date.now())

/**
 * Última atividade conhecida em OUTRO dispositivo da pessoa, vinda do servidor
 * pelo heartbeat.
 *
 * Vive separada de propósito, e a distinção resolve um conflito real: a
 * extensão diz "este computador está parado há 5 minutos" e o servidor diz "o
 * outro computador está ativo agora". As duas afirmações são verdadeiras — a
 * pessoa trocou de máquina. Guardando tudo num campo só, a correção para trás
 * do sinal local apagava a atividade remota e o timer era cortado enquanto a
 * pessoa trabalhava no outro aparelho.
 *
 * É um PISO: só cresce, e nenhum sinal local pode rebaixá-lo.
 */
export const remoteActivityAt = ref(0)

/**
 * O que a política de ociosidade deve olhar: o mais recente entre o que esta
 * máquina viu e o que o servidor sabe das outras.
 */
export const effectiveActivityAt = computed(() =>
  Math.max(lastActivityAt.value, remoteActivityAt.value),
)
/** Tela do computador bloqueada: ocioso na hora, sem esperar o limiar. */
export const screenLocked = ref(false)
/** Qualidade do sinal disponível agora (mostrada na UI e usada pela política). */
export const detectionSource = ref<IdleSource>('tab')

/**
 * A proteção está completa? Só aqui o corte automático é permitido; em
 * `limited` o Nevo avisa e insiste, mas nunca encerra a entrada sozinho.
 */
export const protectionLevel = computed<'full' | 'limited'>(() =>
  TRUSTED_SOURCES.includes(detectionSource.value) ? 'full' : 'limited',
)
export const idlePhase = ref<IdlePhase>('active')
export const lastCut = ref<IdleCutRecord | null>(readLastCut())

// Uma escrita a cada 5s por aba, no máximo (o mousemove dispara dezenas por
// segundo e localStorage é síncrono).
const WRITE_THROTTLE_MS = 5000
let lastWrittenAt = 0

function persistActivity(ts: number) {
  if (ts - lastWrittenAt < WRITE_THROTTLE_MS) return
  lastWrittenAt = ts
  try {
    localStorage.setItem(IDLE_KEYS.lastActivity, String(ts))
  } catch {
    // Modo privativo / cota estourada: a aba continua funcionando sozinha.
  }
}

/**
 * Registra atividade real (mouse, teclado, foco, clique numa ação do alerta).
 * Só avança no tempo: um evento atrasado nunca "volta" o relógio.
 */
export function markActivity(ts: number = Date.now()): void {
  screenLocked.value = false
  if (ts <= lastActivityAt.value) return
  lastActivityAt.value = ts
  persistActivity(ts)
}

/**
 * Atividade vinda de OUTRA ABA da mesma máquina (evento `storage`). É sinal
 * LOCAL: a extensão e o detector do sistema continuam podendo corrigi-lo para
 * trás, porque eles enxergam a máquina inteira e uma aba não. Não repersiste —
 * quem escreveu já gravou, e reescrever aqui só criaria eco entre abas.
 */
export function adoptTabActivity(ts: number): void {
  if (ts > lastActivityAt.value) lastActivityAt.value = ts
}

/**
 * Atividade vinda do SERVIDOR (outro dispositivo da pessoa). Piso monotônico:
 * nenhum sinal local a rebaixa. Ver `remoteActivityAt`.
 */
export function adoptRemoteActivity(ts: number): void {
  if (ts > remoteActivityAt.value) remoteActivityAt.value = ts
}

/**
 * Correção para trás vinda do sistema operacional: a `IdleDetector` avisa que a
 * pessoa está parada há pelo menos `threshold`, então a última atividade é no
 * máximo `ts`. Sem isso, um mousemove residual na aba mascararia a ausência
 * real da pessoa na frente do computador.
 */
export function regressActivity(ts: number): void {
  if (ts < lastActivityAt.value) {
    lastActivityAt.value = ts
    lastWrittenAt = 0
    persistActivity(ts)
  }
}

/**
 * Empurra a última atividade para trás para exercitar o ciclo inteiro sem
 * ficar 15 minutos parado na frente do computador.
 *
 * Existe porque "como eu sei que isto funciona?" não pode depender de esperar,
 * nem de um modo de depuração que só roda em desenvolvimento. Quem instala a
 * extensão precisa conseguir provar, na própria máquina e em produção, que o
 * aviso chega e que o corte acontece.
 *
 * Não é um ensaio: a partir daqui tudo é o fluxo real, com corte de verdade se
 * a proteção estiver completa. Vale exatamente por isso, e a tela avisa.
 *
 * Mexe também no piso remoto: ele é monotônico de propósito (nenhum sinal local
 * o rebaixa), então sem isto o servidor sustentaria a simulação e nada
 * aconteceria.
 */
export function simulateAbsence(ms: number): void {
  const ts = Date.now() - ms
  lastActivityAt.value = ts
  remoteActivityAt.value = Math.min(remoteActivityAt.value, ts)
  lastWrittenAt = 0
  persistActivity(ts)
}

export function setLastCut(record: IdleCutRecord | null): void {
  lastCut.value = record
  try {
    if (record) localStorage.setItem(IDLE_KEYS.lastCut, JSON.stringify(record))
    else localStorage.removeItem(IDLE_KEYS.lastCut)
  } catch {
    // Sem persistência o aviso vale só nesta aba — degradação aceitável.
  }
}
