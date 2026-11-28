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
 *
 * Layout: no computador, a lista do dia ao lado do calendário, e escolher um
 * horário abre o "Próximo" na própria linha (o gesto do Calendly). No celular,
 * os horários viram grade de três colunas e o "Próximo" é um botão largo
 * embaixo, com o dia e a hora escritos, longe do dedo que acabou de tocar.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowRight, CalendarX2, ChevronLeft, ChevronRight, Globe, RotateCw } from 'lucide-vue-next'
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

/** Sempre seis linhas: o cartão não muda de altura de um mês para o outro. */
const weeks = computed(() => {
  const list = monthWeeks(view.value.year, view.value.month)
  while (list.length < 6) list.push(Array.from({ length: 7 }, () => null))
  return list
})

const daySlots = computed(() => (selectedDay.value ? (byDay.value.get(selectedDay.value) ?? []) : []))

/** Hora do dia no fuso do convidado, para separar manhã, tarde e noite. */
function hourOf(slot: string) {
  return Number(formatTime(slot, timezone.value).slice(0, 2))
}

const PERIODS = [
  { key: 'madrugada', label: 'Madrugada', from: 0 },
  { key: 'manha', label: 'Manhã', from: 6 },
  { key: 'tarde', label: 'Tarde', from: 12 },
  { key: 'noite', label: 'Noite', from: 18 },
] as const

const periods = computed(() => {
  const groups = PERIODS.map((p) => ({ ...p, slots: [] as string[] }))
  for (const slot of daySlots.value) {
    const hour = hourOf(slot)
    let index = 0
    for (let i = 0; i < groups.length; i += 1) if (hour >= groups[i]!.from) index = i
    groups[index]!.slots.push(slot)
  }
  return groups.filter((g) => g.slots.length)
})

const dayWeekday = computed(() =>
  selectedDay.value ? formatDateKey(selectedDay.value, { weekday: 'long' }) : '',
)
const dayDate = computed(() =>
  selectedDay.value ? formatDateKey(selectedDay.value, { day: 'numeric', month: 'long' }) : '',
)
const chosenLabel = computed(() =>
  selectedSlot.value && selectedDay.value
    ? `${formatDateKey(selectedDay.value, { weekday: 'short', day: 'numeric', month: 'short' })} às ${formatTime(selectedSlot.value, timezone.value)}`
    : '',
)

// ─── Rolagem da lista (sombra embaixo quando há mais horários) ──────────────
const list = ref<HTMLElement | null>(null)
const moreBelow = ref(false)

function measure() {
  const el = list.value
  moreBelow.value = !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4
}

watch(selectedDay, async () => {
  await nextTick()
  if (list.value) list.value.scrollTop = 0
  measure()
})

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
    await nextTick()
    measure()
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

