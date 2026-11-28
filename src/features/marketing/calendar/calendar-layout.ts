import type { MarketingCalendarItem } from '../marketing-calendar'
import { daysBetween, spMinutes, spTime, spYmd } from './calendar-time'

/**
 * Como os itens das fontes (cards, campanhas, ativações) viram desenho na
 * grade. Funções puras: as três visões (Mês, Semana, Lista) usam as mesmas.
 *
 * - Item com `end` num dia depois do `start` é FAIXA: atravessa os dias da
 *   semana por cima, em pistas (lanes) para não encavalar.
 * - O resto é ponto no dia, ordenado pela hora (dia inteiro primeiro).
 */

/** Item da grade com o que a fonte de cards acrescenta (as outras não têm). */
export interface CalendarItemView extends MarketingCalendarItem {
  networks?: string[]
  assigneeName?: string | null
}

export interface PlacedItem {
  item: CalendarItemView
  /** Dia de Brasília do começo */
  day: string
  /** Dia de Brasília do fim (o próprio `day` quando não tem `end`) */
  endDay: string
  /** 'HH:mm' em Brasília; null no dia inteiro */
  time: string | null
  /** Minutos desde a meia-noite; -1 no dia inteiro */
  minutes: number
  multi: boolean
}

export function placeItem(item: CalendarItemView): PlacedItem {
  const day = spYmd(item.start)
  const endRaw = item.end ? spYmd(item.end) : day
  const endDay = endRaw < day ? day : endRaw
  const timed = !item.allDay && item.start.length > 10
  return {
    item,
    day,
    endDay,
    time: timed ? spTime(item.start) : null,
    minutes: timed ? spMinutes(item.start) : -1,
    multi: endDay > day,
  }
}

export function placeItems(items: CalendarItemView[]): PlacedItem[] {
  return items.map(placeItem)
}

const byTime = (a: PlacedItem, b: PlacedItem) =>
  a.minutes - b.minutes || a.item.title.localeCompare(b.item.title, 'pt-BR')

/** Itens de um dia só, por dia e em ordem de hora. */
export function singlesByDay(placed: PlacedItem[]): Map<string, PlacedItem[]> {
  const map = new Map<string, PlacedItem[]>()
  for (const p of placed) {
    if (p.multi) continue
    const list = map.get(p.day)
    if (list) list.push(p)
    else map.set(p.day, [p])
  }
  for (const list of map.values()) list.sort(byTime)
  return map
}

export interface BandSegment {
  placed: PlacedItem
  /** Coluna de começo (0 = segunda) */
  col: number
  span: number
  lane: number
  /** A faixa começou antes desta semana (sem a ponta arredondada) */
  continuesBefore: boolean
  /** A faixa segue na semana seguinte */
  continuesAfter: boolean
}

/** Faixas de vários dias numa semana (7 dias corridos começando em `days[0]`). */
export function weekBands(placed: PlacedItem[], days: string[]): { segments: BandSegment[]; lanes: number } {
  const first = days[0]!
  const last = days[days.length - 1]!
  const bands = placed
    .filter((p) => p.multi && p.endDay >= first && p.day <= last)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : daysBetween(b.day, b.endDay) - daysBetween(a.day, a.endDay)))
  const laneEnds: number[] = []
  const segments: BandSegment[] = []
  for (const p of bands) {
    const col = Math.max(0, daysBetween(first, p.day))
    const end = Math.min(days.length - 1, daysBetween(first, p.endDay))
    let lane = laneEnds.findIndex((e) => e < col)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else laneEnds[lane] = end
    segments.push({
      placed: p,
      col,
      span: end - col + 1,
      lane,
      continuesBefore: p.day < first,
      continuesAfter: p.endDay > last,
    })
  }
  return { segments, lanes: laneEnds.length }
}

export interface TimedBlock {
  placed: PlacedItem
  /** Minutos desde a meia-noite */
  start: number
  /** Coluna dentro do dia quando há itens na mesma hora */
  col: number
  cols: number
}

/**
 * Itens com hora de um dia na visão Semana. Card é um instante, não uma
 * duração: cada um ocupa `slot` minutos na grade, e os que se encostam dividem
 * a largura da coluna.
 */
export function timedBlocks(list: PlacedItem[], slot = 50): TimedBlock[] {
  const timed = list.filter((p) => p.minutes >= 0).sort(byTime)
  const blocks: TimedBlock[] = []
  let cluster: TimedBlock[] = []
  let clusterEnd = -1
  const flush = () => {
    const cols = cluster.reduce((max, b) => Math.max(max, b.col + 1), 0)
    for (const b of cluster) b.cols = cols
    blocks.push(...cluster)
    cluster = []
  }
  for (const p of timed) {
    if (cluster.length && p.minutes >= clusterEnd) flush()
    const used = new Set(cluster.filter((b) => b.start + slot > p.minutes).map((b) => b.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ placed: p, start: p.minutes, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, p.minutes + slot)
  }
  if (cluster.length) flush()
  return blocks
}

/** Itens que tocam um dia (para a agenda): de um dia só e faixas que passam por ele. */
export function itemsTouching(placed: PlacedItem[], day: string): PlacedItem[] {
  return placed.filter((p) => p.day <= day && p.endDay >= day).sort(byTime)
}
