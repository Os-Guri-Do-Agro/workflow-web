<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppBar from '@/core/components/AppBar.vue'
import NavigationDrawer from '@/core/components/NavigationDrawer.vue'

const drawer = ref(true)
const route = useRoute()
const isLoginPage = computed(() => route.name === 'login')
</script>

<template>
  <v-app>
    <template v-if="!isLoginPage">
      <NavigationDrawer v-model="drawer" />
      <AppBar v-model:drawer="drawer" />
    </template>
    <v-main>
      <RouterView />
    </v-main>
  </v-app>
</template>
