/**
 * Formatação de data do Drive. Duas funções, dois usos:
 * `shortDate` no card (precisa caber) e `fullDate` no painel de detalhes
 * (precisa ser exato). Locale fixo em pt-BR, como o resto do produto.
 */

const SHORT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
})
const SHORT_WITH_YEAR = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})
const FULL = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
})

/** "hoje" e "ontem" por extenso; ano só quando não é o corrente. */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor(
    (startOfToday.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  )
  if (diffDays === 0) return 'hoje'
  if (diffDays === 1) return 'ontem'

  return date.getFullYear() === now.getFullYear()
    ? SHORT.format(date).replace('.', '')
    : SHORT_WITH_YEAR.format(date).replace('.', '')
}

export function fullDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : FULL.format(date)
}
