<script setup lang="ts">
/**
 * Horários de atendimento: a regra semanal, as datas específicas (viagem,
 * feriado, um sábado excepcional) e o fuso em que tudo isso é lido.
 *
 * Edição em rascunho com "Salvar" explícito, e não autosave: regra de agenda
 * pela metade (apagou a manhã, ainda não digitou a tarde) publicada no meio do
 * caminho tiraria horários do ar para quem estiver olhando a página.
 */
import { computed, reactive, ref, watch } from 'vue'
import { CalendarPlus, CopyCheck, Loader2, Plane, Trash2 } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { BookingPage, ClockInterval, DateOverride } from '@/service/booking/booking-service'
import IntervalsEditor from './IntervalsEditor.vue'
import TimezoneSelect from '../TimezoneSelect.vue'
import { useBookingSettings } from '../../composables/useBookingSettings'
import {
  DISPLAY_DAYS,
  availabilitySignature,
  intervalsProblem,
  toMinutes,
  weeklyByDay,
  weeklyFromDays,
} from '../../availability'
import { WEEKDAY_LONG, browserTimeZone, formatDateKey, todayKey, zoneLabel } from '../../booking-time'

const props = defineProps<{ page: BookingPage }>()

const { savePage } = useBookingSettings()
const { success: showSuccess, error: showError } = useToast()

/*
 * Cópias explícitas, nunca `structuredClone`: os dados vêm do cache do Vue
 * Query e do `reactive` daqui, e `structuredClone` lança DataCloneError em
 * Proxy do Vue. Foi o que derrubava a aba inteira na primeira versão.
 */
const copyIntervals = (list: readonly ClockInterval[]) => list.map((i) => ({ start: i.start, end: i.end }))
const copyOverrides = (list: readonly DateOverride[]) =>
  list.map((o) => ({ date: o.date, intervals: copyIntervals(o.intervals) }))

const timezone = ref(props.page.timezone)
const days = reactive<Record<number, ClockInterval[]>>(weeklyByDay(props.page.weeklyHours))
const overrides = ref<DateOverride[]>(copyOverrides(props.page.dateOverrides))

function reset(page: BookingPage = props.page) {
  timezone.value = page.timezone
  Object.assign(days, weeklyByDay(page.weeklyHours))
  overrides.value = copyOverrides(page.dateOverrides)
}

const savedSignature = computed(() =>
  availabilitySignature(props.page.timezone, props.page.weeklyHours, props.page.dateOverrides),
)
const draftSignature = computed(() =>
  availabilitySignature(timezone.value, weeklyFromDays(days), overrides.value),
)
const dirty = computed(() => savedSignature.value !== draftSignature.value)

// O servidor é a verdade: quando a página muda por fora (outra aba, salvar),
// o rascunho acompanha, a menos que haja edição em andamento. Compara pela
// assinatura ANTERIOR: depois de salvar, o rascunho já é igual ao novo valor.
watch(savedSignature, (_next, previous) => {
  if (previous === draftSignature.value || !dirty.value) reset()
})

const hasProblem = computed(
  () =>
    DISPLAY_DAYS.some((d) => intervalsProblem(days[d]!)) ||
    overrides.value.some((o) => intervalsProblem(o.intervals)),
)

/** "40 h por semana · 5 dias": o tamanho da agenda num número. */
const weeklySummary = computed(() => {
  let minutes = 0
  let open = 0
  for (const d of DISPLAY_DAYS) {
    const list = days[d]!
    if (list.length) open += 1
    for (const i of list) minutes += Math.max(0, toMinutes(i.end) - toMinutes(i.start))
  }
  if (!open) return 'Nenhum dia aberto'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = m ? `${h} h ${m} min` : `${h} h`
  return `${hours} por semana · ${open} ${open === 1 ? 'dia' : 'dias'}`
})

const browserTz = browserTimeZone()
const tzMismatch = computed(() => timezone.value !== browserTz)

function toggleDay(day: number, enabled: boolean) {
  if (!enabled) {
    days[day] = []
    return
  }
  // Ligar um dia copia o horário do dia útil mais próximo já configurado:
  // quase sempre é o mesmo expediente.
  const template = DISPLAY_DAYS.map((d) => days[d]!).find((list) => list.length)
  days[day] = template ? copyIntervals(template) : [{ start: '09:00', end: '17:00' }]
}

const copiedFrom = ref<number | null>(null)
function copyToWeekdays(day: number) {
  for (const d of [1, 2, 3, 4, 5]) if (d !== day) days[d] = copyIntervals(days[day]!)
  copiedFrom.value = day
  setTimeout(() => (copiedFrom.value = null), 1600)
}

// ─── Datas específicas ──────────────────────────────────────────────────────

