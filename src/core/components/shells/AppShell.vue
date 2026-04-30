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

const bare = computed(
  () =>
    route.name === 'login' ||
    route.name === 'download' ||
    route.name === 'bug-report',
)

const ActiveShell = computed(() => {
  if (shell.value === 'focus') return FocusShell
  if (shell.value === 'canvas') return CanvasShell
  return CommandShell
})

const paletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const openPalette = () => paletteRef.value?.open()
</script>

<template>
  <div v-if="bare" class="app-shell-bare">
    <slot />
  </div>
  <div v-else class="app-shell-root">
    <component :is="ActiveShell" @open-command-palette="openPalette">
      <slot />
    </component>
    <CommandPalette ref="paletteRef" />
  </div>
</template>

<style scoped>
.app-shell-root,
.app-shell-bare {
  display: contents;
}
</style>
