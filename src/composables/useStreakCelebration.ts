import { readonly, reactive, watch } from 'vue'
import type { StreakMe } from '@/service/streak/streak-service'
import { NEVO_MILESTONES, localDayKey, type NevoMilestone } from '@/components/nevo/nevo-assets'
import { useStreak } from '@/composables/useStreak'
import { getUserToken } from '@/utils/authContent'
import { safeStorage } from '@/utils/safe-storage'
import { onTabVisible } from '@/utils/tab-visibility'

/**
 * Comemoração da sequência (spec sequencia-diaria-nevo): "Dia garantido!",
 * "Dia perfeito!" e marcos de 7/14/30/60/100 dias.
 *
 * O estado é de MÓDULO (singleton) porque quem mostra o overlay
 * (`StreakCelebration`, montado uma vez no AppShell) não é quem percebe a
 * mudança: o dado chega pelo Vue Query, disparado por socket ou polling, e
 * qualquer tela pode estar aberta.
 *
 * Regras de disparo:
 * - `secured`/`perfect`: só na TRANSIÇÃO observada nesta sessão (false para
 *   true no mesmo dia). Abrir o app com o dia já garantido não comemora de novo.
 * - `milestone`: quando `current` é exatamente um marco e o dia está garantido,
 *   mesmo sem transição (chegar aos 7 dias pelo celular e abrir o computador
 *   ainda merece a festa uma vez).
 * - Nunca repete no mesmo dia para a mesma PESSOA neste navegador:
 *   `nevo.celebrated.<userId>.<data>` guarda o que já foi comemorado
 *   ('secured' ou 'perfect') e `nevo.milestone.<userId>.<dias>.<data>` guarda
 *   o marco. O `userId` é o `sub` do JWT: a sequência é da pessoa (D6), e num
 *   computador compartilhado a festa de um não pode "gastar" a do outro.
 *   Chaves no formato antigo, sem o id, são ignoradas (no pior caso a festa
 *   daquele dia aparece mais uma vez).
 * - Prioridade quando tudo acontece junto: marco > perfeito > garantido.
 * - Só abre quando alguém pode VER: com a aba oculta (dia garantido no celular,
 *   timer cortado pela ociosidade com a pessoa longe) ou com um dialog modal na
 *   frente, a festa fica PENDENTE, sem gravar a chave, e abre quando a aba volta
 *   ou o dialog fecha. A chave é gravada na hora em que o overlay aparece: assim
 *   a aba de fundo não "gasta" a festa, e entre duas abas quem mostra primeiro
 *   é quem está à vista (a outra relê a chave e desiste).
 */

export type StreakCelebrationKind = 'secured' | 'perfect' | 'milestone'

export interface StreakCelebrationState {
  open: boolean
  kind: StreakCelebrationKind
  milestone?: NevoMilestone
  /**
   * Marco que a pessoa já tinha conquistado numa sequência anterior (o recorde
   * passa do marco): a festa diz "De volta ao marco", coerente com a trilha de
   * marcos, que mostra a conquista pelo recorde.
   */
  repeat: boolean
  /** Sequência no momento da comemoração (para o texto e o número grande). */
  current: number
  /** Muda a cada disparo: o overlay reinicia timer e animação quando troca. */
  seq: number
}

const state = reactive<StreakCelebrationState>({
  open: false,
  kind: 'secured',
  milestone: undefined,
  repeat: false,
  current: 0,
  seq: 0,
})

/**
 * Último resumo visto nesta sessão (compartilhado entre todos os observadores).
 * Guarda de QUEM era: trocar de conta na mesma aba (logout e login sem F5) não
 * pode transformar o "pendente" de uma pessoa na "transição" da outra.
 */
let lastSeen: { userId: string; date: string; secured: boolean; perfect: boolean } | null = null

const celebratedKey = (userId: string, date: string) => `nevo.celebrated.${userId}.${date}`
const milestoneKey = (userId: string, days: number, date: string) =>
  `nevo.milestone.${userId}.${days}.${date}`

function open(
  kind: StreakCelebrationKind,
  current: number,
  milestone?: NevoMilestone,
  repeat = false,
) {
  state.kind = kind
  state.current = current
  state.milestone = milestone
  state.repeat = repeat
  state.seq++
  state.open = true
}

// ─── Festa pendente (decidida, ainda não vista) ───────────────────────────────

interface PendingCelebration {
  userId: string
  date: string
  kind: StreakCelebrationKind
  current: number
  milestone?: NevoMilestone
  repeat: boolean
  /** Dia perfeito no último resumo visto (vai para a chave do marco). */
  perfect: boolean
}

