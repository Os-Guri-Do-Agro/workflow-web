import type { BalanceAdjustment, BalanceDay } from '@/service/time/time-service'

/**
 * A aritmética da cascata do banco de horas, fora do componente.
 *
 * Existe separada porque a parte que pode errar aqui não é o desenho, é a
 * conta: um acumulado que não fecha faz o gráfico discordar da tabela logo
 * abaixo dele, e aí o número inteiro perde a defesa. Sendo função pura, a
 * invariante (`saldo inicial + soma dos deltas === saldo final`) vira um teste
 * de uma linha, sem montar Vue.
 */

/**
 * O que mexeu no saldo num dia.
 *
 * Não existe tipo `ajuste` aqui de propósito: lançamento manual não vira barra
 * (ver `montarCascata`). Enquanto existia, a option do gráfico carregava um
 * ramo de estilo que nunca era alcançado.
 */
export type TipoDeBarra =
  /** Dia útil trabalhado: a diferença entre o feito e a meta. */
  | 'trabalho'
  /** Dia com meta e nenhum apontamento: a meta inteira vira dívida. */
  | 'sem-registro'
  /** Fim de semana ou feriado com trabalho: entra inteiro como crédito. */
  | 'sem-meta'

export interface BarraDoSaldo {
  /** `YYYY-MM-DD` — o dia a que a barra se refere. */
  day: string
  /** Rótulo do eixo: `14/09`. */
  label: string
  /** Saldo ANTES deste evento: é onde a barra começa a flutuar. */
  base: number
  /** Quanto este evento somou (positivo) ou tirou (negativo). */
  deltaSec: number
  /** Saldo DEPOIS deste evento. */
  saldoSec: number
  tipo: TipoDeBarra
  workedSec: number
  targetSec: number
  /** Nome do feriado, quando o dia é um. */
  holiday: string | null
  /** O dia ainda está correndo: a meta cheia já conta, mas ele pode melhorar. */
  emAndamento: boolean
}

export interface Cascata {
  /** As barras do dia a dia — só o que o TRABALHO moveu. */
  barras: BarraDoSaldo[]
  saldoInicialSec: number
  /** Lançamentos manuais do período, fora do gráfico (ver `montarCascata`). */
  ajustes: BalanceAdjustment[]
  /** Soma dos ajustes. Entra no saldo final, não nas barras. */
  ajustesSec: number
  /** Saldo depois dos dias E dos ajustes. */
  saldoFinalSec: number
}

/** `2026-09-14` → `14/09`. */
function rotulo(day: string): string {
  const [, mes = '', dia = ''] = day.split('-')
  return `${dia}/${mes}`
}

/** Um evento antes de virar barra: ainda sem `base` nem saldo corrente. */
type Evento = Omit<BarraDoSaldo, 'base' | 'saldoSec'>

/**
 * Monta as barras de um mês.
 *
 * `saldoInicialSec` é o que entrou do mês anterior — é ele que faz a leitura
 * "eu tinha 40h, o dia de ontem tirou 1h, tenho 39h" existir. Sem ele, cada mês
 * começaria do zero na tela e o gráfico contaria uma história diferente da do
 * extrato.
 *
 * Dia FUTURO não entra: ele ainda vai acontecer, e cobrar a meta dele agora
 * faria a pessoa parecer devedora do mês inteiro já no dia 1 (é a mesma regra do
 * cálculo no servidor). Dia sem meta e sem trabalho também não entra — uma barra
 * de altura zero só ocupa espaço.
 *
 * **O ajuste manual NÃO vira barra**, e isso foi decidido olhando o gráfico
 * pronto: um acerto de +253h ao lado de dias de ±4h achata todos os dias em
 * traços colados na linha do zero, e o mês inteiro fica ilegível. Ajuste também
 * não é da mesma natureza — ele é lançamento administrativo, não trabalho
 * medido. Ele sai declarado à parte (valor e motivo), e o saldo final continua
 * somando os dois, com a conta visível no rodapé do card.
 *
 * A ordem cronológica é resolvida ANTES de acumular, de propósito: numa cascata,
 * `base` depende de tudo que veio antes, então reordenar depois de somar
 * descolaria as barras umas das outras.
 */
export function montarCascata(opts: {
  saldoInicialSec: number
  dias: BalanceDay[]
  ajustes: BalanceAdjustment[]
  /** Data civil de hoje (`YYYY-MM-DD`). */
  hoje: string
}): Cascata {
  const { saldoInicialSec, dias, ajustes, hoje } = opts

  const eventos: Evento[] = []

  for (const d of dias) {
    if (d.day > hoje) continue

    const temMeta = d.targetSec > 0
    const trabalhou = d.workedSec > 0
    if (!temMeta && !trabalhou) continue

    eventos.push({
      day: d.day,
      label: rotulo(d.day),
      // `chargedSec`, e não `targetSec`: o dia de hoje ainda está correndo e só
      // cobra o que já foi cumprido. Usar a meta cheia aqui faria a barra de
      // hoje despencar a jornada inteira logo cedo, e o gráfico discordaria do
      // saldo que o servidor calculou.
      deltaSec: d.workedSec - d.chargedSec,
      tipo: !temMeta ? 'sem-meta' : trabalhou ? 'trabalho' : 'sem-registro',
      workedSec: d.workedSec,
      targetSec: d.targetSec,
      holiday: d.holiday,
      emAndamento: d.day === hoje,
    })
  }

  eventos.sort((a, b) => a.day.localeCompare(b.day))

  let saldo = saldoInicialSec
  const barras: BarraDoSaldo[] = eventos.map((e) => {
    const base = saldo
    saldo += e.deltaSec
    return { ...e, base, saldoSec: saldo }
  })

  // Os ajustes ficam fora das barras, mas dentro do saldo: o número do rodapé
  // precisa fechar com o do extrato.
  const doPeriodo = ajustes.filter((a) => a.day <= hoje)
  const ajustesSec = doPeriodo.reduce((soma, a) => soma + a.seconds, 0)

  return {
    barras,
    saldoInicialSec,
    ajustes: doPeriodo,
    ajustesSec,
    saldoFinalSec: saldo + ajustesSec,
  }
}

/** `+2h30` / `−1h00`. O sinal é dito, nunca deixado só para a cor. */
export function comSinal(sec: number): string {
  const s = Math.abs(sec)
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  const corpo = h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
  return `${sec < 0 ? '−' : '+'}${corpo}`
}

/** A palavra que acompanha o sinal (o terceiro canal, além de cor e direção). */
export function palavraDoSaldo(sec: number): string {
  if (sec === 0) return 'em dia'
  return sec > 0 ? 'de crédito' : 'devendo'
}
