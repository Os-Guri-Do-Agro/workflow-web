import type { ActivationBase, ActivationKind, ActivationStatus } from '@/service/marketing/marketing-activations'
import { spDateTimeToIso, spTime, spYmd, todaySp, weekdayOf } from '../calendar/calendar-time'

/** Rótulos, cores e datas das Ativações (uma fonte para lista, painel e calendário). */

export const ACTIVATION_KIND_LABEL: Record<ActivationKind, string> = {
  FAIR: 'Feira',
  TALK: 'Palestra',
  PARTNER_ACTION: 'Ação com parceiro',
  EVENT: 'Evento',
  SAMPLING: 'Distribuição de brindes',
  OTHER: 'Outro',
}

export const ACTIVATION_KINDS = Object.keys(ACTIVATION_KIND_LABEL) as ActivationKind[]

export const ACTIVATION_STATUS_LABEL: Record<ActivationStatus, string> = {
  PLANNED: 'Planejada',
  CONFIRMED: 'Confirmada',
  DONE: 'Realizada',
  CANCELED: 'Cancelada',
}

export const ACTIVATION_STATUSES = Object.keys(ACTIVATION_STATUS_LABEL) as ActivationStatus[]

/** Chave da paleta de tags (`var(--tag-<tone>)`). */
export const ACTIVATION_STATUS_TONE: Record<ActivationStatus, string> = {
  PLANNED: 'amber',
  CONFIRMED: 'blue',
  DONE: 'green',
  CANCELED: 'slate',
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/*
 * Datas SEMPRE no fuso de Brasília (o mesmo do calendário e da API), seja qual
 * for o fuso do navegador: quem abre de Manaus ou de Tóquio vê a feira no dia e
 * na hora de Brasília, e o "dia inteiro" (00:00 a 23:59) não escorrega de dia.
 */

/** ISO do servidor -> campos do formulário (data e hora de Brasília; hora vazia = dia inteiro). */
export function splitIso(iso: string | null | undefined, blankTime: string): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const time = spTime(iso)
  return { date: spYmd(iso), time: time === blankTime ? '' : time }
}

/** Campos do formulário (Brasília) -> ISO. Hora vazia vira o início (00:00) ou o fim (23:59) do dia. */
export function joinSp(date: string, time: string, blankTime: string): string | null {
  if (!date) return null
  return spDateTimeToIso(date, time || blankTime)
}

/** Ativação sem hora marcada: 00:00 e (sem fim ou fim às 23:59), em Brasília. */
export function isAllDay(a: Pick<ActivationBase, 'startAt' | 'endAt'>): boolean {
  if (spTime(a.startAt) !== '00:00') return false
  if (!a.endAt) return true
  return spTime(a.endAt) === '23:59'
}

/** 'YYYY-MM-DD' -> "sex, 20 nov" / "20 nov" */
function dayLabel(ymd: string, withWeekday: boolean) {
  const day = Number(ymd.slice(8, 10))
  const month = MONTHS[Number(ymd.slice(5, 7)) - 1]
  return `${withWeekday ? `${WEEKDAYS[weekdayOf(ymd)]}, ` : ''}${day} ${month}`
}

/** "sex, 20 nov, 14:00" · "20 a 22 nov" · "28 nov a 2 dez". */
export function formatWhen(a: Pick<ActivationBase, 'startAt' | 'endAt'>, withWeekday = false): string {
  const start = spYmd(a.startAt)
  const end = a.endAt ? spYmd(a.endAt) : null
  const hour = spTime(a.startAt)
  const allDay = isAllDay(a)
  if (!end || start === end) {
    return allDay ? dayLabel(start, withWeekday) : `${dayLabel(start, withWeekday)}, ${hour}`
  }
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const range = sameMonth
    ? `${Number(start.slice(8, 10))} a ${dayLabel(end, false)}`
    : `${dayLabel(start, false)} a ${dayLabel(end, false)}`
  return allDay ? range : `${range}, ${hour}`
}

/** Ainda não acabou (hoje, em Brasília, conta como próxima). */
export function isUpcoming(a: Pick<ActivationBase, 'startAt' | 'endAt'>, now = new Date()): boolean {
  return spYmd(a.endAt ?? a.startAt) >= todaySp(now)
}
