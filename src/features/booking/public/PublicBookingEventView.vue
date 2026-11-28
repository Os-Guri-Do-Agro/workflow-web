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
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarOff,
  Check,
  Globe,
  Loader2,
  Lock,
  TriangleAlert,
  Video,
} from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import {
  publicBookingService,
  type PublicBooking,
  type PublicEventTypeView,
} from '@/service/booking/booking-service'
import PublicBookingFrame from '../components/PublicBookingFrame.vue'
import BookingSteps from '../components/BookingSteps.vue'
import SlotPicker from '../components/SlotPicker.vue'
import BookingSummary from '../components/BookingSummary.vue'
import { useInviteeTimezone } from '../composables/useInviteeTimezone'
import { formatDayOf, formatTimeRange, zoneLabel } from '../booking-time'

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
const nameInput = ref<HTMLInputElement | null>(null)

/**
 * "Outros tipos de reunião" só aparece para quem veio da lista. Quem chegou
 * pelo link direto do tipo (o caso comum) não tem lista para onde voltar, e
 * numa página de um tipo só a lista devolveria para cá mesmo.
 */
const backState = window.history.state as { back?: unknown } | null
const cameFromList =
  typeof backState?.back === 'string' && /^\/agendar\/[^/]+\/?$/.test(backState.back.split('?')[0]!)

const endOfChosen = computed(() =>
  chosen.value && info.value
    ? new Date(Date.parse(chosen.value) + info.value.eventType.durationMin * 60_000).toISOString()
    : '',
)

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
const showEmailError = ref(false)
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

async function onPick(startAt: string) {
  chosen.value = startAt
  notice.value = null
  formError.value = null
  step.value = 'form'
  await nextTick()
  window.scrollTo({ top: 0 })
  nameInput.value?.focus({ preventScroll: true })
}

function backToPick() {
  step.value = 'pick'
  formError.value = null
}

