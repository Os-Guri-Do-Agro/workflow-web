/**
 * Verifica a aritmética da cascata do banco de horas.
 *
 * Uso: node --experimental-strip-types scripts/verify-balance-waterfall.ts
 *
 * Roda no Node puro de propósito: este repo não tem runner de teste, e a conta
 * do acumulado é justamente a parte que não pode errar — um saldo que não fecha
 * faz o gráfico discordar da tabela logo abaixo dele. Como `balance-waterfall.ts`
 * é uma função pura cujos únicos imports são `import type` (apagados na
 * transpilação), ela roda aqui sem Vite, sem alias e sem instalar dependência.
 */
import {
  comSinal,
  montarCascata,
  palavraDoSaldo,
} from '../src/features/time/balance-waterfall.ts'

const HORA = 3600
const JORNADA = 8 * HORA

let ok = 0
let falhou = 0

function check(rotulo: string, condicao: boolean, detalhe?: unknown) {
  if (condicao) {
    ok++
    console.log(`  OK    ${rotulo}`)
  } else {
    falhou++
    console.log(`  FALHA ${rotulo}`, detalhe ?? '')
  }
}

/**
 * Um dia FECHADO: a meta cheia foi cobrada.
 *
 * `chargedSec` existe porque o dia que ainda está correndo cobra só o que já
 * foi cumprido (ver `DayBalance` no backend). Aqui ele é igual à meta; para o
 * dia corrente existe o `diaDeHoje`.
 */
const dia = (day: string, workedH: number, targetH: number, holiday: string | null = null) => ({
  day,
  workedSec: Math.round(workedH * HORA),
  targetSec: Math.round(targetH * HORA),
  chargedSec: Math.round(targetH * HORA),
  holiday,
})

/** O dia que ainda corre: cobra `min(meta, trabalhado)`, nunca a meta cheia. */
const diaDeHoje = (day: string, workedH: number, targetH: number) => ({
  day,
  workedSec: Math.round(workedH * HORA),
  targetSec: Math.round(targetH * HORA),
  chargedSec: Math.round(Math.min(targetH, workedH) * HORA),
  holiday: null,
})

const ajuste = (day: string, horas: number, reason = 'acerto') => ({
  id: `a-${day}`,
  day,
  seconds: Math.round(horas * HORA),
  reason,
  by: 'Chefe',
})

// ── O caso que originou a feature ──────────────────────────────────────────
// "Tenho 40 horas de banco. Fechei um dia com 7 em vez de 8. 39 horas."
{
  const c = montarCascata({
    saldoInicialSec: 40 * HORA,
    dias: [dia('2026-09-14', 7, 8)],
    ajustes: [],
    hoje: '2026-09-15',
  })

  check('40h de banco, um dia de 7h contra meta de 8h', c.saldoFinalSec === 39 * HORA, c.saldoFinalSec / HORA)
  check('a barra começa no saldo que existia antes', c.barras[0].base === 40 * HORA)
  check('e tira exatamente uma hora', c.barras[0].deltaSec === -HORA)
  check('terminando em 39h', c.barras[0].saldoSec === 39 * HORA)
}

// ── A invariante que o gráfico não pode quebrar ────────────────────────────
{
  const c = montarCascata({
    saldoInicialSec: 5 * HORA,
    dias: [
      dia('2026-09-01', 9, 8),
      dia('2026-09-02', 6, 8),
      dia('2026-09-03', 8, 8),
      dia('2026-09-05', 4, 0), // sábado trabalhado
      dia('2026-09-04', 0, 8), // faltou
    ],
    ajustes: [ajuste('2026-09-03', 2)],
    hoje: '2026-09-10',
  })

  const soma = c.barras.reduce((t, b) => t + b.deltaSec, 0)
  check(
    'inicial + dias + ajustes = final (a conta do rodapé)',
    c.saldoInicialSec + soma + c.ajustesSec === c.saldoFinalSec,
    { inicial: c.saldoInicialSec, dias: soma, ajustes: c.ajustesSec, final: c.saldoFinalSec },
  )
  check(
    'cada barra encaixa na anterior (a cascata não tem buraco)',
    c.barras.every((b, i) => (i === 0 ? b.base === c.saldoInicialSec : b.base === c.barras[i - 1].saldoSec)),
    c.barras.map((b) => [b.day, b.base / HORA, b.saldoSec / HORA]),
  )
  check(
    'as barras saem em ordem cronológica',
    c.barras.every((b, i) => i === 0 || c.barras[i - 1].day <= b.day),
    c.barras.map((b) => b.day),
  )
}

