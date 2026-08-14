<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  BellRing,
  DollarSign,
  Play,
  Square,
  Timer as TimerIcon,
} from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import TaskPicker from '@/components/ui/TaskPicker.vue'
import SaveStatus from '@/components/ui/SaveStatus.vue'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useCompanyActivities } from '@/composables/useCompanyActivities'
import { useRunningEntryEditor } from '@/composables/useRunningEntryEditor'
import { useTimerIdleGuard } from '@/composables/useTimerIdleGuard'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { useTimerSounds } from '@/composables/useTimerSounds'
import { openProtectionDialog } from '@/composables/idle-protection-dialog'
import { useToast } from '@/composables/useToast'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { formatTimer } from '@/utils/duration'

// Acesso por membership: o widget aparece para qualquer usuário logado.
const { me } = useCurrentUser()
const { error: showError } = useToast()
const workspace = useWorkspaceStore()
const { isRunning, elapsedSec, start, stop } = useTimeTracking()
const { companyOf } = useCompanyActivities()
const { playStart, playStop } = useTimerSounds()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

// F3 — timer é considerado "esquecido" após 8h rodando (avisa, mas não para).
const FORGOTTEN_SEC = 8 * 60 * 60

// ─── Formulário de início (estado parado) ─────────────────────────────────────
const description = ref('')
// null = "Pessoal" (sem empresa). Default = empresa ativa, se houver.
const companyId = ref<string | null>(workspace.activeCompanyId)
const activityId = ref<string | null>(null)
// F5 — faturável de ponta a ponta (a UI passa a enviar o billable).
const billable = ref(false)

// ─── Edição ao vivo (estado rodando, T2) ──────────────────────────────────────
const editor = useRunningEntryEditor({ companyOf })

// ─── Ociosidade (spec timer-ociosidade) ───────────────────────────────────────
// As AÇÕES do alerta ficam no card fixo (IdleAlert.vue); aqui o widget só
// reflete o estado: pílula âmbar no trigger e uma linha no painel.
const idle = useTimerIdleGuard()
const alerts = useIdleAlerts()

const idleWarning = computed(() => isRunning.value && idle.phase.value === 'warning')

/** Minutos parados, para o texto do aviso. */
const idleMinutes = computed(() => Math.max(1, Math.round(idle.idleSec.value / 60)))

/** "Parar em 4:12" enquanto a carência corre. */
const cutCountdown = computed(() => formatTimer(idle.secondsToCut.value))

/** Linha discreta de permissão: pede quando dá, orienta quando está bloqueada. */
async function handleEnableAlerts() {
  if (alerts.nextStep.value === null && alerts.blocked.value) {
    showError('Libere as notificações no cadeado da barra de endereço para receber o aviso')
    return
  }
  await alerts.requestNext()
}

/**
 * Texto da linha de proteção. Em modo limitado ela explica a consequência (o
 * Nevo não vai parar o tempo sozinho), porque é isso que muda para a pessoa —
 * "falta uma permissão" não diz nada a quem não sabe o que a permissão faz.
 */
const permissionText = computed(() => {
  if (alerts.limited.value) {
    return alerts.nextStep.value === 'detection'
      ? 'Proteção limitada: sem a detecção de atividade eu não paro seu tempo sozinho'
      : 'Proteção limitada: o navegador bloqueou a detecção de atividade'
  }
  return 'Ative as notificações para ser avisado fora do navegador'
})

