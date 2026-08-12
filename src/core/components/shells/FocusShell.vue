<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Columns3,
  Milestone,
  KeyRound,
  Users,
  StickyNote,
  CalendarDays,
  Settings,
  ListTodo,
  ChevronRight,
  BarChart3,
  CalendarRange,
  Paintbrush,
  Bug,
  HardDrive,
  QrCode,
  ScanText,
  Timer,
  Plug,
} from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import BrandMark from './shared/BrandMark.vue'
import CompanySwitcher from './shared/CompanySwitcher.vue'
import UserMenu from './shared/UserMenu.vue'
import CmdKButton from './shared/CmdKButton.vue'
import ThemeToggle from './shared/ThemeToggle.vue'
import XpToggle from './shared/XpToggle.vue'
import InboxBell from './shared/InboxBell.vue'
import TimerWidget from './shared/TimerWidget.vue'
import HelpButton from './shared/HelpButton.vue'
import { useNavQuarters } from '@/composables/useNavQuarters'
import { CANVAS_ENABLED } from '@/config/feature-flags'
import { useIsAdminAnywhere } from '@/composables/useIsAdminAnywhere'

defineEmits<{
  'open-command-palette': []
}>()

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()
const isAdminAnywhere = useIsAdminAnywhere()

const { quarters, firstMonth } = useNavQuarters()

// Mesma regra de papel do NavList: sem isso o rail oferecia "Usuários" para
// quem não é ADMIN e a rota barrava depois, virando beco sem saída.
const ROLE_RANK: Record<string, number> = { WORKER: 0, ADMIN: 1 }

function userMeetsRole(required?: 'WORKER' | 'ADMIN'): boolean {
  if (!required) return true
  const active = workspace.activeRole
  if (!active) return false
  return (ROLE_RANK[active] ?? -1) >= (ROLE_RANK[required] ?? -1)
}

type RailItem = {
  to: string
  icon: Component
  label: string
  role?: 'WORKER' | 'ADMIN'
  section: 'Trabalho' | 'Pessoal' | 'Ferramentas'
}

/**
 * Espelha a navegação do CommandShell (shared/NavList.vue). Trocar de shell é
 * preferência visual, não deve esconder features: Bug reports, QR Codes e Meu
 * tempo existiam só lá e sumiam para quem usa o Focus.
 */
const railItems = computed<RailItem[]>(() => {
  const items: RailItem[] = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', section: 'Trabalho' },
    { to: '/board', icon: Columns3, label: 'Board', section: 'Trabalho' },
    // Canvas escondido via feature flag (ver feature-flags.ts).
    ...(CANVAS_ENABLED
      ? [{ to: '/boards', icon: Paintbrush, label: 'Canvas', section: 'Trabalho' as const }]
      : []),
    { to: '/roadmap', icon: Milestone, label: 'Roadmap', section: 'Trabalho' },
    { to: '/drive', icon: HardDrive, label: 'Drive', section: 'Trabalho' },
    { to: '/bug-reports', icon: Bug, label: 'Bug reports', role: 'WORKER', section: 'Trabalho' },
  ]
  if (firstMonth.value) {
    items.push({
      to: `/tasks/${firstMonth.value.id}`,
      icon: ListTodo,
      label: 'Tarefas',
      section: 'Trabalho',
    })
  }
  items.push(
    { to: '/variables', icon: KeyRound, label: 'Variáveis', section: 'Trabalho' },
    { to: '/company-users', icon: Users, label: 'Usuários', role: 'ADMIN', section: 'Trabalho' },
    { to: '/time', icon: Timer, label: 'Meu tempo', section: 'Pessoal' },
    { to: '/notes', icon: StickyNote, label: 'Notas', section: 'Pessoal' },
    { to: '/calendar', icon: CalendarDays, label: 'Calendário', section: 'Pessoal' },
    // Ferramentas de integração por último, espelhando o NavList do CommandShell.
    { to: '/qr', icon: QrCode, label: 'QR Codes', section: 'Ferramentas' },
    { to: '/ocr', icon: ScanText, label: 'OCR Digital', section: 'Ferramentas' },
  )
  // Tokens das ferramentas: só ADMIN de alguma empresa (página agregada).
  if (isAdminAnywhere.value) {
    items.push({
      to: '/public-access',
      icon: Plug,
      label: 'Acessos Públicos',
      section: 'Ferramentas',
    })
  }
  return items.filter((i) => userMeetsRole(i.role))
})

const workItems = computed(() => railItems.value.filter((i) => i.section === 'Trabalho'))
const personalItems = computed(() => railItems.value.filter((i) => i.section === 'Pessoal'))

const isActive = (to: string) => {
  if (to === '/dashboard') return route.path === '/' || route.path === '/dashboard'
  if (to.startsWith('/tasks/')) return route.path.startsWith('/tasks/') || route.path.startsWith('/relatorio/')
  return route.path === to || route.path.startsWith(to + '/')
}

