<script setup lang="ts">
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

const route = useRoute()
const router = useRouter()
const userMenu = ref(false)
const user = getUserToken()

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
  const routes: Record<string, { title: string }> = {
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
  if (path.startsWith('/relatorio/')) return [{ title: 'Tarefas' }, { title: 'Relatório' }]
  return [{ title: 'Forge' }]
})

const isMac = navigator.platform.toUpperCase().includes('MAC')
const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K'
</script>

<template>
  <!-- Win2000 task-bar / app-bar -->
  <v-app-bar elevation="0" color="primary" height="30" class="win2k-appbar">
    <!-- Hamburger -->
    <button class="win-tb-btn" @click="emit('update:drawer', !drawer)" title="Menu">
      <v-icon size="15">mdi-menu</v-icon>
    </button>

    <!-- Breadcrumb path -->
    <div class="win-tb-path">
      <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
        <span v-if="idx > 0" class="win-tb-sep">›</span>
        <span class="win-tb-crumb">{{ crumb.title }}</span>
      </template>
    </div>

    <v-spacer />

    <!-- Search trigger -->
    <button class="win-tb-search" @click="emit('open-command-palette')" :title="shortcutLabel">
      <v-icon size="13">mdi-magnify</v-icon>
      <span>Localizar...</span>
      <kbd class="win-tb-kbd">{{ shortcutLabel }}</kbd>
    </button>

    <!-- User button -->
    <v-menu v-model="userMenu" :close-on-content-click="true" location="bottom end">
      <template #activator="{ props }">
        <button v-bind="props" class="win-tb-user">
          <div class="win-tb-avatar">{{ userInitials }}</div>
          <span class="win-tb-username">{{ firstName }}</span>
          <v-icon size="11">mdi-chevron-down</v-icon>
        </button>
      </template>
      <div class="win-dropdown">
        <div class="win-dropdown-title">
          <v-icon size="14" color="white">mdi-account</v-icon>
          {{ user?.name || 'Usuário' }}
        </div>
        <div class="win-dropdown-divider" />
        <button class="win-dropdown-item" @click="router.push('/settings')">
          <v-icon size="14">mdi-cog</v-icon>
          Configurações
        </button>
        <div class="win-dropdown-divider" />
        <button class="win-dropdown-item win-dropdown-item--danger" @click="handleLogout">
          <v-icon size="14">mdi-logout</v-icon>
          Sair
        </button>
      </div>
    </v-menu>
  </v-app-bar>
</template>

<style scoped>
/* ── Win2000 task-bar strip ── */
.win2k-appbar {
  background: #D4D0C8 !important;
  border-bottom: 2px solid #404040 !important;
  border-top: 2px solid #FFFFFF !important;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
  font-size: 11px;
  color: #000 !important;
}

/* shared raised button */
.win-tb-btn,
.win-tb-search,
.win-tb-user {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #D4D0C8;
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  padding: 1px 6px;
  height: 22px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  color: #000;
}
.win-tb-btn:active,
.win-tb-search:active,
.win-tb-user:active {
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
}

.win-tb-path {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
}
.win-tb-sep {
  color: #808080;
  font-size: 12px;
}
.win-tb-crumb {
  font-size: 11px;
  color: #000;
}

.win-tb-search {
  margin-right: 4px;
  min-width: 160px;
  justify-content: flex-start;
}
.win-tb-kbd {
  margin-left: auto;
  font-size: 9px;
  background: #FFFFFF;
  border: 1px solid #808080;
  padding: 0 3px;
  font-family: inherit;
}

.win-tb-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #000080;
  color: #FFFFFF;
  font-size: 9px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}
.win-tb-username {
  font-size: 11px;
  font-weight: bold;
}

/* ── Dropdown menu ── */
.win-dropdown {
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  min-width: 180px;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
  font-size: 11px;
  box-shadow: 2px 2px 0 #808080;
  z-index: 9999;
}
.win-dropdown-title {
  background: linear-gradient(to right, #000080, #1084D0);
  color: #FFFFFF;
  font-weight: bold;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.win-dropdown-divider {
  height: 1px;
  background: #808080;
  box-shadow: 0 1px 0 #FFFFFF;
  margin: 1px 0;
}
.win-dropdown-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 3px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  text-align: left;
  color: #000;
}
.win-dropdown-item:hover {
  background: #000080;
  color: #FFFFFF;
}
.win-dropdown-item--danger:hover {
  background: #800000;
}
</style>
