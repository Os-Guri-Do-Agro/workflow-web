/**
 * Datas do calendário editorial, SEMPRE no fuso de Brasília (spec M1-B), seja
 * qual for o fuso do navegador: quem está viajando vê o post de terça na
 * terça. Espelho do `workflow-api/src/marketing/calendar/marketing-time.ts`.
 *
 * Dia é 'YYYY-MM-DD' (texto, sem fuso) e a conta de dias é feita em UTC puro.
 * A semana da ala vai de segunda a domingo (a mesma do Painel).
 */

export const MARKETING_TIME_ZONE = 'America/Sao_Paulo'

const DAY_MS = 86_400_000
const pad2 = (n: number) => String(n).padStart(2, '0')

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKETING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(date: Date): ZonedParts {
  const out: Record<string, number> = {}
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  }
}

function offsetMinutes(date: Date): number {
  const p = zonedParts(date)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000)
}

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

/** Dia de Brasília de um instante ISO (ou o próprio 'YYYY-MM-DD'). */
export function spYmd(value: string | Date): string {
  if (typeof value === 'string' && isDateOnly(value)) return value
  const p = zonedParts(typeof value === 'string' ? new Date(value) : value)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

/** 'HH:mm' de Brasília de um instante ISO. */
export function spTime(value: string | Date): string {
  const p = zonedParts(typeof value === 'string' ? new Date(value) : value)
  return `${pad2(p.hour)}:${pad2(p.minute)}`
}

/** Minutos desde a meia-noite de Brasília. */
export function spMinutes(value: string | Date): number {
  const p = zonedParts(typeof value === 'string' ? new Date(value) : value)
  return p.hour * 60 + p.minute
}

export function todaySp(now: Date = new Date()): string {
  return spYmd(now)
}

/** Dia + 'HH:mm' de Brasília -> instante ISO (o que a API grava). */
export function spDateTimeToIso(ymd: string, hhmm: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const [hh, mi] = hhmm.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, m - 1, d, hh, mi)
  const first = offsetMinutes(new Date(guess))
  let instant = guess - first * 60_000
  const second = offsetMinutes(new Date(instant))
  if (second !== first) instant = guess - second * 60_000
  return new Date(instant).toISOString()
}

/**
 * Instante ISO -> valor de `<input type="datetime-local">` com a hora de
 * Brasília ('YYYY-MM-DDTHH:mm'). Ex.: '2026-11-12T13:00:00Z' vira
 * '2026-11-12T10:00' num navegador em UTC-4 e também em UTC+9.
 */
export function spLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${spYmd(date)}T${spTime(date)}`
}

/**
 * Valor do `datetime-local`, lido como hora de Brasília -> instante ISO
 * (vazio ou inválido = null). Ex.: '2026-11-12T10:00' vira
 * '2026-11-12T13:00:00.000Z' em qualquer fuso do navegador.
 */
export function spLocalInputToIso(value: string | null | undefined): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value ?? '')
  if (!match || !isYmd(match[1])) return null
  const hh = Number(match[2])
  const mi = Number(match[3])
  if (hh > 23 || mi > 59) return null
  return spDateTimeToIso(match[1]!, `${match[2]}:${match[3]}`)
}

// ── Dias ────────────────────────────────────────────────────────────────────

function toUtc(ymd: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)))
}

function fromUtc(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function dayKey(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

export function addDays(ymd: string, days: number): string {
  return fromUtc(toUtc(ymd) + days * DAY_MS)
}

/** `b - a` em dias de calendário. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

/** 0 = domingo ... 6 = sábado */
export function weekdayOf(ymd: string): number {
  return new Date(toUtc(ymd)).getUTCDay()
}

/** Segunda-feira da semana do dia. */
export function mondayOf(ymd: string): string {
  return addDays(ymd, -((weekdayOf(ymd) + 6) % 7))
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

export function isYmd(value: unknown): value is string {
  if (typeof value !== 'string' || !isDateOnly(value)) return false
  return fromUtc(toUtc(value)) === value
}

/** Primeiro dia do mês seguinte/anterior (`delta` meses), para navegar. */
export function shiftMonth(ymd: string, delta: number): string {
  const y = Number(ymd.slice(0, 4))
  const m0 = Number(ymd.slice(5, 7)) - 1 + delta
  const date = new Date(Date.UTC(y, m0, 1))
  return dayKey(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

// ── Rótulos ─────────────────────────────────────────────────────────────────

/** Cabeçalho da grade (caixa alta aqui é dado: dia da semana). */
export const WEEKDAYS_MON = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const
const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

const monthIndex = (ymd: string) => Number(ymd.slice(5, 7)) - 1
const dayNumber = (ymd: string) => Number(ymd.slice(8, 10))

/** "06/11" */
export function formatDayMonth(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
}

/** "Sexta, 6 de novembro" */
export function formatLongDay(ymd: string): string {
  return `${WEEKDAYS_LONG[weekdayOf(ymd)]}, ${dayNumber(ymd)} de ${MONTH_NAMES[monthIndex(ymd)]!.toLowerCase()}`
}

/** "Hoje · sex, 6 nov", "Amanhã · sáb, 7 nov", "Seg, 9 nov" */
export function dayHeading(ymd: string, today: string): string {
  const base = `${WEEKDAYS_SHORT[weekdayOf(ymd)]}, ${dayNumber(ymd)} ${MONTH_SHORT[monthIndex(ymd)]}`
  const diff = daysBetween(today, ymd)
  if (diff === 0) return `Hoje · ${base}`
  if (diff === 1) return `Amanhã · ${base}`
  if (diff === -1) return `Ontem · ${base}`
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** "Novembro de 2026" */
export function monthTitle(ymd: string): string {
  return `${MONTH_NAMES[monthIndex(ymd)]} de ${ymd.slice(0, 4)}`
}

/** "2 a 8 de nov de 2026" ou "30 de nov a 6 de dez de 2026" */
export function weekTitle(monday: string): string {
  const sunday = addDays(monday, 6)
  const sameMonth = monday.slice(0, 7) === sunday.slice(0, 7)
  const end = `${dayNumber(sunday)} de ${MONTH_SHORT[monthIndex(sunday)]} de ${sunday.slice(0, 4)}`
  return sameMonth
    ? `${dayNumber(monday)} a ${end}`
    : `${dayNumber(monday)} de ${MONTH_SHORT[monthIndex(monday)]} a ${end}`
}

/** "12/11 às 10:00" (Brasília) */
export function formatDayTime(iso: string): string {
  return `${formatDayMonth(spYmd(iso))} às ${spTime(iso)}`
}

// ── Grade ───────────────────────────────────────────────────────────────────

export interface CalendarCell {
  date: string
  day: number
  inMonth: boolean
}

/** Semanas (segunda a domingo) que cobrem o mês do dia `ymd`. */
export function monthGrid(ymd: string): CalendarCell[][] {
  const first = `${ymd.slice(0, 7)}-01`
  const year = Number(ymd.slice(0, 4))
  const month0 = monthIndex(ymd)
  const last = dayKey(year, month0, daysInMonth(year, month0))
  const start = mondayOf(first)
  const end = addDays(mondayOf(last), 6)
  const weeks: CalendarCell[][] = []
  let cursor = start
  while (cursor <= end) {
    const week: CalendarCell[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ date: cursor, day: dayNumber(cursor), inMonth: monthIndex(cursor) === month0 })
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
