<script setup lang="ts">
/**
 * Diálogo de proteção do cronômetro.
 *
 * Existe porque o convite discreto no canto NÃO estava sendo visto: gente do
 * time trabalhou semanas em modo limitado sem saber que existia uma permissão a
 * conceder, e nesse modo o app não consegue distinguir "saiu do computador" de
 * "minimizou o Nevo". Um recado que muda o comportamento do produto precisa
 * interromper, não sussurrar.
 *
 * Abre ao iniciar o cronômetro enquanto a proteção estiver limitada, no máximo
 * uma vez por dia (o "agora não" adia 24h). O clique nos botões daqui é o gesto
 * que o navegador exige para abrir os prompts de permissão — e é por isso que
 * pedir de dentro de um diálogo funciona melhor do que pedir junto do clique de
 * iniciar, onde a ativação se perdia no meio do caminho.
 */
import { computed } from 'vue'
import { BellRing, Radar, ShieldCheck, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { protectionDialogOpen, closeProtectionDialog } from '@/composables/idle-protection-dialog'

const alerts = useIdleAlerts()

/** O AppDialog é v-model; o estado real mora no módulo compartilhado. */
const open = computed({
  get: () => protectionDialogOpen.value,
  set: (v: boolean) => {
    if (!v) handleLater()
  },
})

/** O diálogo se fecha sozinho quando não há mais o que pedir. */
const done = computed(() => alerts.nextStep.value === null)

async function handlePrimary() {
  await alerts.requestNext()
  if (alerts.nextStep.value === null) closeProtectionDialog()
}

function handleLater() {
  alerts.snooze()
  closeProtectionDialog()
}
</script>

<template>
  <AppDialog v-model="open" label="Proteção do cronômetro" size="md">
    <header class="prot-head">
      <span class="prot-icon"><ShieldCheck :size="18" /></span>
      <div class="prot-head-text">
        <h2 class="prot-title">Para eu não parar seu tempo à toa</h2>
        <p class="prot-sub">Dois acessos rápidos, e o cronômetro passa a ser confiável.</p>
      </div>
      <button class="prot-x" type="button" aria-label="Fechar" @click="handleLater">
        <X :size="15" />
      </button>
    </header>

    <div class="prot-body">
      <!-- Passo 1: o que muda o COMPORTAMENTO do produto -->
      <article class="prot-step" :class="{ 'prot-step--done': alerts.detectionActive.value }">
        <span class="prot-step-icon"><Radar :size="16" /></span>
        <div class="prot-step-text">
          <p class="prot-step-title">
            Detecção de atividade
            <span v-if="alerts.detectionActive.value" class="prot-badge">ativa</span>
            <span v-else-if="alerts.detectionBlocked.value" class="prot-badge prot-badge--off">
              bloqueada
            </span>
          </p>
          <p class="prot-step-desc">
            É o que me deixa perceber que você está trabalhando em outro programa. Sem ela eu
            não sei se você saiu ou só minimizou o Nevo, então
            <strong>nunca paro seu cronômetro sozinho</strong> — e o tempo esquecido vira hora
            inflada no relatório.
          </p>
          <p v-if="alerts.detectionBlocked.value" class="prot-step-hint">
            Você bloqueou este acesso. Para liberar: clique no cadeado ao lado do endereço,
            procure "Detecção de ociosidade" e mude para Permitir.
          </p>
        </div>
      </article>

      <!-- Passo 2: o que muda o ALCANCE do aviso -->
      <article class="prot-step" :class="{ 'prot-step--done': alerts.granted.value }">
        <span class="prot-step-icon"><BellRing :size="16" /></span>
        <div class="prot-step-text">
          <p class="prot-step-title">
            Notificações
            <span v-if="alerts.granted.value" class="prot-badge">ativa</span>
            <span v-else-if="alerts.blocked.value" class="prot-badge prot-badge--off">
              bloqueada
            </span>
          </p>
          <p class="prot-step-desc">
            Faz o aviso chegar até você com o navegador minimizado, com os botões de continuar
            ou parar.
          </p>
          <p v-if="alerts.blocked.value" class="prot-step-hint">
            Bloqueada no navegador. Libere no mesmo cadeado, em "Notificações".
          </p>
        </div>
      </article>

      <p v-if="done" class="prot-done">
        Tudo certo: seu cronômetro agora para sozinho só quando você realmente sai.
      </p>
    </div>

    <footer class="prot-foot">
      <button class="prot-btn prot-btn--ghost" type="button" @click="handleLater">
        {{ done ? 'Fechar' : 'Agora não' }}
      </button>
      <button
        v-if="!done"
        class="prot-btn prot-btn--primary"
        type="button"
        :disabled="alerts.requesting.value"
        @click="handlePrimary"
      >
        {{ alerts.stepLabel.value }}
      </button>
    </footer>
  </AppDialog>
</template>

<style scoped>
.prot-head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.prot-head-text {
  flex: 1;
  min-width: 0;
}

.prot-x {
  width: 28px;
  height: 28px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.prot-x:hover {
  background: var(--surface-2);
  color: var(--text);
}

.prot-foot {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--border);
}

.prot-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.prot-title {
  margin: 0;
  font-size: 15px;
  font-weight: 750;
  color: var(--text);
}

.prot-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.prot-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prot-step {
  display: flex;
  gap: 11px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.prot-step--done {
  border-color: color-mix(in srgb, var(--success) 45%, var(--border));
  background: color-mix(in srgb, var(--success) 8%, var(--surface-2));
}

.prot-step-icon {
  flex: none;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
}

.prot-step--done .prot-step-icon {
  color: var(--success);
}

.prot-step-text {
  min-width: 0;
}

.prot-step-title {
  margin: 0 0 3px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.prot-badge {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 18%, transparent);
  color: var(--success);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.prot-badge--off {
  background: color-mix(in srgb, var(--err) 16%, transparent);
  color: var(--err);
}

.prot-step-desc {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.45;
}

.prot-step-hint {
  margin: 6px 0 0;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 1.4;
}

.prot-done {
  margin: 0;
  color: var(--success);
  font-size: 12.5px;
  font-weight: 650;
}

.prot-btn {
  min-height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.prot-btn--ghost:hover {
  background: var(--surface-3);
  color: var(--text);
}

.prot-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.prot-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.prot-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
