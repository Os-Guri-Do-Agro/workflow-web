<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Columns3,
  Ticket,
  KeyRound,
  Users,
  StickyNote,
  CalendarDays,
  Settings,
  Sparkles,
  Bell,
} from 'lucide-vue-next'
import CompanySwitcher from './shared/CompanySwitcher.vue'
import UserMenu from './shared/UserMenu.vue'
import CmdKButton from './shared/CmdKButton.vue'
import ThemeToggle from './shared/ThemeToggle.vue'

defineEmits<{
  'open-command-palette': []
}>()

const route = useRoute()
const router = useRouter()

const railItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/board', icon: Columns3, label: 'Board' },
  { to: '/tickets', icon: Ticket, label: 'Tickets' },
  { to: '/variables', icon: KeyRound, label: 'Variáveis' },
  { to: '/notes', icon: StickyNote, label: 'Notas' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendário' },
  { to: '/company-users', icon: Users, label: 'Usuários' },
]

const isActive = (to: string) => {
  if (to === '/dashboard') return route.path === '/' || route.path === '/dashboard'
  return route.path === to || route.path.startsWith(to + '/')
}

const currentLabel = computed(() => {
  const active = railItems.find((i) => isActive(i.to))
  return active?.label || 'Forge'
})
</script>

<template>
  <div class="focus-shell">
    <!-- Rail -->
    <aside class="rail">
      <div class="rail-logo">w.</div>
      <nav class="rail-nav">
        <button
          v-for="item in railItems"
          :key="item.to"
          class="rail-btn"
          :class="{ 'rail-btn--active': isActive(item.to) }"
          :title="item.label"
          @click="router.push(item.to)"
        >
          <component :is="item.icon" :size="16" />
          <span v-if="isActive(item.to)" class="rail-indicator" />
        </button>
      </nav>
      <div class="rail-footer">
        <button class="rail-btn" title="Configurações" @click="router.push('/settings')">
          <Settings :size="16" />
        </button>
        <UserMenu :show-name="false" />
      </div>
    </aside>

    <!-- Context column -->
    <aside class="context">
      <div class="context-header">
        <CompanySwitcher variant="full" />
      </div>
      <div class="context-scroll">
        <div class="eyebrow">Visão rápida</div>
        <div class="quick-list">
          <button class="quick-item" @click="router.push('/dashboard')">
            <Sparkles :size="12" class="quick-icon" />
            <span class="quick-label">Hoje</span>
            <span class="quick-count">12</span>
          </button>
          <button class="quick-item" @click="router.push('/board')">
            <Columns3 :size="12" class="quick-icon" />
            <span class="quick-label">Em andamento</span>
            <span class="quick-count">8</span>
          </button>
          <button class="quick-item" @click="router.push('/tickets')">
            <Ticket :size="12" class="quick-icon" />
            <span class="quick-label">Tickets abertos</span>
            <span class="quick-count">3</span>
          </button>
        </div>

        <div class="eyebrow eyebrow--spaced">Atalhos</div>
        <div class="quick-list">
          <button class="quick-item" @click="router.push('/variables')">
            <KeyRound :size="12" class="quick-icon" />
            <span class="quick-label">Variáveis</span>
          </button>
          <button class="quick-item" @click="router.push('/notes')">
            <StickyNote :size="12" class="quick-icon" />
            <span class="quick-label">Notas</span>
          </button>
          <button class="quick-item" @click="router.push('/calendar')">
            <CalendarDays :size="12" class="quick-icon" />
            <span class="quick-label">Calendário</span>
          </button>
        </div>
      </div>
      <div class="context-footer">
        <CmdKButton variant="compact" placeholder="Buscar…" @open="$emit('open-command-palette')" />
      </div>
    </aside>

    <!-- Main -->
    <main class="main">
      <header class="slim-top">
        <span class="slim-label">{{ currentLabel }}</span>
        <div class="spacer" />
        <button class="slim-btn" title="Notificações">
          <Bell :size="14" />
        </button>
        <ThemeToggle />
      </header>
      <div class="main-scroll">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.focus-shell {
  display: grid;
  grid-template-columns: 56px 240px 1fr;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

.rail {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  gap: 6px;
}

.rail-logo {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 13px;
  margin-bottom: 6px;
}

.rail-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  margin-top: 4px;
}

.rail-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
  font-family: inherit;
}

.rail-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.rail-btn--active {
  background: var(--surface-2);
  color: var(--text);
}

.rail-indicator {
  position: absolute;
  left: -10px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  border-radius: 2px;
  background: var(--text);
}

.rail-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.context {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.context-header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.context-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-4);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 8px 6px;
}

.eyebrow--spaced {
  padding-top: 14px;
}

.quick-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quick-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background var(--motion-fast) var(--motion-ease);
}

.quick-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.quick-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.quick-label {
  flex: 1;
}

.quick-count {
  font-size: 10.5px;
  color: var(--text-4);
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.context-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg);
}

.slim-top {
  height: 44px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 10px;
}

.slim-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.spacer {
  flex: 1;
}

.slim-btn {
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-2);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--motion-ease);
  font-family: inherit;
}

.slim-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.main-scroll {
  flex: 1;
  overflow-y: auto;
}
</style>
