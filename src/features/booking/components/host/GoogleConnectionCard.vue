<script setup lang="ts">
/**
 * Estado da conexão com o Google. São três estados e não dois: "conectado mas
 * recusando" (autorização expirada ou revogada) é o que derruba a página
 * pública em silêncio, e precisa gritar tanto quanto o "não conectado".
 *
 * Variantes:
 * - `banner` (padrão): aviso completo, com título e explicação, no topo do
 *   painel e na aba Página;
 * - `inline`: só a ação (ou a linha de "conectado"), para quem já tem o
 *   título e a explicação em volta, como o passo 1 do primeiro acesso.
 */
import { computed, ref } from 'vue'
import { CalendarClock, Check, CircleAlert, Loader2 } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type GoogleHealth } from '@/service/booking/booking-service'

const props = withDefaults(defineProps<{ google: GoogleHealth; variant?: 'banner' | 'inline' }>(), {
  variant: 'banner',
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
  <div v-if="state === 'ok'" class="gc gc--ok">
    <span class="gc__badge" aria-hidden="true"><Check :size="14" :stroke-width="2.6" /></span>
    <span class="gc__text">
      <span class="gc__title">Google Calendar conectado</span>
      <span v-if="google.email" class="gc__email" :title="google.email">{{ google.email }}</span>
    </span>
    <button type="button" class="bk-btn bk-btn--ghost bk-btn--sm" :disabled="busy" @click="confirmOpen = true">
      Desconectar
    </button>
  </div>

  <div v-else-if="variant === 'inline'" class="gc gc--inline">
    <button type="button" class="bk-btn bk-btn--primary" :disabled="busy" @click="connect">
      <Loader2 v-if="busy" :size="14" class="bk-spin" />
      <CalendarClock v-else :size="14" />
      {{ state === 'off' ? 'Conectar Google Calendar' : 'Reconectar o Google' }}
    </button>
    <span v-if="state === 'broken'" class="bk-hint bk-hint--err">
      <CircleAlert :size="12" />
      O Google recusou a autorização{{ google.email ? ` de ${google.email}` : '' }}.
    </span>
  </div>

  <div v-else class="gc gc--alert bk-alert" :class="state === 'off' ? 'bk-alert--warn' : 'bk-alert--err'">
    <component :is="state === 'off' ? CalendarClock : CircleAlert" :size="20" />
    <div class="gc__body">
      <p class="gc__alert-title">
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
    <button type="button" class="bk-btn bk-btn--primary gc__cta" :disabled="busy" @click="connect">
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
  gap: 12px;
  padding: 12px 12px 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface-2) 45%, var(--surface));
}

.gc__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
}

.gc__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.gc__title {
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
}

.gc__email {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gc--inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.gc--alert {
  align-items: center;
}

.gc--alert > svg {
  align-self: flex-start;
  margin-top: 1px;
}

.gc__body {
  flex: 1;
  min-width: 0;
}

.gc__alert-title {
  margin: 0 0 3px;
  font-size: 13px;
  font-weight: 700;
}

.gc__desc {
  margin: 0;
  color: var(--text-2);
}

.gc__cta {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .gc--alert {
    flex-wrap: wrap;
  }

  .gc__cta {
    width: 100%;
  }
}
</style>
