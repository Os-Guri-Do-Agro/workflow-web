<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Play, Square, Timer as TimerIcon } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useToast } from '@/composables/useToast'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { formatTimer } from '@/utils/duration'

// Ferramenta premium: o widget some dos 3 shells de uma vez para quem não é Fluvio.
const { isFluvio } = useCurrentUser()
const { error: showError } = useToast()
const workspace = useWorkspaceStore()
const { running, isRunning, elapsedSec, start, stop } = useTimeTracking()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

// ─── Formulário de início ─────────────────────────────────────────────────────
const description = ref('')
// null = "Pessoal" (sem empresa). Default = empresa ativa, se houver.
const companyId = ref<string | null>(workspace.activeCompanyId)
const activityId = ref<string | null>(null)

// "Pessoal" + empresas do usuário.
const companyOptions = computed(() => [
  { label: 'Pessoal', value: null as string | null },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

// Tarefas da empresa escolhida (fonte: workspace já carregado). Opcional.
const activityOptions = computed(() => {
  const tasks = workspace.workspaceData?.activities ?? []
  const filtered = companyId.value
    ? tasks.filter((t) => t.companyId === companyId.value)
    : []
  return [
    { label: 'Sem tarefa', value: null as string | null },
    ...filtered.map((t) => ({ label: t.title, value: t.id })),
  ]
})

// Trocar de empresa reseta a tarefa (evita vínculo inconsistente).
watch(companyId, () => {
  activityId.value = null
})

const clock = computed(() => formatTimer(elapsedSec.value))
const runningLabel = computed(() => running.value?.description?.trim() || 'Sem descrição')

function toggleOpen() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

async function handleStart() {
  try {
    await start.mutateAsync({
      description: description.value.trim() || undefined,
      companyId: companyId.value,
      activityId: activityId.value,
    })
    description.value = ''
    activityId.value = null
    close()
  } catch {
    showError('Não foi possível iniciar o timer')
  }
}

async function handleStop() {
  try {
    await stop.mutateAsync()
    close()
  } catch {
    showError('Não foi possível parar o timer')
  }
}

function onDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) close()
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <div v-if="isFluvio" ref="rootRef" class="timer">
    <!-- Trigger: pílula com cronômetro quando rodando; botão play quando parado -->
    <button
      class="timer-trigger"
      :class="{ 'timer-trigger--running': isRunning, 'timer-trigger--active': isOpen }"
      type="button"
      :title="isRunning ? 'Timer em andamento' : 'Iniciar timer'"
      @click="toggleOpen"
    >
      <span v-if="isRunning" class="timer-dot" />
      <TimerIcon v-else :size="15" />
      <span v-if="isRunning" class="timer-clock">{{ clock }}</span>
    </button>

    <Transition name="timer-pop">
      <section v-if="isOpen" class="timer-panel" aria-label="Time tracking">
        <header class="timer-header">
          <p class="timer-eyebrow">Meu tempo</p>
          <h2 class="timer-title">{{ isRunning ? 'Timer em andamento' : 'Iniciar timer' }}</h2>
        </header>

        <!-- Estado: rodando -->
        <div v-if="isRunning" class="timer-body">
          <div class="timer-live">
            <span class="timer-live-clock">{{ clock }}</span>
            <span class="timer-live-desc">{{ runningLabel }}</span>
            <span v-if="running?.company" class="timer-chip">{{ running.company.name }}</span>
            <span v-else class="timer-chip timer-chip--muted">Pessoal</span>
          </div>
          <button
            class="timer-btn timer-btn--stop"
            type="button"
            :disabled="stop.isPending.value"
            @click="handleStop"
          >
            <Square :size="15" />
            <span>Parar</span>
          </button>
        </div>

        <!-- Estado: parado (formulário) -->
        <form v-else class="timer-body" @submit.prevent="handleStart">
          <label class="timer-field">
            <span class="timer-label">No que você está trabalhando?</span>
            <input
              v-model="description"
              class="timer-input"
              type="text"
              placeholder="Descrição (opcional)"
              maxlength="500"
            />
          </label>

          <label class="timer-field">
            <span class="timer-label">Empresa</span>
            <AppSelect
              v-model="companyId"
              :items="companyOptions"
              placeholder="Pessoal"
              label="Empresa"
              density="compact"
            />
          </label>

          <label v-if="companyId" class="timer-field">
            <span class="timer-label">Tarefa</span>
            <AppSelect
              v-model="activityId"
              :items="activityOptions"
              placeholder="Sem tarefa"
              label="Tarefa"
              density="compact"
            />
          </label>

          <button
            class="timer-btn timer-btn--start"
            type="submit"
            :disabled="start.isPending.value"
          >
            <Play :size="15" />
            <span>Iniciar</span>
          </button>
        </form>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.timer {
  position: relative;
  display: inline-flex;
}

.timer-trigger {
  /* Hit-area >= 44px (acessibilidade). */
  min-width: 44px;
  height: 44px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.timer-trigger:hover,
.timer-trigger--active {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.timer-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  color: var(--text);
}

.timer-trigger--running {
  border-color: var(--accent);
  color: var(--text);
}

.timer-clock {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.timer-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
  animation: timer-pulse 1.6s ease-in-out infinite;
}

.timer-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(320px, calc(100vw - 24px));
  z-index: 80;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
}

.timer-header {
  padding: 14px 14px 8px;
  border-bottom: 1px solid var(--border);
}

.timer-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timer-title {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 750;
}

.timer-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timer-live {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.timer-live-clock {
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.timer-live-desc {
  color: var(--text-2);
  font-size: 13px;
}

.timer-chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 650;
}

.timer-chip--muted {
  background: var(--surface-2);
  color: var(--text-3);
}

.timer-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.timer-label {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
}

.timer-input {
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.timer-input::placeholder {
  color: var(--text-3);
}

.timer-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.timer-btn {
  height: 44px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.timer-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.timer-btn--start {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.timer-btn--start:hover:not(:disabled) {
  filter: brightness(1.05);
}

.timer-btn--stop {
  background: var(--surface-2);
  color: var(--err);
  border-color: var(--border);
}

.timer-btn--stop:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--err);
}

.timer-pop-enter-active,
.timer-pop-leave-active {
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.timer-pop-enter-from,
.timer-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@keyframes timer-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .timer-dot {
    animation: none;
  }
}
</style>
