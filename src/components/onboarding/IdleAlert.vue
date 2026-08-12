<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Coffee, Play, RotateCcw, X } from 'lucide-vue-next'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useTimerIdleGuard } from '@/composables/useTimerIdleGuard'
import { useToast } from '@/composables/useToast'
import { formatTimer } from '@/utils/duration'

/**
 * Card do aviso de ociosidade (spec timer-ociosidade).
 *
 * Fica FORA do popover do timer de propósito: as ações precisam estar na tela
 * quando a pessoa volta ao computador, sem depender de ela abrir o widget. Foi
 * o que a verificação de ponta a ponta mostrou — com os botões dentro do
 * popover fechado, a única pista visível era o favicon piscando.
 *
 * Dois estados: aviso (ainda dá para continuar) e pós-corte (o tempo já parou,
 * dá para retomar e recuperar). Montado uma vez no AppShell.
 */
const { isRunning } = useTimeTracking()
const idle = useTimerIdleGuard()
const { error: showError } = useToast()

const warning = computed(() => isRunning.value && idle.phase.value === 'warning')
const cut = computed(() => idle.lastCut.value)
const visible = computed(() => warning.value || !!cut.value)

const idleMinutes = computed(() => Math.max(1, Math.round(idle.idleSec.value / 60)))
const countdown = computed(() => formatTimer(idle.secondsToCut.value))
const cutAtLabel = computed(() =>
  cut.value
    ? new Date(cut.value.cutAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '',
)

async function handleStop() {
  try {
    await idle.stopNow()
  } catch {
    showError('Não foi possível parar o timer')
  }
}

async function handleResume() {
  try {
    await idle.resume()
  } catch {
    showError('Não foi possível retomar o timer')
  }
}

async function handleRecover() {
  try {
    await idle.recover()
  } catch {
    showError('Não foi possível recuperar esse tempo')
  }
}
</script>

<template>
  <Transition name="idle-alert">
    <aside
      v-if="visible"
      class="idle-alert"
      :class="{ 'idle-alert--warn': warning }"
      role="alert"
      aria-live="assertive"
    >
      <!-- Estado 1: ainda dá para continuar -->
      <template v-if="warning">
        <span class="idle-alert-icon idle-alert-icon--warn"><AlertTriangle :size="16" /></span>
        <div class="idle-alert-body">
          <p class="idle-alert-title">Sem atividade há {{ idleMinutes }} min</p>
          <p class="idle-alert-desc">
            O tempo para em {{ countdown }} e volta para o último momento em que você
            estava ativo.
          </p>
          <div class="idle-alert-actions">
            <button
              class="idle-alert-btn idle-alert-btn--primary"
              type="button"
              @click="idle.continueCounting()"
            >
              Continuar contando
            </button>
            <button
              class="idle-alert-btn"
              type="button"
              :disabled="idle.cutting.value"
              @click="handleStop"
            >
              Parar agora
            </button>
          </div>
        </div>
      </template>

      <!-- Estado 2: já parou, com as saídas -->
      <template v-else-if="cut">
        <span class="idle-alert-icon"><Coffee :size="16" /></span>
        <div class="idle-alert-body">
          <p class="idle-alert-title">Seu tempo parou às {{ cutAtLabel }}</p>
          <p class="idle-alert-desc">
            Encerramos por inatividade, no último momento ativo, então o tempo parado não
            foi contado.
          </p>
          <div class="idle-alert-actions">
            <button
              v-if="!isRunning"
              class="idle-alert-btn idle-alert-btn--primary"
              type="button"
              @click="handleResume"
            >
              <Play :size="13" />
              <span>Retomar</span>
            </button>
            <button
              v-if="idle.recoverableMin.value > 0"
              class="idle-alert-btn"
              type="button"
              @click="handleRecover"
            >
              <RotateCcw :size="13" />
              <span>Recuperar os {{ idle.recoverableMin.value }} min</span>
            </button>
          </div>
        </div>
        <button
          class="idle-alert-close"
          type="button"
          aria-label="Dispensar aviso"
          @click="idle.dismissCut()"
        >
          <X :size="15" />
        </button>
      </template>
    </aside>
  </Transition>
</template>

<style scoped>
.idle-alert {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 95;
  width: min(380px, calc(100vw - 32px));
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}

.idle-alert--warn {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  background: color-mix(in srgb, var(--warn) 10%, var(--surface));
}

.idle-alert-icon {
  width: 30px;
  height: 30px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
}

.idle-alert-icon--warn {
  background: color-mix(in srgb, var(--warn) 20%, transparent);
  color: var(--warn);
}

.idle-alert-body {
  flex: 1;
  min-width: 0;
}

.idle-alert-title {
  margin: 0 0 3px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.idle-alert-desc {
  margin: 0 0 10px;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.idle-alert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.idle-alert-btn {
  min-height: 34px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.idle-alert-btn:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.idle-alert-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.idle-alert-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.idle-alert-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
  color: var(--accent-fg);
}

.idle-alert-close {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.idle-alert-close:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.idle-alert-enter-active,
.idle-alert-leave-active {
  transition:
    opacity var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.idle-alert-enter-from,
.idle-alert-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
