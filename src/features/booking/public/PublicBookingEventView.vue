<script setup lang="ts">
/**
 * `/agendar/:slug/:eventSlug` — escolher horário, se identificar, confirmar.
 *
 * Três passos na mesma rota (`pick` → `form` → `done`), sem query string: o
 * horário escolhido não é algo que faça sentido compartilhar ou recarregar, e
 * um F5 no meio volta ao calendário com horários FRESCOS, que é o certo.
 *
 * Erros do POST têm destinos diferentes porque pedem ações diferentes:
 * - 409 (horário tomado): volta ao calendário recarregado, com o aviso.
 * - 429 (limite por e-mail): fica no formulário; a saída é o link do convite.
 * - 503 (Google fora): fica no formulário para tentar de novo sem redigitar.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ArrowLeft, CalendarCheck2, CalendarOff, Loader2, MailCheck } from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import {
  publicBookingService,
  type PublicBooking,
  type PublicEventTypeView,
} from '@/service/booking/booking-service'
import PublicBookingFrame from '../components/PublicBookingFrame.vue'
import SlotPicker from '../components/SlotPicker.vue'
import BookingSummary from '../components/BookingSummary.vue'
import { useInviteeTimezone } from '../composables/useInviteeTimezone'
import { formatRange, zoneLabel } from '../booking-time'

const route = useRoute()
const slug = String(route.params.slug ?? '')
const eventSlug = String(route.params.eventSlug ?? '')

const info = ref<PublicEventTypeView | null>(null)
const loadError = ref<string | null>(null)
const loading = ref(true)

const timezone = useInviteeTimezone()
const step = ref<'pick' | 'form' | 'done'>('pick')
const chosen = ref<string | null>(null)
const notice = ref<string | null>(null)
const picker = ref<InstanceType<typeof SlotPicker> | null>(null)

const form = reactive({ name: '', email: '', notes: '' })
const submitting = ref(false)
const formError = ref<string | null>(null)
const booking = ref<PublicBooking | null>(null)

const endOfChosen = computed(() =>
  chosen.value && info.value
    ? new Date(Date.parse(chosen.value) + info.value.eventType.durationMin * 60_000).toISOString()
    : '',
)

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
const canSubmit = computed(
  () => form.name.trim().length >= 2 && emailValid.value && !submitting.value,
)

onMounted(async () => {
  try {
    info.value = await publicBookingService.eventType(slug, eventSlug)
    document.title = `${info.value.eventType.title} · ${info.value.host.name}`
  } catch (e) {
    loadError.value = bookingErrorMessage(e, 'Não foi possível abrir esta agenda agora.')
  } finally {
    loading.value = false
  }
})

function loadSlots(range: { start: string; end: string }) {
  return publicBookingService.slots(slug, eventSlug, range)
}

function onPick(startAt: string) {
  chosen.value = startAt
  notice.value = null
  formError.value = null
  step.value = 'form'
}

function backToPick() {
  step.value = 'pick'
  formError.value = null
}

async function submit() {
  if (!chosen.value || !canSubmit.value) return
  submitting.value = true
  formError.value = null
  try {
    booking.value = await publicBookingService.book(slug, eventSlug, {
      startAt: chosen.value,
      name: form.name.trim(),
      email: form.email.trim(),
      timezone: timezone.value,
      notes: form.notes.trim() || undefined,
    })
    step.value = 'done'
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined
    const message = bookingErrorMessage(e, 'Não foi possível confirmar agora. Tente de novo.')
    if (status === 409) {
      notice.value = message
      chosen.value = null
      step.value = 'pick'
      await picker.value?.refresh()
    } else {
      formError.value = message
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <PublicBookingFrame v-if="loading || loadError || !info" compact>
    <div class="ev-state">
      <p v-if="loading" class="ev-muted">Carregando agenda...</p>
      <template v-else>
        <CalendarOff :size="28" class="ev-state__icon" />
        <h1>Agenda indisponível</h1>
        <p class="ev-muted">{{ loadError }}</p>
      </template>
    </div>
  </PublicBookingFrame>

  <PublicBookingFrame
    v-else
    :host-name="info.host.name"
    :headline="info.host.headline"
    :title="info.eventType.title"
    :duration-min="info.eventType.durationMin"
    :description="step === 'pick' ? info.eventType.description : null"
  >
    <template #aside>
      <RouterLink
        v-if="step === 'pick'"
        class="ev-all"
        :to="{ name: 'public-booking', params: { slug: info.slug } }"
      >
        <ArrowLeft :size="13" />
        Outros tipos de reunião
      </RouterLink>
      <p v-if="step === 'form' && chosen" class="ev-chosen">
        <CalendarCheck2 :size="15" />
        <span>{{ formatRange(chosen, endOfChosen, timezone) }}</span>
      </p>
    </template>

    <!-- Indisponível (anfitrião sem Google) -->
    <div v-if="!info.accepting" class="ev-state">
      <CalendarOff :size="28" class="ev-state__icon" />
      <h2>Agenda temporariamente indisponível</h2>
      <p class="ev-muted">
        {{ info.host.name }} não está recebendo agendamentos por aqui no momento.
      </p>
    </div>

    <!-- 1. Escolher -->
    <template v-else-if="step === 'pick'">
      <h2 class="ev-h2">Escolha dia e horário</h2>
      <p v-if="notice" class="ev-notice" role="alert">{{ notice }}</p>
      <SlotPicker
        ref="picker"
        v-model:timezone="timezone"
        :loader="loadSlots"
        :max-days-ahead="info.eventType.maxDaysAhead"
        @confirm="onPick"
      />
    </template>

    <!-- 2. Identificar -->
    <form v-else-if="step === 'form'" class="ev-form" novalidate @submit.prevent="submit">
      <button type="button" class="ev-back" @click="backToPick">
        <ArrowLeft :size="14" />
        Trocar horário
      </button>
      <h2 class="ev-h2">Seus dados</h2>
      <p class="ev-muted ev-muted--left">
        O convite com o link do Google Meet vai para este e-mail. Horário em
        {{ zoneLabel(timezone, chosen ? Date.parse(chosen) : Date.now()) }}.
      </p>

      <label class="ev-field">
        <span>Nome</span>
        <input
          v-model="form.name"
          type="text"
          autocomplete="name"
          maxlength="120"
          required
          :disabled="submitting"
        />
      </label>
      <label class="ev-field">
        <span>E-mail</span>
        <input
          v-model="form.email"
          type="email"
          autocomplete="email"
          inputmode="email"
          maxlength="254"
          required
          :aria-invalid="form.email.length > 3 && !emailValid"
          :disabled="submitting"
        />
        <small v-if="form.email.length > 3 && !emailValid" class="ev-hint ev-hint--err">
          Confira o e-mail: é para ele que o convite vai.
        </small>
      </label>
      <label class="ev-field">
        <span>O que você quer tratar? <em>(opcional)</em></span>
        <textarea
          v-model="form.notes"
          rows="4"
          maxlength="2000"
          placeholder="Contexto que ajude a preparar a reunião"
          :disabled="submitting"
        />
      </label>

      <p v-if="formError" class="ev-error" role="alert">{{ formError }}</p>

      <button type="submit" class="ev-submit press" :disabled="!canSubmit">
        <Loader2 v-if="submitting" :size="16" class="spin" />
        {{ submitting ? 'Confirmando...' : 'Confirmar reunião' }}
      </button>
    </form>

    <!-- 3. Confirmado -->
    <div v-else-if="booking" class="ev-done">
      <span class="ev-done__icon"><MailCheck :size="26" /></span>
      <h2 class="ev-h2 ev-h2--center">Reunião confirmada</h2>
      <p class="ev-muted">
        Enviamos o convite para <strong>{{ booking.inviteeEmail }}</strong>. Ele já está na
        agenda de {{ booking.host.name }}, com o link do Google Meet.
      </p>
      <BookingSummary
        class="ev-done__summary"
        :start-at="booking.startAt"
        :end-at="booking.endAt"
        :timezone="timezone"
        :host-name="booking.host.name"
        :host-timezone="booking.host.timezone"
        :meet-link="booking.meetLink"
      />
      <div class="ev-done__actions">
        <a
          v-if="booking.meetLink"
          :href="booking.meetLink"
          target="_blank"
          rel="noopener noreferrer"
          class="ev-submit ev-submit--inline press"
        >
          Abrir o Google Meet
        </a>
        <RouterLink
          class="ev-link"
          :to="{ name: 'public-booking-manage', params: { token: booking.manageToken } }"
        >
          Remarcar ou cancelar
        </RouterLink>
      </div>
    </div>
  </PublicBookingFrame>
</template>

<style scoped>
.ev-h2 {
  margin: 0 0 18px;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.ev-h2--center {
  margin-bottom: 6px;
  text-align: center;
}

.ev-muted {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.55;
  text-align: center;
}

.ev-muted--left {
  margin: -10px 0 18px;
  text-align: left;
}

.ev-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  color: var(--text-3);
  font-size: 12px;
  text-decoration: none;
}

.ev-all:hover {
  color: var(--text);
}

.ev-chosen {
  display: flex;
  gap: 9px;
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
}

.ev-chosen :deep(svg) {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--accent);
}

.ev-chosen span::first-letter {
  text-transform: uppercase;
}

.ev-notice,
.ev-error {
  margin: 0 0 16px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  line-height: 1.5;
}

.ev-notice {
  border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  color: var(--text);
}

.ev-error {
  border: 1px solid color-mix(in srgb, var(--err) 40%, transparent);
  background: color-mix(in srgb, var(--err) 10%, transparent);
  color: var(--text);
}

.ev-form {
  display: flex;
  flex-direction: column;
  max-width: 440px;
}

.ev-back {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
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

.ev-back:hover {
  color: var(--text);
}

.ev-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.ev-field > span {
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.ev-field em {
  color: var(--text-4);
  font-style: normal;
  font-weight: 500;
}

.ev-field input,
.ev-field textarea {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.ev-field textarea {
  resize: vertical;
  min-height: 92px;
  line-height: 1.5;
}

.ev-field input:focus,
.ev-field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

.ev-field input[aria-invalid='true'] {
  border-color: var(--err);
}

.ev-hint {
  font-size: 11.5px;
}

.ev-hint--err {
  color: var(--err);
}

.ev-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  margin-top: 4px;
  padding: 0 22px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
  cursor: pointer;
}

.ev-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ev-submit--inline {
  margin-top: 0;
}

.ev-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 520px;
  margin: 0 auto;
  padding: 8px 0;
}

.ev-done__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}

.ev-done__summary {
  align-self: stretch;
  margin-top: 14px;
}

.ev-done__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 18px;
  margin-top: 18px;
}

.ev-link {
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ev-link:hover {
  color: var(--text);
}

.ev-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 8px;
  text-align: center;
}

.ev-state h1,
.ev-state h2 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.ev-state__icon {
  color: var(--text-3);
}

.spin {
  animation: ev-spin 0.9s linear infinite;
}

@keyframes ev-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