const currentLabel = computed(() => {
  const active = railItems.value.find((i) => isActive(i.to))
  return active?.label || 'Forge'
})

const openQuarter = ref<string | null>(null)

watch(
  () => route.path,
  (p) => {
    if (!p.startsWith('/tasks/') && !p.startsWith('/relatorio/')) return
    const q = quarters.value.find(
      (qq) =>
        qq.months.some((m) => p === `/tasks/${m.id}`) ||
        p === `/relatorio/${qq.id}`,
    )
    if (q) openQuarter.value = q.id
  },
  { immediate: true },
)

const isMonthActive = (monthId: string) => route.path === `/tasks/${monthId}`
const isReportActive = (quarterId: string) => route.path === `/relatorio/${quarterId}`

const showTasks = computed(() =>
  route.path.startsWith('/tasks/') || route.path.startsWith('/relatorio/'),
)
</script>

<template>
  <div class="focus-shell">
    <!-- Rail -->
    <aside class="rail">
      <BrandMark class="rail-brand" />
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
        <!-- Tasks drill-down (when in /tasks or /relatorio) -->
        <template v-if="showTasks && quarters.length">
          <div class="eyebrow">
            <ListTodo :size="11" />
            Tarefas
          </div>
          <div class="tree">
            <div v-for="q in quarters" :key="q.id" class="tree-group">
              <button
                class="tree-head"
                :class="{ 'tree-head--open': openQuarter === q.id }"
                @click="openQuarter = openQuarter === q.id ? null : q.id"
              >
                <ChevronRight :size="11" class="tree-chev" />
                <span class="tree-q">{{ q.label }}</span>
                <span class="tree-q-meta">{{ q.monthsLabel }}</span>
              </button>
              <div v-if="openQuarter === q.id" class="tree-children">
                <button
                  class="tree-item"
                  :class="{ 'tree-item--active': isReportActive(q.id) }"
                  @click="router.push(`/relatorio/${q.id}`)"
                >
                  <BarChart3 :size="11" class="tree-icon" />
                  <span>Relatório {{ q.label }}</span>
                </button>
                <button
                  v-for="m in q.months"
                  :key="m.id"
                  class="tree-item"
                  :class="{ 'tree-item--active': isMonthActive(m.id) }"
                  @click="router.push(`/tasks/${m.id}`)"
                >
                  <CalendarRange :size="11" class="tree-icon" />
                  <span>{{ m.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Default atalhos: mesma fonte do rail, para as duas listas nunca divergirem -->
        <template v-else>
          <div class="eyebrow">Trabalho</div>
          <div class="quick-list">
            <button
              v-for="item in workItems"
              :key="item.to"
              class="quick-item"
              :class="{ 'quick-item--active': isActive(item.to) }"
              @click="router.push(item.to)"
            >
              <component :is="item.icon" :size="12" class="quick-icon" />
              <span class="quick-label">{{ item.label }}</span>
            </button>
          </div>

          <div class="eyebrow eyebrow--spaced">Pessoal</div>
          <div class="quick-list">
            <button
              v-for="item in personalItems"
              :key="item.to"
              class="quick-item"
              :class="{ 'quick-item--active': isActive(item.to) }"
              @click="router.push(item.to)"
            >
              <component :is="item.icon" :size="12" class="quick-icon" />
              <span class="quick-label">{{ item.label }}</span>
            </button>
          </div>
        </template>
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
        <HelpButton />
        <TimerWidget />
        <InboxBell />
        <XpToggle />
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

.rail-brand {
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
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

.quick-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.quick-item--active {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}

.quick-item--active .quick-icon {
  color: var(--text);
}

.quick-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.quick-label {
  flex: 1;
}

/* ── Tasks tree ── */
.tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-group {
  display: flex;
  flex-direction: column;
}

.tree-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  color: var(--text-2);
  transition: background var(--motion-fast) var(--motion-ease);
  text-align: left;
}

.tree-head:hover {
  background: var(--surface-2);
  color: var(--text);
}

.tree-chev {
  color: var(--text-4);
  transition: transform var(--motion-fast) var(--motion-ease);
  flex-shrink: 0;
}

.tree-head--open .tree-chev {
  transform: rotate(90deg);
  color: var(--text-2);
}

.tree-q {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.tree-q-meta {
  font-size: 10.5px;
  color: var(--text-4);
  margin-left: auto;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tree-children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 4px 12px;
  border-left: 1px solid var(--border);
  margin-left: 12px;
}

.tree-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-2);
  transition: background var(--motion-fast) var(--motion-ease);
  text-align: left;
  width: 100%;
}

.tree-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.tree-item--active {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}

.tree-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.tree-item--active .tree-icon {
  color: var(--text);
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

/* Altura mínima 56px, não 44px fixo: os botões do topo têm alvo de 44px
   (a11y 50+), e 44 de barra com 44 de botão deixava os ícones colados nas
   bordas, sem respiro vertical. */
.slim-top {
  min-height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 6px 16px;
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
