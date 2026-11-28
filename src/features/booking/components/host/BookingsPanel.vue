<script setup lang="ts">
/**
 * Reuniões marcadas pela página, agrupadas por dia. A hora aparece no fuso do
 * NAVEGADOR do anfitrião (onde ele está agora, igual ao /calendar), e o fuso
 * do convidado aparece ao lado quando é outro: "10:00 · ela está em Lisboa
 * (14:00)" é o lembrete que evita cumprimentar com "bom dia" às 18h dela.
 */
import { computed, ref } from 'vue'
import { CalendarCheck2, CalendarX2, Globe, History, Loader2, MessageSquareText, Video, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type BookingScope, type HostBooking } from '@/service/booking/booking-service'
import { bookingKeys, useHostBookings } from '../../composables/useBookingSettings'
import {
  browserTimeZone,
  dateKeyInZone,
  formatDateKey,
  formatTime,
  gmtOffset,
  todayKey,
  zoneCity,
} from '../../booking-time'

const scope = ref<BookingScope>('upcoming')
const { data, isLoading, isError, refetch } = useHostBookings(scope)
const queryClient = useQueryClient()
const { success: showSuccess, error: showError } = useToast()

const tz = browserTimeZone()
const today = todayKey(tz)

const SCOPES: Array<{ key: BookingScope; label: string }> = [
  { key: 'upcoming', label: 'Próximas' },
  { key: 'past', label: 'Passadas' },
  { key: 'canceled', label: 'Canceladas' },
]

const groups = computed(() => {
  const map = new Map<string, HostBooking[]>()
  for (const booking of data.value ?? []) {
    const key = dateKeyInZone(booking.startAt, tz)
    const list = map.get(key)
    if (list) list.push(booking)
    else map.set(key, [booking])
  }
  return [...map.entries()]
})

function dayLabel(key: string) {
  if (key === today) return 'Hoje'
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  if (key === tomorrow) return 'Amanhã'
  return formatDateKey(key, { weekday: 'long', day: 'numeric', month: 'long' })
}

function otherZone(booking: HostBooking) {
  return gmtOffset(booking.inviteeTimezone, Date.parse(booking.startAt)) !== gmtOffset(tz, Date.parse(booking.startAt))
}

const isLive = (b: HostBooking) => Date.parse(b.startAt) <= Date.now() && Date.parse(b.endAt) > Date.now()

const expanded = ref<string | null>(null)

// ─── Cancelar ───────────────────────────────────────────────────────────────

const canceling = ref<HostBooking | null>(null)
const reason = ref('')
const cancelBusy = ref(false)

function askCancel(booking: HostBooking) {
  canceling.value = booking
  reason.value = ''
}

async function confirmCancel() {
  if (!canceling.value) return
  cancelBusy.value = true
  try {
    await bookingService.cancelBooking(canceling.value.id, reason.value.trim())
    showSuccess('Reunião cancelada. O Google avisou o convidado.')
    canceling.value = null
    await queryClient.invalidateQueries({ queryKey: bookingKeys.all })
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível cancelar agora.'))
  } finally {
    cancelBusy.value = false
  }
}
</script>

