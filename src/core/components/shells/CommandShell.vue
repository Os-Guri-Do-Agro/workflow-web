<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, Sparkles } from 'lucide-vue-next'
import CompanySwitcher from './shared/CompanySwitcher.vue'
import UserMenu from './shared/UserMenu.vue'
import CmdKButton from './shared/CmdKButton.vue'
import ThemeToggle from './shared/ThemeToggle.vue'
import NavList from './shared/NavList.vue'

defineEmits<{
  'open-command-palette': []
}>()

const route = useRoute()

const breadcrumbs = computed(() => {
  const path = route.path
  const routes: Record<string, string> = {
    '/': 'Dashboard',
    '/dashboard': 'Dashboard',
    '/board': 'Board',
    '/settings': 'Configurações',
    '/variables': 'Variáveis',
    '/company-users': 'Usuários',
    '/tickets': 'Tickets',
    '/notes': 'Notas',
    '/calendar': 'Calendário',
  }
  if (routes[path]) return [routes[path]]
  if (path.startsWith('/tasks/')) {
    const parts = path.split('/')
    const items = ['Tarefas']
    if (parts[2]) items.push('Mês')
    if (parts[3]) items.push('Detalhes')
    return items
  }
  if (path.startsWith('/relatorio/')) return ['Tarefas', 'Relatório']
  if (path.startsWith('/notes/')) return ['Notas', 'Editor']
  return ['Forge']
})
</script>

<template>
  <div class="command-shell">
    <header class="topbar">
      <CompanySwitcher variant="compact" />
      <div class="topbar-sep" />
      <div class="breadcrumbs">
        <template v-for="(crumb, i) in breadcrumbs" :key="i">
          <ChevronRight v-if="i > 0" :size="12" class="crumb-sep" />
          <span class="crumb" :class="{ 'crumb--active': i === breadcrumbs.length - 1 }">
            {{ crumb }}
          </span>
        </template>
      </div>
      <div class="spacer" />
      <CmdKButton variant="full" @open="$emit('open-command-palette')" />
      <ThemeToggle />
      <UserMenu />
    </header>

    <div class="body">
      <aside class="sidebar">
        <div class="sidebar-scroll">
          <NavList />
        </div>
        <div class="sidebar-footer">
          <div class="plan-card">
            <div class="plan-head">
              <Sparkles :size="12" class="plan-spark" />
              <span class="plan-label">Plano Free</span>
            </div>
            <div class="plan-progress">
              <div class="plan-bar">
                <div class="plan-bar-fill" />
              </div>
              <span class="plan-meta">7 / 20 projetos</span>
            </div>
            <button class="plan-upgrade">Fazer upgrade →</button>
          </div>
        </div>
      </aside>

      <main class="main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.command-shell {
  display: grid;
  grid-template-rows: 56px 1fr;
  height: 100vh;
  color: var(--text);
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 2;
}

.topbar-sep {
  width: 1px;
  height: 22px;
  background: linear-gradient(to bottom, transparent, var(--border), transparent);
  margin: 0 2px;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  padding: 5px 10px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-2) 65%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.crumb-sep {
  color: var(--text-4);
  opacity: 0.5;
}

.crumb {
  color: var(--text-3);
  font-weight: 500;
}

.crumb--active {
  color: var(--text);
  font-weight: 600;
}

.spacer {
  flex: 1;
}

.body {
  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 0;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  min-height: 0;
}

.sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px 0;
  scrollbar-width: thin;
}

.sidebar-footer {
  border-top: 1px solid var(--border);
  padding: 12px;
}

.plan-card {
  padding: 12px 13px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.plan-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.plan-spark {
  color: var(--accent);
}

.plan-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-2);
}

.plan-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.plan-bar {
  flex: 1;
  height: 5px;
  background: var(--surface-3);
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}

.plan-bar-fill {
  width: 35%;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 30%, var(--text)));
  border-radius: 999px;
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
}

.plan-meta {
  font-size: 10.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.plan-upgrade {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  padding: 0;
  transition: color var(--motion-fast) var(--motion-ease);
}

.plan-upgrade:hover {
  color: var(--accent);
}

.main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
</style>
