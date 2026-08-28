import { computed, onScopeDispose, ref, watch } from 'vue'
import { TIMER_AUTO_STOP_ENABLED } from '@/config/feature-flags'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useIdleDetection } from '@/composables/useIdleDetection'
import { useSystemNotification } from '@/composables/useSystemNotification'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useTimerSounds } from '@/composables/useTimerSounds'
import {
  IDLE_DEBUG,
  IDLE_KEYS,
  TAB_ID,
  effectiveActivityAt,
  idlePhase,
  lastCut,
  markActivity,
  protectionLevel,
  screenLocked,
  setLastCut,
  type IdleCutRecord,
} from '@/composables/idle-state'

/**
 * Política de ociosidade do timer (spec timer-ociosidade).
 *
 * `useIdleDetection` diz QUANDO houve a última atividade; aqui decidimos o que
 * fazer com isso: avisar aos 15 min (notificação do sistema + favicon + título)
 * e, se ninguém responder em mais 5, encerrar a entrada no instante da última
 * atividade real — o tempo ocioso não entra em total nenhum.
 *
 * **HOJE O CORTE ESTÁ DESLIGADO** (`TIMER_AUTO_STOP_ENABLED`, ver
 * `config/feature-flags.ts`): estava encerrando timer de gente que estava
 * trabalhando. O aviso continua, e o botão "Parar agora" dele também — o que
 * sumiu foi só o encerramento sem ninguém pedir. Ver `cortaAutomatico`.
 *
 * Nada de ociosidade vai para o servidor: ele recebe só o fim da entrada.
 *
 * Instalado uma vez no AppShell; o TimerWidget consome o mesmo estado.
 */

/** Notificação de aviso e de corte usam `tag` fixa: uma substitui a outra. */
const WARN_TAG = 'nevo-idle-warn'
const CUT_TAG = 'nevo-idle-cut'

/** Reavaliação periódica. Não precisa de 1s: a decisão é por timestamp. */
const TICK_MS = 5_000

/** Claim de corte vale por pouco tempo: se a aba dona morrer, outra assume. */
const CLAIM_TTL_MS = 30_000

/**
 * Teto do período recuperável.
 *
 * A recuperação existe para desfazer um corte indevido de quem estava numa
 * reunião ou lendo algo fora do navegador — meia hora, uma hora. Voltar cinco
 * horas depois e recriar tudo com um clique registraria como trabalho um tempo
 * que ninguém acompanhou; acima do teto o caminho certo é a entrada manual da
 * tela /time, onde a pessoa escolhe início e fim conscientemente.
 */
const RECOVER_MAX_MS = 2 * 60 * 60 * 1000

/** Limiares curtos para conseguir exercitar o fluxo sem esperar 20 minutos. */
const DEBUG_WARN_MS = 30_000
const DEBUG_GRACE_MS = 15_000

/**
 * Reserva o direito de cortar. Não é atômico (localStorage não oferece isso), e
 * não precisa ser: a corrida remanescente termina em 404 no backend, que o
 * chamador trata como no-op.
 */