// "Pessoal" + empresas do usuário.
const companyOptions = computed(() => [
  { label: 'Pessoal', value: null as string | null },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

// O AppSelect emite SelectValuePrimitive; company/activity são sempre id ou null.
const toId = (v: unknown): string | null => (typeof v === 'string' ? v : null)

// T3 — trocar empresa só zera a tarefa se ela não pertence à nova empresa; e
// escolher a tarefa preenche a empresa dela.
function onStartCompany(raw: unknown) {
  const id = toId(raw)
  companyId.value = id
  if (activityId.value && companyOf(activityId.value) !== id) activityId.value = null
}
function onStartActivity(raw: unknown) {
  const id = toId(raw)
  activityId.value = id
  if (id && !companyId.value) companyId.value = companyOf(id)
}

const clock = computed(() => formatTimer(elapsedSec.value))

// F3 — aviso de timer esquecido (>8h). Mostra há quantas horas está rodando.
const forgotten = computed(() => isRunning.value && elapsedSec.value > FORGOTTEN_SEC)
const runningHours = computed(() => Math.floor(elapsedSec.value / 3600))

function toggleOpen() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

async function handleStart() {
  // Proteção limitada: interrompe com o diálogo em vez de pedir em silêncio.
  // O pedido antigo, colado no clique de iniciar, passava despercebido — e
  // quem não concedia ficava sem saber que o app não conseguia distinguir
  // "saiu do computador" de "minimizou o navegador".
  if (alerts.needsAttention.value) openProtectionDialog()
  try {
    await start.mutateAsync({
      description: description.value.trim() || undefined,
      companyId: companyId.value,
      activityId: companyId.value ? activityId.value : null,
      billable: billable.value,
    })
    // Som depois da confirmação do servidor: tocar antes prometeria um começo
    // que ainda pode falhar.
    playStart()
    description.value = ''
    activityId.value = null
    billable.value = false
    close()
  } catch {
    showError('Não foi possível iniciar o timer')
  }
}

async function handleStop() {
  try {
    editor.flush() // salva a última edição pendente antes de parar
    await stop.mutateAsync()
    playStop()
    close()
  } catch {
    showError('Não foi possível parar o timer')
  }
}

/**
 * Dropdowns do reka (select de empresa, busca de tarefa) são TELEPORTADOS para
 * o `<body>`: no DOM eles ficam fora do painel, então o "clique fora" os tratava
 * como clique externo e fechava o timer inteiro no meio da escolha. Interação em
 * conteúdo teleportado é interação dentro do widget.
 */
const PORTAL_SELECTOR =
  '[data-reka-popper-content-wrapper], [data-dismissable-layer], [role="listbox"], .tp-menu'

function onDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return
  const target = event.target as Element | null
  if (target?.closest?.(PORTAL_SELECTOR)) return
  if (rootRef.value && !rootRef.value.contains(target as Node)) close()
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <div v-if="me" ref="rootRef" class="timer">
    <!-- Trigger: pílula com cronômetro quando rodando; botão play quando parado -->
    <button
      class="timer-trigger"
      :class="{
        'timer-trigger--running': isRunning,
        'timer-trigger--active': isOpen,
        'timer-trigger--idle': idleWarning,
      }"
      type="button"
      :title="
        idleWarning
          ? 'Sem atividade: o timer vai parar'
          : isRunning
            ? 'Timer em andamento'
            : 'Iniciar timer'
      "
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

        <!-- Estado: rodando (edição ao vivo, T2) -->
        <div v-if="isRunning" class="timer-body">
          <div class="timer-live">
            <span class="timer-live-clock timer-live-clock--rec">{{ clock }}</span>
          </div>

          <label class="timer-field">
            <span class="timer-label">No que você está trabalhando?</span>
            <input
              v-model="editor.form.description"
              class="timer-input"
              type="text"
              placeholder="Descrição (opcional)"
              maxlength="500"
              @input="editor.touch()"
            />
          </label>

          <div class="timer-field">
            <span class="timer-label">Empresa</span>
            <AppSelect
              :model-value="editor.form.companyId"
              :items="companyOptions"
              placeholder="Pessoal"
              label="Empresa"
              density="compact"
              @update:model-value="editor.setCompany($event)"
            />
          </div>

          <div v-if="editor.form.companyId" class="timer-field">
            <span class="timer-label">Tarefa</span>
            <!-- TaskPicker, não select plano: a lista de uma empresa passa de
                 dezenas, e o menu navega por trimestre e mês como o resto do
                 produto (spec time-selecao-de-tarefa-e-som). -->
            <TaskPicker
              :model-value="editor.form.activityId"
              :company-id="editor.form.companyId"
              placeholder="Sem tarefa"
              label="Tarefa"
              density="compact"
              @update:model-value="editor.setActivity($event)"
            />
          </div>
          <p v-else class="timer-hint">Escolha uma empresa para atribuir uma tarefa.</p>

          <label class="timer-toggle">
            <input
              v-model="editor.form.billable"
              type="checkbox"
              class="timer-toggle-input"
              @change="editor.touch()"
            />
            <span class="timer-toggle-box"><DollarSign :size="13" /></span>
            <span class="timer-toggle-text">Faturável</span>
          </label>

          <div v-if="editor.state.value !== 'idle'" class="timer-autosave">
            <SaveStatus
              :state="editor.state.value"
              :saved-at="editor.savedAt.value"
              @retry="editor.flush()"
            />
          </div>

          <!-- O aviso de ociosidade com as ações NÃO mora aqui: ele precisa
               aparecer com o painel fechado, então vive no card fixo
               (components/onboarding/IdleAlert.vue, montado no AppShell). Aqui
               fica só o eco discreto, para quem abriu o painel entender o
               estado da pílula âmbar. -->
          <p v-if="idleWarning" class="timer-idle-hint">
            Sem atividade há {{ idleMinutes }} min. O tempo para em {{ cutCountdown }}.
          </p>

          <!-- F3 — aviso de timer esquecido (âmbar), sem parar automaticamente. -->
          <div v-if="forgotten" class="timer-warn" role="alert">
            <AlertTriangle :size="15" />
            <span>Timer rodando há {{ runningHours }}h. Ainda está trabalhando?</span>
          </div>

          <!-- Sem permissão, o aviso não alcança quem está fora do navegador,
               que é justamente o caso que importa. -->
          <button
            v-if="alerts.limited.value || alerts.needsPermission.value"
            class="timer-perm"
            :class="{ 'timer-perm--warn': alerts.limited.value }"
            type="button"
            @click="openProtectionDialog()"
          >
            <BellRing :size="13" />
            <span>{{ permissionText }}</span>
          </button>

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

          <div class="timer-field">
            <span class="timer-label">Empresa</span>
            <AppSelect
              :model-value="companyId"
              :items="companyOptions"
              placeholder="Pessoal"
              label="Empresa"
              density="compact"
              @update:model-value="onStartCompany($event)"
            />
          </div>

          <div v-if="companyId" class="timer-field">
            <span class="timer-label">Tarefa</span>
            <TaskPicker
              :model-value="activityId"
              :company-id="companyId"
              placeholder="Sem tarefa"
              label="Tarefa"
              density="compact"
              @update:model-value="onStartActivity($event)"
            />
          </div>
          <p v-else class="timer-hint">Escolha uma empresa para atribuir uma tarefa.</p>

          <!-- F5 — faturável -->
          <label class="timer-toggle">
            <input v-model="billable" type="checkbox" class="timer-toggle-input" />
            <span class="timer-toggle-box"><DollarSign :size="13" /></span>
            <span class="timer-toggle-text">Faturável</span>
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

/* Ociosidade: a pílula vira âmbar e pulsa, mesmo com o painel fechado. */
.timer-trigger--idle {
  border-color: var(--warn);
  background: color-mix(in srgb, var(--warn) 16%, var(--surface-2));
  color: var(--text);
}

.timer-trigger--idle .timer-dot {
  background: var(--warn);
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

/* Cronômetro em gravação: ponto vermelho pulsando (casa com favicon/título). */
.timer-live-clock--rec {
  position: relative;
  color: var(--err);
  padding-left: 18px;
}

.timer-live-clock--rec::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 10px;
  height: 10px;
  margin-top: -5px;
  border-radius: 999px;
  background: var(--err);
  animation: timer-pulse 1.6s ease-in-out infinite;
}

.timer-hint {
  margin: 0;
  color: var(--text-4);
  font-size: 11px;
  line-height: 1.3;
}

.timer-autosave {
  display: flex;
  justify-content: flex-end;
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

.timer-live-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.timer-chip--bill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

/* Ociosidade — eco do estado no painel (as ações ficam no card fixo). */
.timer-idle-hint {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 14%, var(--surface));
  color: var(--warn);
  font-size: 11.5px;
  font-weight: 650;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

/* Convite discreto de permissão (só quando falta). */
.timer-perm {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.timer-perm:hover {
  color: var(--text);
  border-color: var(--accent);
}

/* Proteção limitada não é convite: é aviso de que o produto está capado. */
.timer-perm--warn {
  border-style: solid;
  border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  color: var(--warn);
}

/* F3 — banner de timer esquecido (âmbar). */
.timer-warn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 14%, var(--surface));
  color: var(--warn);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

/* F5 — toggle "Faturável". */
.timer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.timer-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.timer-toggle-box {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.timer-toggle-input:checked + .timer-toggle-box {
  background: color-mix(in srgb, var(--success) 18%, transparent);
  border-color: var(--success);
  color: var(--success);
}

.timer-toggle-input:focus-visible + .timer-toggle-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.timer-toggle-text {
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
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
