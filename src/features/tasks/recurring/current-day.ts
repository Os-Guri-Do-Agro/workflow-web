/**
 * O dia de hoje, como valor REATIVO.
 *
 * Existe por um motivo específico: o board mostra uma ocorrência por regra e
 * escolhe qual pela data de hoje (`boardOccurrences`). Se esse "hoje" for lido
 * por uma função pura dentro de um `computed`, o Vue não tem dependência
 * nenhuma para invalidar quando o dia vira — e uma aba deixada aberta durante a
 * madrugada continua mostrando o card de ontem até alguém dar F5. Foi
 * exatamente o que aconteceu no primeiro corte da feature.
 *
 * Duas fontes de revalidação, porque uma só não cobre os dois jeitos de a
 * meia-noite passar:
 *
 * - **a aba voltando ao foco** (`onTabVisible`), que é o caso comum — o
 *   navegador estrangula temporizador de aba oculta, então voltar é o momento
 *   confiável de recalcular;
 * - **um timeout até a próxima meia-noite**, para a aba que ficou visível a
 *   noite toda (um quadro num telão não recebe foco nunca).
 *
 * O motor de datas (`recurrence-engine.ts`) continua puro e sem Vue: quem
 * precisa de reatividade importa daqui.
 */
import { readonly, ref } from 'vue'
import { today } from './recurrence-engine'
import { onTabVisible } from '@/utils/tab-visibility'

const dia = ref(today())

/**
 * Recalcula o dia corrente. Idempotente: só escreve quando a data mudou de
 * verdade, então chamar a cada foco de aba não invalida computed à toa.
 */
export function refreshCurrentDay(): void {
  const agora = today()
  if (agora !== dia.value) dia.value = agora
}

/** `'YYYY-MM-DD'` de hoje, revalidado sozinho na virada do dia. */
export const currentDay = readonly(dia)

function scheduleMidnight(): void {
  const agora = new Date()
  // 5 segundos depois da virada: temporizador que dispara no instante exato
  // corre o risco de ler o relógio ainda no dia anterior.
  const virada = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate() + 1,
    0,
    0,
    5,
  )
  window.setTimeout(() => {
    refreshCurrentDay()
    scheduleMidnight()
  }, Math.max(1000, virada.getTime() - agora.getTime()))
}

// Ambiente sem DOM (teste, SSR) fica só com o valor inicial e o refresh manual.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  onTabVisible(refreshCurrentDay)
  scheduleMidnight()
}