<template>
  <div class="bp">
    <div class="bp__scopes" role="tablist" aria-label="Filtrar reuniões">
      <button
        v-for="s in SCOPES"
        :key="s.key"
        type="button"
        role="tab"
        class="bp__scope"
        :class="{ 'is-active': scope === s.key }"
        :aria-selected="scope === s.key"
        @click="scope = s.key"
      >
        {{ s.label }}
      </button>
    </div>

    <div v-if="isLoading" class="bp__loading">
      <Skeleton v-for="n in 4" :key="n" height="72px" />
    </div>

    <EmptyState
      v-else-if="isError"
      :icon="CalendarX2"
      title="Não foi possível carregar as reuniões"
      description="Confira sua conexão e tente de novo."
    >
      <template #action>
        <button type="button" class="bk-btn" @click="refetch()">Tentar de novo</button>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="!groups.length"
      :icon="scope === 'upcoming' ? CalendarCheck2 : scope === 'past' ? History : CalendarX2"
      :title="
        scope === 'upcoming'
          ? 'Nenhuma reunião marcada'
          : scope === 'past'
            ? 'Nenhuma reunião passada'
            : 'Nenhuma reunião cancelada'
      "
      :description="scope === 'upcoming' ? 'Divulgue o link da sua página: as reuniões marcadas aparecem aqui na hora.' : undefined"
    />

    <div v-else class="bp__groups">
      <section v-for="[key, items] in groups" :key="key" class="bp__group">
        <h3 class="bp__day">{{ dayLabel(key) }}</h3>
        <ul class="bp__list">
          <li
            v-for="b in items"
            :key="b.id"
            class="bp__item bk-card"
            :class="{ 'is-canceled': b.status === 'CANCELED', 'is-live': isLive(b) }"
          >
            <div class="bp__time">
              <span class="bp__start">{{ formatTime(b.startAt, tz) }}</span>
              <span class="bp__end">{{ formatTime(b.endAt, tz) }}</span>
            </div>

            <div class="bp__body">
              <p class="bp__who">
                {{ b.inviteeName }}
                <span v-if="isLive(b)" class="bp__live">Agora</span>
              </p>
              <p class="bp__meta">
                <a :href="`mailto:${b.inviteeEmail}`">{{ b.inviteeEmail }}</a>
                · {{ b.eventType.title }}
                <span v-if="b.rescheduleCount" class="bp__tag">remarcada</span>
              </p>
              <p v-if="otherZone(b)" class="bp__zone">
                <Globe :size="12" />
                {{ formatTime(b.startAt, b.inviteeTimezone) }} para o convidado ({{ zoneCity(b.inviteeTimezone) }}, {{ gmtOffset(b.inviteeTimezone, Date.parse(b.startAt)) }})
              </p>
              <p v-if="b.status === 'CANCELED'" class="bp__canceled">
                Cancelada {{ b.canceledBy === 'INVITEE' ? 'pelo convidado' : 'por você' }}{{ b.cancelReason ? `: ${b.cancelReason}` : '' }}
              </p>
              <button
                v-if="b.notes"
                type="button"
                class="bp__notes-toggle"
                :aria-expanded="expanded === b.id"
                @click="expanded = expanded === b.id ? null : b.id"
              >
                <MessageSquareText :size="12" />
                {{ expanded === b.id ? 'Ocultar assunto' : 'Ver assunto' }}
              </button>
              <p v-if="b.notes && expanded === b.id" class="bp__notes">{{ b.notes }}</p>
            </div>

            <div class="bp__actions">
              <a
                v-if="b.meetLink && b.status === 'CONFIRMED' && scope === 'upcoming'"
                class="bk-btn bk-btn--sm"
                :class="{ 'bk-btn--primary': isLive(b) }"
                :href="b.meetLink"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Video :size="13" />
                Meet
              </a>
              <button
                v-if="scope === 'upcoming' && !isLive(b)"
                type="button"
                class="bk-icon-btn"
                :aria-label="`Cancelar reunião com ${b.inviteeName}`"
                title="Cancelar"
                @click="askCancel(b)"
              >
                <X :size="15" />
              </button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <AppDialog
      :model-value="!!canceling"
      label="Cancelar reunião"
      size="sm"
      :loading="cancelBusy"
      @update:model-value="!$event && (canceling = null)"
    >
      <div v-if="canceling" class="bk-dialog">
        <header class="bk-dialog__head">
          <h2>Cancelar a reunião?</h2>
          <button type="button" class="bk-icon-btn" aria-label="Fechar" :disabled="cancelBusy" @click="canceling = null">
            <X :size="16" />
          </button>
        </header>
        <div class="bk-dialog__body">
          <p class="bp__dialog-text">
            {{ canceling.inviteeName }} · {{ dayLabel(dateKeyInZone(canceling.startAt, tz)).toLowerCase() }} às
            {{ formatTime(canceling.startAt, tz) }}. O Google manda o cancelamento para
            {{ canceling.inviteeEmail }} e o evento sai das duas agendas.
          </p>
          <label class="bk-field">
            <span class="bk-label">Motivo (opcional)</span>
            <textarea v-model="reason" class="bk-input" rows="3" maxlength="500" :disabled="cancelBusy" />
          </label>
        </div>
        <footer class="bk-dialog__foot">
          <button type="button" class="bk-btn" :disabled="cancelBusy" @click="canceling = null">Manter</button>
          <button type="button" class="bk-btn bk-btn--danger" :disabled="cancelBusy" @click="confirmCancel">
            <Loader2 v-if="cancelBusy" :size="14" class="bk-spin" />
            Cancelar reunião
          </button>
        </footer>
      </div>
    </AppDialog>
  </div>
</template>

<style scoped>
.bp {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bp__scopes {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.bp__scope {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.bp__scope.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.bp__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bp__groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.bp__day {
  margin: 0 0 10px;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.bp__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bp__item {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: start;
  padding: 14px 16px;
}

.bp__item.is-live {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.bp__item.is-canceled {
  opacity: 0.75;
}

.bp__time {
  display: flex;
  flex-direction: column;
  padding-left: 10px;
  border-left: 3px solid var(--accent);
  font-variant-numeric: tabular-nums;
}

.is-canceled .bp__time {
  border-left-color: var(--surface-3);
}

.bp__start {
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.is-canceled .bp__start {
  text-decoration: line-through;
}

.bp__end {
  color: var(--text-3);
  font-size: 11.5px;
}

.bp__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.bp__who {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
}

.bp__live {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 10.5px;
  font-weight: 700;
}

.bp__meta,
.bp__zone,
.bp__canceled {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.45;
}

.bp__meta a {
  color: var(--text-2);
  text-decoration: none;
}

.bp__meta a:hover {
  text-decoration: underline;
}

.bp__tag {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 10.5px;
}

.bp__zone {
  display: flex;
  align-items: center;
  gap: 5px;
}

.bp__canceled {
  color: var(--err);
}

.bp__notes-toggle {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 5px;
  margin-top: 2px;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.bp__notes {
  margin: 4px 0 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.bp__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bp__dialog-text {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.55;
}

@media (max-width: 560px) {
  .bp__item {
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .bp__actions {
    grid-column: 2;
  }
}
</style>
