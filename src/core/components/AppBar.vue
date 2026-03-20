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
  'open-command-palette': []
}>()

const theme = useTheme()
const route = useRoute()
const router = useRouter()
const userMenu = ref(false)
const user = getUserToken()

const userInitials = computed(() => {
  const name = user?.name || ''
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
})

const firstName = computed(() => user?.name?.split(' ')[0] || '')

const toggleTheme = () => {
  theme.global.name.value = theme.global.name.value === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', theme.global.name.value)
}

const handleLogout = () => {
  localStorage.clear()
  router.push('/login')
}

const breadcrumbs = computed(() => {
  const path = route.path
  const routes: Record<string, { title: string; parent?: string }> = {
    '/': { title: 'Dashboard' },
    '/settings': { title: 'Configurações' },
    '/variables': { title: 'Variáveis' },
    '/company-users': { title: 'Usuários / Empresas' },
    '/tickets': { title: 'Tickets' },
  }

  const current = routes[path]
  if (current) return [{ title: current.title }]

  if (path.startsWith('/tasks/')) {
    const parts = path.split('/')
    const items = [{ title: 'Tarefas' }]
    if (parts[2]) items.push({ title: 'Mês' })
    if (parts[3]) items.push({ title: 'Detalhes' })
    return items
  }

  if (path.startsWith('/relatorio/')) {
    return [{ title: 'Tarefas' }, { title: 'Relatório' }]
  }

  return [{ title: 'Forge' }]
})

const isMac = navigator.platform.toUpperCase().includes('MAC')
const shortcutLabel = isMac ? '⌘ K' : 'Ctrl K'
</script>

<template>
  <v-app-bar elevation="0" color="primary" height="48" class="app-bar-custom">
    <v-btn icon size="small" variant="text" @click="emit('update:drawer', !drawer)">
      <v-icon size="18" color="secondary">mdi-menu</v-icon>
    </v-btn>

    <v-breadcrumbs :items="breadcrumbs" class="pa-0 ml-1">
      <template #divider>
        <v-icon size="14" style="opacity: 0.3">mdi-chevron-right</v-icon>
      </template>
      <template #item="{ item }">
        <span class="breadcrumb-text">{{ item.title }}</span>
      </template>
    </v-breadcrumbs>

    <v-spacer />

    <!-- Search / Command palette trigger -->
    <button class="cmd-k-btn" @click="emit('open-command-palette')">
      <v-icon size="14" style="opacity: 0.45">mdi-magnify</v-icon>
      <span class="cmd-k-text">Buscar...</span>
      <kbd class="cmd-k-kbd">{{ shortcutLabel }}</kbd>
    </button>

    <!-- Theme toggle -->
    <v-btn icon size="small" variant="text" @click="toggleTheme" class="ml-1">
      <v-icon size="18" color="secondary" style="opacity: 0.6">
        {{ theme.global.name.value === 'light' ? 'mdi-moon-waning-crescent' : 'mdi-white-balance-sunny' }}
      </v-icon>
    </v-btn>

    <!-- User menu -->
    <v-menu v-model="userMenu" :close-on-content-click="true" location="bottom end">
      <template #activator="{ props }">
        <button v-bind="props" class="user-btn mr-3">
          <div class="user-avatar">{{ userInitials }}</div>
          <span class="user-name">{{ firstName }}</span>
        </button>
      </template>
      <v-card class="user-menu-card" rounded="lg" min-width="180">
        <v-list density="compact" class="py-1">
          <v-list-item
            density="compact"
            prepend-icon="mdi-cog-outline"
            title="Configurações"
            @click="router.push('/settings')"
          />
          <v-divider class="my-1" />
          <v-list-item
            density="compact"
            prepend-icon="mdi-logout"
            title="Sair"
            @click="handleLogout"
          />
        </v-list>
      </v-card>
    </v-menu>
  </v-app-bar>
</template>

<style scoped>
.app-bar-custom {
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08) !important;
}

.breadcrumb-text {
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.55);
}

/* ─── Cmd+K button ─── */
.cmd-k-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
  height: 32px;
  width: 300px;
  justify-content: space-between;
}

.cmd-k-btn:hover {
  border-color: rgba(var(--v-theme-secondary), 0.2);
  background: rgba(var(--v-theme-secondary), 0.09);
}

.cmd-k-text {
  font-size: 12.5px;
  color: rgba(var(--v-theme-secondary), 0.35);
  white-space: nowrap;
}

.cmd-k-kbd {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.3);
  background: rgba(var(--v-theme-secondary), 0.07);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  font-family: inherit;
  line-height: 1.4;
}

/* ─── User button ─── */
.user-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.12s ease;
}

.user-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.06);
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-primary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.user-name {
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.7);
}

.user-menu-card {
  background: rgb(var(--v-theme-primary)) !important;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1) !important;
}
</style>