const today = todayKey(props.page.timezone)
const newDate = ref('')
const newMode = ref<'off' | 'custom'>('off')

const upcomingOverrides = computed(() =>
  [...overrides.value].filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
)

function addOverride() {
  if (!newDate.value) return
  const existing = overrides.value.find((o) => o.date === newDate.value)
  const intervals: ClockInterval[] =
    newMode.value === 'off' ? [] : [{ start: '09:00', end: '12:00' }]
  if (existing) existing.intervals = intervals
  else overrides.value = [...overrides.value, { date: newDate.value, intervals }]
  newDate.value = ''
}

function removeOverride(date: string) {
  overrides.value = overrides.value.filter((o) => o.date !== date)
}

function overrideLabel(date: string) {
  const text = formatDateKey(date, { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

async function save() {
  if (hasProblem.value) return
  try {
    const saved = await savePage.mutateAsync({
      timezone: timezone.value,
      weeklyHours: weeklyFromDays(days),
      // Datas passadas não servem para nada e só incham a regra.
      dateOverrides: overrides.value.filter((o) => o.date >= today),
    })
    // O rascunho passa a ser a regra que o SERVIDOR devolveu (normalizada,
    // sem datas passadas). Da resposta, e não da prop: o Vue Query avisa os
    // observadores num ciclo depois, e resetar pela prop pegava a versão antiga.
    if (saved.page) reset(saved.page)
    showSuccess('Horários salvos. A página já mostra a nova disponibilidade.')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível salvar os horários.'))
  }
}
</script>

<template>
  <div class="av">
    <section class="av__section av__week bk-card">
      <header class="bk-card__head">
        <div>
          <h3 class="bk-card__title">Horário semanal</h3>
          <p class="bk-card__sub">Quando você aceita reuniões. Fora disso, nada aparece na página.</p>
        </div>
        <span class="bk-chip av__total">{{ weeklySummary }}</span>
      </header>

      <ul class="av__days">
        <li v-for="day in DISPLAY_DAYS" :key="day" class="av__day" :class="{ 'is-off': !days[day]!.length }">
          <label class="av__day-name">
            <span class="bk-switch">
              <input
                type="checkbox"
                :checked="days[day]!.length > 0"
                :aria-label="`${WEEKDAY_LONG[day]} disponível`"
                @change="toggleDay(day, ($event.target as HTMLInputElement).checked)"
              />
              <span />
            </span>
            {{ WEEKDAY_LONG[day] }}
          </label>
          <div class="av__day-body">
            <IntervalsEditor
              v-if="days[day]!.length"
              :model-value="days[day]!"
              :day-label="WEEKDAY_LONG[day]!"
              @update:model-value="days[day] = $event"
            />
            <span v-else class="av__unavailable">Indisponível</span>
          </div>
          <button
            v-if="days[day]!.length && day >= 1 && day <= 5"
            type="button"
            class="bk-icon-btn av__copy"
            :class="{ 'is-done': copiedFrom === day }"
            :title="copiedFrom === day ? 'Copiado para os dias úteis' : 'Copiar para os outros dias úteis'"
            :aria-label="`Copiar o horário de ${WEEKDAY_LONG[day]} para os outros dias úteis`"
            @click="copyToWeekdays(day)"
          >
            <CopyCheck :size="15" />
          </button>
        </li>
      </ul>
    </section>

    <div class="av__side">
      <section class="av__section bk-card">
        <header>
          <h3 class="bk-card__title">Fuso horário</h3>
          <p class="bk-card__sub">Os horários ao lado são lidos neste fuso. Quem marca vê tudo convertido para o fuso dela.</p>
        </header>
        <TimezoneSelect v-model="timezone" />
        <div v-if="tzMismatch" class="bk-alert bk-alert--info">
          <Plane :size="15" />
          <span>
            Seu navegador está em {{ zoneLabel(browserTz) }}. Se você está viajando e vai atender
            daqui,
            <button type="button" class="bk-link" @click="timezone = browserTz">use este fuso</button>.
          </span>
        </div>
      </section>

      <section class="av__section bk-card">
        <header>
          <h3 class="bk-card__title">Datas específicas</h3>
          <p class="bk-card__sub">Folga, viagem ou um horário diferente num dia só. Vale mais que a regra semanal.</p>
        </header>

        <div class="av__add">
          <input v-model="newDate" class="bk-input av__date" type="date" :min="today" aria-label="Data" />
          <div class="bk-seg av__mode" role="radiogroup" aria-label="O que muda nesse dia">
            <button
              type="button"
              role="radio"
              class="bk-seg__btn"
              :class="{ 'is-active': newMode === 'off' }"
              :aria-checked="newMode === 'off'"
              @click="newMode = 'off'"
            >
              Dia livre
            </button>
            <button
              type="button"
              role="radio"
              class="bk-seg__btn"
              :class="{ 'is-active': newMode === 'custom' }"
              :aria-checked="newMode === 'custom'"
              @click="newMode = 'custom'"
            >
              Outro horário
            </button>
          </div>
          <button type="button" class="bk-btn av__add-btn" :disabled="!newDate" @click="addOverride">
            <CalendarPlus :size="14" />
            Adicionar
          </button>
        </div>

        <ul v-if="upcomingOverrides.length" class="av__overrides">
          <li v-for="o in upcomingOverrides" :key="o.date" class="av__override">
            <div class="av__override-top">
              <span class="av__override-date">{{ overrideLabel(o.date) }}</span>
              <span v-if="!o.intervals.length" class="bk-chip bk-chip--warn">Dia livre</span>
              <span v-else class="bk-chip">Outro horário</span>
              <button
                type="button"
                class="bk-icon-btn bk-icon-btn--danger"
                :aria-label="`Remover a exceção de ${overrideLabel(o.date)}`"
                title="Remover"
                @click="removeOverride(o.date)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <IntervalsEditor v-if="o.intervals.length" v-model="o.intervals" :day-label="overrideLabel(o.date)" />
          </li>
        </ul>
        <p v-else class="av__none">Nenhuma data específica. A regra semanal vale todos os dias.</p>
      </section>
    </div>

    <Transition name="av-bar">
      <div v-if="dirty" class="av__bar" role="region" aria-label="Alterações não salvas">
        <span class="av__bar-text" :class="{ 'is-err': hasProblem }">
          {{ hasProblem ? 'Corrija os horários marcados em vermelho.' : 'Alterações não salvas' }}
        </span>
        <button type="button" class="bk-btn bk-btn--ghost" :disabled="savePage.isPending.value" @click="reset()">
          Descartar
        </button>
        <button
          type="button"
          class="bk-btn bk-btn--primary"
          :disabled="hasProblem || savePage.isPending.value"
          @click="save"
        >
          <Loader2 v-if="savePage.isPending.value" :size="14" class="bk-spin" />
          Salvar horários
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.av {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  padding-top: 4px;
  padding-bottom: 72px;
}

.av__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.av__section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}

.av__total {
  flex-shrink: 0;
}

.av__days {
  display: flex;
  flex-direction: column;
  margin: 0 -8px;
  padding: 0;
  list-style: none;
}

.av__day {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) 32px;
  align-items: start;
  gap: 12px;
  padding: 10px 8px;
  border-radius: var(--radius);
  transition: background var(--motion-fast) var(--motion-ease);
}

.av__day + .av__day {
  border-top: 1px solid var(--border);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.av__day:hover {
  background: color-mix(in srgb, var(--surface-2) 50%, transparent);
}

.av__day-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.av__day.is-off .av__day-name {
  color: var(--text-3);
}

.av__day-body {
  min-width: 0;
}

.av__unavailable {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  color: var(--text-4);
  font-size: 12.5px;
}

.av__copy {
  margin-top: 2px;
}

.av__copy.is-done {
  color: var(--success);
}

.av__add {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.av__date {
  flex: 1 1 150px;
  width: auto;
}

.av__mode {
  flex: 0 0 auto;
}

.av__add-btn {
  flex: 1 0 auto;
  min-height: 40px;
}

.av__overrides {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.av__override {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface-2) 50%, var(--surface));
}

.av__override-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.av__override-date {
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

.av__none {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}

/* ─── Barra de salvar ─────────────────────────────────────────────────────── */

.av__bar {
  position: sticky;
  bottom: 16px;
  z-index: 3;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: center;
  padding: 8px 8px 8px 18px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  color: var(--text-2);
  font-size: 12.5px;
}

.av__bar .bk-btn {
  border-radius: 999px;
}

.av__bar-text {
  margin-right: 6px;
  font-weight: 600;
}

.av__bar-text.is-err {
  color: var(--err);
}

.av-bar-enter-active,
.av-bar-leave-active {
  transition:
    opacity var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.av-bar-enter-from,
.av-bar-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 980px) {
  .av {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .av__section {
    padding: 16px 14px;
  }

  .av__week .bk-card__head {
    flex-direction: column;
  }

  .av__day {
    grid-template-columns: minmax(0, 1fr) 32px;
  }

  .av__day-name {
    grid-column: 1 / -1;
  }

  .av__day-body {
    grid-column: 1;
  }

  .av__mode {
    flex: 1 1 100%;
  }

  .av__mode .bk-seg__btn {
    flex: 1;
  }

  .av__bar {
    left: 0;
    flex-wrap: wrap;
    justify-content: center;
    border-radius: var(--radius-lg);
  }
}
</style>
