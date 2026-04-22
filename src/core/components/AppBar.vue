<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, ref } from 'vue'
import { Menu, ChevronRight, Search, Moon, Sun, Settings, LogOut } from 'lucide-vue-next'
import { getUserToken } from '@/utils/authContent'
import { useUiPreferences } from '@/composables/useUiPreferences'

defineProps<{
  drawer: boolean
}>()

const emit = defineEmits<{
  'update:drawer': [value: boolean]
  'open-command-palette': []
}>()

const route = useRoute()
const router = useRouter()
const userMenu = ref(false)
const user = getUserToken()
const { theme, toggleTheme } = useUiPreferences()

const userInitials = computed(() => {
  const name = user?.name || ''
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
})

const firstName = computed(() => user?.name?.split(' ')[0] || '')

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
      <Menu :size="18" class="bar-icon" />
    </v-btn>

    <v-breadcrumbs :items="breadcrumbs" class="pa-0 ml-1">
      <template #divider>
        <ChevronRight :size="14" class="breadcrumb-divider" />
      </template>
      <template #item="{ item }">
        <span class="breadcrumb-text">{{ item.title }}</span>
      </template>
    </v-breadcrumbs>

    <v-spacer />

    <!-- Search / Command palette trigger -->
    <button class="cmd-k-btn" @click="emit('open-command-palette')">
      <Search :size="14" class="cmd-k-icon" />
      <span class="cmd-k-text">Buscar...</span>
      <kbd class="cmd-k-kbd">{{ shortcutLabel }}</kbd>
    </button>

    <!-- Theme toggle -->
    <v-btn icon size="small" variant="text" @click="toggleTheme" class="ml-1">
      <component :is="theme === 'light' ? Moon : Sun" :size="18" class="theme-icon" />
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
          <v-list-item density="compact" @click="router.push('/settings')">
            <template #prepend>
              <Settings :size="15" class="menu-icon" />
            </template>
            <v-list-item-title class="menu-title">Configurações</v-list-item-title>
          </v-list-item>
          <v-divider class="my-1" />
          <v-list-item density="compact" @click="handleLogout">
            <template #prepend>
              <LogOut :size="15" class="menu-icon" />
            </template>
            <v-list-item-title class="menu-title">Sair</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card>
    </v-menu>
  </v-app-bar>
</template>

<style scoped>
.app-bar-custom {
  border-bottom: 1px solid var(--border) !important;
}

.bar-icon,
.theme-icon {
  color: var(--text-2);
}

.breadcrumb-divider {
  color: var(--text-4);
  opacity: 0.6;
}

.breadcrumb-text {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
}

/* ─── Cmd+K button ─── */
.cmd-k-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
  height: 32px;
  justify-content: space-between;
}

.cmd-k-btn:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.cmd-k-icon {
  color: var(--text-3);
}

.cmd-k-text {
  font-size: 12.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.cmd-k-kbd {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-3);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
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
  transition: background var(--motion-fast) var(--motion-ease);
}

.user-btn:hover {
  background: var(--surface-2);
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--text);
  color: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}

.user-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
}

.user-menu-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}

.menu-icon {
  color: var(--text-3);
  margin-right: 4px;
}

.menu-title {
  font-size: 12.5px;
  color: var(--text);
}
</style>
