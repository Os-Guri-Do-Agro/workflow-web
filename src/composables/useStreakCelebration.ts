import { readonly, reactive, watch } from 'vue'
import type { StreakMe } from '@/service/streak/streak-service'
import { NEVO_MILESTONES, type NevoMilestone } from '@/components/nevo/nevo-assets'
import { useStreak } from '@/composables/useStreak'
import { getUserToken } from '@/utils/authContent'
import { safeStorage } from '@/utils/safe-storage'

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
 */

export type StreakCelebrationKind = 'secured' | 'perfect' | 'milestone'

export interface StreakCelebrationState {
  open: boolean
  kind: StreakCelebrationKind
  milestone?: NevoMilestone
  /** Sequência no momento da comemoração (para o texto e o número grande). */
  current: number
  /** Muda a cada disparo: o overlay reinicia timer e animação quando troca. */
  seq: number
}

const state = reactive<StreakCelebrationState>({
  open: false,
  kind: 'secured',
  milestone: undefined,
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

function open(kind: StreakCelebrationKind, current: number, milestone?: NevoMilestone) {
  state.kind = kind
  state.current = current
  state.milestone = milestone
  state.seq++
  state.open = true
}

/** Decide se o resumo novo merece comemoração. Idempotente pelo localStorage. */
function evaluate(s: StreakMe) {
  // Sem pessoa identificada não dá para prometer "uma vez por pessoa": melhor
  // não comemorar do que gravar a festa numa chave que ninguém reconhece.
  const userId = getUserToken()?.sub
  if (!userId) {
    lastSeen = null
    return
  }
  // Resumo anterior de OUTRA pessoa não serve de base para transição.
  const prev = lastSeen?.userId === userId ? lastSeen : null
  lastSeen = { userId, date: s.date, secured: s.securedToday, perfect: s.perfectToday }

  // Marco: não depende de transição, só de ainda não ter sido comemorado hoje.
  if (s.securedToday) {
    const milestone = NEVO_MILESTONES.find((m) => m.days === s.current)
    if (milestone && !safeStorage.getItem(milestoneKey(userId, milestone.days, s.date))) {
      safeStorage.setItem(milestoneKey(userId, milestone.days, s.date), '1')
      // O marco já é a festa do dia: não emenda um "Dia garantido!" depois.
      safeStorage.setItem(celebratedKey(userId, s.date), s.perfectToday ? 'perfect' : 'secured')
      open('milestone', s.current, milestone)
      return
    }
  }

  // Sem resumo anterior do MESMO dia (e da mesma pessoa) não há transição observada.
  if (!prev || prev.date !== s.date) return

  const done = safeStorage.getItem(celebratedKey(userId, s.date))
  if (s.perfectToday && !prev.perfect && done !== 'perfect') {
    safeStorage.setItem(celebratedKey(userId, s.date), 'perfect')
    open('perfect', s.current)
    return
  }
  if (s.securedToday && !prev.secured && !done) {
    safeStorage.setItem(celebratedKey(userId, s.date), 'secured')
    open('secured', s.current)
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
  }

  return {
    state: readonly(state),
    close: closeStreakCelebration,
    preview: previewStreakCelebration,
  }
}
