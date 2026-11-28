<script setup lang="ts">
/**
 * Calendário do mês + horários do dia, no fuso escolhido pelo convidado.
 *
 * Quem busca os horários é o `loader` do pai (marcar e remarcar usam rotas
 * diferentes); este componente só sabe pedir "o mês X no fuso Y". O mês é
 * convertido em janela de INSTANTES no fuso do convidado: um horário às 23:30
 * de São Paulo é dia 21 em Lisboa, e precisa aparecer no dia 21 para quem
 * está em Lisboa.
 *
 * Trocar o fuso refaz o agrupamento e mantém a escolha se ela ainda existir
 * (o instante é o mesmo, só muda o dia/hora exibidos).
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowRight, CalendarX2, ChevronLeft, ChevronRight, RotateCw } from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import TimezoneSelect from './TimezoneSelect.vue'
import {
  WEEKDAY_SHORT,
  addDays,
  dateKeyInZone,
  formatDateKey,
  formatMonth,
  formatTime,
  monthWeeks,
  todayKey,
  zonedMidnight,
} from '../booking-time'

const props = withDefaults(
  defineProps<{
    loader: (range: { start: string; end: string }) => Promise<string[]>
    /** Até quantos dias à frente a agenda abre (limita a navegação). */
    maxDaysAhead: number
    confirmLabel?: string
    busy?: boolean
  }>(),
  { confirmLabel: 'Próximo', busy: false },
)

const timezone = defineModel<string>('timezone', { required: true })
const emit = defineEmits<{ confirm: [startAt: string] }>()

const today = computed(() => todayKey(timezone.value))
const [initialYear, initialMonth] = today.value.split('-').map(Number) as [number, number]
const view = ref({ year: initialYear, month: initialMonth })

const loading = ref(false)
const error = ref<string | null>(null)
const slots = ref<string[]>([])
const selectedDay = ref<string | null>(null)
const selectedSlot = ref<string | null>(null)
/** Pula para o próximo mês com horário UMA vez, na primeira carga. */
let autoAdvanced = false
let requestSeq = 0

const monthKey = computed(() => `${view.value.year}-${String(view.value.month).padStart(2, '0')}`)
const lastDay = computed(() => addDays(today.value, props.maxDaysAhead))
const canPrev = computed(() => monthKey.value > today.value.slice(0, 7))
const canNext = computed(() => monthKey.value < lastDay.value.slice(0, 7))

const byDay = computed(() => {
  const map = new Map<string, string[]>()
  for (const slot of slots.value) {
    const key = dateKeyInZone(slot, timezone.value)
    if (!key.startsWith(monthKey.value)) continue
    const list = map.get(key)
    if (list) list.push(slot)
    else map.set(key, [slot])
  }
  return map
})

const weeks = computed(() => monthWeeks(view.value.year, view.value.month))
const daySlots = computed(() => (selectedDay.value ? (byDay.value.get(selectedDay.value) ?? []) : []))

