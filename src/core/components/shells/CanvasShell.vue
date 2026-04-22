<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Columns3,
  Ticket,
  KeyRound,
  StickyNote,
  CalendarDays,
  Sparkles,
  Bell,
  Plus,
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

const tabs = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/board', icon: Columns3, label: 'Board' },
  { to: '/tickets', icon: Ticket, label: 'Tickets' },
  { to: '/variables', icon: KeyRound, label: 'Variáveis' },
  { to: '/notes', icon: StickyNote, label: 'Notas' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendário' },
]

const dockItems = [
  { to: '/dashboard', icon: LayoutDashboard },
  { to: '/board', icon: Columns3 },
  { to: '/variables', icon: KeyRound },
  { to: '/tickets', icon: Ticket },
  { to: '/notes', icon: StickyNote },
]

const isActive = (to: string) => {
  if (to === '/dashboard') return route.path === '/' || route.path === '/dashboard'
  return route.path === to || route.path.startsWith(to + '/')
}
</script>

<template>
  <div class="canvas-shell">
    <!-- Top nav -->
    <header class="topnav">
      <div class="topnav-inner">
        <div class="brand">
          <div class="logo-mark">w.</div>
          <CompanySwitcher variant="inline" />
        </div>

        <nav class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.to"
            class="tab"
            :class="{ 'tab--active': isActive(tab.to) }"
            @click="router.push(tab.to)"
          >
            <component :is="tab.icon" :size="14" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <div class="spacer" />

        <CmdKButton variant="full" placeholder="Buscar ou pular…" @open="$emit('open-command-palette')" />
        <button class="new-btn">
          <Plus :size="14" />
          <span>Novo</span>
        </button>
        <button class="icon-btn" title="Notificações">
          <Bell :size="14" />
          <span class="notification-dot" />
        </button>
        <ThemeToggle />
        <UserMenu :show-name="false" />
      </div>
    </header>

    <!-- Main -->
    <main class="main">
      <slot />
    </main>

    <!-- Floating dock -->
    <div class="dock">
      <button
        v-for="item in dockItems"
        :key="item.to"
        class="dock-btn"
        :class="{ 'dock-btn--active': isActive(item.to) }"
        @click="router.push(item.to)"
      >
        <component :is="item.icon" :size="15" />
      </button>
      <div class="dock-sep" />
      <button class="dock-btn dock-btn--accent" title="Assistente" @click="$emit('open-command-palette')">
        <Sparkles :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.canvas-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  position: relative;
  overflow: hidden;
}

.topnav {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 20px;
}

.topnav-inner {
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-mark {
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
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 12px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 7px;
  background: transparent;
  border: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tab:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.tab--active {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.new-btn:hover {
  opacity: 0.92;
}

.icon-btn {
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
  position: relative;
  font-family: inherit;
  transition: background var(--motion-fast) var(--motion-ease);
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.notification-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--err);
}

.main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.dock {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  z-index: 50;
}

.dock-btn {
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
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.dock-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dock-btn--active {
  background: var(--surface-2);
  color: var(--text);
}

.dock-btn--accent {
  background: var(--accent);
  color: var(--accent-fg);
}

.dock-btn--accent:hover {
  background: var(--accent);
  color: var(--accent-fg);
  opacity: 0.92;
}

.dock-sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}
</style>
