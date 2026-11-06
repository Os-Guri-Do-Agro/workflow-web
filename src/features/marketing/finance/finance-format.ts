import { spYmd } from '../calendar/calendar-time'

/**
 * Datas e números do financeiro (front). Mês é 'YYYY-MM' e dia 'YYYY-MM-DD',
 * sempre no fuso de Brasília (o mesmo da API), seja qual for o do navegador.
 */

export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const pad = (n: number) => String(n).padStart(2, '0')

export function isYm(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function todayYmd(now = new Date()): string {
  return spYmd(now)
}

export function currentYm(now = new Date()): string {
  return todayYmd(now).slice(0, 7)
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** "novembro de 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return `${MONTH_NAMES[m - 1] ?? ym} de ${y}`
}

/** "Novembro de 2026" */
export function monthTitle(ym: string): string {
  const label = monthLabel(ym)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** "nov/2026" */
export function monthShort(ym: string | null | undefined): string {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return `${(MONTH_SHORT[m - 1] ?? '').toLowerCase()}/${y}`
}

/** 'YYYY-MM-DD' -> '05/11' (ou '05/11/2026' com `year`) */
export function dayBr(ymd: string, year = false): string {
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return ymd
  return year ? `${d}/${m}/${y}` : `${d}/${m}`
}

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "qui" */
export function weekdayShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return WEEKDAY[new Date(y, m - 1, d).getDay()] ?? ''
}

/** Data padrão de um lançamento novo no mês aberto: hoje, ou o dia 1. */
export function defaultDateFor(month: string): string {
  const today = todayYmd()
  return today.startsWith(`${month}-`) ? today : `${month}-01`
}

const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Centavos -> "1.234,56" (sem o R$, para a matriz e o campo de valor) */
export function centsPlain(cents: number | null | undefined): string {
  return plain.format((cents ?? 0) / 100)
}

/** Percentual inteiro de uso do orçamento (0 sem orçamento). */
export function usePercent(spent: number, budget: number | null): number {
  if (!budget || budget <= 0) return spent > 0 ? 100 : 0
  return Math.round((spent / budget) * 100)
}
