<script setup lang="ts">
import MascotCard from '@/components/ui/MascotCard.vue'
import { useIdleAlerts } from '@/composables/useIdleAlerts'

/**
 * Convite de permissão do aviso de ociosidade (spec timer-ociosidade).
 *
 * Aparece no primeiro acesso e some assim que a pessoa decide. O clique no
 * botão é o que torna o pedido possível: o navegador recusa prompt de permissão
 * sem gesto do usuário, então não dá para pedir sozinho ao abrir o app.
 *
 * São duas permissões e uma por clique (ver `useIdleAlerts`), então o texto
 * muda conforme o passo que falta.
 */
const alerts = useIdleAlerts()
</script>

<template>
  <Transition name="nevo-card">
    <MascotCard v-if="alerts.shouldShowPrompt.value" from="Nevo">
      <p class="prompt-title">
        {{
          alerts.nextStep.value === 'detection'
            ? 'Falta um passo para eu te avisar direito'
            : 'Quer que eu te avise se o timer ficar sozinho?'
        }}
      </p>
      <p class="prompt-desc">
        {{
          alerts.nextStep.value === 'detection'
            ? 'Com a detecção de atividade eu entendo quando você está trabalhando em outro programa e não paro seu tempo à toa.'
            : 'Se você sair do computador com o cronômetro rodando, eu aviso e paro o tempo em vez de contar hora que você não trabalhou.'
        }}
      </p>

      <template #actions>
        <button
          class="prompt-btn"
          type="button"
          :disabled="alerts.requesting.value"
          @click="alerts.requestNext()"
        >
          {{ alerts.stepLabel.value }}
        </button>
        <button class="prompt-btn prompt-btn--ghost" type="button" @click="alerts.dismissPrompt()">
          Agora não
        </button>
      </template>

    </MascotCard>
  </Transition>
</template>

<style scoped>
.prompt-title {
  margin: 0 0 4px;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.prompt-desc {
  margin: 0;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.45;
}

.prompt-btn {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.prompt-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.prompt-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.prompt-btn--ghost {
  border-color: var(--border);
  background: transparent;
  color: var(--text-3);
}

.prompt-btn--ghost:hover {
  background: var(--surface-2);
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
