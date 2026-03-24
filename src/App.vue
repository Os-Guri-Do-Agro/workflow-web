<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppBar from '@/core/components/AppBar.vue'
import NavigationDrawer from '@/core/components/NavigationDrawer.vue'
import CommandPalette from '@/components/CommandPalette.vue'

const drawer = ref(true)
const route = useRoute()
const isLoginPage = computed(() => route.name === 'login' )
const isDownloadPage = computed(() => route.name === 'download' )
const commandPaletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)

const openCommandPalette = () => {
  commandPaletteRef.value?.open()
}
</script>

<template>
  <v-app>
    <template v-if="!isLoginPage && !isDownloadPage">
      <NavigationDrawer v-model="drawer" />
      <AppBar v-model:drawer="drawer" @open-command-palette="openCommandPalette" />
      <CommandPalette ref="commandPaletteRef" />
    </template>
    <v-main>
      <RouterView />
    </v-main>
  </v-app>
</template>

<style scoped>
* {
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    'Open Sans',
    'Helvetica Neue',
    sans-serif;
}
</style>
