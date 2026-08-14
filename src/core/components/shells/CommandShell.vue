<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ChevronRight, FolderPlus } from 'lucide-vue-next'
import { useCompanyCreation } from '@/composables/useCompanyCreation'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import BrandMark from './shared/BrandMark.vue'
import CompanySwitcher from './shared/CompanySwitcher.vue'
import UserMenu from './shared/UserMenu.vue'
import CmdKButton from './shared/CmdKButton.vue'
import ThemeToggle from './shared/ThemeToggle.vue'
import XpToggle from './shared/XpToggle.vue'
import NavList from './shared/NavList.vue'
import InboxBell from './shared/InboxBell.vue'
import TimerWidget from './shared/TimerWidget.vue'
import HelpButton from './shared/HelpButton.vue'
import { CANVAS_ENABLED } from '@/config/feature-flags'

defineEmits<{
  'open-command-palette': []
}>()

const route = useRoute()
const { openCreateCompany } = useCompanyCreation()
const workspace = useWorkspaceStore()
// Só ADMIN cria empresa (regra do backend); WORKER veria um botão que sempre 403.
const canCreateCompany = computed(() => workspace.isAdmin)

const breadcrumbs = computed(() => {
  const path = route.path
  const routes: Record<string, string> = {
    '/': 'Dashboard',
    '/dashboard': 'Dashboard',
    '/board': 'Board',
    // Canvas: breadcrumb '/boards' só existe com a flag ligada (ver feature-flags.ts).
    ...(CANVAS_ENABLED ? { '/boards': 'Canvas' } : {}),
    '/roadmap': 'Roadmap',
    '/settings': 'Configurações',
    '/protecao': 'Proteção do cronômetro',
    '/variables': 'Variáveis',
    '/company-users': 'Usuários',
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
  if (CANVAS_ENABLED && path.startsWith('/boards/')) return ['Canvas', 'Board']
  if (path.startsWith('/notes/')) return ['Notas', 'Editor']
  return ['Forge']
})

// Glossário de jargão em PT-BR simples (acessibilidade 50+). Quando um crumb é
// um termo técnico, mostramos uma explicação amigável no tooltip (title).
const JARGON_GLOSSARY: Record<string, string> = {
  Board: 'Quadro de tarefas no estilo Kanban: organize o trabalho em colunas (a fazer, fazendo, feito).',
  Backlog: 'Lista de tudo o que ainda está por fazer, esperando para ser priorizado.',
  Sprint: 'Ciclo curto de trabalho (geralmente 1 a 2 semanas) com metas definidas.',
  Roadmap: 'Planejamento do que será entregue ao longo do tempo.',
}

function crumbTooltip(crumb: string): string | undefined {
  return JARGON_GLOSSARY[crumb]
}
</script>

<template>
  <div class="command-shell">
    <header class="topbar">
      <BrandMark />
      <CompanySwitcher variant="compact" />
      <div class="topbar-sep" />
      <div class="breadcrumbs">
        <template v-for="(crumb, i) in breadcrumbs" :key="i">
          <ChevronRight v-if="i > 0" :size="12" class="crumb-sep" />
          <span
            class="crumb"
            :class="{ 'crumb--active': i === breadcrumbs.length - 1, 'crumb--glossary': crumbTooltip(crumb) }"
            :title="crumbTooltip(crumb)"
          >
            {{ crumb }}
          </span>
        </template>
      </div>
      <div class="spacer" />
      <CmdKButton variant="full" @open="$emit('open-command-palette')" />
      <HelpButton />
      <TimerWidget />
      <InboxBell />
      <XpToggle />
      <ThemeToggle />
      <UserMenu />
    </header>

    <div class="body">
      <aside class="sidebar">
        <div class="sidebar-scroll">
          <NavList />
        </div>
        <div v-if="canCreateCompany" class="sidebar-footer">
          <button class="new-project-btn press" type="button" @click="openCreateCompany">
            <FolderPlus :size="15" class="new-project-icon" />
            <span>Começar outro projeto</span>
          </button>
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

/* Termo técnico com explicação no tooltip (acessibilidade 50+). */
.crumb--glossary {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  text-decoration-color: var(--text-4);
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

.new-project-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.new-project-btn:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.new-project-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
</style>
