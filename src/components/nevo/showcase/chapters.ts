/**
 * Capítulos da vitrine 3D (spec sequencia-diaria-nevo, T8).
 *
 * Arquivo SEM dependência de three.js nem de gsap de propósito: o overlay
 * (`NevoShowcase.vue`) precisa dos títulos para desenhar a legenda antes da
 * cena carregar, e o indicador de capítulos no movimento reduzido. Se isto
 * morasse em `timeline.ts`, o gsap e o three entrariam no chunk do componente
 * e todo mundo baixaria a cena só para ler cinco títulos.
 *
 * Os tempos são em segundos na timeline de 22 s que roda em loop. `poster` é o
 * instante, relativo ao início do capítulo, em que a cena está "assentada"
 * (câmera parada, elementos já em cena): é o quadro que aparece quando a vitrine
 * está parada e alguém pula para aquele capítulo.
 */
import type { StreakMe, StreakTeam } from '@/service/streak/streak-service'

export interface ShowcaseChapter {
  id: 'inicio' | 'sequencia' | 'missoes' | 'time' | 'todo-dia'
  title: string
  subtitle: string
  start: number
  end: number
  poster: number
  /**
   * Onde a legenda fica no palco 16:9 ESTREITO (de 561 a 760px, o tamanho da
   * vitrine na coluna da home). O enquadramento da timeline foi pensado para o
   * palco largo; no estreito a legenda ocupa metade da largura e, em cima,
   * cobria o assunto dos capítulos 2 a 5 (o número no celular, a chama dos
   * marcos, o confete). Embaixo à esquerda só tem o teclado e a base do
   * notebook. No capítulo 1 embaixo à esquerda é o Nevo, então ela fica em cima.
   */
  captionNarrow: 'top' | 'bottom'
}

export const SHOWCASE_DURATION = 22

export const SHOWCASE_CHAPTERS: readonly ShowcaseChapter[] = [
  {
    id: 'inicio',
    title: 'Seu dia começa aqui',
    subtitle: 'Tarefas, tempo e time no mesmo lugar.',
    start: 0,
    end: 4.4,
    poster: 1.4,
    captionNarrow: 'top',
  },
  {
    id: 'sequencia',
    title: 'Sua sequência',
    subtitle: 'Cada dia garantido acende mais uma chama.',
    start: 4.4,
    end: 8.8,
    poster: 3.9,
    captionNarrow: 'bottom',
  },
  {
    id: 'missoes',
    title: 'Missões do dia',
    subtitle: 'Foque 30 minutos ou conclua 1 tarefa para garantir o dia.',
    start: 8.8,
    end: 13.2,
    poster: 4.1,
    captionNarrow: 'bottom',
  },
  {
    id: 'time',
    title: 'O time junto',
    subtitle: 'Veja a chama de cada colega e comemore juntos.',
    start: 13.2,
    end: 17.6,
    poster: 3.6,
    captionNarrow: 'bottom',
  },
  {
    id: 'todo-dia',
    title: 'Todo dia conta',
    subtitle: 'Volte amanhã e o Nevo continua a sequência com você.',
    start: 17.6,
    end: 22,
    poster: 1.5,
    captionNarrow: 'bottom',
  },
]

/** Índice do capítulo que contém o instante `t` (segundos dentro do loop). */
export function chapterAt(t: number): number {
  const i = SHOWCASE_CHAPTERS.findIndex((c) => t >= c.start && t < c.end)
  return i === -1 ? SHOWCASE_CHAPTERS.length - 1 : i
}

/**
 * Subtítulo com os dados reais quando existem. A vitrine é um vídeo de
 * produto, mas a legenda falando do número da própria pessoa e do time dela é
 * o que faz parecer "o meu Nevo" e não um anúncio genérico. Sem dados (API
 * fora, time vazio), fica a frase padrão do capítulo.
 *
 * Frases curtas de propósito (cabem numa linha a 400px): no palco largo a
 * legenda fica no canto de cima e, com duas linhas, cobriria as chamas do
 * capítulo 4. No palco estreito ela desce (ver `captionNarrow`).
 */
export function chapterSubtitle(
  chapter: ShowcaseChapter,
  streak: StreakMe | null | undefined,
  team: StreakTeam | null | undefined,
): string {
  if (chapter.id === 'sequencia' && streak) {
    if (streak.current <= 0) return 'Garanta o dia hoje e acenda a primeira chama.'
    const seguidos = streak.current === 1 ? '1 dia garantido' : `${streak.current} dias seguidos`
    return `${seguidos}. Cada dia acende mais uma chama.`
  }
  if (chapter.id === 'time' && team && team.summary.total > 1) {
    const { securedToday, total } = team.summary
    if (securedToday <= 0) return 'Ninguém garantiu o dia ainda. Comece o ritmo!'
    const verbo = securedToday === 1 ? 'já garantiu' : 'já garantiram'
    return `${securedToday} de ${total} pessoas ${verbo} o dia hoje.`
  }
  return chapter.subtitle
}
