<script setup lang="ts">
/**
 * Reconciliação de cronômetro largado (spec timer-confiavel, P2).
 *
 * Aparece quando o servidor tem uma entrada aberta cujo cliente sumiu: reboot,
 * suspensão da máquina, navegador morto, notebook fechado. Nenhuma escolha
 * automática serve para todos esses casos — o navegador pode ter morrido
 * enquanto a pessoa seguia trabalhando (fechar na última atividade apagaria
 * horas reais), ou a máquina pode ter dormido a noite inteira (fechar agora
 * inventaria uma jornada). Quem sabe o que aconteceu é ela, então o produto
 * pergunta em vez de decidir.
 *
 * Montado uma vez no AppShell.
 */
import { computed, ref } from 'vue'
import { AlarmClockOff, Check, Clock, Trash2 } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { useAbandonedEntry } from '@/composables/useAbandonedEntry'
import { useToast } from '@/composables/useToast'
import { formatDurationLong } from '@/utils/duration'

const { pending, resolving, resolve, dismiss } = useAbandonedEntry()
const { error: showError } = useToast()

const custom = ref('')
const showCustom = ref(false)

const open = computed({
  get: () => !!pending.value,
  set: (v: boolean) => {
    if (!v) dismiss()
  },
})

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const emJogo = computed(() =>
  pending.value ? formatDurationLong(pending.value.pendingSec) : '',
)

async function apply(action: 'activity' | 'now' | 'discard' | 'custom') {
  try {
    await resolve(action, action === 'custom' ? new Date(custom.value).toISOString() : undefined)
  } catch {
    showError('Não foi possível resolver esse cronômetro')
  }
}
</script>

<template>
  <AppDialog v-if="pending" v-model="open" label="Cronômetro em aberto" size="md" persistent>
    <header class="ab-head">
      <span class="ab-icon"><AlarmClockOff :size="18" /></span>
      <div>
        <h2 class="ab-title">Seu cronômetro ficou aberto</h2>
        <p class="ab-sub">
          Começou em {{ hora(pending.entry.startedAt) }} e o Nevo perdeu contato com este
          computador. Você decide o que fazer com {{ emJogo }}.
        </p>
      </div>
    </header>

    <div class="ab-body">
      <p class="ab-fact">
        Última atividade que eu vi: <strong>{{ hora(pending.lastActivityAt) }}</strong>
      </p>

      <button class="ab-opt ab-opt--primary" type="button" :disabled="resolving" @click="apply('activity')">
        <Check :size="15" />
        <span class="ab-opt-text">
          <span class="ab-opt-title">Registrar até a última atividade</span>
          <span class="ab-opt-desc">
            Fecha em {{ hora(pending.lastActivityAt) }}. É o mais seguro se você parou por aí.
          </span>
        </span>
      </button>

      <button class="ab-opt" type="button" :disabled="resolving" @click="apply('now')">
        <Clock :size="15" />
        <span class="ab-opt-text">
          <span class="ab-opt-title">Trabalhei até agora</span>
          <span class="ab-opt-desc">
            Some {{ emJogo }} à entrada. Use quando o navegador fechou mas você continuou.
          </span>
        </span>
      </button>

      <button v-if="!showCustom" class="ab-opt" type="button" @click="showCustom = true">
        <Clock :size="15" />
        <span class="ab-opt-text">
          <span class="ab-opt-title">Escolher o horário</span>
          <span class="ab-opt-desc">Para quando você sabe exatamente quando parou.</span>
        </span>
      </button>
      <div v-else class="ab-custom">
        <input v-model="custom" class="ab-input" type="datetime-local" />
        <button
          class="ab-opt-btn"
          type="button"
          :disabled="!custom || resolving"
          @click="apply('custom')"
        >
          Registrar até aqui
        </button>
      </div>

      <button class="ab-opt ab-opt--danger" type="button" :disabled="resolving" @click="apply('discard')">
        <Trash2 :size="15" />
        <span class="ab-opt-text">
          <span class="ab-opt-title">Descartar esta entrada</span>
          <span class="ab-opt-desc">Nada disso foi trabalho: apaga o registro inteiro.</span>
        </span>
      </button>
    </div>
  </AppDialog>
</template>

<style scoped>
.ab-head {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.ab-icon {
  width: 34px;
  height: 34px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 18%, transparent);
  color: var(--warn);
}

.ab-title {
  margin: 0;
  font-size: 15px;
  font-weight: 750;
  color: var(--text);
}

.ab-sub {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.ab-body {
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ab-fact {
  margin: 0 0 4px;
  color: var(--text-2);
  font-size: 12.5px;
}

.ab-opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.ab-opt:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.ab-opt:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ab-opt--primary {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.ab-opt--danger {
  color: var(--err);
}

.ab-opt-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ab-opt-title {
  font-size: 12.5px;
  font-weight: 700;
}

.ab-opt-desc {
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.4;
}

.ab-custom {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.ab-input {
  flex: 1;
  min-height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.ab-opt-btn {
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.ab-opt-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