async function load() {
  const seq = ++requestSeq
  loading.value = true
  error.value = null
  const first = `${monthKey.value}-01`
  const next = addDays(`${monthKey.value}-01`, 32).slice(0, 7) + '-01'
  try {
    const result = await props.loader({
      start: new Date(zonedMidnight(first, timezone.value)).toISOString(),
      end: new Date(zonedMidnight(next, timezone.value)).toISOString(),
    })
    if (seq !== requestSeq) return
    slots.value = result

    // Primeira visita num mês sem nada (ex.: dia 29 com a agenda do mês
    // cheia): leva para o próximo mês, em vez de mostrar um calendário vazio.
    if (!autoAdvanced && !result.length && canNext.value) {
      autoAdvanced = true
      shiftMonth(1)
      return
    }
    autoAdvanced = true

    if (selectedDay.value && !byDay.value.has(selectedDay.value)) selectedDay.value = null
    if (!selectedDay.value) selectedDay.value = [...byDay.value.keys()].sort()[0] ?? null
    if (selectedSlot.value && !result.includes(selectedSlot.value)) selectedSlot.value = null
  } catch (e) {
    if (seq !== requestSeq) return
    slots.value = []
    error.value = bookingErrorMessage(e, 'Não foi possível carregar os horários agora.')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function shiftMonth(delta: number) {
  const d = new Date(Date.UTC(view.value.year, view.value.month - 1 + delta, 1))
  view.value = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  selectedDay.value = null
  selectedSlot.value = null
}

function pickDay(day: string) {
  if (!byDay.value.has(day)) return
  selectedDay.value = day
  selectedSlot.value = null
}

watch(monthKey, load)
watch(timezone, (_tz, previous) => {
  // O instante escolhido continua o mesmo; só reagrupa no fuso novo.
  const keep = selectedSlot.value
  if (keep && previous) selectedDay.value = dateKeyInZone(keep, timezone.value)
  void load()
})

/** Recarrega por fora (ex.: o horário foi tomado entre escolher e confirmar). */
function refresh() {
  selectedSlot.value = null
  return load()
}

defineExpose({ refresh })
onMounted(load)
</script>

<template>
  <div class="sp">
    <section class="sp__cal" aria-label="Escolha o dia">
      <header class="sp__month">
        <button
          type="button"
          class="sp__nav"
          :disabled="!canPrev || loading"
          aria-label="Mês anterior"
          @click="shiftMonth(-1)"
        >
          <ChevronLeft :size="16" />
        </button>
        <h3>{{ formatMonth(view.year, view.month) }}</h3>
        <button
          type="button"
          class="sp__nav"
          :disabled="!canNext || loading"
          aria-label="Próximo mês"
          @click="shiftMonth(1)"
        >
          <ChevronRight :size="16" />
        </button>
      </header>

      <div class="sp__grid" role="grid" :aria-busy="loading">
        <span v-for="label in WEEKDAY_SHORT" :key="label" class="sp__wd" role="columnheader">{{ label }}</span>
        <template v-for="(week, wi) in weeks" :key="wi">
          <template v-for="(day, di) in week" :key="`${wi}-${di}`">
            <span v-if="!day" class="sp__cell sp__cell--blank" />
            <button
              v-else
              type="button"
              class="sp__cell"
              :class="{
                'is-available': byDay.has(day),
                'is-selected': day === selectedDay,
                'is-today': day === today,
              }"
              :disabled="!byDay.has(day)"
              :aria-pressed="day === selectedDay"
              :aria-label="`${formatDateKey(day)}${byDay.has(day) ? `, ${byDay.get(day)!.length} horários` : ', sem horários'}`"
              @click="pickDay(day)"
            >
              {{ Number(day.slice(8)) }}
            </button>
          </template>
        </template>
        <div v-if="loading" class="sp__veil" aria-hidden="true" />
      </div>

      <div class="sp__tz">
        <span class="sp__tz-label">Horários em</span>
        <TimezoneSelect v-model="timezone" variant="inline" />
      </div>
    </section>

    <section class="sp__times" aria-live="polite">
      <div v-if="error" class="sp__state">
        <CalendarX2 :size="22" />
        <p>{{ error }}</p>
        <button type="button" class="sp__retry" @click="load">
          <RotateCw :size="13" />
          Tentar de novo
        </button>
      </div>

      <template v-else-if="loading && !daySlots.length">
        <p class="sp__day-title sp__day-title--ghost" />
        <span v-for="n in 6" :key="n" class="sp__skeleton" />
      </template>

      <div v-else-if="!byDay.size" class="sp__state">
        <CalendarX2 :size="22" />
        <p>Nenhum horário livre em {{ formatMonth(view.year, view.month).toLowerCase() }}.</p>
        <button v-if="canNext" type="button" class="sp__retry" @click="shiftMonth(1)">
          Ver o próximo mês
          <ArrowRight :size="13" />
        </button>
      </div>

      <template v-else-if="selectedDay">
        <p class="sp__day-title">{{ formatDateKey(selectedDay) }}</p>
        <ul class="sp__list">
          <li v-for="slot in daySlots" :key="slot">
            <div class="sp__slot-row" :class="{ 'is-picked': slot === selectedSlot }">
              <button
                type="button"
                class="sp__slot"
                :aria-pressed="slot === selectedSlot"
                @click="selectedSlot = slot"
              >
                {{ formatTime(slot, timezone) }}
              </button>
              <button
                v-if="slot === selectedSlot"
                type="button"
                class="sp__confirm press"
                :disabled="busy"
                @click="emit('confirm', slot)"
              >
                {{ confirmLabel }}
              </button>
            </div>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped>
.sp {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: 28px;
  min-height: 380px;
}

.sp__month {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.sp__month h3 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
}

.sp__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.sp__nav:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.sp__nav:disabled {
  opacity: 0.35;
  cursor: default;
}

.sp__grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.sp__wd {
  padding-bottom: 6px;
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: uppercase;
}

.sp__cell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  max-height: 46px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-4);
  font-family: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  cursor: default;
}

.sp__cell--blank {
  pointer-events: none;
}

.sp__cell.is-available {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
  font-weight: 650;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.sp__cell.is-available:hover {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.sp__cell.is-selected {
  background: var(--accent);
  color: var(--accent-fg);
}

.sp__cell.is-today::after {
  content: '';
  position: absolute;
  bottom: 5px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.sp__cell:focus-visible,
.sp__slot:focus-visible,
.sp__confirm:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sp__veil {
  position: absolute;
  inset: 22px 0 0;
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  animation: sp-pulse 1.2s ease-in-out infinite;
}

.sp__tz {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 18px;
}

.sp__tz-label {
  color: var(--text-3);
  font-size: 12px;
}

.sp__times {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sp__day-title {
  margin: 6px 0 14px;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 600;
}

.sp__day-title::first-letter {
  text-transform: uppercase;
}

.sp__day-title--ghost {
  width: 70%;
  height: 16px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.sp__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  margin: 0;
  padding: 0 4px 0 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
}

.sp__slot-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  transition: grid-template-columns var(--motion) var(--motion-ease);
}

.sp__slot-row.is-picked {
  grid-template-columns: 1fr 1fr;
}

.sp__slot,
.sp__confirm {
  min-height: 46px;
  border-radius: var(--radius);
  font-family: inherit;
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.sp__slot {
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--surface);
  color: var(--accent);
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.sp__slot:hover {
  border-color: var(--accent);
}

.is-picked .sp__slot {
  border-color: var(--text-3);
  background: var(--text-2);
  color: var(--surface);
}

.sp__confirm {
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
}

.sp__confirm:disabled {
  opacity: 0.6;
  cursor: progress;
}

.sp__skeleton {
  display: block;
  height: 46px;
  margin-bottom: 8px;
  border-radius: var(--radius);
  background: var(--surface-2);
  animation: sp-pulse 1.2s ease-in-out infinite;
}

.sp__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex: 1;
  padding: 24px 8px;
  color: var(--text-3);
  text-align: center;
}

.sp__state p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.sp__retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.sp__retry:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

@keyframes sp-pulse {
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sp__veil,
  .sp__skeleton {
    animation: none;
  }
}

@media (max-width: 720px) {
  .sp {
    grid-template-columns: 1fr;
    gap: 24px;
    min-height: 0;
  }

  .sp__list {
    max-height: none;
  }
}
</style>