function claimCut(): boolean {
  try {
    const now = Date.now()
    const raw = localStorage.getItem(IDLE_KEYS.cutClaim)
    if (raw) {
      const claim = JSON.parse(raw) as { tabId: string; ts: number }
      if (claim.tabId !== TAB_ID && now - claim.ts < CLAIM_TTL_MS) return false
    }
    localStorage.setItem(IDLE_KEYS.cutClaim, JSON.stringify({ tabId: TAB_ID, ts: now }))
    const after = JSON.parse(
      localStorage.getItem(IDLE_KEYS.cutClaim) ?? '{}',
    ) as { tabId?: string }
    return after.tabId === TAB_ID
  } catch {
    return true
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404
}

let installed = false

// Relógio e trava de corte vivem no MÓDULO, não na chamada: o guard é
// consumido em dois lugares (AppShell instala, TimerWidget desenha) e um `now`
// por instância deixaria o contador do widget congelado, já que só a primeira
// instalação tem o intervalo.
const now = ref(Date.now())
const cutting = ref(false)

/**
 * Instante da última atividade REAL, congelado quando o aviso subiu.
 *
 * Sem isto, "Parar agora" gravava justamente o tempo ocioso que o recurso
 * existe para descartar: o clique no botão (ou o foco da janela ao clicar na
 * notificação) passa pelo detector de atividade e empurra `lastActivityAt` para
 * agora antes do handler rodar. Quem atende o aviso ficaria pior do que quem o
 * ignora.
 */
const idleSince = ref<number | null>(null)

export function useTimerIdleGuard() {
  const { isRunning, running, stopAt, stop, start, createManual } = useTimeTracking()
  const { idleGuard, idleWarnMin } = useUiPreferences()
  const notification = useSystemNotification()
  // O aviso era só visual: notificação, favicon e título. Quem estava com o
  // navegador atrás de outra janela não via nada e descobria o corte depois.
  const { playAlert, playStop } = useTimerSounds()
  useIdleDetection()

  const debug = IDLE_DEBUG
  const warnMs = computed(() =>
    debug ? DEBUG_WARN_MS : Math.max(1, idleWarnMin.value) * 60_000,
  )
  // Carência = um terço do aviso (5 min no padrão de 15). Tempo suficiente para
  // voltar de uma ida ao banheiro, curto o bastante para não inflar o registro.
  const graceMs = computed(() => (debug ? DEBUG_GRACE_MS : Math.round(warnMs.value / 3)))

  /**
   * Há quanto tempo a pessoa está parada, em segundos — considerando TODOS os
   * dispositivos dela (ver `effectiveActivityAt`). Olhar só esta máquina faria
   * o notebook parado cortar o tempo que o desktop está produzindo.
   */
  const idleSec = computed(() =>
    Math.max(0, Math.floor((now.value - effectiveActivityAt.value) / 1000)),
  )

  /**
   * Segundos restantes até o corte, enquanto o aviso está de pé. Zero em modo
   * limitado: lá não existe corte, e mostrar contagem regressiva seria mentira.
   */
  const secondsToCut = computed(() => {
    if (idlePhase.value !== 'warning' || !cortaAutomatico.value) return 0
    const deadline = effectiveActivityAt.value + warnMs.value + graceMs.value
    return Math.max(0, Math.round((deadline - now.value) / 1000))
  })

  const enabled = computed(() => idleGuard.value)

  /**
   * Existe corte automático nesta sessão?
   *
   * Duas condições, e as duas por motivos diferentes:
   *
   * - `TIMER_AUTO_STOP_ENABLED`: a chave geral, hoje DESLIGADA (ver
   *   `config/feature-flags.ts`). Cortava tempo de gente que estava trabalhando.
   * - `protectionLevel === 'full'`: mesmo com a chave ligada, cortar exige uma
   *   fonte que enxergue o computador inteiro. Sem ela, "sem eventos na aba" só
   *   quer dizer que o Nevo está minimizado.
   *
   * Tudo que dependia de `protectionLevel === 'full'` passou a depender daqui:
   * a contagem regressiva, o texto do aviso e o próprio corte precisam contar a
   * MESMA história, senão o aviso promete um corte que não vem.
   */
  const cortaAutomatico = computed(
    () => TIMER_AUTO_STOP_ENABLED && protectionLevel.value === 'full',
  )

  function describe(): string {
    const desc = running.value?.description?.trim()
    return desc || 'Sem descrição'
  }

  async function enterWarning() {
    idlePhase.value = 'warning'
    idleSince.value = effectiveActivityAt.value
    // Antes da notificação: o som é o que alcança quem está de fone em outra
    // janela, e o toast do sistema pode ir direto para a Central de Ações.
    playAlert()
    const minutes = Math.round(warnMs.value / 60_000)
    const limitado = !cortaAutomatico.value
    await notification.notify({
      tag: WARN_TAG,
      title: 'Seu tempo continua correndo',
      // Em modo limitado o texto NÃO promete corte: nesse modo o Nevo não sabe
      // se você saiu ou só minimizou, e prometer o que não vai fazer é pior do
      // que não prometer.
      body: debug
        ? `Sem atividade há ${idleSec.value}s. "${describe()}" segue gravando.`
        : limitado
          ? `Sem atividade no Nevo há ${minutes} min. "${describe()}" segue gravando — se estiver em outro programa, tudo certo.`
          : `Sem atividade há ${minutes} min. "${describe()}" segue gravando.`,
      actions: [
        { action: 'continue', title: 'Continuar contando' },
        { action: 'stop', title: 'Parar agora' },
      ],
      data: { kind: 'idle-warning' as const },
    })
  }

  function exitWarning() {
    idlePhase.value = 'active'
    idleSince.value = null
    void notification.close(WARN_TAG)
  }

  /**
   * Encerra a entrada no instante da última atividade. `reason` só muda a
   * mensagem: o corte manual ("Parar agora") usa exatamente o mesmo instante,
   * senão a pessoa que atende o aviso perderia menos tempo do que quem ignora.
   */
  async function cut(reason: 'auto' | 'manual') {
    if (cutting.value || !running.value) return
    // REGRA CENTRAL: corte automático exige fonte que enxergue o computador
    // inteiro. Sem ela, "sem eventos na aba" significa apenas que o Nevo está
    // minimizado — foi assim que o cronômetro parou de quem só tinha ido
    // trabalhar em outro programa. O aviso continua; o corte, não.
    if (reason === 'auto' && !cortaAutomatico.value) return
    if (reason === 'auto' && !claimCut()) return

    cutting.value = true
    const entry = running.value
    // `idleSince` (congelado no aviso) e não `lastActivityAt`: clicar em "Parar
    // agora" é, ele próprio, atividade, e usar o valor vivo devolveria o
    // instante do clique — gravando todo o tempo ocioso.
    const cutAt = idleSince.value ?? effectiveActivityAt.value
    // Quando o instante retroativo é recusado, a entrada fecha em AGORA: o
    // tempo ocioso acabou contado e não existe período nenhum para recuperar.
    let closedAtCutAt = true
    try {
      await stopAt.mutateAsync(new Date(cutAt).toISOString())
    } catch (error) {
      // Outra aba (ou o auto-stop do servidor) já encerrou: nada a fazer.
      if (isNotFound(error)) {
        idlePhase.value = 'active'
        return
      }
      // Instante recusado (clock skew, entrada longa demais): fecha normal, que
      // é melhor do que deixar o timer correndo sozinho.
      try {
        await stop.mutateAsync()
        closedAtCutAt = false
      } catch {
        idlePhase.value = 'active'
        return
      }
    } finally {
      cutting.value = false
    }

    if (!closedAtCutAt) {
      // Sem oferta de recuperação: recriar [cutAt, agora] sobreporia a entrada
      // que acabou de fechar e levaria 409 do anti-sobreposição.
      idlePhase.value = 'stopped'
      playStop()
      void notification.close(WARN_TAG)
      await notification.notify({
        tag: CUT_TAG,
        title: 'Timer parado por inatividade',
        body: 'Seu tempo foi encerrado agora. O período parado ficou registrado.',
        data: { kind: 'idle-cut' as const },
      })
      return
    }

    const record: IdleCutRecord = {
      entryId: entry.id,
      cutAt,
      at: Date.now(),
      description: entry.description ?? '',
      companyId: entry.companyId ?? null,
      activityId: entry.activityId ?? null,
      billable: entry.billable ?? false,
    }
    setLastCut(record)
    idlePhase.value = 'stopped'
    idleSince.value = null
    playStop()
    void notification.close(WARN_TAG)

    const hhmm = new Date(cutAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
    await notification.notify({
      tag: CUT_TAG,
      title: 'Timer parado por inatividade',
      body: `Seu tempo parou às ${hhmm}, no último momento em que você estava ativo.`,
      actions: [{ action: 'recover', title: 'Recuperar o tempo' }],
      data: { kind: 'idle-cut' as const },
    })
  }

  function evaluate() {
    now.value = Date.now()
    if (!enabled.value || !isRunning.value) {
      if (idlePhase.value === 'warning') exitWarning()
      return
    }

    const idleMs = now.value - effectiveActivityAt.value
    // Tela bloqueada é ausência inequívoca: vale o aviso na hora.
    const effective = screenLocked.value ? Math.max(idleMs, warnMs.value) : idleMs

    if (idlePhase.value === 'warning') {
      if (effective < warnMs.value) exitWarning()
      else if (effective >= warnMs.value + graceMs.value) void cut('auto')
      return
    }

    if (effective >= warnMs.value) void enterWarning()
  }

  // ─── Ações da pessoa ────────────────────────────────────────────────────────

  /** "Continuar contando": clicar já é atividade, então o ciclo reinicia inteiro. */
  function continueCounting() {
    markActivity()
    exitWarning()
  }

  /** "Parar agora": mesmo corte do automático, sem esperar a carência. */
  async function stopNow() {
    await cut('manual')
  }

  /**
   * Retoma o trabalho com os mesmos vínculos da entrada cortada. O registro do
   * corte é PRESERVADO: retomar e recuperar são decisões independentes, e quem
   * clica em "Retomar" primeiro ainda precisa poder recuperar o período (o
   * `recover` já corta o fim no início do timer novo para não sobrepor).
   */
  async function resume() {
    const record = lastCut.value
    if (!record) return
    markActivity()
    await start.mutateAsync({
      description: record.description || undefined,
      companyId: record.companyId,
      activityId: record.companyId ? record.activityId : null,
      billable: record.billable,
    })
    idlePhase.value = 'active'
  }

  /**
   * Recupera o tempo cortado como entrada manual. Se já existe um timer novo
   * rodando, a entrada termina no início dele: sobrepor faria o backend recusar
   * com 409 (regra anti-sobreposição do time tracking).
   */
  async function recover() {
    const record = lastCut.value
    if (!record) return
    markActivity()
    const endMs = running.value ? new Date(running.value.startedAt).getTime() : Date.now()
    const span = endMs - record.cutAt
    // Menos de um minuto não vira entrada; acima do teto, a recuperação de um
    // clique deixa de ser oferecida (ver RECOVER_MAX_MS).
    if (span < 60_000 || span > RECOVER_MAX_MS) {
      setLastCut(null)
      idlePhase.value = 'active'
      return
    }
    await createManual.mutateAsync({
      description: record.description || undefined,
      startedAt: new Date(record.cutAt).toISOString(),
      endedAt: new Date(endMs).toISOString(),
      companyId: record.companyId,
      activityId: record.companyId ? record.activityId : null,
      billable: record.billable,
    })
    setLastCut(null)
    idlePhase.value = 'active'
  }

  /** Some com o aviso pós-corte sem recuperar nada. */
  function dismissCut() {
    setLastCut(null)
    idlePhase.value = 'active'
    void notification.close(CUT_TAG)
  }

  /**
   * Minutos recuperáveis do último corte. Zero quando não há o que recuperar OU
   * quando o intervalo passou do teto — e aí a UI simplesmente não oferece o
   * botão, em vez de propor recriar horas que ninguém acompanhou.
   */
  const recoverableMin = computed(() => {
    const record = lastCut.value
    if (!record) return 0
    const endMs = running.value ? new Date(running.value.startedAt).getTime() : now.value
    const span = endMs - record.cutAt
    if (span > RECOVER_MAX_MS) return 0
    return Math.max(0, Math.round(span / 60_000))
  })

  // ─── Instalação (uma vez por aplicação) ─────────────────────────────────────

  if (!installed && typeof window !== 'undefined') {
    installed = true

    const timer = window.setInterval(evaluate, TICK_MS)

    // Atividade e bloqueio de tela reavaliam na hora: esperar o tique deixaria
    // o alerta de pé por segundos depois da pessoa já ter voltado.
    const stopWatch = watch([effectiveActivityAt, screenLocked, isRunning, enabled], evaluate)

    const offAction = notification.onAction((action, kind) => {
      // Ignora SÓ o teste: ele usa os mesmos botões, e sem esta guarda "Parar
      // agora" de um teste pararia o timer de verdade. A guarda é pela negativa
      // de propósito — um service worker ANTIGO, ainda instalado no navegador,
      // manda `unknown` no caminho de app fechado, e recusar o desconhecido
      // transformaria o clique real da pessoa em nada.
      if (kind === 'idle-test') return
      if (action === 'continue') continueCounting()
      else if (action === 'stop') void cut('manual').catch(() => {})
      else if (action === 'recover') void recover().catch(() => {})
    })

    onScopeDispose(() => {
      window.clearInterval(timer)
      stopWatch()
      offAction()
      installed = false
    })
  }

  return {
    phase: idlePhase,
    /** `full` = corta sozinho · `limited` = só avisa (ver idle-state). */
    protection: protectionLevel,
    idleSec,
    secondsToCut,
    lastCut,
    recoverableMin,
    cutting,
    continueCounting,
    stopNow,
    resume,
    recover,
    dismissCut,
  }
}
