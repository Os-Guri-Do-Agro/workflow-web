<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  metrics?: any
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
  <v-chart :option="option" style="width: 100%; height: 300px" />
</template>
