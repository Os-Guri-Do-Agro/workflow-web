<script setup lang="ts">
/**
 * `/reuniao/:token` — o link que vai dentro do convite. Sem login: o token de
 * 192 bits É a autorização do convidado.
 *
 * Remarcar mostra os horários com a própria reunião liberada (empurrar 30 min
 * uma reunião de 1h não pode ser recusado por conflito com ela mesma). Tanto
 * remarcar quanto cancelar avisam a outra parte pelo Google, então a tela
 * diz isso antes do clique.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ArrowLeft, CalendarCheck2, CalendarOff, CalendarX2, Loader2 } from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import { publicBookingService, type PublicBooking } from '@/service/booking/booking-service'
import PublicBookingFrame from '../components/PublicBookingFrame.vue'
import SlotPicker from '../components/SlotPicker.vue'
import BookingSummary from '../components/BookingSummary.vue'
import { useInviteeTimezone } from '../composables/useInviteeTimezone'
import { formatRange } from '../booking-time'

const route = useRoute()
const token = String(route.params.token ?? '')

const booking = ref<PublicBooking | null>(null)
const loadError = ref<string | null>(null)
const loading = ref(true)
const timezone = useInviteeTimezone()

const mode = ref<'view' | 'reschedule' | 'cancel'>('view')
const working = ref(false)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)
const success = ref<string | null>(null)
const reason = ref('')
const pendingSlot = ref<string | null>(null)
const picker = ref<InstanceType<typeof SlotPicker> | null>(null)

const isCanceled = computed(() => booking.value?.status === 'CANCELED')

onMounted(async () => {
  try {
    booking.value = await publicBookingService.manage(token)
    document.title = `${booking.value.eventType.title} · ${booking.value.host.name}`
  } catch (e) {
    loadError.value = bookingErrorMessage(e, 'Não foi possível abrir esta reunião agora.')
  } finally {
    loading.value = false
  }
})

function loadSlots(range: { start: string; end: string }) {
  return publicBookingService.manageSlots(token, range)
}

function open(next: 'reschedule' | 'cancel') {
  mode.value = next
  actionError.value = null
  notice.value = null
  success.value = null
  pendingSlot.value = null
}

async function confirmReschedule(startAt: string) {
  pendingSlot.value = startAt
  working.value = true
  actionError.value = null
  try {
    booking.value = await publicBookingService.reschedule(token, {
      startAt,
      timezone: timezone.value,
    })
    mode.value = 'view'
    success.value = 'Reunião remarcada. O Google enviou o convite atualizado para os participantes.'
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined
    const message = bookingErrorMessage(e, 'Não foi possível remarcar agora.')
    if (status === 409) {
      notice.value = message
      await picker.value?.refresh()
    } else {
      actionError.value = message
    }
  } finally {
    working.value = false
    pendingSlot.value = null
  }
}

async function confirmCancel() {
  working.value = true
  actionError.value = null
  try {
    booking.value = await publicBookingService.cancel(token, reason.value.trim() || undefined)
    mode.value = 'view'
    success.value = null
  } catch (e) {
    actionError.value = bookingErrorMessage(e, 'Não foi possível cancelar agora.')
  } finally {
    working.value = false
  }
}
</script>

<template>
  <PublicBookingFrame v-if="loading || loadError || !booking" compact>
    <div class="mg-state">
      <p v-if="loading" class="mg-muted">Carregando reunião...</p>
      <template v-else>
        <CalendarOff :size="28" class="mg-state__icon" />
        <h1>Reunião não encontrada</h1>
        <p class="mg-muted">{{ loadError }}</p>
      </template>
    </div>
  </PublicBookingFrame>

  <PublicBookingFrame
    v-else
    :host-name="booking.host.name"
    :title="booking.eventType.title"
    :duration-min="booking.eventType.durationMin"
  >
    <template #aside>
      <p v-if="mode === 'reschedule'" class="mg-current">
        <span class="mg-current__label">Horário atual</span>
        <span class="mg-current__value">{{ formatRange(booking.startAt, booking.endAt, timezone) }}</span>
      </p>
    </template>

    <!-- Remarcar -->
    <template v-if="mode === 'reschedule'">
      <button type="button" class="mg-back" :disabled="working" @click="mode = 'view'">
        <ArrowLeft :size="14" />
        Voltar
      </button>
      <h2 class="mg-h2">Escolha o novo horário</h2>
      <p v-if="notice" class="mg-notice" role="alert">{{ notice }}</p>
      <p v-if="actionError" class="mg-error" role="alert">{{ actionError }}</p>
      <SlotPicker
        ref="picker"
        v-model:timezone="timezone"
        :loader="loadSlots"
        :max-days-ahead="booking.eventType.maxDaysAhead"
        :busy="working"
        :confirm-label="working ? 'Remarcando...' : 'Remarcar'"
        @confirm="confirmReschedule"
      />
    </template>

    <!-- Cancelar -->
    <div v-else-if="mode === 'cancel'" class="mg-cancel">
      <button type="button" class="mg-back" :disabled="working" @click="mode = 'view'">
        <ArrowLeft :size="14" />
        Voltar
      </button>
      <h2 class="mg-h2">Cancelar a reunião?</h2>
      <BookingSummary
        :start-at="booking.startAt"
        :end-at="booking.endAt"
        :timezone="timezone"
        :host-name="booking.host.name"
        :host-timezone="booking.host.timezone"
      />
      <label class="mg-field">
        <span>Motivo <em>(opcional, {{ booking.host.name }} vai ver)</em></span>
        <textarea v-model="reason" rows="3" maxlength="500" :disabled="working" />
      </label>
      <p class="mg-muted mg-muted--left">
        O Google avisa os participantes e o evento sai das agendas.
      </p>
      <p v-if="actionError" class="mg-error" role="alert">{{ actionError }}</p>
      <div class="mg-actions">
        <button type="button" class="mg-btn mg-btn--danger press" :disabled="working" @click="confirmCancel">
          <Loader2 v-if="working" :size="15" class="spin" />
          Cancelar reunião
        </button>
        <button type="button" class="mg-btn mg-btn--ghost" :disabled="working" @click="mode = 'view'">
          Manter
        </button>
      </div>
    </div>

    <!-- Ver -->
    <div v-else class="mg-view">
      <span class="mg-badge" :class="isCanceled ? 'mg-badge--off' : 'mg-badge--ok'">
        <component :is="isCanceled ? CalendarX2 : CalendarCheck2" :size="14" />
        {{ isCanceled ? 'Cancelada' : 'Confirmada' }}
      </span>
      <h2 class="mg-h2">
        {{ isCanceled ? 'Esta reunião foi cancelada' : `Sua reunião com ${booking.host.name}` }}
      </h2>
      <p v-if="success" class="mg-success" role="status">{{ success }}</p>
      <p v-if="isCanceled && booking.cancelReason" class="mg-muted mg-muted--left">
        Motivo: {{ booking.cancelReason }}
      </p>

      <BookingSummary
        :start-at="booking.startAt"
        :end-at="booking.endAt"
        :timezone="timezone"
        :host-name="booking.host.name"
        :host-timezone="booking.host.timezone"
        :invitee-name="booking.inviteeName"
        :invitee-email="booking.inviteeEmail"
        :meet-link="booking.meetLink"
        :canceled="isCanceled"
      />

      <div v-if="booking.canModify" class="mg-actions">
        <button type="button" class="mg-btn mg-btn--primary press" @click="open('reschedule')">
          Remarcar
        </button>
        <button type="button" class="mg-btn mg-btn--ghost" @click="open('cancel')">Cancelar</button>
      </div>
      <p v-else-if="!isCanceled" class="mg-muted mg-muted--left">
        Essa reunião já começou ou aconteceu, então não dá mais para remarcar por aqui.
      </p>
      <RouterLink
        v-if="isCanceled"
        class="mg-again"
        :to="{ name: 'public-booking', params: { slug: booking.page.slug } }"
      >
        Marcar um novo horário
      </RouterLink>
    </div>
  </PublicBookingFrame>
</template>

<style scoped>
.mg-h2 {
  margin: 0 0 16px;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.mg-muted {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.55;
  text-align: center;
}

.mg-muted--left {
  text-align: left;
}

.mg-current {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.mg-current__label {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mg-current__value {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.mg-current__value::first-letter {
  text-transform: uppercase;
}

.mg-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: -4px 0 14px;
  padding: 4px 0;
  border: none;
  background: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.mg-back:hover:not(:disabled) {
  color: var(--text);
}

.mg-view,
.mg-cancel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 520px;
}

.mg-view .mg-h2,
.mg-cancel .mg-h2 {
  margin: 0;
}

.mg-badge {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
}

.mg-badge--ok {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.mg-badge--off {
  background: color-mix(in srgb, var(--err) 12%, transparent);
  color: var(--err);
}

.mg-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mg-field > span {
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.mg-field em {
  color: var(--text-4);
  font-style: normal;
  font-weight: 500;
}

.mg-field textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}

.mg-field textarea:focus {
  border-color: var(--accent);
}

.mg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 20px;
  border-radius: var(--radius);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 650;
  cursor: pointer;
}

.mg-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.mg-btn--primary {
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
}

.mg-btn--danger {
  border: none;
  background: var(--err);
  /* Mesmo contraste do botão de perigo do ConfirmDialog. */
  color: white;
}

.mg-btn--ghost {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
}

.mg-btn--ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.mg-again {
  align-self: flex-start;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}

.mg-notice,
.mg-error,
.mg-success {
  margin: 0 0 4px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.5;
}

.mg-notice {
  border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
}

.mg-error {
  border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

.mg-success {
  border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
}

.mg-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 8px;
  text-align: center;
}

.mg-state h1 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.mg-state__icon {
  color: var(--text-3);
}

.spin {
  animation: mg-spin 0.9s linear infinite;
}

@keyframes mg-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
