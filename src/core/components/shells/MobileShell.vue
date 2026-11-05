<script setup lang="ts">
/**
 * Moldura do app em tela pequena (spec v2-mobile-e-home, M1).
 *
 * Abaixo de 900px a moldura de desktop não cabe: a sidebar de 248px comia dois
 * terços de um celular e a topbar empilhava busca, chip, timer, sino, tema e
 * avatar numa linha que transbordava. Aqui o desenho é o de app de celular:
 *
 * - topo compacto com empresa, busca, sequência, sino e avatar;
 * - conteúdo com rolagem própria (a página inteira nunca rola por baixo);
 * - tab bar com as quatro telas de uso diário e "Mais" para o resto do menu.
 *
 * Vale para qualquer variante escolhida em Configurações (command, focus,
 * canvas): a variante é preferência de desktop. O AppShell decide quem monta.
 *
 * `--shell-bottom-inset` vai para o `<html>` enquanto esta moldura existe: o
 * botão do assistente, os recados do Nevo e os toasts sobem acima da tab bar
 * lendo essa variável, sem cada um precisar saber em que moldura está.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { House, Menu, NotebookPen, SquareKanban, Timer } from 'lucide-vue-next'
import BrandMark from './shared/BrandMark.vue'
import CompanySwitcher from './shared/CompanySwitcher.vue'
import UserMenu from './shared/UserMenu.vue'
import CmdKButton from './shared/CmdKButton.vue'
import InboxBell from './shared/InboxBell.vue'
import StreakChip from './shared/StreakChip.vue'
import MobileMoreSheet from './shared/MobileMoreSheet.vue'
import { useNavQuarters } from '@/composables/useNavQuarters'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { formatTimer } from '@/utils/duration'
import { currentMonthId } from './shared/current-month'
import { useUiPreferences } from '@/composables/useUiPreferences'

defineEmits<{
  'open-command-palette': []
}>()

const route = useRoute()
const { quarters } = useNavQuarters()
const { isRunning, elapsedSec } = useTimeTracking()

const tasksTo = computed(() => {
  const id = currentMonthId(quarters.value)
  return id ? `/tasks/${id}` : '/board'
})

const moreOpen = ref(false)
watch(
  () => route.fullPath,
  () => {
    moreOpen.value = false
  },
)

type TabKey = 'home' | 'tasks' | 'time' | 'notes' | 'more'

const activeTab = computed<TabKey | null>(() => {
  if (moreOpen.value) return 'more'
  const p = route.path
  if (p === '/' || p === '/dashboard') return 'home'
  if (p.startsWith('/tasks') || p === '/board' || p.startsWith('/activity')) return 'tasks'
  if (p.startsWith('/time')) return 'time'
  if (p.startsWith('/notes')) return 'notes'
  return null
})

const timerLabel = computed(() => (isRunning.value ? formatTimer(elapsedSec.value) : 'Tempo'))

const TABBAR_INSET = 'calc(58px + env(safe-area-inset-bottom, 0px))'

/**
 * Barra do sistema (status bar do celular, barra do app instalado) na mesma cor
 * do topo: com o app aberto pela tela inicial, a diferença de cor entre as duas
 * era a primeira coisa que denunciava "site dentro de app".
 */
const topRef = ref<HTMLElement | null>(null)
const { theme, accent } = useUiPreferences()
function syncThemeColor() {
  const el = topRef.value
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!el || !meta) return
  const color = getComputedStyle(el).backgroundColor
  if (color) meta.content = color
}
watch([theme, accent], () => requestAnimationFrame(syncThemeColor))

onMounted(() => {
  document.documentElement.style.setProperty('--shell-bottom-inset', TABBAR_INSET)
  requestAnimationFrame(syncThemeColor)
})
onBeforeUnmount(() => document.documentElement.style.removeProperty('--shell-bottom-inset'))
</script>