let pending: PendingCelebration | null = null

const PRIORITY: Record<StreakCelebrationKind, number> = { secured: 1, perfect: 2, milestone: 3 }

/**
 * Tem alguém olhando? Aba em primeiro plano e nenhum dialog modal na frente
 * (o overlay fica em z 4000, ABAIXO dos AppDialog em 5000: aberto por baixo de
 * um dialog, ele sumiria em 7 s sem ninguém ver e ainda puxaria o foco).
 */
function canShowNow(): boolean {
  if (typeof document === 'undefined' || document.hidden) return false
  // Todos, e não só o primeiro: com a festa já aberta, o cartão dela também é
  // um dialog modal e pode vir antes do AppDialog na ordem do DOM.
  const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
  return ![...modals].some((el) => !el.closest('.ncel'))
}

/** Guarda a festa decidida; uma maior (marco > perfeito > garantido) substitui a menor. */
function queue(next: PendingCelebration) {
  if (pending && (pending.userId !== next.userId || pending.date !== next.date)) pending = null
  if (!pending || PRIORITY[next.kind] >= PRIORITY[pending.kind]) pending = next
  tryShow()
}

/**
 * Abre a festa pendente se alguém pode vê-la. Relê a chave antes de gravar:
 * outra aba (a que estava à vista) pode ter comemorado primeiro.
 */
function tryShow() {
  const p = pending
  if (!p) {
    stopWatchingDialogs()
    return
  }
  // Virou o dia ou trocou a pessoa: a festa de ontem, ou de outro, não vale mais.
  if (p.date !== localDayKey() || getUserToken()?.sub !== p.userId) {
    pending = null
    stopWatchingDialogs()
    return
  }
  if (!canShowNow()) {
    // Dialog modal na frente: tenta de novo quando o body mudar (o dialog sai).
    // Aba oculta: quem chama de novo é o `onTabVisible` do observador.
    if (!document.hidden) watchDialogs()
    return
  }
  pending = null
  stopWatchingDialogs()

  if (p.kind === 'milestone' && p.milestone) {
    if (safeStorage.getItem(milestoneKey(p.userId, p.milestone.days, p.date))) return
    safeStorage.setItem(milestoneKey(p.userId, p.milestone.days, p.date), '1')
    // O marco já é a festa do dia: não emenda um "Dia garantido!" depois.
    safeStorage.setItem(celebratedKey(p.userId, p.date), p.perfect ? 'perfect' : 'secured')
    open('milestone', p.current, p.milestone, p.repeat)
    return
  }
  const done = safeStorage.getItem(celebratedKey(p.userId, p.date))
  if (p.kind === 'perfect' ? done === 'perfect' : !!done) return
  safeStorage.setItem(celebratedKey(p.userId, p.date), p.kind)
  open(p.kind, p.current)
}

// Dialog modal por cima: AppDialog e os dialogs do reka entram e saem como
// filhos diretos do <body> (Teleport/portal). Observa só enquanto há festa
// esperando por um deles.
//
// `subtree`: nem todo dialog modal é filho direto do <body>. A ajuda e o drawer
// do Roadmap vivem dentro da view, sem Teleport; olhando só os filhos do body,
// fechar um deles não disparava nada e a festa ficava presa até um foco na
// janela. Com a árvore toda as mutações são muitas: a checagem vai no máximo
// uma vez por quadro, e só enquanto há festa esperando.
let dialogObserver: MutationObserver | null = null
let retryFrame: number | null = null

function scheduleRetry() {
  if (retryFrame !== null) return
  retryFrame = requestAnimationFrame(() => {
    retryFrame = null
    tryShow()
  })
}

function watchDialogs() {
  if (dialogObserver || typeof MutationObserver === 'undefined') return
  dialogObserver = new MutationObserver(scheduleRetry)
  dialogObserver.observe(document.body, { childList: true, subtree: true })
}

function stopWatchingDialogs() {
  dialogObserver?.disconnect()
  dialogObserver = null
  if (retryFrame !== null) cancelAnimationFrame(retryFrame)
  retryFrame = null
}

/**
 * Ajusta a festa pendente ao resumo novo: some se o dia não está mais garantido
 * ou se o marco dela não é mais a sequência atual; "Dia perfeito!" vira "Dia
 * garantido!" se o dia deixou de ser perfeito (e ainda não foi comemorado).
 */
