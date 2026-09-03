<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  Columns3,
  Milestone,
  Repeat,
  KeyRound,
  StickyNote,
  CalendarDays,
  Sparkles,
  Plus,
  ListTodo,
  BarChart3,
  CalendarRange,
  ChevronDown,
  Paintbrush,
  HardDrive,
  Link2,
  QrCode,
  ScanText,
  Plug,
} from 'lucide-vue-next'
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

const emit = defineEmits<{
  'open-command-palette': []
}>()

const route = useRoute()
const isAdminAnywhere = useIsAdminAnywhere()
const router = useRouter()

const { quarters, firstMonth } = useNavQuarters()

// Canvas (`/boards`) só aparece com a feature flag ligada (ver feature-flags.ts).
const tabs = computed(() => [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/board', icon: Columns3, label: 'Board' },
  ...(CANVAS_ENABLED ? [{ to: '/boards', icon: Paintbrush, label: 'Canvas' }] : []),
  { to: '/roadmap', icon: Milestone, label: 'Roadmap' },
  // Protótipo de tarefas recorrentes (dados fictícios).
  { to: '/recorrentes', icon: Repeat, label: 'Recorrentes' },
  { to: '/drive', icon: HardDrive, label: 'Drive' },
  { to: '/variables', icon: KeyRound, label: 'Variáveis' },
  { to: '/notes', icon: StickyNote, label: 'Notas' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendário' },
  // Ferramentas de integração por último (o Canvas não tem seções; a ordem diz).
  { to: '/qr', icon: QrCode, label: 'QR Codes' },
  { to: '/links', icon: Link2, label: 'Encurtador' },
  { to: '/ocr', icon: ScanText, label: 'OCR Digital' },
  // Tokens das ferramentas: só ADMIN de alguma empresa (página agregada).
  ...(isAdminAnywhere.value
    ? [{ to: '/public-access', icon: Plug, label: 'Acessos Públicos' }]
    : []),
])

const dockItems = computed(() => {
  const items: Array<{ to: string; icon: Component }> = [
    { to: '/dashboard', icon: LayoutDashboard },
    { to: '/board', icon: Columns3 },
    ...(CANVAS_ENABLED ? [{ to: '/boards', icon: Paintbrush }] : []),
    { to: '/roadmap', icon: Milestone },
  ]
  if (firstMonth.value) items.push({ to: `/tasks/${firstMonth.value.id}`, icon: ListTodo })
  items.push(
    { to: '/drive', icon: HardDrive },
    { to: '/variables', icon: KeyRound },
    { to: '/notes', icon: StickyNote },
  )
  return items
})

const isActive = (to: string) => {
  if (to === '/dashboard') return route.path === '/' || route.path === '/dashboard'
  if (to.startsWith('/tasks/')) return route.path.startsWith('/tasks/') || route.path.startsWith('/relatorio/')
  return route.path === to || route.path.startsWith(to + '/')
}

const tasksActive = computed(
  () => route.path.startsWith('/tasks/') || route.path.startsWith('/relatorio/'),
)

const tasksOpen = ref(false)
const tasksWrap = ref<HTMLElement | null>(null)

const handleDocClick = (e: MouseEvent) => {
  if (!tasksOpen.value) return
  if (tasksWrap.value && !tasksWrap.value.contains(e.target as Node)) tasksOpen.value = false
}
document.addEventListener('mousedown', handleDocClick)
onBeforeUnmount(() => document.removeEventListener('mousedown', handleDocClick))

const goTask = (to: string) => {
  tasksOpen.value = false
  router.push(to)
}

const handleNew = () => {
  // Opens the command palette (where user can quick-create / navigate)
  emit('open-command-palette')
}

/**
 * Roda do mouse anda a faixa de navegação na horizontal.
 *
 * Faixa que rola para o lado é inalcançável com mouse comum: o gesto natural é
 * girar a roda, que sem isto rola a página e deixa a navegação parada. Só
 * intercepta quando há de fato o que rolar, senão a página deixaria de rolar
 * com o cursor sobre a barra.
 */
const onTabsWheel = (event: WheelEvent) => {
  const el = event.currentTarget as HTMLElement
  if (el.scrollWidth <= el.clientWidth) return
  // Trackpad já manda deltaX: nesse caso o navegador resolve sozinho.
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  event.preventDefault()
  el.scrollLeft += event.deltaY
}
</script>

<template>
  <div class="canvas-shell">
    <!-- Top nav -->
    <header class="topnav">
      <div class="topnav-inner">
        <div class="brand">
          <BrandMark />
          <CompanySwitcher variant="inline" />
        </div>

        <!-- A faixa rola; "Tarefas" fica fixa ao lado dela. O menu de Tarefas
             abre para fora da barra e seria recortado por um container com
             overflow, então ele não pode viver dentro da faixa rolável. -->
        <div class="nav-row">
          <nav class="tabs" aria-label="Navegação principal" @wheel="onTabsWheel">
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

          <!-- Tarefas with quarter/month dropdown -->
          <div
            v-if="quarters.length"
            ref="tasksWrap"
            class="tab-wrap"
          >
            <button
              class="tab"
              :class="{ 'tab--active': tasksActive || tasksOpen }"
              @click="tasksOpen = !tasksOpen"
            >
              <ListTodo :size="14" />
              <span>Tarefas</span>
              <ChevronDown :size="11" class="tab-chev" :class="{ 'tab-chev--open': tasksOpen }" />
            </button>

            <div v-if="tasksOpen" class="tasks-pop">
              <div v-for="q in quarters" :key="q.id" class="pop-group">
                <div class="pop-head">
                  <span class="pop-q">{{ q.label }}</span>
                  <span class="pop-q-meta">{{ q.monthsLabel }}</span>
                </div>
                <button
                  class="pop-item"
                  :class="{ 'pop-item--active': route.path === `/relatorio/${q.id}` }"
                  @click="goTask(`/relatorio/${q.id}`)"
                >
                  <BarChart3 :size="12" class="pop-icon" />
                  <span>Relatório {{ q.label }}</span>
                </button>
                <button
                  v-for="m in q.months"
                  :key="m.id"
                  class="pop-item"
                  :class="{ 'pop-item--active': route.path === `/tasks/${m.id}` }"
                  @click="goTask(`/tasks/${m.id}`)"
                >
                  <CalendarRange :size="12" class="pop-icon" />
                  <span>{{ m.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Grupo que NUNCA encolhe: era ele que sumia da barra quando a
             navegação crescia (empresa com muitos itens, tela de 1280). -->
        <div class="nav-actions">
          <CmdKButton variant="full" placeholder="Buscar ou pular…" @open="emit('open-command-palette')" />
          <button class="new-btn" title="Novo (Ctrl+K)" @click="handleNew">
            <Plus :size="14" />
            <span>Novo</span>
          </button>
          <HelpButton />
          <TimerWidget />
          <InboxBell />
          <XpToggle />
          <ThemeToggle />
          <UserMenu :show-name="false" />
        </div>
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
      <button class="dock-btn dock-btn--accent" title="Assistente" @click="emit('open-command-palette')">
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
  position: relative;
  z-index: 40;
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
  flex: none;
}

/* A navegação é a ÚNICA parte elástica da barra: marca e ações são fixas.
   Sem `min-width: 0` um item de flex não encolhe abaixo do próprio conteúdo, e
   era isso que empurrava busca, "Novo" e o menu do usuário para fora da barra
   assim que a empresa tinha itens de menu demais. */
.nav-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  margin-left: 12px;
}

.tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  /* Esmaece a borda direita quando há mais item do que cabe. Sem transbordo, o
     conteúdo termina antes da faixa esmaecida e nada muda. */
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
}

.tabs::-webkit-scrollbar {
  display: none;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex: none;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  /* Rótulo em duas linhas inflava a barra de 52px para 71px e ainda assim
     transbordava. Item de navegação não quebra: ou cabe, ou rola. */
  white-space: nowrap;
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

.tab-chev {
  color: var(--text-4);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.tab-chev--open {
  transform: rotate(180deg);
  color: var(--text-2);
}

.tab-wrap {
  position: relative;
  flex: none;
}

.tasks-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  max-height: 64vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
  padding: 6px;
  z-index: 50;
}

.pop-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.pop-group:last-child {
  border-bottom: none;
}

.pop-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 10px 6px;
}

.pop-q {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pop-q-meta {
  font-size: 10px;
  color: var(--text-4);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.pop-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--text-2);
  transition: background var(--motion-fast) var(--motion-ease);
  text-align: left;
  width: 100%;
}

.pop-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.pop-item--active {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 600;
}

.pop-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.pop-item--active .pop-icon {
  color: var(--text);
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
  transition: filter var(--motion-fast) var(--motion-ease);
}

.new-btn:hover {
  filter: brightness(1.06);
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
