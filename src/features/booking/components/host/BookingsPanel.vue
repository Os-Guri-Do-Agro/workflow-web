<script setup lang="ts">
/**
 * Reuniões marcadas pela página, agrupadas por dia. A hora aparece no fuso do
 * NAVEGADOR do anfitrião (onde ele está agora, igual ao /calendar), e o fuso
 * do convidado aparece ao lado quando é outro: "10:00 · 14:00 em Lisboa" é o
 * lembrete que evita cumprimentar com "bom dia" às 18h dela.
 *
 * Cada dia é UM cartão com as reuniões em linhas (hora, quem, o quê, ações),
 * e não um cartão por reunião: a lista lê como agenda, e a hora fica sempre
 * na mesma coluna para o olho descer por ela.
 */
import { computed, ref } from 'vue'
import {
  CalendarCheck2,
  CalendarX2,
  Check,
  Copy,
  Globe,
  History,
  Loader2,
  MessageSquareText,
  Video,
  X,
} from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type BookingScope, type HostBooking } from '@/service/booking/booking-service'
import BookingAvatar from '../BookingAvatar.vue'
import { bookingKeys, useHostBookings } from '../../composables/useBookingSettings'
import {
  addDays,
  browserTimeZone,
  dateKeyInZone,
  formatDateKey,
  formatDuration,
  formatTime,
  gmtOffset,
  todayKey,
  zoneCity,
  zoneLabel,
} from '../../booking-time'

const props = defineProps<{ publicUrl: string }>()

const scope = ref<BookingScope>('upcoming')
const { data, isLoading, isError, refetch } = useHostBookings(scope)
const queryClient = useQueryClient()
const { success: showSuccess, error: showError } = useToast()

const tz = browserTimeZone()
const today = todayKey(tz)
const tzName = zoneLabel(tz)

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

function dayTitle(key: string) {
  if (key === today) return 'Hoje'
  if (key === addDays(today, 1)) return 'Amanhã'
  if (key === addDays(today, -1)) return 'Ontem'
  const weekday = formatDateKey(key, { weekday: 'long' })
  return weekday.charAt(0).toUpperCase() + weekday.slice(1)
}

