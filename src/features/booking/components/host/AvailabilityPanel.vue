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
import { CalendarPlus, Copy, Loader2, Plane, Trash2 } from 'lucide-vue-next'
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

function copyToWeekdays(day: number) {
  for (const d of [1, 2, 3, 4, 5]) if (d !== day) days[d] = copyIntervals(days[day]!)
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
    <section class="av__section bk-card">
      <header class="av__head">
        <div>
          <h3>Horário semanal</h3>
          <p>Quando você aceita reuniões. Fora disso, nada aparece na página.</p>
        </div>
      </header>

      <ul class="av__days">
        <li v-for="day in DISPLAY_DAYS" :key="day" class="av__day">
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
            title="Copiar para os outros dias úteis"
            :aria-label="`Copiar o horário de ${WEEKDAY_LONG[day]} para os outros dias úteis`"
            @click="copyToWeekdays(day)"
          >
            <Copy :size="14" />
          </button>
        </li>
      </ul>
    </section>

    <div class="av__side">
      <section class="av__section bk-card">
        <header class="av__head">
          <div>
            <h3>Fuso horário</h3>
            <p>Os horários acima são lidos neste fuso.</p>
          </div>
        </header>
        <TimezoneSelect v-model="timezone" />
        <div v-if="tzMismatch" class="bk-alert bk-alert--info av__tz-hint">
          <Plane :size="15" />
          <span>
            Seu navegador está em {{ zoneLabel(browserTz) }}. Se você está viajando e vai atender
            daqui,
            <button type="button" class="av__link" @click="timezone = browserTz">use este fuso</button>.
          </span>
        </div>
      </section>

      <section class="av__section bk-card">
        <header class="av__head">
          <div>
            <h3>Datas específicas</h3>
            <p>Folga, viagem ou um horário diferente num dia só. Vale mais que a regra semanal.</p>
          </div>
        </header>

        <div class="av__add">
          <input v-model="newDate" class="bk-input av__date" type="date" :min="today" aria-label="Data" />
          <select v-model="newMode" class="bk-input av__mode" aria-label="Tipo">
            <option value="off">Indisponível</option>
            <option value="custom">Outro horário</option>
          </select>
          <button type="button" class="bk-btn" :disabled="!newDate" @click="addOverride">
            <CalendarPlus :size="14" />
            Adicionar
          </button>
        </div>

        <ul v-if="upcomingOverrides.length" class="av__overrides">
          <li v-for="o in upcomingOverrides" :key="o.date" class="av__override">
            <div class="av__override-top">
              <span class="av__override-date">{{ formatDateKey(o.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) }}</span>
              <span v-if="!o.intervals.length" class="av__off-pill">Indisponível</span>
              <button
                type="button"
                class="bk-icon-btn"
                :aria-label="`Remover a exceção de ${o.date}`"
                @click="removeOverride(o.date)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <IntervalsEditor v-if="o.intervals.length" v-model="o.intervals" :day-label="o.date" />
          </li>
        </ul>
        <p v-else class="bk-hint">Nenhuma data específica.</p>
      </section>
    </div>

    <Transition name="av-bar">
      <div v-if="dirty" class="av__bar" role="region" aria-label="Alterações não salvas">
        <span>{{ hasProblem ? 'Corrija os horários marcados em vermelho.' : 'Alterações não salvas' }}</span>
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
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
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

.av__head h3 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
}

.av__head p {
  margin: 3px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.45;
}

.av__days {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.av__day {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) 32px;
  align-items: start;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}

.av__day:first-child {
  border-top: none;
  padding-top: 0;
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

.av__tz-hint {
  align-items: flex-start;
}

.av__tz-hint :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--info);
}

.av__link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
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
  flex: 1 1 140px;
  width: auto;
}

.av__overrides {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.av__override {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.av__override-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.av__override-date {
  flex: 1;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  text-transform: capitalize;
}

.av__off-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--err) 12%, transparent);
  color: var(--err);
  font-size: 11px;
  font-weight: 600;
}

.av__bar {
  position: sticky;
  bottom: 16px;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: center;
  padding: 8px 8px 8px 16px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  color: var(--text-2);
  font-size: 12.5px;
}

.av__bar span {
  margin-right: 6px;
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
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .av__day {
    grid-template-columns: minmax(0, 1fr) 32px;
  }

  .av__day-name {
    grid-column: 1 / -1;
  }

  .av__bar {
    flex-wrap: wrap;
    justify-content: center;
    border-radius: var(--radius-lg);
  }
}
</style>
