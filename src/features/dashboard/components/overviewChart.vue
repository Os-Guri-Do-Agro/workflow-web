<script setup lang="ts">
import { ref } from 'vue'

const option = ref({
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
      name: 'Access From',
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      padAngle: 5,
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
        { value: 12, name: 'Gustavo' },
        { value: 12, name: 'Nicolas' },
        { value: 10, name: 'Marcel' },
        { value: 9, name: 'Letícia' },
      ],
    },
  ],
})
</script>

<template>
  <v-chart :option="option" style="width: 100%; height: 300px" />
</template>