function dayLabel(day: string) {
  const count = byDay.value.get(day)?.length ?? 0
  const base = formatDateKey(day)
  if (!count) return `${base}, sem horários`
  return `${base}, ${count} ${count === 1 ? 'horário livre' : 'horários livres'}`
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
        <h3 aria-live="polite">{{ formatMonth(view.year, view.month) }}</h3>
        <div class="sp__navs">
          <button
            type="button"
            class="sp__nav"
            :disabled="!canPrev || loading"
            aria-label="Mês anterior"
            @click="shiftMonth(-1)"
          >
            <ChevronLeft :size="17" />
          </button>
          <button
            type="button"
            class="sp__nav"
            :disabled="!canNext || loading"
            aria-label="Próximo mês"
            @click="shiftMonth(1)"
          >
            <ChevronRight :size="17" />
          </button>
        </div>
      </header>

      <div class="sp__grid" role="grid" :aria-busy="loading">
        <div class="sp__row" role="row">
          <span v-for="label in WEEKDAY_SHORT" :key="label" class="sp__wd" role="columnheader">{{ label }}</span>
        </div>
        <div v-for="(week, wi) in weeks" :key="wi" class="sp__row" role="row">
          <template v-for="(day, di) in week" :key="`${wi}-${di}`">
            <span v-if="!day" class="sp__cell sp__cell--blank" role="gridcell" />
            <span v-else role="gridcell" class="sp__gridcell">
              <button
                type="button"
                class="sp__cell"
                :class="{
                  'is-available': byDay.has(day),
                  'is-selected': day === selectedDay,
                  'is-today': day === today,
                }"
                :disabled="!byDay.has(day)"
                :aria-pressed="day === selectedDay"
                :aria-label="dayLabel(day)"
                :aria-current="day === today ? 'date' : undefined"
                @click="pickDay(day)"
              >
                {{ Number(day.slice(8)) }}
              </button>
            </span>
          </template>
        </div>
        <div v-if="loading" class="sp__veil" aria-hidden="true" />
      </div>

      <div class="sp__tz">
        <span class="sp__tz-label"><Globe :size="13" /> Fuso horário</span>
        <TimezoneSelect v-model="timezone" variant="inline" />
      </div>
    </section>

    <section class="sp__times" aria-live="polite">
      <div v-if="error" class="sp__state">
        <span class="sp__state-icon"><CalendarX2 :size="20" /></span>
        <p>{{ error }}</p>
        <button type="button" class="bk-btn bk-btn--sm" @click="load">
          <RotateCw :size="13" />
          Tentar de novo
        </button>
      </div>

      <div v-else-if="loading && !daySlots.length" class="sp__skeleton" aria-hidden="true">
        <span class="bk-skel" style="width: 60%; height: 15px" />
        <span class="bk-skel" style="width: 40%; height: 12px; margin-bottom: 10px" />
        <span v-for="n in 6" :key="n" class="bk-skel sp__skel-slot" />
      </div>

      <div v-else-if="!byDay.size" class="sp__state">
        <span class="sp__state-icon"><CalendarX2 :size="20" /></span>
        <p>Nenhum horário livre em {{ formatMonth(view.year, view.month).toLowerCase() }}.</p>
        <button v-if="canNext" type="button" class="bk-btn bk-btn--sm" @click="shiftMonth(1)">
          Ver o próximo mês
          <ArrowRight :size="13" />
        </button>
      </div>

      <template v-else-if="selectedDay">
        <header class="sp__day">
          <p class="sp__day-weekday bk-first-up">{{ dayWeekday }}</p>
          <p class="sp__day-date">
            {{ dayDate }} · {{ daySlots.length }} {{ daySlots.length === 1 ? 'horário' : 'horários' }}
          </p>
        </header>

        <div class="sp__scroll" :class="{ 'has-more': moreBelow }">
          <div ref="list" class="sp__list" @scroll.passive="measure">
            <section v-for="group in periods" :key="group.key" class="sp__period">
              <h4 v-if="periods.length > 1" class="sp__period-label">{{ group.label }}</h4>
              <ul class="sp__slots">
                <li v-for="slot in group.slots" :key="slot" class="sp__slot-row" :class="{ 'is-picked': slot === selectedSlot }">
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
                </li>
              </ul>
            </section>
          </div>
        </div>

        <!-- Celular: confirmação larga, com o que foi escolhido escrito. -->
        <button
          v-if="selectedSlot"
          type="button"
          class="bk-btn bk-btn--primary bk-btn--lg bk-btn--block sp__mobile-confirm press"
          :disabled="busy"
          @click="emit('confirm', selectedSlot)"
        >
          {{ confirmLabel }}
          <span class="sp__mobile-chosen">{{ chosenLabel }}</span>
          <ArrowRight :size="16" />
        </button>
      </template>
    </section>
  </div>
</template>

<style scoped>
.sp {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 232px;
  gap: 32px;
}

/* ─── Calendário ──────────────────────────────────────────────────────────── */

.sp__cal {
  min-width: 0;
}

.sp__month {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.sp__month h3 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
}

.sp__navs {
  display: flex;
  gap: 4px;
}

.sp__nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.sp__nav:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
}

.sp__nav:disabled {
  opacity: 0.35;
  cursor: default;
}

.sp__grid {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sp__row {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.sp__wd {
  padding: 2px 0 6px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-align: center;
  text-transform: uppercase;
}

.sp__gridcell {
  display: flex;
  justify-content: center;
}

.sp__cell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 46px;
  aspect-ratio: 1;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-4);
  font-family: inherit;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  cursor: default;
}

