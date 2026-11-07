import type { AppConversion, AppWeekWindow, CellSum } from '@/service/marketing/marketing-app-data'
import { addDays } from '../calendar/calendar-time'

/**
 * Como a área Dados escreve um número do app. A regra que manda: célula de 1 a
 * 4 chega cortada (privacidade), então a soma é um intervalo, e a tela diz
 * "32 a 38" ou "menos de 5" em vez de arredondar para um número inventado.
 */

const nf = new Intl.NumberFormat('pt-BR')

export function fmtInt(n: number): string {
  return nf.format(n)
}

/** "12", "32 a 38", "menos de 5" ou "sem dado". */
export function fmtSum(s: CellSum | null | undefined): string {
  if (!s || s.cells === 0) return 'sem dado'
  if (s.cut === 0) return nf.format(s.min)
  if (s.cut === s.cells && s.cut === 1) return 'menos de 5'
  return `${nf.format(s.min)} a ${nf.format(s.max)}`
}

/** Explicação do corte para o `title` (vazio quando não houve corte). */
export function cutHint(s: CellSum | null | undefined): string {
  if (!s || !s.cut) return ''
  const dias = s.cut === 1 ? '1 número veio' : `${s.cut} números vieram`
  return `${dias} como "menos de 5" (recorte de privacidade do app). Por isso o total é um intervalo.`
}

/**
 * Estoque que o app manda arredondado PARA CIMA, de 5 em 5 (assinaturas e pets
 * ativos): 0 chega 0, de 1 a 5 chega 5, de 6 a 10 chega 10, e nunca vem cortado.
 * O valor v quer dizer "entre v-4 e v": 5 vira "até 5", o resto "cerca de v".
 * Sem `rounded`, é o `fmtSum`. Soma de marcas segue a mesma regra (5 no total
 * ainda é "até 5"). Número com corte só existe em dado de antes de 07/11 e sai
 * como intervalo, pelo `fmtSum`.
 */
export function fmtStock(s: CellSum | null | undefined, rounded: boolean): string {
  if (!rounded || !s || s.cells === 0 || s.cut) return fmtSum(s)
  if (s.min === 0) return '0'
  if (s.min === 5) return 'até 5'
  return `cerca de ${nf.format(s.min)}`
}

/** `title` do estoque arredondado: diz a faixa de verdade (cada número pode estar até 4 acima). */
export function stockHint(s: CellSum | null | undefined, rounded: boolean): string {
  if (!rounded || !s || !s.cells || s.cut || s.min === 0) return cutHint(s)
  const de = Math.max(1, s.min - 4 * s.cells)
  return `O app manda este número arredondado para cima, de 5 em 5 (recorte de privacidade): o valor fica entre ${nf.format(de)} e ${nf.format(s.min)}.`
}

/**
 * Variação do estoque no período: "cerca de +5", "cerca de -10", "sem mudança" ou
 * "" (sem as duas fotos). As duas fotos arredondadas podem estar até 4 acima
 * cada, então a variação de verdade fica a até 4 do número: 0 vira "menos de 5".
 */
export function fmtChange(change: number | null | undefined, rounded: boolean): string {
  if (change === null || change === undefined) return ''
  if (change === 0) return rounded ? 'menos de 5 de diferença' : 'sem mudança'
  const n = `${change > 0 ? '+' : '-'}${nf.format(Math.abs(change))}`
  return rounded ? `cerca de ${n}` : n
}

/** Valor para ordenar e desenhar: o meio do intervalo. */
export function midValue(s: CellSum | null | undefined): number {
  if (!s) return 0
  return (s.min + s.max) / 2
}

export function isExact(s: CellSum | null | undefined): boolean {
  return !!s && s.cells > 0 && s.cut === 0
}

/** "+12,5%", "-3%" ou "" (sem base ou com intervalo). */
export function fmtDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return ''
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export function deltaTone(delta: number | null | undefined): 'up' | 'down' | 'flat' | '' {
  if (delta === null || delta === undefined) return ''
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

export function fmtConversion(c: AppConversion | null | undefined): string {
  if (!c) return '-'
  const f = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  return c.min === c.max ? f(c.min) : `${f(c.min)} a ${f(c.max)}`
}

/** "05/11" */
export function fmtDay(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return `${d}/${m}`
}

/** "30/10 a 05/11" */
export function fmtRange(from: string, to: string): string {
  return `${fmtDay(from)} a ${fmtDay(to)}`
}

/** "por semana fechada, de 26/10 a 01/11", "... de 05/10 a 01/11 (4 semanas)" ou "nenhuma semana do período fechou ainda". */
export function fmtWeeks(w: AppWeekWindow): string {
  if (!w.count) return 'nenhuma semana do período fechou ainda'
  const n = w.count > 1 ? ` (${w.count} semanas)` : ''
  return `por semana fechada, de ${fmtDay(w.from)} a ${fmtDay(w.to)}${n}`
}

/** A semana em curso: "A semana de 02/11 a 08/11 ainda não fechou: entra na segunda-feira, 09/11." */
export function fmtOpenWeek(w: AppWeekWindow): string {
  if (!w.open) return ''
  return `A semana de ${fmtRange(w.open.from, w.open.to)} ainda não fechou: entra na segunda-feira, ${fmtDay(addDays(w.open.to, 1))}.`
}

/** "há 3 h", "há 2 dias" */
export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca'
  const ms = now - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'há menos de 1 h'
  if (h < 48) return `há ${h} h`
  return `há ${Math.floor(h / 24)} dias`
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const SOURCE_LABEL: Record<string, string> = {
  usuario: 'último acesso da conta',
  aparelho: 'uso do aparelho',
  misto: 'conta e aparelho',
}
