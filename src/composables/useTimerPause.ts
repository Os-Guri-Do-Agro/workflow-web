import { computed, ref } from 'vue'
import type { TimeEntry } from '@/service/time/time-service'

/**
 * Pausa do cronômetro (spec banco-de-horas, fase A).
 *
 * Pausar **encerra** a entrada e guarda o contexto do que estava sendo feito;
 * retomar abre uma entrada nova com os mesmos vínculos. Foi a escolha do dono
 * do produto entre as duas modelagens possíveis, e ela tem uma vantagem
 * técnica grande: `durationSec` continua significando exatamente o que já
 * significava, então nada muda no heartbeat, na arbitragem entre dispositivos
 * nem na reconciliação de entrada abandonada.
 *
 * O ganho que a pessoa queria continua inteiro: voltar do almoço é um clique em
 * Retomar, sem procurar a entrada certa na lista do dia.
 *
 * Vive em `localStorage` porque a volta do almoço quase sempre acontece depois
 * de um refresh, de fechar o navegador ou em outra aba.
 */

const KEY = 'nevo.timer.paused'

/**
 * Acima disto, a pausa não é mais oferecida.
 *
 * Retomar de ontem seria pior que não oferecer nada: criaria uma entrada nova
 * com o contexto de um dia que já foi fechado, e a pessoa só perceberia no
 * relatório. Doze horas cobrem qualquer almoço, reunião ou fim de expediente
 * interrompido, e não cobrem "voltei no dia seguinte".
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export interface PausedWork {
  description: string
  companyId: string | null
  activityId: string | null
  activityTitle: string | null
  billable: boolean
  /** Quando pausou (ms). */
  at: number
}

function read(): PausedWork | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PausedWork
    if (typeof parsed?.at !== 'number') return null
    if (Date.now() - parsed.at > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

const paused = ref<PausedWork | null>(read())

let listening = false

export function useTimerPause() {
  // Outra aba pausou ou retomou: o botão desta precisa acompanhar, senão duas
  // abas oferecem ações contraditórias sobre o mesmo cronômetro.
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) paused.value = read()
    })
    // A validade também precisa correr com a aba ABERTA. Sem este tique, quem
    // deixa o Nevo aberto a noite toda encontraria "Retomar" na manhã seguinte
    // e recriaria uma entrada com o contexto de ontem — exatamente o que o
    // limite de 12h existe para impedir.
    window.setInterval(() => {
      if (paused.value && Date.now() - paused.value.at > MAX_AGE_MS) clear()
    }, 60_000)
  }

  /** Há trabalho pausado aguardando retomada? */
  const isPaused = computed(
    () => paused.value !== null && Date.now() - paused.value.at <= MAX_AGE_MS,
  )

  /** Rótulo do que está pausado, para o botão dizer o que vai retomar. */
  const pausedLabel = computed(
    () => paused.value?.activityTitle || paused.value?.description || 'trabalho anterior',
  )

  /**
   * Guarda o contexto da entrada que acabou de ser encerrada.
   *
   * `overrides` existe porque `entry` é o que o SERVIDOR devolveu, e a edição
   * ao vivo tem autosave debounced: quem troca a tarefa e pausa em seguida
   * teria o contexto salvo com a tarefa antiga, e o Retomar traria de volta a
   * coisa errada. O formulário da tela é a verdade mais recente.
   */
  function capture(entry: TimeEntry, overrides?: Partial<PausedWork>): void {
    const next: PausedWork = {
      description: entry.description ?? '',
      companyId: entry.companyId ?? null,
      activityId: entry.activityId ?? null,
      activityTitle: entry.activity?.title ?? null,
      billable: entry.billable ?? false,
      at: Date.now(),
      ...overrides,
    }
    paused.value = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Sem persistência a pausa vale só nesta aba — degradação aceitável.
    }
  }

  function clear(): void {
    paused.value = null
    try {
      localStorage.removeItem(KEY)
    } catch {
      // idem
    }
  }

  /** O que o start precisa receber para retomar exatamente o mesmo trabalho. */
  function resumePayload() {
    const p = paused.value
    // Revalida na hora do uso: entre o desenho do botão e o clique pode ter
    // passado o prazo (aba dormindo com o intervalo estrangulado).
    if (!p || Date.now() - p.at > MAX_AGE_MS) return null
    return {
      description: p.description || undefined,
      companyId: p.companyId,
      activityId: p.companyId ? p.activityId : null,
      billable: p.billable,
    }
  }

  return { paused, isPaused, pausedLabel, capture, clear, resumePayload }
}