.sp__cell--blank {
  aspect-ratio: auto;
  min-height: 0;
  pointer-events: none;
}

.sp__cell.is-available {
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.sp__cell.is-available:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.sp__cell.is-selected,
.sp__cell.is-selected:hover {
  background: var(--accent);
  color: var(--accent-fg);
}

.sp__cell.is-today::after {
  content: '';
  position: absolute;
  bottom: 6px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}

.sp__cell:focus-visible,
.sp__slot:focus-visible,
.sp__confirm:focus-visible,
.sp__nav:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sp__veil {
  position: absolute;
  inset: 26px 0 0;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  animation: sp-pulse 1.2s ease-in-out infinite;
}

.sp__tz {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

/* Alinha o texto do fuso com o rótulo (o gatilho tem respiro interno). */
.sp__tz :deep(.tzs) {
  max-width: calc(100% + 8px);
  margin-left: -8px;
}

.sp__tz-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

/* ─── Horários ────────────────────────────────────────────────────────────── */

.sp__times {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sp__day {
  margin: 2px 0 12px;
}

.sp__day p {
  margin: 0;
}

.sp__day-weekday {
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
}

.sp__day-date {
  margin-top: 2px !important;
  color: var(--text-3);
  font-size: 12.5px;
}

.sp__scroll {
  position: relative;
  min-height: 0;
}

/* Sombra no pé quando ainda há horário para baixo: a lista não parece cortada. */
.sp__scroll::after {
  content: '';
  position: absolute;
  right: 6px;
  bottom: 0;
  left: 0;
  height: 44px;
  background: linear-gradient(to bottom, transparent, var(--surface));
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion) var(--motion-ease);
}

.sp__scroll.has-more::after {
  opacity: 1;
}

.sp__list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 382px;
  padding: 2px 6px 2px 2px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.sp__period-label {
  margin: 0 0 7px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
}

.sp__slots {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sp__slot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}

.sp__slot-row.is-picked {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.sp__slot,
.sp__confirm {
  min-height: 44px;
  border-radius: var(--radius);
  font-family: inherit;
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.sp__slot {
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  background: var(--surface);
  color: var(--accent-ink);
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.sp__slot:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.is-picked .sp__slot {
  border-color: transparent;
  background: var(--surface-3);
  color: var(--text);
}

.sp__confirm {
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
  animation: sp-in var(--motion) var(--motion-ease);
}

.sp__confirm:disabled {
  opacity: 0.6;
  cursor: progress;
}

.sp__mobile-confirm {
  display: none;
}

.sp__mobile-chosen {
  font-weight: 500;
  opacity: 0.85;
}

.sp__mobile-chosen::before {
  content: '·';
  margin-right: 6px;
}

/* ─── Estados ─────────────────────────────────────────────────────────────── */

.sp__skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}

.sp__skel-slot {
  height: 44px;
  border-radius: var(--radius);
}

.sp__state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 240px;
  padding: 16px 8px;
  color: var(--text-3);
  text-align: center;
}

.sp__state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-3);
}

.sp__state p {
  max-width: 220px;
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

@keyframes sp-pulse {
  50% {
    opacity: 0.55;
  }
}

@keyframes sp-in {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sp__veil,
  .sp__confirm {
    animation: none;
  }
}

/* ─── Celular ─────────────────────────────────────────────────────────────── */

@media (max-width: 760px) {
  .sp {
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
  }

  .sp__times {
    padding-top: 18px;
    border-top: 1px solid var(--border);
  }

  .sp__list {
    max-height: none;
    padding: 0;
    overflow: visible;
  }

  .sp__scroll::after {
    display: none;
  }

  .sp__slots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .sp__slot-row.is-picked {
    grid-template-columns: minmax(0, 1fr);
  }

  .is-picked .sp__slot {
    background: var(--accent);
    color: var(--accent-fg);
  }

  .sp__confirm {
    display: none;
  }

  /* Gruda no pé da tela: depois de rolar a grade, o botão continua à mão. */
  .sp__mobile-confirm {
    position: sticky;
    bottom: 12px;
    z-index: 2;
    display: inline-flex;
    margin-top: 16px;
    box-shadow: var(--shadow-overlay);
  }
}
</style>
