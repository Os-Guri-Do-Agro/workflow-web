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
import CompanyCreateOverlay from '@/features/companies/components/CompanyCreateOverlay.vue'
import NoCompanyState from '@/features/companies/components/NoCompanyState.vue'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useXpSounds } from '@/composables/useXpSounds'
import { useAssistant } from '@/composables/useAssistant'
import { useOnboarding } from '@/composables/useOnboarding'
import { useToast } from '@/composables/useToast'
import { useTimerDocumentTitle } from '@/composables/useTimerDocumentTitle'
import { useFaviconBadge } from '@/composables/useFaviconBadge'
import { CANVAS_ENABLED } from '@/config/feature-flags'

const route = useRoute()
const router = useRouter()
const { shell, xp } = useUiPreferences()
const { playStartup, playClick } = useXpSounds()

// Som de inicialização ao LIGAR o modo XP (só na transição off→on por gesto do
// usuário — sem `immediate`, então nunca toca no boot/refresh com XP já ligado).
watch(xp, (on, was) => {
  if (on && !was) playStartup()
})

// Clique do mouse a cada clique NA TELA enquanto o XP está ligado — como no
// Windows clássico. Listener global em capture; ligado/desligado conforme o modo.
function onGlobalPointerDown(e: PointerEvent) {
  // Só botão principal; ignora scrollbar/arrasto secundário.
  if (e.button !== 0) return
  playClick()
}
watch(
  xp,
  (on) => {
    window.removeEventListener('pointerdown', onGlobalPointerDown, true)
    if (on) window.addEventListener('pointerdown', onGlobalPointerDown, true)
  },
  { immediate: true },
)
onUnmounted(() => window.removeEventListener('pointerdown', onGlobalPointerDown, true))

const assistant = useAssistant()
const onboarding = useOnboarding()
const { info } = useToast()

// Contador do timer no título da aba (persiste ao trocar de rota/shell — por isso
// mora aqui, no ponto sempre presente, e não no TimerWidget que é por-shell).
useTimerDocumentTitle()
// Badge vermelho de "gravando" no favicon enquanto o timer roda (mesmo ponto
// sempre-presente, mesmo singleton de estado).
useFaviconBadge()

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
    route.name === 'public-roadmap' ||
    route.name === 'public-note',
)

const ActiveShell = computed(() => {
  if (shell.value === 'focus') return FocusShell
  // Canvas escondido (feature flag off): quem tinha ui.shell='canvas' no
  // localStorage cai no CommandShell em vez de uma tela quebrada.
  if (shell.value === 'canvas' && CANVAS_ENABLED) return CanvasShell
  return CommandShell
})

// ── Gate de empresa ─────────────────────────────────────────────────────────
// Usuário logado sem NENHUMA empresa fica preso (nada funciona sem empresa). Ao
// entrar numa rota logada a gente carrega as empresas dele; se a lista vier
// vazia (fetch OK), mostra o estado "crie sua empresa" no lugar do shell.
const workspace = useWorkspaceStore()
const companiesLoadOk = ref(false)

async function ensureCompaniesLoaded() {
  if (!localStorage.getItem('token')) return
  try {
    await workspace.fetchCompanies()
    companiesLoadOk.value = true
  } catch {
    // Falha de rede não deve bloquear com o estado sem-empresa (falso positivo).
    companiesLoadOk.value = false
  }
}

watch(
  bare,
  (isBare) => {
    if (!isBare) {
      companiesLoadOk.value = false
      void ensureCompaniesLoaded()
    }
  },
  { immediate: true },
)

// Só bloqueia quando o fetch confirmou zero empresas (nunca durante o load).
const hasNoCompany = computed(
  () => !bare.value && companiesLoadOk.value && workspace.companies.length === 0,
)

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
  <template v-else-if="hasNoCompany">
    <NoCompanyState />
    <CompanyCreateOverlay />
  </template>
  <div v-else class="app-shell-root">
    <component :is="ActiveShell" @open-command-palette="openPalette">
      <slot />
    </component>
    <CommandPalette ref="paletteRef" />
    <CompanyCreateOverlay />
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
