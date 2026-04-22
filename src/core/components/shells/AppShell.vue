<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import CommandShell from './CommandShell.vue'
import FocusShell from './FocusShell.vue'
import CanvasShell from './CanvasShell.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { useUiPreferences } from '@/composables/useUiPreferences'

const route = useRoute()
const { shell } = useUiPreferences()

const bare = computed(() => route.name === 'login' || route.name === 'download')

const ActiveShell = computed(() => {
  if (shell.value === 'focus') return FocusShell
  if (shell.value === 'canvas') return CanvasShell
  return CommandShell
})

const paletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const openPalette = () => paletteRef.value?.open()
</script>

<template>
  <template v-if="bare">
    <slot />
  </template>
  <template v-else>
    <component :is="ActiveShell" @open-command-palette="openPalette">
      <slot />
    </component>
    <CommandPalette ref="paletteRef" />
  </template>
</template>
