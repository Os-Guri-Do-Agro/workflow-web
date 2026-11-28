<script setup lang="ts">
/**
 * A curva do saldo acumulado, mês a mês (spec banco-de-horas-tela-explicavel).
 *
 * A cascata responde "o que aconteceu neste mês"; esta responde "para onde isso
 * está indo". São perguntas diferentes, e por isso são dois gráficos e não duas
 * séries no mesmo plot — dois eixos y no mesmo desenho alinhariam escalas de
 * forma arbitrária e inventariam uma correlação que não existe.
 *
 * Uma série só, então sem caixa de legenda: o título já diz o que está plotado,
 * e um quadradinho sozinho ao lado dele só restabeleceria o óbvio ocupando
 * espaço. A polaridade se lê pela posição em relação à linha do zero.
 */
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import {
  chartFontFamily,
  chartThemeDep,
  chartTooltip,
  resolveCssColor,
  withAlpha,
} from '@/plugins/echarts-theme'
import {
  chartBalanceColors,
} from '@/plugins/echarts-theme'
import { optionTendencia } from '@/features/time/balance-chart-options'
import type { StatementMonth } from '@/service/time/time-service'

// `MarkLineComponent`: sem ele a linha do zero (a referência que separa
// crédito de dívida) é descartada em silêncio pelo build modular.
use([CanvasRenderer, LineChart, GridComponent, MarkLineComponent, TooltipComponent])

const props = defineProps<{ months: StatementMonth[] }>()

const rotulos = computed(() =>
  props.months.map((m) => {
    const [ano = '', num = ''] = m.month.split('-')
    const nome = new Date(Number(ano), Number(num) - 1, 1).toLocaleDateString('pt-BR', {
      month: 'short',
    })
    return `${nome.replace('.', '')}/${ano.slice(2)}`
  }),
)

const option = computed(() => {
  void chartThemeDep()

  const cor = chartBalanceColors()

  return optionTendencia({
    meses: props.months,
    rotulos: rotulos.value,
    tooltipBase: chartTooltip(),
    cores: {
      credito: cor.credito,
      divida: cor.divida,
      // Acento do produto, e não uma cor de status: esta linha é uma
      // trajetória, não um julgamento de bom/ruim. Verde e vermelho ficam
      // reservados para o sinal do valor, na cascata.
      acento: resolveCssColor('var(--accent)'),
      grade: withAlpha('var(--border)', 0.9),
      texto: resolveCssColor('var(--text-3)'),
      textoForte: resolveCssColor('var(--text-2)'),
      superficie: resolveCssColor('var(--surface)'),
      neutro: withAlpha('var(--text-4)', 0.7),
      fonte: chartFontFamily(),
    },
  })
})
</script>

<template>
  <section v-if="months.length > 1" class="tr">
    <h4 class="tr-title">Saldo acumulado, mês a mês</h4>
    <VChart class="tr-chart" :option="option" autoresize />
  </section>
</template>

<style scoped>
.tr {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.tr-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
}

.tr-chart {
  height: 180px;
  width: 100%;
}
</style>
