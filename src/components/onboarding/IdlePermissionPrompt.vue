<script setup lang="ts">
import { computed } from 'vue'
import { BellRing, X } from 'lucide-vue-next'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { idlePhase, lastCut } from '@/composables/idle-state'

/**
 * Convite de permissão do aviso de ociosidade (spec timer-ociosidade).
 *
 * Aparece no primeiro acesso e some assim que a pessoa decide. O clique no
 * botão é o que torna o pedido possível: o navegador recusa prompt de permissão
 * sem gesto do usuário, então não dá para pedir sozinho ao abrir o app.
 *
 * Some também quando a permissão já foi concedida ou negada em outra sessão.
 */
const alerts = useIdleAlerts()

/**
 * O `IdleAlert` mora no mesmo canto e tem prioridade (é o que exige ação
 * imediata). Quando ele está na tela, este card sobe para os dois conviverem —
 * e o caso não é raro: permissão pendente é exatamente a situação em que o
 * alerta de ociosidade aparece.
 */
const stacked = computed(() => idlePhase.value === 'warning' || !!lastCut.value)
</script>

<template>
  <Transition name="idle-prompt">
    <aside
      v-if="alerts.shouldShowPrompt.value"
      class="idle-prompt"
      :class="{ 'idle-prompt--stacked': stacked }"
      aria-live="polite"
    >
      <span class="idle-prompt-icon"><BellRing :size="16" /></span>
      <div class="idle-prompt-text">
        <p class="idle-prompt-title">
          {{
            alerts.nextStep.value === 'detection'
              ? 'Detectar atividade fora do navegador'
              : 'Avisar quando o timer ficar sozinho'
          }}
        </p>
        <p class="idle-prompt-desc">
          {{
            alerts.nextStep.value === 'detection'
              ? 'Falta um passo: com isso o Nevo entende que você está trabalhando em outro programa e não para seu tempo à toa.'
              : 'Se você sair do computador com o cronômetro rodando, o Nevo avisa e para o tempo em vez de contar hora que você não trabalhou.'
          }}
        </p>
      </div>
      <div class="idle-prompt-actions">
        <button
          class="idle-prompt-btn"
          type="button"
          :disabled="alerts.requesting.value"
          @click="alerts.requestNext()"
        >
          {{ alerts.stepLabel.value }}
        </button>
        <button
          class="idle-prompt-close"
          type="button"
          aria-label="Agora não"
          @click="alerts.dismissPrompt()"
        >
          <X :size="15" />
        </button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.idle-prompt {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 90;
  width: min(380px, calc(100vw - 32px));
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  transition: bottom var(--motion) var(--motion-ease);
}

/* Dá lugar ao alerta de ociosidade, que ocupa o mesmo canto. */
.idle-prompt--stacked {
  bottom: 176px;
}

.idle-prompt-icon {
  width: 30px;
  height: 30px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.idle-prompt-text {
  flex: 1;
  min-width: 0;
}

.idle-prompt-title {
  margin: 0 0 3px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.idle-prompt-desc {
  margin: 0;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.45;
}

.idle-prompt-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.idle-prompt-btn {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.idle-prompt-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.idle-prompt-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.idle-prompt-close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.idle-prompt-close:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.idle-prompt-enter-active,
.idle-prompt-leave-active {
  transition:
    opacity var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.idle-prompt-enter-from,
.idle-prompt-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
