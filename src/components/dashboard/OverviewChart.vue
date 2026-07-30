<script setup lang="ts">
import { computed } from 'vue'
// Import local, e não componente global registrado no `main.ts`: o registro
// global fazia o echarts (536 KB) entrar no chunk de entrada e ser baixado por
// quem abre a tela de login. É o mesmo padrão que `HeroSection` e `StatsRow` já
// usavam; este era o único arquivo que dependia do registro global.
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components'

use([CanvasRenderer, PieChart, TitleComponent, TooltipComponent, LegendComponent])

/** Só o que o gráfico realmente lê da resposta de métricas. */
interface OverviewMetrics {
  status?: {
    todo?: number
    inProgress?: number
    inTesting?: number
    completed?: number
  }
}

const props = defineProps<{
  metrics?: OverviewMetrics
}>()

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
  },
  legend: {
    top: '5%',
    left: 'center',
    type: 'scroll',
    orient: 'horizontal',
  },
  series: [
    {
      name: 'Status',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      padAngle: 1,
      itemStyle: {
        borderRadius: 5,
      },
      label: {
        show: false,
        position: 'center',
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 20,
          fontWeight: 'bold',
        },
      },
      labelLine: {
        show: false,
      },
      data: [
        { value: props.metrics?.status?.todo || 0, name: 'A Fazer' },
        { value: props.metrics?.status?.inProgress || 0, name: 'Em Andamento' },
        { value: props.metrics?.status?.inTesting || 0, name: 'Em Teste' },
        { value: props.metrics?.status?.completed || 0, name: 'Concluída' },
      ],
    },
  ],
}))
</script>

<template>
  <VChart :option="option" style="width: 100%; height: 300px" />
</template>
