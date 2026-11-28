import type { ClockInterval, DateOverride, WeeklyRule } from '@/service/booking/booking-service'

/** "HH:MM" → minutos. */
export function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Minutos → "HH:MM" (limitado ao dia). */
export function toClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/**
 * Primeiro problema dos intervalos de um dia, ou null. Mesma regra do servidor
 * (engine/slots.ts → normalizeIntervals): sobreposição é erro, não é fundida,
 * porque 09-12 e 11-14 quase sempre é digitação errada.
 */
export function intervalsProblem(intervals: ClockInterval[]): string | null {
  const sorted = [...intervals].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  for (const interval of sorted) {
    if (!interval.start || !interval.end) return 'Preencha início e fim.'
    if (toMinutes(interval.end) <= toMinutes(interval.start)) {
      return `O fim (${interval.end}) precisa ser depois do início (${interval.start}).`
    }
  }
  for (let i = 1; i < sorted.length; i += 1) {
    if (toMinutes(sorted[i]!.start) < toMinutes(sorted[i - 1]!.end)) {
      return 'Há intervalos se sobrepondo.'
    }
  }
  return null
}

/** Ordem de exibição: semana de trabalho primeiro (seg → dom). */
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0]

export function weeklyByDay(rules: WeeklyRule[]): Record<number, ClockInterval[]> {
  const out: Record<number, ClockInterval[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
  for (const rule of rules) out[rule.day]?.push({ start: rule.start, end: rule.end })
  for (const day of Object.keys(out)) {
    out[Number(day)]!.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
  }
  return out
}

export function weeklyFromDays(days: Record<number, ClockInterval[]>): WeeklyRule[] {
  return Object.entries(days).flatMap(([day, intervals]) =>
    intervals.map((i) => ({ day: Number(day), start: i.start, end: i.end })),
  )
}

/**
 * Comparação estável para saber se há alteração não salva.
 *
 * Monta TUPLAS, nunca serializa os objetos como vieram: o Postgres guarda a
 * regra em `jsonb`, que reordena as chaves (`{day, start, end}` volta como
 * `{day, end, start}`). Com `JSON.stringify` dos objetos, a tela achava que
 * havia alteração não salva logo ao abrir e a barra de salvar nunca sumia — o
 * teste de ponta a ponta contra o banco real foi o que pegou.
 */
export function availabilitySignature(
  timezone: string,
  weekly: WeeklyRule[],
  overrides: DateOverride[],
): string {
  const interval = (i: ClockInterval) => [i.start, i.end]
  const w = [...weekly]
    .sort((a, b) => a.day - b.day || toMinutes(a.start) - toMinutes(b.start))
    .map((r) => [r.day, r.start, r.end])
  const o = [...overrides]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => [
      x.date,
      [...x.intervals].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)).map(interval),
    ])
  return JSON.stringify([timezone, w, o])
}