function reconcilePending(s: StreakMe) {
  const p = pending
  if (!p) return
  const stale =
    !s.securedToday ||
    (p.kind === 'milestone' && p.milestone?.days !== s.current)
  if (stale) {
    pending = null
    stopWatchingDialogs()
    return
  }
  if (p.kind === 'perfect' && !s.perfectToday) {
    if (safeStorage.getItem(celebratedKey(p.userId, p.date))) {
      pending = null
      stopWatchingDialogs()
      return
    }
    p.kind = 'secured'
  }
  p.current = s.current
}

/** Decide se o resumo novo merece comemoração. Idempotente pelo localStorage. */
function evaluate(s: StreakMe) {
  // Sem pessoa identificada não dá para prometer "uma vez por pessoa": melhor
  // não comemorar do que gravar a festa numa chave que ninguém reconhece.
  const userId = getUserToken()?.sub
  if (!userId) {
    lastSeen = null
    pending = null
    return
  }
  // Resumo anterior de OUTRA pessoa não serve de base para transição.
  const prev = lastSeen?.userId === userId ? lastSeen : null
  lastSeen = { userId, date: s.date, secured: s.securedToday, perfect: s.perfectToday }
  const base = { userId, date: s.date, current: s.current, repeat: false, perfect: s.perfectToday }

  // Festa decidida e ainda esperando (aba oculta, dialog na frente) com um dado
  // que já não vale: o dia deixou de estar garantido (tarefa reaberta, tempo
  // excluído) ou o marco mudou. Abrir depois gravaria a chave do dia e "gastaria"
  // a festa com a tela dizendo o contrário; a garantia de verdade, mais tarde,
  // não comemoraria mais.
  if (pending?.userId === userId && pending.date === s.date) reconcilePending(s)

  // Marco: não depende de transição, só de ainda não ter sido comemorado hoje.
  if (s.securedToday) {
    const milestone = NEVO_MILESTONES.find((m) => m.days === s.current)
    if (milestone && !safeStorage.getItem(milestoneKey(userId, milestone.days, s.date))) {
      // Já tinha sido conquistado antes: recorde acima do marco, ou a sequência
      // que quebrou chegou nele (empate com o recorde: fez 14, quebrou, fez 14
      // de novo; `best > current` sozinho chamava isso de primeira vez).
      const repeat = s.best > s.current || s.previous >= milestone.days
      queue({ ...base, kind: 'milestone', milestone, repeat })
      return
    }
  }

  // Festa já decidida e ainda esperando: só atualiza o que ela vai gravar.
  if (pending?.userId === userId && pending.date === s.date) pending.perfect = s.perfectToday

  // Sem resumo anterior do MESMO dia (e da mesma pessoa) não há transição observada.
  if (!prev || prev.date !== s.date) return

  const done = safeStorage.getItem(celebratedKey(userId, s.date))
  if (s.perfectToday && !prev.perfect && done !== 'perfect') {
    queue({ ...base, kind: 'perfect' })
    return
  }
  if (s.securedToday && !prev.secured && !done) {
    queue({ ...base, kind: 'secured' })
  }
}

/** Fecha o overlay (botão Continuar, Esc, clique fora, tempo esgotado). */
export function closeStreakCelebration() {
  state.open = false
}

/**
 * Abre a comemoração sem passar pelas regras (pré-visualização, QA visual).
 * Não grava no localStorage.
 */
export function previewStreakCelebration(
  kind: StreakCelebrationKind,
  current: number,
  milestoneDays?: number,
) {
  const milestone =
    kind === 'milestone'
      ? (NEVO_MILESTONES.find((m) => m.days === milestoneDays) ?? NEVO_MILESTONES[0])
      : undefined
  open(kind, current, milestone)
}

/** O aviso de "a aba voltou" é ligado uma vez por app, não por observador. */
let visibleBound = false

/**
 * Estado da comemoração + observador da sequência.
 *
 * Pode ser chamado por mais de um componente: o `lastSeen` é compartilhado e a
 * checagem no localStorage acontece antes de abrir, então dois observadores
 * nunca disparam duas vezes a mesma festa. Passe `{ watch: false }` para só
 * ler o estado (sem observar a API).
 */
export function useStreakCelebration(opts: { watch?: boolean } = {}) {
  if (opts.watch !== false) {
    const { streak, available } = useStreak()
    watch(
      streak,
      (s) => {
        if (!s || !available.value) return
        evaluate(s)
      },
      { immediate: true },
    )
    // A aba voltou: a festa que esperava pode abrir agora.
    if (!visibleBound) {
      visibleBound = true
      onTabVisible(tryShow)
    }
  }

  return {
    state: readonly(state),
    close: closeStreakCelebration,
    preview: previewStreakCelebration,
  }
}
