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
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarClock,
  CalendarOff,
  CalendarX2,
  CircleCheck,
  Info,
  Loader2,
  TriangleAlert,
  Video,
} from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import { publicBookingService, type PublicBooking } from '@/service/booking/booking-service'
import PublicBookingFrame from '../components/PublicBookingFrame.vue'
import SlotPicker from '../components/SlotPicker.vue'
import BookingSummary from '../components/BookingSummary.vue'
import { useInviteeTimezone } from '../composables/useInviteeTimezone'
import { formatDayOf, formatTimeRange } from '../booking-time'

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

function open(next: 'view' | 'reschedule' | 'cancel') {
  mode.value = next
  actionError.value = null
  notice.value = null
  if (next !== 'view') success.value = null
  window.scrollTo({ top: 0 })
}

async function confirmReschedule(startAt: string) {
  working.value = true
  actionError.value = null
  try {
    booking.value = await publicBookingService.reschedule(token, {
      startAt,
      timezone: timezone.value,
    })
    mode.value = 'view'
    success.value = 'Reunião remarcada. O Google enviou o convite atualizado para os participantes.'
    window.scrollTo({ top: 0 })
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
  }
}

async function confirmCancel() {
  working.value = true
  actionError.value = null
  try {
    booking.value = await publicBookingService.cancel(token, reason.value.trim() || undefined)
    mode.value = 'view'
    success.value = null
    window.scrollTo({ top: 0 })
  } catch (e) {
    actionError.value = bookingErrorMessage(e, 'Não foi possível cancelar agora.')
  } finally {
    working.value = false
  }
}
</script>

