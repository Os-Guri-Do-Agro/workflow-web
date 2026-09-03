/**
 * Motor de recorrência — funções puras sobre datas `'YYYY-MM-DD'`.
 *
 * Toda aritmética passa por `Date.UTC`, nunca por `new Date('2026-09-01')`
 * interpretado em fuso local: no Brasil (UTC-3) o construtor local faz o dia
 * RECUAR, e uma regra "toda segunda" começaria a cuspir domingos. É a mesma
 * convenção de `utils/date.ts`, que grava todo prazo ao meio-dia UTC.
 *
 * Nada aqui conhece Vue, store ou API: dá para testar cada função com string
 * de entrada e string de saída.
 */
import type { MonthDay, RecurrenceRule } from './recurrence-types'

/** Nomes na ordem de `Date.getUTCDay()`: índice 0 = domingo. */
export const WEEKDAYS = [
  { value: 0, short: 'D', label: 'Domingo', abbr: 'dom' },
  { value: 1, short: 'S', label: 'Segunda', abbr: 'seg' },
  { value: 2, short: 'T', label: 'Terça', abbr: 'ter' },
  { value: 3, short: 'Q', label: 'Quarta', abbr: 'qua' },
  { value: 4, short: 'Q', label: 'Quinta', abbr: 'qui' },
  { value: 5, short: 'S', label: 'Sexta', abbr: 'sex' },
  { value: 6, short: 'S', label: 'Sábado', abbr: 'sáb' },
] as const

const MS_DAY = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/** `'YYYY-MM-DD'` para o timestamp do meio-dia UTC daquele dia. */
export function dateOnlyToUtc(dateOnly: string): number {
  return Date.parse(`${dateOnly}T12:00:00.000Z`)
}

/** Timestamp para `'YYYY-MM-DD'`, lendo os campos UTC. */
export function utcToDateOnly(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDays(dateOnly: string, days: number): string {
  return utcToDateOnly(dateOnlyToUtc(dateOnly) + days * MS_DAY)
}

/** Dia da semana UTC (0 = domingo), imune a fuso. */
export function weekdayOf(dateOnly: string): number {
  return new Date(dateOnlyToUtc(dateOnly)).getUTCDay()
}

export function isWeekend(dateOnly: string): boolean {
  const d = weekdayOf(dateOnly)
  return d === 0 || d === 6
}

/** Diferença em dias-calendário entre duas datas date-only. */
export function diffDays(from: string, to: string): number {
  return Math.round((dateOnlyToUtc(to) - dateOnlyToUtc(from)) / MS_DAY)
}

/** `'YYYY-MM'` da data. É a chave que decide em qual mês a tarefa cai. */
export function monthKeyOf(dateOnly: string): string {
  return dateOnly.slice(0, 7)
}

export function daysInMonth(monthKey: string): number {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Primeiro e último dia do mês, como date-only. */
export function monthRange(monthKey: string): { start: string; end: string } {
  return { start: `${monthKey}-01`, end: `${monthKey}-${pad(daysInMonth(monthKey))}` }
}

/** Soma meses à chave `'YYYY-MM'` (aceita negativo). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const total = year * 12 + (month - 1) + delta
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/**
 * Reposiciona a data no mês informado mantendo o dia.
 *
 * Dia que não existe no destino (31 em fevereiro) recorta para o último dia,
 * mesma regra do `dateOnlyInMonth` de `utils/date.ts`. Isto é o que faz "mudei
 * o prazo para novembro" bastar para a tarefa mudar de mês.
 */
export function dateInMonth(dateOnly: string, monthKey: string): string {
  const day = Number(dateOnly.slice(8, 10))
  return `${monthKey}-${pad(Math.min(day, daysInMonth(monthKey)))}`
}

export function monthLabel(monthKey: string, opts?: { short?: boolean }): string {
  const label = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: opts?.short ? 'short' : 'long',
    year: 'numeric',
  }).format(new Date(dateOnlyToUtc(`${monthKey}-01`)))
  // O Intl devolve "setembro de 2026" / "set. de 2026"; o "de" polui chip e título.
  return label.replace(' de ', ' ').replace('. ', ' ')
}

export function dayLabel(dateOnly: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).format(new Date(dateOnlyToUtc(dateOnly)))
}

/** Hoje em `'YYYY-MM-DD'`, pelo calendário LOCAL de quem está olhando a tela. */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Resolve o dia do mês da regra dentro de um mês concreto. */
function resolveMonthDay(monthKey: string, monthDay: MonthDay): string {
  const last = daysInMonth(monthKey)
  const day = monthDay === 'last' ? last : Math.min(monthDay, last)
  return `${monthKey}-${pad(day)}`
}

/** Quantos meses separam duas chaves `'YYYY-MM'`. */
function monthDistance(from: string, to: string): number {
  const fy = Number(from.slice(0, 4))
  const fm = Number(from.slice(5, 7))
  const ty = Number(to.slice(0, 4))
  const tm = Number(to.slice(5, 7))
  return (ty - fy) * 12 + (tm - fm)
}

/** Teto de segurança: regra diária num intervalo largo não pode travar a tela. */
const MAX_OCCURRENCES = 400

