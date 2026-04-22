<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppShell from '@/core/components/shells/AppShell.vue'
import AppToast from '@/components/AppToast.vue'
</script>

<template>
  <v-app>
    <AppShell>
      <RouterView v-slot="{ Component, route }">
        <Transition name="route" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </AppShell>
    <AppToast />
  </v-app>
</template>

<style>
.route-enter-active {
  transition:
    opacity 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.route-leave-active {
  transition: opacity 120ms cubic-bezier(0.4, 0, 1, 1);
}

.route-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.route-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .route-enter-active,
  .route-leave-active {
    transition: opacity 80ms linear;
  }
  .route-enter-from,
  .route-leave-to {
    transform: none;
  }
}
</style>