<template>
  <div class="mobile-shell">
    <header ref="topRef" class="m-top">
      <BrandMark :size="28" />
      <div class="m-company">
        <CompanySwitcher variant="compact" />
      </div>
      <div class="m-actions">
        <CmdKButton variant="icon" @open="$emit('open-command-palette')" />
        <StreakChip compact />
        <InboxBell />
        <UserMenu :show-name="false" />
      </div>
    </header>

    <main class="m-main">
      <slot />
    </main>

    <nav class="m-tabs" aria-label="Navegação principal">
      <RouterLink to="/" class="m-tab" :class="{ 'is-active': activeTab === 'home' }" :aria-current="activeTab === 'home' ? 'page' : undefined">
        <span class="m-tab-icon"><House :size="20" aria-hidden="true" /></span>
        <span class="m-tab-label">Início</span>
      </RouterLink>
      <RouterLink :to="tasksTo" class="m-tab" :class="{ 'is-active': activeTab === 'tasks' }" :aria-current="activeTab === 'tasks' ? 'page' : undefined">
        <span class="m-tab-icon"><SquareKanban :size="20" aria-hidden="true" /></span>
        <span class="m-tab-label">Tarefas</span>
      </RouterLink>
      <RouterLink
        to="/time"
        class="m-tab"
        :class="{ 'is-active': activeTab === 'time', 'is-recording': isRunning }"
        :aria-current="activeTab === 'time' ? 'page' : undefined"
        :aria-label="isRunning ? `Meu tempo, cronômetro rodando: ${timerLabel}` : 'Meu tempo'"
      >
        <span class="m-tab-icon">
          <Timer :size="20" aria-hidden="true" />
          <span v-if="isRunning" class="m-rec-dot" aria-hidden="true" />
        </span>
        <span class="m-tab-label m-tab-label--clock">{{ timerLabel }}</span>
      </RouterLink>
      <RouterLink to="/notes" class="m-tab" :class="{ 'is-active': activeTab === 'notes' }" :aria-current="activeTab === 'notes' ? 'page' : undefined">
        <span class="m-tab-icon"><NotebookPen :size="20" aria-hidden="true" /></span>
        <span class="m-tab-label">Notas</span>
      </RouterLink>
      <button
        type="button"
        class="m-tab"
        :class="{ 'is-active': activeTab === 'more' }"
        :aria-expanded="moreOpen"
        aria-haspopup="dialog"
        @click="moreOpen = !moreOpen"
      >
        <span class="m-tab-icon"><Menu :size="20" aria-hidden="true" /></span>
        <span class="m-tab-label">Mais</span>
      </button>
    </nav>

    <MobileMoreSheet v-model:open="moreOpen" />
  </div>
</template>

<style scoped>
.mobile-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100vh;
  height: 100dvh;
  color: var(--text);
  /* Fundo próprio: o Modo XP deixa body e #app transparentes sobre o papel de
     parede, e sem isto o conteúdo do celular ficava em cima da imagem. */
  background: var(--bg);
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

.m-top {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: calc(6px + env(safe-area-inset-top, 0px)) max(10px, env(safe-area-inset-right, 0px)) 6px
    max(10px, env(safe-area-inset-left, 0px));
  min-height: 52px;
  background: var(--accent-wash);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 3;
}

.m-company {
  min-width: 0;
  flex: 1;
  display: flex;
}

/* O nome da empresa encolhe antes de qualquer botão sumir. */
.m-company :deep(.switch-btn) {
  min-width: 0;
  max-width: 100%;
}

.m-company :deep(.switch-btn span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.m-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.m-main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  position: relative;
  z-index: 1;
}

.m-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  padding: 4px max(4px, env(safe-area-inset-right, 0px)) calc(4px + env(safe-area-inset-bottom, 0px))
    max(4px, env(safe-area-inset-left, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  position: relative;
  z-index: 3;
}

.m-tab {
  appearance: none;
  border: 0;
  background: transparent;
  font: inherit;
  color: var(--text-3);
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 50px;
  padding: 4px 2px;
  border-radius: var(--radius-md);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color var(--motion-fast) var(--motion-ease);
}

.m-tab-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 28px;
  border-radius: 999px;
  transition: background var(--motion-fast) var(--motion-ease);
}

.m-tab-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.m-tab-label--clock {
  font-variant-numeric: tabular-nums;
}

.m-tab.is-active {
  color: var(--accent-ink);
}

.m-tab.is-active .m-tab-icon {
  background: var(--accent-soft);
}

.m-tab.is-recording:not(.is-active) {
  color: var(--text);
}

.m-rec-dot {
  position: absolute;
  top: 3px;
  right: 12px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--err);
  box-shadow: 0 0 0 2px var(--surface);
}

.m-tab:active .m-tab-icon {
  background: var(--accent-soft);
}

.m-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .m-tab,
  .m-tab-icon {
    transition: none;
  }
}
</style>
