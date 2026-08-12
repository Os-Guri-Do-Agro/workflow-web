<script setup lang="ts">
import { computed } from 'vue'
import { Play, RotateCcw, X } from 'lucide-vue-next'
import MascotCard from '@/components/ui/MascotCard.vue'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useTimerIdleGuard } from '@/composables/useTimerIdleGuard'
import { useToast } from '@/composables/useToast'
import { formatTimer } from '@/utils/duration'

/**
 * Aviso de ociosidade do timer (spec timer-ociosidade), no formato de recado do
 * Nevo.
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
  <Transition name="nevo-card">
    <MascotCard
      v-if="visible"
      from="Nevo"
      :tone="warning ? 'warn' : 'default'"
      live="assertive"
    >
      <template #meta>
        <span v-if="warning" class="alert-countdown">para em {{ countdown }}</span>
      </template>

      <!-- Estado 1: ainda dá para continuar -->
      <template v-if="warning">
        <p class="alert-title">Você ainda está por aí?</p>
        <p class="alert-desc">
          Não vejo atividade há {{ idleMinutes }} min e seu cronômetro continua correndo. Se
          ninguém responder, eu paro o tempo no último momento em que você estava ativo.
        </p>
      </template>

      <!-- Estado 2: já parou, com as saídas -->
      <template v-else-if="cut">
        <p class="alert-title">Parei seu tempo às {{ cutAtLabel }}</p>
        <p class="alert-desc">
          Foi por inatividade, e voltei até o último momento ativo — o tempo parado não entrou
          na sua conta.
        </p>
      </template>

      <template #actions>
        <template v-if="warning">
          <button class="alert-btn alert-btn--primary" type="button" @click="idle.continueCounting()">
            Continuar contando
          </button>
          <button
            class="alert-btn"
            type="button"
            :disabled="idle.cutting.value"
            @click="handleStop"
          >
            Parar agora
          </button>
        </template>
        <template v-else>
          <button
            v-if="!isRunning"
            class="alert-btn alert-btn--primary"
            type="button"
            @click="handleResume"
          >
            <Play :size="12" />
            <span>Retomar</span>
          </button>
          <button
            v-if="idle.recoverableMin.value > 0"
            class="alert-btn"
            type="button"
            @click="handleRecover"
          >
            <RotateCcw :size="12" />
            <span>Recuperar os {{ idle.recoverableMin.value }} min</span>
          </button>
        </template>
      </template>

      <template v-if="!warning" #dismiss>
        <button
          class="alert-close"
          type="button"
          aria-label="Dispensar aviso"
          @click="idle.dismissCut()"
        >
          <X :size="13" />
        </button>
      </template>
    </MascotCard>
  </Transition>
</template>

<style scoped>
.alert-title {
  margin: 0 0 4px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.alert-desc {
  margin: 0;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.45;
}

.alert-countdown {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn) 22%, transparent);
  color: var(--warn);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}

.alert-btn {
  min-height: 32px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.alert-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.alert-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alert-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.alert-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
  color: var(--accent-fg);
}

.alert-close {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.alert-close:hover {
  background: var(--surface-3);
  color: var(--text);
}

.nevo-card-enter-active,
.nevo-card-leave-active {
  transition:
    opacity var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.nevo-card-enter-from,
.nevo-card-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
