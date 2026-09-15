/**
 * Renderiza os gráficos do banco de horas FORA do navegador, para poder olhar
 * para eles.
 *
 * Uso: node --experimental-strip-types scripts/render-balance-charts.ts [saida]
 *
 * A skill de dataviz é explícita: o validador de paleta checa cor, não layout —
 * colisão de rótulo, eixo cortado e barra espremida só aparecem olhando. Sem
 * isso, "o gráfico está pronto" significa apenas "compilou".
 *
 * Usa o MESMO `optionCascata`/`optionTendencia` que o componente usa; o que o
 * script faz de diferente é passar as cores já resolvidas (no navegador quem
 * resolve é o `echarts-theme`, lendo tokens do DOM).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as echarts from 'echarts'
import { montarCascata } from '../src/features/time/balance-waterfall.ts'
import {
  optionCascata,
  optionTendencia,
  type CoresDoGrafico,
} from '../src/features/time/balance-chart-options.ts'

const HORA = 3600

/** As cores validadas pelo script da skill (ver `chartBalanceColors`). */
const claro: CoresDoGrafico = {
  credito: '#039855',
  divida: '#F04438',
  acento: '#ED732A',
  grade: 'rgba(11,11,12,0.08)',
  texto: 'rgba(11,11,12,0.70)',
  textoForte: 'rgba(11,11,12,0.70)',
  superficie: '#FFFFFF',
  neutro: 'rgba(11,11,12,0.40)',
  fonte: 'Inter, sans-serif',
}

const escuro: CoresDoGrafico = {
  ...claro,
  grade: 'rgba(230,238,250,0.14)',
  texto: 'rgba(240,243,247,0.58)',
  textoForte: 'rgba(240,243,247,0.78)',
  superficie: '#181B21',
  neutro: 'rgba(240,243,247,0.42)',
}

const dia = (day: string, workedH: number, targetH: number, holiday: string | null = null) => ({
  day,
  workedSec: Math.round(workedH * HORA),
  targetSec: Math.round(targetH * HORA),
  holiday,
})

/**
 * Setembro/2026 na conta real do Nicolas, que é o caso mais duro que a tela
 * tem hoje: um mês que começa com um ajuste enorme (o zeramento de +253h27) e
 * dois dias de trabalho depois dele.
 */
const setembro = montarCascata({
  saldoInicialSec: -205 * HORA - 27 * 60,
  dias: [
    dia('2026-09-01', 0, 4),
    dia('2026-09-02', 0, 4),
    dia('2026-09-03', 1.5, 4),
    dia('2026-09-04', 0, 4),
    dia('2026-09-05', 0, 4),
    dia('2026-09-06', 0, 4),
    dia('2026-09-07', 0, 0, 'Independência'),
    dia('2026-09-08', 2.1, 4),
    dia('2026-09-09', 0, 4),
    dia('2026-09-10', 3.2, 4),
    dia('2026-09-11', 0, 4),
    dia('2026-09-12', 0, 4),
    dia('2026-09-13', 0, 4),
    dia('2026-09-14', 5.62, 8),
    dia('2026-09-15', 3.32, 8),
  ],
  ajustes: [
    {
      id: 'a1',
      day: '2026-09-13',
      seconds: 253 * HORA + 27 * 60,
      reason: 'Início full time na EMMITEC: saldo anterior zerado',
      by: 'Nicolas',
    },
  ],
  hoje: '2026-09-15',
})

/** O caso que o Nicolas descreveu: 40h no banco, um dia de 7h contra meta de 8h. */
const exemploDoPedido = montarCascata({
  saldoInicialSec: 40 * HORA,
  dias: [
    dia('2026-10-01', 8, 8),
    dia('2026-10-02', 7, 8),
    dia('2026-10-03', 9.5, 8),
    dia('2026-10-05', 0, 8),
    dia('2026-10-06', 8, 8),
    dia('2026-10-07', 6, 8),
  ],
  ajustes: [],
  hoje: '2026-10-10',
})

const meses = [
  { month: '2026-07', from: '2026-07-20', to: '2026-07-31', workedSec: 9 * HORA, targetSec: 80 * HORA, adjustmentSec: 0, balanceSec: -71 * HORA, cumulativeSec: -71 * HORA, adjustments: [] },
  { month: '2026-08', from: '2026-08-01', to: '2026-08-31', workedSec: 21.6 * HORA, targetSec: 156 * HORA, adjustmentSec: 0, balanceSec: -134 * HORA, cumulativeSec: -205 * HORA, adjustments: [] },
  { month: '2026-09', from: '2026-09-01', to: '2026-09-15', workedSec: 8.9 * HORA, targetSec: 64 * HORA, adjustmentSec: 253 * HORA, balanceSec: 198 * HORA, cumulativeSec: -7 * HORA, adjustments: [] },
]

const destaque = (barras: typeof setembro.barras) =>
  barras.reduce<(typeof barras)[number] | null>(
    (alvo, b) => (!alvo || Math.abs(b.deltaSec) > Math.abs(alvo.deltaSec) ? b : alvo),
    null,
  )

function render(option: Record<string, unknown>, largura: number, altura: number, fundo: string) {
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: largura,
    height: altura,
  })
  chart.setOption({ ...option, animation: false, backgroundColor: fundo })
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}

const saida = resolve(process.argv[2] ?? './chart-preview')
mkdirSync(dirname(resolve(saida, 'x')), { recursive: true })

const trabalhos: [string, string][] = [
  [
    'cascata-setembro-claro.svg',
    render(
      optionCascata({ barras: setembro.barras, destaque: destaque(setembro.barras), cores: claro }),
      820,
      300,
      claro.superficie,
    ),
  ],
  [
    'cascata-setembro-escuro.svg',
    render(
      optionCascata({ barras: setembro.barras, destaque: destaque(setembro.barras), cores: escuro }),
      820,
      300,
      escuro.superficie,
    ),
  ],
  [
    'cascata-exemplo-40h.svg',
    render(
      optionCascata({
        barras: exemploDoPedido.barras,
        destaque: destaque(exemploDoPedido.barras),
        cores: claro,
      }),
      620,
      300,
      claro.superficie,
    ),
  ],
  [
    'cascata-estreita-390px.svg',
    render(
      optionCascata({ barras: setembro.barras, destaque: destaque(setembro.barras), cores: claro }),
      390,
      280,
      claro.superficie,
    ),
  ],
  [
    'tendencia-claro.svg',
    render(
      optionTendencia({
        meses,
        rotulos: ['jul/26', 'ago/26', 'set/26'],
        cores: claro,
      }),
      620,
      200,
      claro.superficie,
    ),
  ],
]

for (const [nome, svg] of trabalhos) {
  const caminho = resolve(saida, nome)
  writeFileSync(caminho, svg, 'utf8')
  console.log(`  ${nome}  (${(svg.length / 1024).toFixed(0)} KB)`)
}

console.log(`\n${trabalhos.length} arquivos em ${saida}`)
