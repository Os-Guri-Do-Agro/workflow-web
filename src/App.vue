<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppShell from '@/core/components/shells/AppShell.vue'
import AppToast from '@/components/AppToast.vue'
</script>

<template>
  <v-app>
    <AppShell>
      <RouterView />
    </AppShell>
    <AppToast />
  </v-app>
</template>

<style>
/* Force Vuetify's app wrapper to inherit our theme tokens so theme changes
   propagate to every descendant, not just the body background. */
.v-application,
.v-application__wrap {
  background: var(--bg) !important;
  color: var(--text) !important;
}
</style>