/**
 * Todas as datas em que a regra acontece dentro de `[from, to]`.
 *
 * Devolve em ordem crescente, sem repetição. `'once'` devolve no máximo um
 * elemento — é o que permite tarefa avulsa e recorrente compartilharem toda a
 * tela sem `if` espalhado.
 */
export function expandRule(rule: RecurrenceRule, from: string, to: string): string[] {
  if (diffDays(from, to) < 0) return []

  const floor = rule.startDate > from ? rule.startDate : from
  const ceil = rule.endDate && rule.endDate < to ? rule.endDate : to
  if (diffDays(floor, ceil) < 0) return []

  const out: string[] = []

  if (rule.frequency === 'once') {
    if (rule.startDate >= from && rule.startDate <= to) out.push(rule.startDate)
    return out
  }

  const interval = Math.max(1, Math.trunc(rule.interval) || 1)

  if (rule.frequency === 'daily') {
    // Anda de `interval` em `interval` a partir de startDate (não do `floor`):
    // "a cada 3 dias" tem que manter a mesma cadência quando a pessoa navega
    // para outro mês, senão a régua muda conforme a janela que ela abriu.
    const offset = diffDays(rule.startDate, floor)
    const firstStep = Math.max(0, Math.ceil(offset / interval))
    for (let step = firstStep; out.length < MAX_OCCURRENCES; step++) {
      const date = addDays(rule.startDate, step * interval)
      if (date > ceil) break
      if (rule.skipWeekends && isWeekend(date)) continue
      out.push(date)
    }
    return out
  }

  if (rule.frequency === 'weekly') {
    const days = rule.weekdays.length ? rule.weekdays : [weekdayOf(rule.startDate)]
    const wanted = new Set(days)
    // A semana de referência é a que contém `startDate`; `interval` conta
    // semanas inteiras a partir dela, não dias corridos.
    const anchor = addDays(rule.startDate, -weekdayOf(rule.startDate))
    for (let date = floor; date <= ceil && out.length < MAX_OCCURRENCES; date = addDays(date, 1)) {
      if (!wanted.has(weekdayOf(date))) continue
      const weekIndex = Math.floor(diffDays(anchor, date) / 7)
      if (weekIndex < 0 || weekIndex % interval !== 0) continue
      if (date < rule.startDate) continue
      out.push(date)
    }
    return out
  }

  // Mensal: um dia por mês, respeitando o intervalo em meses.
  const startMonth = monthKeyOf(rule.startDate)
  let cursor = monthKeyOf(floor)
  const lastMonth = monthKeyOf(ceil)
  while (monthDistance(cursor, lastMonth) >= 0 && out.length < MAX_OCCURRENCES) {
    const distance = monthDistance(startMonth, cursor)
    if (distance >= 0 && distance % interval === 0) {
      const date = resolveMonthDay(cursor, rule.monthDay)
      if (date >= floor && date <= ceil && date >= rule.startDate) out.push(date)
    }
    cursor = shiftMonthKey(cursor, 1)
  }
  return out
}

/** As próximas `count` datas da regra a partir de `from` (inclusive). */
export function nextOccurrences(rule: RecurrenceRule, count: number, from = today()): string[] {
  // Janela de 2 anos: cobre até "a cada 12 meses" sem varrer o calendário todo.
  const horizon = addDays(from, 730)
  return expandRule(rule, from, horizon).slice(0, count)
}

/** Lista de dias da semana em texto: `[1,3,5]` vira "seg, qua e sex". */
function weekdayNames(days: number[]): string {
  const names = [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS.find((w) => w.value === d)?.abbr ?? '')
    .filter(Boolean)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/**
 * A regra em uma frase pt-BR, do jeito que a pessoa falaria.
 *
 * É a legenda que aparece no card e no formulário. Uma regra que a pessoa não
 * consegue ler em voz alta é uma regra que ela não confia — e tarefa que se
 * cria sozinha precisa de confiança para valer a pena.
 */
export function describeRule(rule: RecurrenceRule): string {
  const interval = Math.max(1, Math.trunc(rule.interval) || 1)

  if (rule.frequency === 'once') return `Uma vez, em ${dayLabel(rule.startDate)}`

  let base: string
  if (rule.frequency === 'daily') {
    const dia = rule.skipWeekends ? 'dia útil' : 'dia'
    base = interval === 1 ? `Todo ${dia}` : `A cada ${interval} ${dia}s`
  } else if (rule.frequency === 'weekly') {
    const days = rule.weekdays.length ? rule.weekdays : [weekdayOf(rule.startDate)]
    const nomes = weekdayNames(days)
    base = interval === 1 ? `Toda semana · ${nomes}` : `A cada ${interval} semanas · ${nomes}`
  } else {
    const dia = rule.monthDay === 'last' ? 'no último dia' : `no dia ${rule.monthDay}`
    base = interval === 1 ? `Todo mês ${dia}` : `A cada ${interval} meses ${dia}`
  }

  return rule.endDate ? `${base} · até ${dayLabel(rule.endDate)}` : base
}

/** Regra vazia para o formulário abrir com algo coerente. */
export function emptyRule(startDate = today()): RecurrenceRule {
  return {
    frequency: 'once',
    interval: 1,
    weekdays: [weekdayOf(startDate)],
    monthDay: Number(startDate.slice(8, 10)),
    skipWeekends: true,
    startDate,
    endDate: null,
  }
}
