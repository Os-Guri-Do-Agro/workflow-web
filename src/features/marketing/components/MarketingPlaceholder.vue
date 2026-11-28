<script setup lang="ts">
import { Hammer } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'

/** Tela provisória de uma seção que a fase ainda não entregou. */
defineProps<{ title: string; phase: string }>()
</script>

<template>
  <EmptyState
    :icon="Hammer"
    :title="title"
    :description="`Esta parte da ala Marketing chega na fase ${phase}.`"
  />
</template>