function dayDate(key: string) {
  const sameYear = key.slice(0, 4) === today.slice(0, 4)
  const date = formatDateKey(key, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
  // "Hoje" e "Amanhã" pedem o dia da semana junto; os outros já são o dia da semana.
  const near = key === today || key === addDays(today, 1) || key === addDays(today, -1)
  return near ? `${formatDateKey(key, { weekday: 'long' })}, ${date}` : date
}

function otherZone(booking: HostBooking) {
  return gmtOffset(booking.inviteeTimezone, Date.parse(booking.startAt)) !== gmtOffset(tz, Date.parse(booking.startAt))
}

const isLive = (b: HostBooking) =>
  b.status === 'CONFIRMED' && Date.parse(b.startAt) <= Date.now() && Date.parse(b.endAt) > Date.now()

const expanded = ref<string | null>(null)

const emptyTitle = computed(() =>
  scope.value === 'upcoming'
    ? 'Nenhuma reunião marcada'
    : scope.value === 'past'
      ? 'Nenhuma reunião passada'
      : 'Nenhuma reunião cancelada',
)

// ─── Link (estado vazio) ────────────────────────────────────────────────────
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.publicUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    showError('Não foi possível copiar. Selecione o link e copie manualmente.')
  }
}

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
    <div class="bp__bar">
      <div class="bk-seg" role="tablist" aria-label="Filtrar reuniões">
        <button
          v-for="s in SCOPES"
          :key="s.key"
          type="button"
          role="tab"
          class="bk-seg__btn"
          :class="{ 'is-active': scope === s.key }"
          :aria-selected="scope === s.key"
          @click="scope = s.key"
        >
          {{ s.label }}
        </button>
      </div>
      <p class="bp__tz" :title="`Horários mostrados no fuso do seu navegador: ${tzName}`">
        <Globe :size="13" />
        {{ tzName }}
      </p>
    </div>

    <div v-if="isLoading" class="bp__loading" aria-busy="true">
      <div v-for="n in 2" :key="n" class="bp__group">
        <span class="bk-skel" style="width: 160px; height: 14px; margin-bottom: 12px" />
        <div class="bk-card bp__skel-card">
          <span v-for="r in 3 - n + 1" :key="r" class="bk-skel bp__skel-row" />
        </div>
      </div>
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

    <div v-else-if="!groups.length" class="bp__empty bk-card">
      <EmptyState
        :icon="scope === 'upcoming' ? CalendarCheck2 : scope === 'past' ? History : CalendarX2"
        :title="emptyTitle"
        :description="
          scope === 'upcoming'
            ? 'Divulgue o link da sua página: as reuniões marcadas aparecem aqui na hora, sem recarregar.'
            : undefined
        "
      >
        <template v-if="scope === 'upcoming'" #action>
          <button type="button" class="bk-btn bk-btn--primary" @click="copyLink">
            <component :is="copied ? Check : Copy" :size="14" />
            {{ copied ? 'Copiado' : 'Copiar link da página' }}
          </button>
        </template>
      </EmptyState>
    </div>

    <div v-else class="bp__groups">
      <section v-for="[key, items] in groups" :key="key" class="bp__group" :aria-label="`${dayTitle(key)}, ${dayDate(key)}`">
        <header class="bp__day">
          <h3>{{ dayTitle(key) }}</h3>
          <span class="bp__day-date">{{ dayDate(key) }}</span>
          <span class="bp__day-count">{{ items.length }} {{ items.length === 1 ? 'reunião' : 'reuniões' }}</span>
        </header>

        <ul class="bp__list bk-card">
          <li
            v-for="b in items"
            :key="b.id"
            class="bp__row"
            :class="{ 'is-canceled': b.status === 'CANCELED', 'is-live': isLive(b), 'is-past': scope === 'past' }"
          >
            <div class="bp__time">
              <span class="bp__start">{{ formatTime(b.startAt, tz) }}</span>
              <span class="bp__end">{{ formatTime(b.endAt, tz) }}</span>
            </div>

            <div class="bp__who">
              <BookingAvatar :name="b.inviteeName" :size="34" />
              <div class="bp__who-text">
                <p class="bp__name">
                  <span class="bp__name-text">{{ b.inviteeName }}</span>
                  <span v-if="isLive(b)" class="bk-chip bk-chip--accent bp__live"><span class="bk-dot" /> Agora</span>
                  <span v-else-if="b.rescheduleCount && b.status === 'CONFIRMED'" class="bk-chip">Remarcada</span>
                </p>
                <a class="bp__email" :href="`mailto:${b.inviteeEmail}`">{{ b.inviteeEmail }}</a>
              </div>
            </div>

            <div class="bp__what">
              <p class="bp__type">{{ b.eventType.title }}</p>
              <p class="bp__meta">
                {{ formatDuration(b.eventType.durationMin) }}
                <span v-if="otherZone(b)" class="bp__zone" :title="`Fuso do convidado: ${zoneLabel(b.inviteeTimezone, Date.parse(b.startAt))}`">
                  <Globe :size="12" />
                  {{ formatTime(b.startAt, b.inviteeTimezone) }} em {{ zoneCity(b.inviteeTimezone) }}
                </span>
              </p>
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
                <Video :size="14" />
                {{ isLive(b) ? 'Entrar' : 'Meet' }}
              </a>
              <button
                v-if="scope === 'upcoming' && !isLive(b)"
                type="button"
                class="bk-icon-btn bk-icon-btn--danger bp__cancel"
                data-cancel
                :aria-label="`Cancelar reunião com ${b.inviteeName}`"
                title="Cancelar reunião"
                @click="askCancel(b)"
              >
                <X :size="16" />
                <span class="bp__cancel-text">Cancelar</span>
              </button>
            </div>

            <button
              v-if="b.notes"
              type="button"
              class="bp__notes"
              :class="{ 'is-open': expanded === b.id }"
              :aria-expanded="expanded === b.id"
              :title="expanded === b.id ? 'Recolher assunto' : 'Ver o assunto inteiro'"
              @click="expanded = expanded === b.id ? null : b.id"
            >
              <MessageSquareText :size="13" />
              <span>{{ b.notes }}</span>
            </button>

            <p v-if="b.status === 'CANCELED'" class="bp__canceled">
              Cancelada {{ b.canceledBy === 'INVITEE' ? 'pelo convidado' : 'por você' }}{{ b.cancelReason ? `: “${b.cancelReason}”` : '' }}
            </p>
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
          <div>
            <h2>Cancelar a reunião?</h2>
            <p>O Google manda o cancelamento para {{ canceling.inviteeEmail }} e o evento sai das duas agendas.</p>
          </div>
          <button type="button" class="bk-icon-btn" aria-label="Fechar" :disabled="cancelBusy" @click="canceling = null">
            <X :size="16" />
          </button>
        </header>
        <div class="bk-dialog__body">
          <div class="bp__dialog-who">
            <BookingAvatar :name="canceling.inviteeName" :size="36" />
            <div>
              <p class="bp__dialog-name">{{ canceling.inviteeName }}</p>
              <p class="bp__dialog-when">
                {{ dayTitle(dateKeyInZone(canceling.startAt, tz)) }}, {{ dayDate(dateKeyInZone(canceling.startAt, tz)) }} ·
                {{ formatTime(canceling.startAt, tz) }} – {{ formatTime(canceling.endAt, tz) }}
              </p>
            </div>
          </div>
          <label class="bk-field">
            <span class="bk-label">Motivo <span class="bk-label__opt">(opcional, vai junto no aviso)</span></span>
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
  gap: 20px;
  padding-top: 4px;
}

