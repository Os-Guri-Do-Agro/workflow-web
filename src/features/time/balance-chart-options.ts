import type { BarraDoSaldo } from './balance-waterfall'
import { comSinal, palavraDoSaldo } from './balance-waterfall'
import type { StatementMonth } from '@/service/time/time-service'

/**
 * As options dos gráficos do banco de horas, fora dos componentes.
 *
 * Fica separado por um motivo prático: `resolveCssColor` lê o DOM, então uma
 * option montada dentro do `.vue` só existe dentro do navegador — e aí a única
 * forma de conferir o desenho é abrir a tela e olhar no olho. Recebendo as cores
 * já resolvidas, a mesma função roda em Node e rende um SVG/PNG que dá para
 * inspecionar de verdade (`scripts/render-balance-charts.ts`).
 *
 * Quem resolve token continua sendo o componente. Este módulo não sabe o que é
 * tema; ele só desenha.
 */

/** As cores que o gráfico precisa, já resolvidas para hex/rgb. */
export interface CoresDoGrafico {
  credito: string
  divida: string
  acento: string
  grade: string
  texto: string
  textoForte: string
  superficie: string
  neutro: string
  fonte: string
}

/** Duração legível, sem sinal (ex.: `8h00`). Usada nos textos do tooltip. */
function duracao(sec: number): string {
  const s = Math.abs(sec)
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

/** Aplica alpha a um hex de 6 dígitos (o suficiente para o que usamos aqui). */
function comAlpha(cor: string, alpha: number): string {
  if (/^#[0-9a-f]{6}$/i.test(cor)) {
    return cor + Math.round(alpha * 255).toString(16).padStart(2, '0')
  }
  return cor
}

/** O texto do tooltip de uma barra: é onde a regra do dia é dita por extenso. */
export function tooltipDaBarra(b: BarraDoSaldo): string {
  const linhas: string[] = [`<strong>${b.label}</strong>`]

  if (b.tipo === 'sem-meta') {
    linhas.push(
      b.holiday
        ? `${b.holiday}: sem meta, e as ${duracao(b.workedSec)} viraram crédito`
        : `Dia sem meta: as ${duracao(b.workedSec)} viraram crédito`,
    )
  } else if (b.tipo === 'sem-registro') {
    linhas.push(`Sem apontamento. A meta de ${duracao(b.targetSec)} ficou devendo`)
  } else {
    linhas.push(`Trabalhado ${duracao(b.workedSec)} de uma meta de ${duracao(b.targetSec)}`)
  }

  linhas.push(
    `<strong>${comSinal(b.deltaSec)}</strong> ${b.deltaSec >= 0 ? 'no banco' : 'do banco'}`,
  )
  linhas.push(`Saldo depois: ${comSinal(b.saldoSec)} ${palavraDoSaldo(b.saldoSec)}`)
  if (b.emAndamento) linhas.push('<em>hoje ainda está correndo</em>')

  return linhas.join('<br>')
}

/**
 * A cascata: cada barra flutua na altura do saldo e tem a altura do delta do
 * dia. Duas leituras, mesma unidade, um eixo só.
 */
export function optionCascata(opts: {
  barras: BarraDoSaldo[]
  cores: CoresDoGrafico
  /** A barra que ganha rótulo fixo (a que mais mexeu no saldo). */
  destaque: BarraDoSaldo | null
  /** Tooltip do ECharts, já com as cores do produto. */
  tooltipBase?: Record<string, unknown>
}): Record<string, unknown> {
  const { barras, cores, destaque, tooltipBase = {} } = opts

  // O trecho invisível que empurra a barra até a altura do saldo corrente.
  const apoio = barras.map((b) => Math.min(b.base, b.saldoSec) / 3600)

  const marcas = barras.map((b) => {
    const positivo = b.deltaSec >= 0
    const emDia = b.deltaSec === 0
    const ehDestaque =
      !!destaque && b.day === destaque.day && b.tipo === destaque.tipo
    // Dia que cumpriu a meta exata não é crédito nem dívida: é "nada mudou", e
    // pintá-lo de verde ou vermelho inventaria um sinal que o dado não tem.
    const base = emDia ? cores.neutro : positivo ? cores.credito : cores.divida

    return {
      value: Math.abs(b.deltaSec) / 3600,
      itemStyle: {
        color: base,
        // Arredonda a PONTA do dado, nunca a base: crédito arredonda em cima,
        // dívida embaixo. A forma passa a repetir a direção do valor.
        borderRadius: positivo ? [4, 4, 0, 0] : [0, 0, 4, 4],
      },
      // O rótulo é POR ITEM porque `label.position` da série não aceita
      // função: fixo em 'top', ele pousava no ponto de PARTIDA de uma barra
      // que desce e ficava por cima dela. Aqui cada barra diz para que lado o
      // seu rótulo vai — o lado em que o dia terminou.
      label: ehDestaque
        ? { show: true, position: positivo ? 'top' : 'bottom' }
        : { show: false },
    }
  })

  return {
    animationDuration: 420,
    backgroundColor: 'transparent',
    grid: { top: 26, right: 12, bottom: 28, left: 54 },
    textStyle: { fontFamily: cores.fonte },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const lista = params as { dataIndex: number }[]
        const b = barras[lista?.[0]?.dataIndex ?? -1]
        return b ? tooltipDaBarra(b) : ''
      },
    },
    xAxis: {
      type: 'category',
      data: barras.map((b) => b.label),
      axisLabel: { color: cores.texto, fontSize: 11, fontFamily: cores.fonte },
      axisLine: { lineStyle: { color: cores.grade } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'horas',
      nameTextStyle: { color: cores.texto, fontSize: 10, fontFamily: cores.fonte },
      // A janela segue os dados, e não o zero.
      //
      // Sem isto, a barra de apoio (empilhada a partir do zero) obrigava um
      // saldo de 40h a desenhar o eixo de 0 a 50: metade do gráfico vazia e o
      // dia de −1h reduzido a um risco. `scale` deixa o ECharts escolher os
      // limites pelos dados E arredondar os ticks — fixar min/max na mão dava
      // rótulos colados (um "+29h" encostado no "+30h").
      scale: true,
      axisLabel: {
        color: cores.texto,
        fontSize: 11,
        fontFamily: cores.fonte,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}h`,
      },
      // Hairline sólida, um passo fora da superfície: orienta e some.
      splitLine: { lineStyle: { color: cores.grade, width: 1, type: 'solid' } },
    },
    series: [
      {
        type: 'bar',
        stack: 'saldo',
        silent: true,
        itemStyle: { color: 'transparent' },
        emphasis: { itemStyle: { color: 'transparent' } },
        data: apoio,
        barMaxWidth: 24,
      },
      {
        type: 'bar',
        stack: 'saldo',
        // `samesign` (o default do ECharts) descarta a base quando ela tem
        // sinal contrário ao valor: com saldo negativo, toda marca positiva
        // voltava a nascer no zero e a cascata deixava de flutuar — o gráfico
        // virava uma fileira de traços colados na linha do zero. Foi visto
        // renderizando setembro real, onde o saldo é negativo o mês inteiro.
        stackStrategy: 'all',
        data: marcas,
        barMaxWidth: 24,
        // Rótulo SELETIVO: só no dia que mais mexeu. Número em cima de toda
        // barra vira ruído e ninguém lê.
        // Altura mínima em PIXELS: sem isto, um dia que cumpriu a meta exata
        // (delta zero) simplesmente não é desenhado, e o gráfico fica com um
        // buraco que lê como "faltou dado" em vez de "nada mudou".
        barMinHeight: 3,
        // Rótulo SELETIVO: só o dia que mais mexeu no saldo ganha número fixo
        // (quem liga o `show` é cada item). Um valor em cima de toda barra é
        // ruído e ninguém lê.
        label: {
          color: cores.textoForte,
          fontFamily: cores.fonte,
          fontSize: 11,
          distance: 6,
          formatter: (p: { dataIndex: number }) => {
            const b = barras[p.dataIndex]
            return b ? comSinal(b.deltaSec) : ''
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: cores.neutro, width: 1, type: 'dashed' },
          label: { show: false },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  }
}

/** A curva do acumulado: uma série só, sem legenda (o título já a nomeia). */
export function optionTendencia(opts: {
  meses: StatementMonth[]
  rotulos: string[]
  cores: CoresDoGrafico
  tooltipBase?: Record<string, unknown>
}): Record<string, unknown> {
  const { meses, rotulos, cores, tooltipBase = {} } = opts

  return {
    animationDuration: 420,
    backgroundColor: 'transparent',
    grid: { top: 20, right: 14, bottom: 26, left: 54 },
    textStyle: { fontFamily: cores.fonte },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      formatter: (params: unknown) => {
        const lista = params as { dataIndex: number }[]
        const indice = lista?.[0]?.dataIndex ?? -1
        const m = meses[indice]
        if (!m) return ''
        return [
          `<strong>${rotulos[indice] ?? ''}</strong>`,
          `No mês: ${comSinal(m.balanceSec)}`,
          `Acumulado: <strong>${comSinal(m.cumulativeSec)}</strong> ${palavraDoSaldo(m.cumulativeSec)}`,
        ].join('<br>')
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: rotulos,
      axisLabel: {
        color: cores.texto,
        fontSize: 11,
        fontFamily: cores.fonte,
        // Sem `boundaryGap` o primeiro e o último ponto ficam na borda do grid,
        // e um rótulo centrado neles é cortado pela moldura ("set/26" virava
        // "set/2"). Encostar os extremos para dentro resolve sem roubar largura.
        alignMinLabel: 'left',
        alignMaxLabel: 'right',
      },
      axisLine: { lineStyle: { color: cores.grade } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: cores.texto,
        fontSize: 11,
        fontFamily: cores.fonte,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}h`,
      },
      splitLine: { lineStyle: { color: cores.grade, width: 1, type: 'solid' } },
    },
    series: [
      {
        type: 'line',
        data: meses.map((m) => Number((m.cumulativeSec / 3600).toFixed(2))),
        smooth: false,
        lineStyle: { width: 2, color: cores.acento, cap: 'round', join: 'round' },
        itemStyle: {
          color: cores.acento,
          // Anel na cor da superfície: mantém o ponto legível onde ele cruza a
          // linha, e ele é parte da área de toque.
          borderColor: cores.superficie,
          borderWidth: 2,
        },
        symbolSize: 9,
        // Wash, nunca bloco saturado.
        areaStyle: { color: comAlpha(cores.acento, 0.1) },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: cores.neutro, width: 1, type: 'dashed' },
          label: {
            show: true,
            formatter: 'zero',
            // No fim da linha (o default) o texto cai fora do grid e é cortado;
            // e é justamente onde o último ponto mora. No começo, por dentro,
            // ele fica num canto que o dado não ocupa.
            position: 'insideStartBottom',
            color: cores.texto,
            fontSize: 10,
            fontFamily: cores.fonte,
          },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  }
}
