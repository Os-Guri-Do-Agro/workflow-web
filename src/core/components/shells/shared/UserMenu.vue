<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Settings, LogOut } from 'lucide-vue-next'
import { getUserToken } from '@/utils/authContent'

withDefaults(
  defineProps<{
    showName?: boolean
  }>(),
  { showName: true },
)

const router = useRouter()
const menu = ref(false)
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

const handleLogout = () => {
  localStorage.clear()
  router.push('/login')
}
</script>

<template>
  <v-menu v-model="menu" :close-on-content-click="true" location="bottom end">
    <template #activator="{ props }">
      <button v-bind="props" class="user-btn">
        <div class="user-avatar">{{ userInitials }}</div>
        <span v-if="showName" class="user-name">{{ firstName }}</span>
      </button>
    </template>
    <v-card class="user-menu-card" rounded="lg" min-width="200" elevation="0">
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
            <LogOut :size="15" class="menu-icon menu-icon--danger" />
          </template>
          <v-list-item-title class="menu-title menu-title--danger">Sair</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-menu>
</template>

<style scoped>
.user-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background var(--motion-fast) var(--motion-ease);
  font-family: inherit;
}

.user-btn:hover {
  background: var(--surface-2);
}

.user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-fg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.user-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
}

.user-menu-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-overlay) !important;
}

.menu-icon {
  color: var(--text-3);
  margin-right: 4px;
}

.menu-icon--danger {
  color: var(--err);
}

.menu-title {
  font-size: 12.5px;
  color: var(--text);
}

.menu-title--danger {
  color: var(--err);
}
</style>