<template>
  <PublicBookingFrame v-if="loading" loading />

  <PublicBookingFrame v-else-if="loadError || !booking" compact>
    <div class="mg-state">
      <span class="mg-state__icon"><CalendarOff :size="22" /></span>
      <h1>Reunião não encontrada</h1>
      <p>{{ loadError }}</p>
    </div>
  </PublicBookingFrame>

  <PublicBookingFrame
    v-else
    :host-name="booking.host.name"
    :headline="booking.host.headline ?? null"
    :avatar-url="booking.host.avatarUrl"
    :title="booking.eventType.title"
    :duration-min="booking.eventType.durationMin"
  >
    <template v-if="mode === 'reschedule'" #facts>
      <li class="bk-fact">
        <CalendarClock :size="16" />
        <span>
          <span class="bk-fact__line bk-fact__was bk-first-up">{{ formatDayOf(booking.startAt, timezone) }}</span>
          <span class="bk-fact__line bk-fact__was">{{ formatTimeRange(booking.startAt, booking.endAt, timezone) }}</span>
          <span class="bk-fact__sub">Horário atual. Muda quando você confirmar o novo.</span>
        </span>
      </li>
    </template>

    <!-- Remarcar -->
    <template v-if="mode === 'reschedule'">
      <header class="mg-head">
        <button type="button" class="bk-back" :disabled="working" @click="open('view')">
          <ArrowLeft :size="14" />
          Voltar
        </button>
        <h2>Escolha o novo horário</h2>
        <p class="mg-sub">O Google manda o convite atualizado para os dois lados assim que você confirmar.</p>
      </header>
      <p v-if="notice" class="bk-alert bk-alert--warn mg-gap" role="alert">
        <TriangleAlert :size="15" />
        <span>{{ notice }}</span>
      </p>
      <p v-if="actionError" class="bk-alert bk-alert--err mg-gap" role="alert">
        <TriangleAlert :size="15" />
        <span>{{ actionError }}</span>
      </p>
      <SlotPicker
        ref="picker"
        v-model:timezone="timezone"
        class="mg-picker"
        :loader="loadSlots"
        :max-days-ahead="booking.eventType.maxDaysAhead"
        :busy="working"
        :confirm-label="working ? 'Remarcando...' : 'Remarcar'"
        @confirm="confirmReschedule"
      />
    </template>

    <!-- Cancelar -->
    <div v-else-if="mode === 'cancel'" class="mg-body">
      <header class="mg-head">
        <button type="button" class="bk-back" :disabled="working" @click="open('view')">
          <ArrowLeft :size="14" />
          Voltar
        </button>
        <h2>Cancelar a reunião?</h2>
        <p class="mg-sub">O Google avisa os participantes e o evento sai das agendas.</p>
      </header>
      <BookingSummary
        :start-at="booking.startAt"
        :end-at="booking.endAt"
        :timezone="timezone"
        :host-name="booking.host.name"
        :host-timezone="booking.host.timezone"
      />
      <label class="bk-field">
        <span class="bk-label">
          Motivo <span class="bk-label__opt">(opcional, {{ booking.host.name }} vai ver)</span>
        </span>
        <textarea v-model="reason" class="bk-input bk-input--lg" rows="3" maxlength="500" :disabled="working" />
      </label>
      <p v-if="actionError" class="bk-alert bk-alert--err" role="alert">
        <TriangleAlert :size="15" />
        <span>{{ actionError }}</span>
      </p>
      <div class="mg-actions">
        <button type="button" class="bk-btn bk-btn--danger bk-btn--lg press" :disabled="working" @click="confirmCancel">
          <Loader2 v-if="working" :size="15" class="bk-spin" />
          Cancelar reunião
        </button>
        <button type="button" class="bk-btn bk-btn--lg" :disabled="working" @click="open('view')">
          Manter
        </button>
      </div>
    </div>

    <!-- Ver -->
    <div v-else class="mg-body">
      <header class="mg-head">
        <span class="bk-chip" :class="isCanceled ? 'bk-chip--err' : 'bk-chip--success'">
          <component :is="isCanceled ? CalendarX2 : CalendarCheck2" :size="13" />
          {{ isCanceled ? 'Cancelada' : 'Confirmada' }}
        </span>
        <h2>
          {{ isCanceled ? 'Esta reunião foi cancelada' : `Sua reunião com ${booking.host.name}` }}
        </h2>
        <p v-if="isCanceled" class="mg-sub">
          {{ booking.canceledBy === 'HOST' ? `${booking.host.name} cancelou` : 'Você cancelou' }} esta
          reunião{{ booking.cancelReason ? `: “${booking.cancelReason}”` : '.' }}
        </p>
      </header>

      <p v-if="success" class="bk-alert bk-alert--success" role="status">
        <CircleCheck :size="15" />
        <span>{{ success }}</span>
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
        <button type="button" class="bk-btn bk-btn--lg" @click="open('reschedule')">
          <CalendarClock :size="16" />
          Remarcar
        </button>
        <button type="button" class="bk-btn bk-btn--danger-quiet bk-btn--lg" @click="open('cancel')">
          Cancelar
        </button>
      </div>
      <p v-else-if="!isCanceled" class="bk-alert bk-alert--info">
        <Info :size="15" />
        <span>Essa reunião já começou ou aconteceu, então não dá mais para remarcar por aqui.</span>
      </p>

      <RouterLink
        v-if="isCanceled"
        class="bk-btn bk-btn--primary bk-btn--lg mg-again press"
        :to="{ name: 'public-booking', params: { slug: booking.page.slug } }"
      >
        Marcar um novo horário
      </RouterLink>
    </div>
  </PublicBookingFrame>
</template>

<style scoped>
.mg-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 4px;
}

.mg-head h2 {
  margin: 12px 0 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.mg-head .bk-back + h2 {
  margin-top: 0;
}

.mg-sub {
  margin: 5px 0 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.mg-gap {
  margin: 16px 0 0;
}

.mg-picker {
  margin-top: 20px;
}

.mg-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 540px;
}

.mg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mg-again {
  align-self: flex-start;
}

.mg-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 8px;
  text-align: center;
}

.mg-state__icon {
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

.mg-state h1 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.mg-state p {
  max-width: 380px;
  margin: 0;
  color: var(--text-3);
  font-size: 13.5px;
  line-height: 1.55;
}

@media (max-width: 520px) {
  .mg-actions {
    flex-direction: column;
  }

  .mg-actions > * {
    width: 100%;
  }
}
</style>