async function submit() {
  showEmailError.value = form.email.length > 0 && !emailValid.value
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
    window.scrollTo({ top: 0 })
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
  <PublicBookingFrame v-if="loading" loading />

  <PublicBookingFrame v-else-if="loadError || !info" compact>
    <div class="ev-state">
      <span class="ev-state__icon"><CalendarOff :size="22" /></span>
      <h1>Agenda indisponível</h1>
      <p>{{ loadError }}</p>
    </div>
  </PublicBookingFrame>

  <PublicBookingFrame
    v-else
    :host-name="info.host.name"
    :headline="info.host.headline"
    :avatar-url="info.host.avatarUrl"
    :title="info.eventType.title"
    :duration-min="info.eventType.durationMin"
    :description="step === 'pick' ? info.eventType.description : null"
  >
    <template v-if="step !== 'pick' && chosen" #facts>
      <li class="bk-fact bk-fact--key">
        <CalendarCheck2 :size="16" />
        <span>
          <span class="bk-fact__line bk-first-up">{{ formatDayOf(chosen, timezone) }}</span>
          <span class="bk-fact__line bk-fact__time">{{ formatTimeRange(chosen, endOfChosen, timezone) }}</span>
        </span>
      </li>
      <li class="bk-fact">
        <Globe :size="16" />
        <span>{{ zoneLabel(timezone, Date.parse(chosen)) }}</span>
      </li>
    </template>

    <template v-if="step === 'pick' && cameFromList" #aside-foot>
      <RouterLink class="bk-back" :to="{ name: 'public-booking', params: { slug: info.slug } }">
        <ArrowLeft :size="14" />
        Outros tipos de reunião
      </RouterLink>
    </template>

    <!-- Indisponível (anfitrião sem Google) -->
    <div v-if="!info.accepting" class="ev-state">
      <span class="ev-state__icon"><CalendarOff :size="22" /></span>
      <h2>Agenda temporariamente indisponível</h2>
      <p>{{ info.host.name }} não está recebendo agendamentos por aqui no momento.</p>
    </div>

    <!-- 1. Escolher -->
    <template v-else-if="step === 'pick'">
      <header class="ev-head">
        <BookingSteps :current="1" />
        <h2>Escolha dia e horário</h2>
      </header>
      <p v-if="notice" class="bk-alert bk-alert--warn ev-notice" role="alert">
        <TriangleAlert :size="15" />
        <span>{{ notice }}</span>
      </p>
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
      <header class="ev-head">
        <BookingSteps :current="2" />
        <button type="button" class="bk-back ev-back" :disabled="submitting" @click="backToPick">
          <ArrowLeft :size="14" />
          Trocar horário
        </button>
        <h2>Seus dados</h2>
        <p class="ev-sub">O convite com o link do Google Meet vai para o e-mail que você informar.</p>
      </header>

      <label class="bk-field">
        <span class="bk-label">Nome</span>
        <input
          ref="nameInput"
          v-model="form.name"
          class="bk-input bk-input--lg"
          type="text"
          autocomplete="name"
          maxlength="120"
          required
          :disabled="submitting"
        />
      </label>
      <label class="bk-field">
        <span class="bk-label">E-mail</span>
        <input
          v-model="form.email"
          class="bk-input bk-input--lg"
          type="email"
          autocomplete="email"
          inputmode="email"
          maxlength="254"
          required
          :aria-invalid="showEmailError && !emailValid"
          :disabled="submitting"
          @blur="showEmailError = form.email.length > 0 && !emailValid"
        />
        <small v-if="showEmailError && !emailValid" class="bk-hint bk-hint--err">
          Confira o e-mail: é para ele que o convite vai.
        </small>
      </label>
      <label class="bk-field">
        <span class="bk-label">O que você quer tratar? <span class="bk-label__opt">(opcional)</span></span>
        <textarea
          v-model="form.notes"
          class="bk-input bk-input--lg"
          rows="4"
          maxlength="2000"
          placeholder="Contexto que ajude a preparar a reunião"
          :disabled="submitting"
        />
      </label>

      <p v-if="formError" class="bk-alert bk-alert--err" role="alert">
        <TriangleAlert :size="15" />
        <span>{{ formError }}</span>
      </p>

      <button type="submit" class="bk-btn bk-btn--primary bk-btn--lg bk-btn--block press" :disabled="!canSubmit">
        <Loader2 v-if="submitting" :size="16" class="bk-spin" />
        {{ submitting ? 'Confirmando...' : 'Confirmar reunião' }}
      </button>
      <p class="ev-privacy">
        <Lock :size="12" />
        Seus dados vão só para {{ info.host.name }} e para o convite do Google Calendar.
      </p>
    </form>

    <!-- 3. Confirmado -->
    <div v-else-if="booking" class="ev-done">
      <span class="ev-done__icon"><Check :size="26" :stroke-width="2.6" /></span>
      <h2>Reunião confirmada</h2>
      <p class="ev-done__lead">
        Enviamos o convite para <strong>{{ booking.inviteeEmail }}</strong>. A reunião já está na
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
          class="bk-btn bk-btn--primary bk-btn--lg press"
        >
          <Video :size="16" />
          Abrir o Google Meet
        </a>
        <RouterLink
          class="bk-btn bk-btn--lg"
          :to="{ name: 'public-booking-manage', params: { token: booking.manageToken } }"
        >
          Remarcar ou cancelar
        </RouterLink>
      </div>
      <p class="ev-done__tip">O convite que chegou no seu e-mail também traz o link para remarcar ou cancelar.</p>
    </div>
  </PublicBookingFrame>
</template>

<style scoped>
.ev-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 20px;
}

.ev-head h2 {
  margin: 16px 0 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ev-back {
  margin: 14px 0 -6px -6px;
}

.ev-sub {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.55;
}

.ev-notice {
  margin-bottom: 16px;
}

.ev-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 460px;
}

.ev-form .ev-head {
  margin-bottom: 4px;
}

.ev-privacy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: -4px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.45;
  text-align: center;
}

.ev-privacy :deep(svg) {
  flex-shrink: 0;
}

/* ─── Confirmado ──────────────────────────────────────────────────────────── */

.ev-done {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 540px;
  margin: 0 auto;
  padding: 12px 0;
  text-align: center;
}

.ev-done__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  margin-bottom: 16px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--success) 6%, transparent);
  color: var(--success);
  animation: ev-pop var(--motion-slow) var(--motion-ease);
}

.ev-done h2 {
  margin: 0;
  color: var(--text);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.ev-done__lead {
  max-width: 440px;
  margin: 8px 0 0;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.6;
}

.ev-done__lead strong {
  color: var(--text);
  font-weight: 650;
  overflow-wrap: anywhere;
}

.ev-done__summary {
  align-self: stretch;
  margin-top: 22px;
}

.ev-done__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

.ev-done__tip {
  margin: 16px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

/* ─── Estados ─────────────────────────────────────────────────────────────── */

.ev-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 8px;
  text-align: center;
}

.ev-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-3);
}

.ev-state h1,
.ev-state h2 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.ev-state p {
  max-width: 380px;
  margin: 0;
  color: var(--text-3);
  font-size: 13.5px;
  line-height: 1.55;
}

@keyframes ev-pop {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
}

@media (max-width: 520px) {
  .ev-done__actions {
    flex-direction: column;
    align-self: stretch;
  }
}
</style>
