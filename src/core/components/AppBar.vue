<script setup lang="ts">
import { useTheme } from 'vuetify'
import { useRoute, useRouter } from 'vue-router'
import { computed, ref } from 'vue'
import { getUserToken } from '@/utils/authContent'

defineProps<{
  drawer: boolean
}>()

const emit = defineEmits<{
  'update:drawer': [value: boolean]
}>()

const theme = useTheme()
const route = useRoute()
const router = useRouter()
const userMenu = ref(false)
const temaSalvo = localStorage.getItem('theme')
const user = getUserToken()

const userInitials = computed(() => {
  const name = user?.name || ''
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const firstName = computed(() => user?.name?.split(' ')[0] || '')

const toggleTheme = () => {
  theme.global.name.value = theme.global.name.value === 'light' ? 'dark' : 'light'

  localStorage.setItem('theme', theme.global.name.value)
}

const handleLogout = () => {
  window.location.href = '/login'
  userMenu.value = false
}

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    '/': 'Dashboard',
    '/tasks': 'Tarefas',
    '/settings': 'Configurações',
  }
  return titles[route.path] || 'Stack Roads'
})

const breadcrumbs = computed(() => {
  const path = route.path
  const routes: Record<string, { title: string; parent?: string }> = {
    '/': { title: 'Dashboard' },
    '/settings': { title: 'Configurações' },
    '/relatorio/q1': { title: 'Relatório Q1', parent: 'Q1 • Jan-Mar' },
    '/relatorio/q2': { title: 'Relatório Q2', parent: 'Q2 • Abr-Jun' },
    '/relatorio/q3': { title: 'Relatório Q3', parent: 'Q3 • Jul-Set' },
    '/relatorio/q4': { title: 'Relatório Q4', parent: 'Q4 • Out-Dez' },
    '/tasks/janeiro': { title: 'Janeiro', parent: 'Q1 • Jan-Mar' },
    '/tasks/fevereiro': { title: 'Fevereiro', parent: 'Q1 • Jan-Mar' },
    '/tasks/marco': { title: 'Março', parent: 'Q1 • Jan-Mar' },
    '/tasks/abril': { title: 'Abril', parent: 'Q2 • Abr-Jun' },
    '/tasks/maio': { title: 'Maio', parent: 'Q2 • Abr-Jun' },
    '/tasks/junho': { title: 'Junho', parent: 'Q2 • Abr-Jun' },
    '/tasks/julho': { title: 'Julho', parent: 'Q3 • Jul-Set' },
    '/tasks/agosto': { title: 'Agosto', parent: 'Q3 • Jul-Set' },
    '/tasks/setembro': { title: 'Setembro', parent: 'Q3 • Jul-Set' },
    '/tasks/outubro': { title: 'Outubro', parent: 'Q4 • Out-Dez' },
    '/tasks/novembro': { title: 'Novembro', parent: 'Q4 • Out-Dez' },
    '/tasks/dezembro': { title: 'Dezembro', parent: 'Q4 • Out-Dez' },
  }

  const current = routes[path]
  if (!current) return [{ title: pageTitle.value }]
  if (path === '/') return [{ title: 'Dashboard' }]
  if (path === '/settings') return [{ title: 'Configurações' }]

  const items = [{ title: 'Tarefas' }]
  if (current.parent) items.push({ title: current.parent })
  items.push({ title: current.title })

  return items
})
</script>

<template>
  <v-app-bar elevation="0" color="primary" border="b" height="56">
    <v-app-bar-nav-icon color="secondary" @click="emit('update:drawer', !drawer)" />

    <v-breadcrumbs :items="breadcrumbs" class="pa-0">
      <template v-slot:divider>
        <v-icon size="16" color="secondary-lighten-2">mdi-chevron-right</v-icon>
      </template>
      <template v-slot:item="{ item }">
        <span class="text-caption text-secondary">{{ item.title }}</span>
      </template>
    </v-breadcrumbs>

    <v-spacer />

    <v-btn icon variant="text" color="secondary" @click="toggleTheme">
      <v-icon size="20">{{
        theme.global.name.value === 'light' ? 'mdi-weather-night' : 'mdi-weather-sunny'
      }}</v-icon>
    </v-btn>

    <!-- <v-btn icon variant="text" color="secondary">
      <v-icon size="20">mdi-magnify</v-icon>
    </v-btn>

    <v-btn icon variant="text" color="secondary">
      <v-badge color="error" content="3" dot>
        <v-icon size="20">mdi-bell-outline</v-icon>
      </v-badge>
    </v-btn> -->

    <v-menu v-model="userMenu" :close-on-content-click="false" location="bottom end">
      <template v-slot:activator="{ props }">
        <v-btn variant="text" v-bind="props" class="d-flex align-center ga-2">
          <v-avatar size="30" color="secondary">
            <span style="font-size: 11px" class="font-weight-bold text-primary">{{
              userInitials
            }}</span>
          </v-avatar>
          <span class="text-secondary ml-1">{{ firstName }}</span>
        </v-btn>
      </template>

      <v-card min-width="200">
        <v-list>
          <v-list-item
            prepend-icon="mdi-cog"
            title="Configurações"
            @click="router.push('/settings')"
          />
          <v-divider />
          <v-list-item prepend-icon="mdi-logout" title="Sair" @click="handleLogout" />
        </v-list>
      </v-card>
    </v-menu>
  </v-app-bar>
</template>
