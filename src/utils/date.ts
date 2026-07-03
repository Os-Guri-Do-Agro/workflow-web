/**
 * Utilitários para datas date-only (ex.: dueDate).
 *
 * Convenção do app: dueDate é semanticamente date-only, mas trafega como
 * DateTime ISO. Para o dia-calendário nunca regredir em nenhum fuso, toda
 * data date-only é gravada ao meio-dia UTC e exibida no calendário UTC.
 */

/** Converte 'YYYY-MM-DD' em ISO ao meio-dia UTC (mesmo dia-calendário em qualquer fuso habitado). */
export function dateOnlyToUtcNoonIso(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`
}

/** Extrai 'YYYY-MM-DD' de um ISO (para preencher <input type="date">). */
export function isoToDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

/** Formata o dia-calendário UTC do ISO em pt-BR, imune a fuso. */
export function formatDateOnly(
  iso: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...opts,
  }).format(new Date(iso))
}

/** Atrasada só depois que o dia-calendário UTC do dueDate termina. */
export function isOverdue(iso: string | null | undefined): boolean {
  if (!iso) return false
  return new Date(`${iso.slice(0, 10)}T23:59:59.999Z`).getTime() < Date.now()
}

/** Diferença em dias-calendário entre o dia UTC do ISO e o dia local de hoje (labels Hoje/Amanhã/Atrasada Xd). */
export function dateOnlyDiffDays(iso: string, from: Date = new Date()): number {
  const due = new Date(iso)
  const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const todayUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((dueUtc - todayUtc) / 86_400_000)
}

/** Hoje LOCAL em 'YYYY-MM-DD'. */
export function todayDateOnly(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
