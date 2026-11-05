import type { NavQuarter } from '@/composables/useNavQuarters'

/**
 * Nome do mês (como a API grava em `Month.name`) para o número 1 a 12.
 * A API grava em português ("Novembro"); o inglês fica de reserva porque o
 * comentário do schema ainda documenta "January", e empresa antiga pode ter
 * nascido assim.
 */
const MONTH_NUMBER: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

export function monthNumberFromName(name: string): number | null {
  const key = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  return MONTH_NUMBER[key] ?? null
}

/** Id do mês corrente na lista do menu, ou `null` se a empresa não tem ele. */
export function currentMonthId(quarters: NavQuarter[], today = new Date()): string | null {
  const wanted = today.getMonth() + 1
  for (const quarter of quarters) {
    for (const month of quarter.months) {
      if (monthNumberFromName(month.name) === wanted) return month.id
    }
  }
  return null
}
