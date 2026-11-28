/**
 * Fonte única do roadmap (spec docs/specs/2026/q4/q4-2/v2-celular-roadmap-notas.md):
 * tipos de item (rótulo, ícone, cor), datas em 'YYYY-MM-DD' sem fuso e o
 * empilhamento da linha do tempo. Tudo puro, sem Vue, para as duas visões
 * (Mês e Ano) e o PDF lerem a mesma regra.
 *
 * Datas: o roadmap guarda dia-calendário como texto ('2026-11-04'). Toda conta
 * aqui é em UTC sobre esse texto; `new Date('2026-11-04')` em fuso local faria
 * o dia recuar em UTC-3.
 */
import type { Component } from 'vue'
import {
  CheckCircle2,
  FlaskConical,
  Megaphone,
  StickyNote,
  Target,
  TriangleAlert,
  Video,
} from 'lucide-vue-next'
import type { RoadmapCategory } from '@/service/roadmap/roadmap-monthly-service'

export interface CategoryMeta {
  value: RoadmapCategory
  label: string
  icon: Component
  /** Cor do tipo (ponto, faixa e ícone). Sempre token, nunca hex. */
  tone: string
}

/** Ordem de leitura: o que marca o calendário primeiro, o que anota por último. */
export const ROADMAP_CATEGORIES: readonly CategoryMeta[] = [
  { value: 'milestone', label: 'Marco', icon: Target, tone: 'var(--accent)' },
  { value: 'delivery', label: 'Entrega', icon: CheckCircle2, tone: 'var(--success)' },
  { value: 'test', label: 'Teste', icon: FlaskConical, tone: 'var(--task-status-test)' },
  { value: 'meeting', label: 'Reunião', icon: Megaphone, tone: 'var(--info)' },
  { value: 'recording', label: 'Gravação', icon: Video, tone: 'var(--tag-pink)' },
  { value: 'note', label: 'Nota', icon: StickyNote, tone: 'var(--warn)' },
  { value: 'risk', label: 'Risco', icon: TriangleAlert, tone: 'var(--err)' },
]

const CATEGORY_BY_VALUE = new Map(ROADMAP_CATEGORIES.map((c) => [c.value, c]))

export function categoryMeta(value: string | null | undefined): CategoryMeta {
  return CATEGORY_BY_VALUE.get(value as RoadmapCategory) ?? CATEGORY_BY_VALUE.get('note')!
}

export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const
const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const
export const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

// ── Datas ───────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0')

export function dateKey(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`
}

export function monthKeyOf(year: number, month0: number): string {
  return `${year}-${pad2(month0 + 1)}`
}

export function parseDate(key: string): { year: number; month0: number; day: number } {
  return { year: Number(key.slice(0, 4)), month0: Number(key.slice(5, 7)) - 1, day: Number(key.slice(8, 10)) }
}

function toUtc(key: string): number {
  const { year, month0, day } = parseDate(key)
  return Date.UTC(year, month0, day)
}

function fromUtc(ms: number): string {
  const d = new Date(ms)
  return dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export function addDays(key: string, days: number): string {
  return fromUtc(toUtc(key) + days * 86_400_000)
}

/** `b - a` em dias-calendário. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

export function weekdayOf(key: string): number {
  return new Date(toUtc(key)).getUTCDay()
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/** "04/11" */
export function formatDayMonth(key: string): string {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`
}

/** "4 nov" */
export function formatShort(key: string): string {
  const { month0, day } = parseDate(key)
  return `${day} ${MONTH_SHORT[month0]}`
}

/** "Quarta, 4 de novembro" */
export function formatLongDay(key: string): string {
  const { month0, day } = parseDate(key)
  return `${WEEKDAYS_LONG[weekdayOf(key)]}, ${day} de ${MONTH_NAMES[month0]!.toLowerCase()}`
}

/** "Hoje · qui, 5 nov", "Amanhã · sex, 6 nov", "seg, 9 nov" */
export function dayHeading(key: string, today: string): string {
  const { month0, day } = parseDate(key)
  const base = `${WEEKDAYS_SHORT[weekdayOf(key)]!.toLowerCase()}, ${day} ${MONTH_SHORT[month0]}`
  const diff = daysBetween(today, key)
  if (diff === 0) return `Hoje · ${base}`
  if (diff === 1) return `Amanhã · ${base}`
  if (diff === -1) return `Ontem · ${base}`
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** "21 a 27/11" ou "28/10 a 3/11" */
export function formatRange(start: string, end: string): string {
  const a = parseDate(start)
  const b = parseDate(end)
  if (start === end) return formatDayMonth(start)
  if (a.month0 === b.month0 && a.year === b.year) return `${a.day} a ${b.day}/${pad2(b.month0 + 1)}`
  return `${a.day}/${pad2(a.month0 + 1)} a ${b.day}/${pad2(b.month0 + 1)}`
}

/** "hoje", "amanhã", "em 23 dias", "há 2 dias" */
export function relativeDays(diff: number): string {
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  return diff > 0 ? `em ${diff} dias` : `há ${-diff} dias`
}

export interface CalendarCell {
  date: string
  day: number
  /** Dia do mês mostrado (os de fora completam a semana, apagados). */
  inMonth: boolean
}

/** Semanas de domingo a sábado cobrindo o mês inteiro (5 ou 6 linhas). */
export function monthGrid(year: number, month0: number): CalendarCell[][] {
  const first = dateKey(year, month0, 1)
  const start = addDays(first, -weekdayOf(first))
  const last = dateKey(year, month0, daysInMonth(year, month0))
  const end = addDays(last, 6 - weekdayOf(last))
  const weeks: CalendarCell[][] = []
  let cursor = start
  while (cursor <= end) {
    const week: CalendarCell[] = []
    for (let i = 0; i < 7; i++) {
      const { month0: m, day } = parseDate(cursor)
      week.push({ date: cursor, day, inMonth: m === month0 })
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

/**
 * Dias de teste de um marco: de `testStart` até a véspera do marco (no dia do
 * marco a versão sai; o marco é o próprio pino). Janela no próprio dia vale
 * só aquele dia.
 */
export function testWindow(testStart: string, date: string): { start: string; end: string; days: number } {
  if (testStart >= date) return { start: date, end: date, days: 1 }
  const end = addDays(date, -1)
  return { start: testStart, end, days: daysBetween(testStart, end) + 1 }
}

// ── Linha do tempo ──────────────────────────────────────────────────────────

export interface PackInput {
  id: string
  /** Em px (ou qualquer unidade linear), já com a largura do rótulo. */
  start: number
  end: number
}

/**
 * Empilhamento guloso: cada item vai para a primeira linha livre, senão abre
 * uma nova. Ordena por início (empate: o mais longo antes), então o resultado
 * não depende da ordem da API.
 */
export function packRows(items: readonly PackInput[], gap = 6): { row: Map<string, number>; rows: number } {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id))
  const ends: number[] = []
  const row = new Map<string, number>()
  for (const item of sorted) {
    let r = ends.findIndex((end) => end + gap <= item.start)
    if (r === -1) {
      r = ends.length
      ends.push(item.end)
    } else {
      ends[r] = item.end
    }
    row.set(item.id, r)
  }
  return { row, rows: ends.length }
}

/** Largura aproximada de um rótulo em px (sem medir o DOM a cada render). */
export function labelWidth(text: string, fontPx = 12, padding = 26): number {
  return Math.ceil(text.length * fontPx * 0.56) + padding
}
