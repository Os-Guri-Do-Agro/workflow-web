<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CommandShell from './CommandShell.vue'
import FocusShell from './FocusShell.vue'
import CanvasShell from './CanvasShell.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import AssistantPanel from '@/components/assistant/AssistantPanel.vue'
import AssistantLauncher from '@/components/assistant/AssistantLauncher.vue'
import WelcomeGuide from '@/components/onboarding/WelcomeGuide.vue'
import XpTaskbar from './shared/XpTaskbar.vue'
import XpWindowChrome from './shared/XpWindowChrome.vue'
import XpDesktop from './shared/XpDesktop.vue'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useXpSounds } from '@/composables/useXpSounds'
import { useAssistant } from '@/composables/useAssistant'
import { useOnboarding } from '@/composables/useOnboarding'
import { useToast } from '@/composables/useToast'
import { useTimerDocumentTitle } from '@/composables/useTimerDocumentTitle'
import { CANVAS_ENABLED } from '@/config/feature-flags'

const route = useRoute()
const router = useRouter()
const { shell, xp } = useUiPreferences()
const { playStartup } = useXpSounds()

// Som de inicialização ao LIGAR o modo XP (só na transição off→on por gesto do
// usuário — sem `immediate`, então nunca toca no boot/refresh com XP já ligado).
watch(xp, (on, was) => {
  if (on && !was) playStartup()
})

const assistant = useAssistant()
const onboarding = useOnboarding()
const { info } = useToast()

// Contador do timer no título da aba (persiste ao trocar de rota/shell — por isso
// mora aqui, no ponto sempre presente, e não no TimerWidget que é por-shell).
useTimerDocumentTitle()

// Redirects do guard chegam com ?reason=... — traduz em toast e limpa a query
// (router.replace) para o aviso não repetir em refresh/navegação.
const REASON_MESSAGES: Record<string, string> = {
  'no-access': 'Você não tem acesso a essa página nesta empresa',
  'canvas-off': 'Este recurso está desativado no momento',
}

watch(
  () => route.query.reason,
  (reason) => {
    const message = typeof reason === 'string' ? REASON_MESSAGES[reason] : undefined
    if (!message) return
    info(message)
    const rest = { ...route.query }
    delete rest.reason
    void router.replace({ query: rest })
  },
  { immediate: true },
)

// Atalho global do Assistente (Ctrl/Cmd + I), estilo extensão do Claude.
// Ignora quando o foco está em input/textarea/contentEditable (ex.: editor TipTap,
// onde Cmd+I = itálico).
function isTyping(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}
function onAssistantHotkey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
    if (isTyping(e.target)) return
    e.preventDefault()
    assistant.toggle()
  }
}
onMounted(() => window.addEventListener('keydown', onAssistantHotkey, true))
onUnmounted(() => window.removeEventListener('keydown', onAssistantHotkey, true))

const bare = computed(
  () =>
    route.name === 'login' ||
    route.name === 'signup' ||
    route.name === 'download' ||
    route.name === 'bug-report' ||
    route.name === 'report-status' ||
    route.name === 'public-board' ||
    route.name === 'public-roadmap',
)

const ActiveShell = computed(() => {
  if (shell.value === 'focus') return FocusShell
  // Canvas escondido (feature flag off): quem tinha ui.shell='canvas' no
  // localStorage cai no CommandShell em vez de uma tela quebrada.
  if (shell.value === 'canvas' && CANVAS_ENABLED) return CanvasShell
  return CommandShell
})

// Onboarding abre sozinho UMA vez, quando o usuário entra numa rota logada
// (sai do login/bare). maybeAutoOpen é idempotente (guarda em localStorage).
watch(
  bare,
  (isBare) => {
    if (!isBare) window.setTimeout(() => onboarding.maybeAutoOpen(), 600)
  },
  { immediate: true },
)

const paletteRef = ref<InstanceType<typeof CommandPalette> | null>(null)
const openPalette = () => paletteRef.value?.open()
</script>

<template>
  <div v-if="bare" class="app-shell-bare">
    <slot />
  </div>
  <div v-else class="app-shell-root">
    <component :is="ActiveShell" @open-command-palette="openPalette">
      <slot />
    </component>
    <CommandPalette ref="paletteRef" />
    <AssistantLauncher />
    <AssistantPanel />
    <WelcomeGuide />
    <!-- Easter egg Windows XP (só quando o modo XP está ligado): ícones de área
         de trabalho, title bar da "janela" de conteúdo e barra de tarefas. -->
    <template v-if="xp">
      <XpDesktop />
      <XpWindowChrome />
      <XpTaskbar />
    </template>
  </div>
</template>

<style scoped>
.app-shell-root,
.app-shell-bare {
  display: contents;
}
</style>