.bp__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
}

.bp__tz {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.bp__loading,
.bp__groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.bp__skel-card {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
}

.bp__skel-row {
  height: 56px;
  margin: 4px;
}

.bp__empty {
  border-style: dashed;
}

/* ─── Dia ─────────────────────────────────────────────────────────────────── */

.bp__day {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
  padding: 0 2px;
}

.bp__day h3 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.bp__day-date {
  color: var(--text-3);
  font-size: 12.5px;
}

.bp__day-count {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}

.bp__list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
}

/* ─── Linha ───────────────────────────────────────────────────────────────── */

.bp__row {
  position: relative;
  display: grid;
  /* Ações com largura fixa: com "Entrar" numa linha e "Meet + X" na outra, a
     coluna do meio andaria e a lista perderia o alinhamento. */
  grid-template-columns: 58px minmax(0, 1.35fr) minmax(0, 1fr) 112px;
  grid-template-areas:
    'time who what actions'
    '.    notes notes notes'
    '.    canceled canceled canceled';
  align-items: center;
  gap: 4px 16px;
  padding: 14px 16px;
  transition: background var(--motion-fast) var(--motion-ease);
}

.bp__row + .bp__row {
  border-top: 1px solid var(--border);
}

.bp__row:hover {
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
}

/* Acontecendo agora: faixa do acento na borda e fundo levemente tingido. */
.bp__row.is-live {
  background: var(--accent-wash);
}

.bp__row.is-live::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  background: var(--accent);
}

.bp__time {
  grid-area: time;
  display: flex;
  flex-direction: column;
  align-self: start;
  padding-top: 2px;
  font-variant-numeric: tabular-nums;
}

.bp__start {
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.bp__end {
  color: var(--text-3);
  font-size: 12px;
}

.bp__who {
  grid-area: who;
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.bp__who-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.bp__name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0;
}

.bp__name-text {
  overflow: hidden;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bp__live .bk-dot {
  animation: bp-blink 1.6s ease-in-out infinite;
}

.bp__email {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12.5px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bp__email:hover {
  color: var(--text-2);
  text-decoration: underline;
}

.bp__what {
  grid-area: what;
  min-width: 0;
}

.bp__what p {
  margin: 0;
}

.bp__type {
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bp__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 2px !important;
  color: var(--text-3);
  font-size: 12.5px;
}

.bp__zone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
}

.bp__actions {
  grid-area: actions;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 32px;
}

.bp__cancel-text {
  display: none;
}

.bp__notes {
  grid-area: notes;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  max-width: 100%;
  margin: 6px 0 0;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
}

.bp__notes > svg {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--text-3);
}

.bp__notes span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}

.bp__notes.is-open span {
  display: block;
  white-space: pre-wrap;
}

.bp__notes:hover {
  color: var(--text);
}

.bp__notes:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.bp__canceled {
  grid-area: canceled;
  margin: 4px 0 0;
  color: var(--err);
  font-size: 12.5px;
  line-height: 1.45;
}

.is-canceled .bp__start {
  color: var(--text-3);
  text-decoration: line-through;
}

.is-canceled .bp__who,
.is-canceled .bp__what,
.is-past .bp__who,
.is-past .bp__what {
  opacity: 0.8;
}

/* ─── Diálogo ─────────────────────────────────────────────────────────────── */

.bp__dialog-who {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.bp__dialog-who p {
  margin: 0;
}

.bp__dialog-name {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
}

.bp__dialog-when {
  margin-top: 2px !important;
  color: var(--text-3);
  font-size: 12.5px;
}

@keyframes bp-blink {
  50% {
    opacity: 0.35;
  }
}

/* ─── Telas menores ───────────────────────────────────────────────────────── */

@media (max-width: 720px) {
  .bp__row {
    grid-template-columns: 50px minmax(0, 1fr);
    grid-template-areas:
      'time who'
      'time what'
      '.    notes'
      '.    canceled'
      '.    actions';
    align-items: start;
    gap: 8px 12px;
    padding: 14px;
  }

  .bp__what {
    padding-left: 45px;
  }

  .bp__notes {
    margin-top: 0;
  }

  /* Sem ação nenhuma (passadas, canceladas, ao vivo sem Meet), a linha some. */
  .bp__actions {
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .bp__actions:empty {
    display: none;
  }

  .bp__cancel {
    gap: 6px;
    width: auto;
    padding: 0 10px;
    border-color: var(--border);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
  }

  .bp__cancel-text {
    display: inline;
  }

  .bp__day-count {
    display: none;
  }
}

@media (max-width: 420px) {
  .bp__what {
    padding-left: 0;
  }
}
</style>