// ── Cada tipo de dia ──────────────────────────────────────────────────────
{
  const c = montarCascata({
    saldoInicialSec: 0,
    dias: [
      dia('2026-09-01', 8, 8),
      dia('2026-09-02', 0, 8),
      dia('2026-09-05', 3, 0),
      dia('2026-09-07', 2, 0, 'Independência'),
      dia('2026-09-06', 0, 0), // domingo vazio
    ],
    ajustes: [],
    hoje: '2026-09-10',
  })

  const porDia = new Map(c.barras.map((b) => [b.day, b]))
  check('dia cumprido é "trabalho"', porDia.get('2026-09-01')?.tipo === 'trabalho')
  check('dia com meta e sem registro é "sem-registro"', porDia.get('2026-09-02')?.tipo === 'sem-registro')
  check('  e ele tira a meta inteira', porDia.get('2026-09-02')?.deltaSec === -JORNADA)
  check('sábado trabalhado é "sem-meta" e vira crédito', porDia.get('2026-09-05')?.tipo === 'sem-meta' && porDia.get('2026-09-05')!.deltaSec === 3 * HORA)
  check('feriado trabalhado mantém o nome do feriado', porDia.get('2026-09-07')?.holiday === 'Independência')
  check('domingo sem nada não vira barra', !porDia.has('2026-09-06'))
}

// ── Ajustes ───────────────────────────────────────────────────────────────
{
  const c = montarCascata({
    saldoInicialSec: 0,
    dias: [dia('2026-09-10', 8, 8)],
    ajustes: [ajuste('2026-09-10', 40, 'Acerto de julho'), ajuste('2026-09-12', -3, 'Folga')],
    hoje: '2026-09-15',
  })

  // O ajuste NÃO vira barra: um acerto grande ao lado de dias de poucas horas
  // achata o mês inteiro. Ele sai declarado à parte, e o saldo continua fechando.
  check('o ajuste não entra nas barras do gráfico', c.barras.length === 1)
  check('mas é devolvido para a tela declarar', c.ajustes.length === 2)
  check('o motivo viaja junto (o saldo precisa ser explicável)', c.ajustes[0].reason === 'Acerto de julho')
  check('ajuste em dia sem apontamento não se perde', c.ajustes.some((a) => a.day === '2026-09-12'))
  check('e o saldo final soma os dois', c.saldoFinalSec === 37 * HORA, c.saldoFinalSec / HORA)
}

// ── Hoje e o futuro ───────────────────────────────────────────────────────
{
  const c = montarCascata({
    saldoInicialSec: 0,
    dias: [diaDeHoje('2026-09-15', 3, 8), dia('2026-09-16', 0, 8), dia('2026-09-17', 0, 8)],
    ajustes: [ajuste('2026-09-20', 5)],
    hoje: '2026-09-15',
  })

  check('dia futuro não vira dívida', c.barras.length === 1, c.barras.map((b) => b.day))
  check('ajuste com data futura também fica de fora', c.ajustes.length === 0 && c.ajustesSec === 0)
  check('hoje entra marcado como em andamento', c.barras[0].emAndamento === true)
  // A regra que mudou em 16/09/2026: enquanto o dia corre, ele cobra só o que
  // ja foi cumprido. Sem isto, quem abrisse a tela as 9h aparecia devendo a
  // jornada inteira de um dia que nem tinha acontecido.
  check(
    'hoje com 3h de uma meta de 8h ainda não tira nada do banco',
    c.barras[0].deltaSec === 0,
    c.barras[0].deltaSec,
  )
}

// ── Hoje que passou da meta ────────────────────────────────────────────────
{
  const c = montarCascata({
    saldoInicialSec: 10 * HORA,
    dias: [diaDeHoje('2026-09-15', 10, 8)],
    ajustes: [],
    hoje: '2026-09-15',
  })

  check('a hora extra de hoje já entra como crédito', c.barras[0].deltaSec === 2 * HORA)
  check('  e o saldo sobe na hora', c.saldoFinalSec === 12 * HORA)
}

// ── O mesmo dia, depois de fechar ──────────────────────────────────────────
{
  const c = montarCascata({
    saldoInicialSec: 0,
    dias: [dia('2026-09-15', 3, 8)],
    ajustes: [],
    hoje: '2026-09-16',
  })

  check('quando o dia fecha, a meta cheia é cobrada', c.barras[0].deltaSec === -5 * HORA)
  check('  e ele deixa de estar em andamento', c.barras[0].emAndamento === false)
}

// ── Os outros dois canais, além da cor ────────────────────────────────────
check('valor negativo sai com sinal de menos', comSinal(-HORA) === '−1h00', comSinal(-HORA))
check('valor positivo sai com mais', comSinal(2.5 * HORA) === '+2h30', comSinal(2.5 * HORA))
check('menos de uma hora sai em minutos', comSinal(-15 * 60) === '−15min', comSinal(-15 * 60))
check('a palavra acompanha o sinal', palavraDoSaldo(-1) === 'devendo' && palavraDoSaldo(1) === 'de crédito' && palavraDoSaldo(0) === 'em dia')

console.log(`\n${ok} verificações OK, ${falhou} falhas.`)
if (falhou) process.exit(1)
