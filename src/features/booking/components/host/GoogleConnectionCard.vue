<script setup lang="ts">
/**
 * Estado da conexão com o Google, no topo do painel. São três estados e não
 * dois: "conectado mas recusando" (autorização expirada ou revogada) é o que
 * derruba a página pública em silêncio, e precisa gritar tanto quanto o
 * "não conectado".
 */
import { computed, ref } from 'vue'
import { CalendarClock, CircleAlert, Loader2, ShieldCheck } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type GoogleHealth } from '@/service/booking/booking-service'

const props = withDefaults(defineProps<{ google: GoogleHealth; compact?: boolean }>(), {
  compact: false,
})
const emit = defineEmits<{ changed: [] }>()

const { error: showError, success: showSuccess } = useToast()
const busy = ref(false)
const confirmOpen = ref(false)

const state = computed(() =>
  !props.google.connected ? 'off' : props.google.healthy ? 'ok' : 'broken',
)

async function connect() {
  busy.value = true
  try {
    window.location.href = await bookingService.googleAuthUrl('/agendamentos')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível iniciar a conexão com o Google.'))
    busy.value = false
  }
}

async function disconnect() {
  busy.value = true
  try {
    await bookingService.disconnectGoogle()
    confirmOpen.value = false
    showSuccess('Google Calendar desconectado')
    emit('changed')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível desconectar agora.'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="state === 'ok'" class="gc gc--ok" :class="{ 'gc--compact': compact }">
    <ShieldCheck :size="16" class="gc__icon" />
    <span class="gc__text">
      Google Calendar conectado
      <strong v-if="google.email">{{ google.email }}</strong>
    </span>
    <button type="button" class="bk-btn bk-btn--ghost bk-btn--sm" :disabled="busy" @click="confirmOpen = true">
      Desconectar
    </button>
  </div>

  <div v-else class="gc gc--alert bk-alert" :class="state === 'off' ? 'bk-alert--warn' : 'bk-alert--err'">
    <component :is="state === 'off' ? CalendarClock : CircleAlert" :size="20" class="gc__alert-icon" />
    <div class="gc__body">
      <p class="gc__title">
        {{ state === 'off' ? 'Conecte seu Google Calendar' : 'A conexão com o Google parou de funcionar' }}
      </p>
      <p class="gc__desc">
        <template v-if="state === 'off'">
          É dele que o Nevo lê seus horários ocupados, e é nele que as reuniões nascem, com o link do
          Google Meet e o convite para a outra pessoa. Sem ele, a página não aceita agendamentos.
        </template>
        <template v-else>
          O Google recusou a autorização{{ google.email ? ` de ${google.email}` : '' }} (ela expira ou
          foi revogada). Sua página está fora do ar até você reconectar.
        </template>
      </p>
    </div>
    <button type="button" class="bk-btn bk-btn--primary" :disabled="busy" @click="connect">
      <Loader2 v-if="busy" :size="14" class="bk-spin" />
      {{ state === 'off' ? 'Conectar Google' : 'Reconectar' }}
    </button>
  </div>

  <ConfirmDialog
    v-model="confirmOpen"
    title="Desconectar o Google Calendar?"
    message="Sua página de agendamento para de aceitar reuniões até você conectar de novo. O calendário do Nevo também deixa de sincronizar com o Google."
    confirm-label="Desconectar"
    danger
    :loading="busy"
    @confirm="disconnect"
  />
</template>

<style scoped>
.gc--ok {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12.5px;
}

.gc--compact {
  padding: 0;
  border: none;
  background: none;
}

.gc__icon {
  flex-shrink: 0;
  color: var(--success);
}

.gc__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc__text strong {
  margin-left: 4px;
  color: var(--text);
  font-weight: 600;
}

.gc--alert {
  align-items: center;
}

.gc__alert-icon {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 1px;
}

.bk-alert--warn .gc__alert-icon {
  color: var(--warn);
}

.bk-alert--err .gc__alert-icon {
  color: var(--err);
}

.gc__body {
  flex: 1;
  min-width: 0;
}

.gc__title {
  margin: 0 0 3px;
  font-size: 13px;
  font-weight: 700;
}

.gc__desc {
  margin: 0;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .gc--alert {
    flex-wrap: wrap;
  }
}
</style>
