<script setup lang="ts">
/**
 * Editor da regra de repetição.
 *
 * Regra de desenho: a pessoa escolhe a FREQUÊNCIA primeiro e só depois vê os
 * campos daquela frequência. Mostrar dias da semana, dia do mês e intervalo
 * todos juntos transforma uma decisão simples ("toda segunda") num formulário
 * de configuração — e o campo que não vale para a escolha atual vira ruído que
 * a pessoa precisa aprender a ignorar.
 *
 * A frase em `describeRule` e a prévia das próximas datas ficam sempre à vista:
 * elas são a prova de que a regra faz o que a pessoa quis. Tarefa que se cria
 * sozinha sem prévia é tarefa que ninguém confia.
 */
import { computed } from 'vue'
import { CalendarClock, CalendarDays, CalendarRange, Repeat, Sparkles } from 'lucide-vue-next'
import type { LucideIcon } from 'lucide-vue-next'
import type { MonthDay, RecurrenceFrequency, RecurrenceRule } from '../recurrence-types'
import { WEEKDAYS, dayLabel, describeRule, monthLabel, monthKeyOf, nextOccurrences } from '../recurrence-engine'

const props = defineProps<{ modelValue: RecurrenceRule }>()
const emit = defineEmits<{ 'update:modelValue': [value: RecurrenceRule] }>()

const rule = computed(() => props.modelValue)

function patch(part: Partial<RecurrenceRule>): void {
  emit('update:modelValue', { ...props.modelValue, ...part })
}

interface FrequencyOption {
  value: RecurrenceFrequency
  label: string
  hint: string
  icon: LucideIcon
}

/**
 * "Fixa do mês" é o rótulo de `monthly` de propósito: é o nome que a coisa já
 * tem na cabeça de quem usa ("as fixas que eu deixo em teste"). Chamar de
 * "mensal" seria correto e inútil.
 */
const FREQUENCIES: FrequencyOption[] = [
  { value: 'once', label: 'Não repete', hint: 'Uma tarefa só, no prazo escolhido', icon: CalendarDays },
  { value: 'weekly', label: 'Semanal', hint: 'Nos dias da semana que você marcar', icon: CalendarRange },
  { value: 'monthly', label: 'Fixa do mês', hint: 'Reaparece sozinha todo mês', icon: Repeat },
  { value: 'daily', label: 'Diária', hint: 'Todo dia, com opção de pular fim de semana', icon: CalendarClock },
]

function setFrequency(value: RecurrenceFrequency): void {
  if (value === props.modelValue.frequency) return
  // Ao trocar de frequência, os campos da nova precisam já vir preenchidos com
  // algo coerente: cair em "semanal sem nenhum dia marcado" é um estado que a
  // pessoa não pediu e que não gera nada.
  const start = props.modelValue.startDate
  if (value === 'weekly' && props.modelValue.weekdays.length === 0) {
    patch({ frequency: value, weekdays: [1] })
    return
  }
  if (value === 'monthly' && props.modelValue.monthDay === undefined) {
    patch({ frequency: value, monthDay: Number(start.slice(8, 10)) })
    return
  }
  patch({ frequency: value })
}

function toggleWeekday(day: number): void {
  const days = props.modelValue.weekdays.includes(day)
    ? props.modelValue.weekdays.filter((d) => d !== day)
    : [...props.modelValue.weekdays, day]
  // Nunca deixa zerar: regra semanal sem dia nenhum não gera ocorrência, e a
  // tela ficaria vazia sem dizer por quê. Desmarcar o último é ignorado.
  if (!days.length) return
  patch({ weekdays: days.sort((a, b) => a - b) })
}

const monthDayOptions = computed<MonthDay[]>(() => [
  ...Array.from({ length: 28 }, (_, i) => i + 1),
  'last' as const,
])

const intervalLabel = computed(() => {
  if (rule.value.frequency === 'daily') return rule.value.interval === 1 ? 'dia' : 'dias'
  if (rule.value.frequency === 'weekly') return rule.value.interval === 1 ? 'semana' : 'semanas'
  return rule.value.interval === 1 ? 'mês' : 'meses'
})

const sentence = computed(() => describeRule(rule.value))

/** Próximas datas geradas: a prova visual de que a regra está certa. */
const upcoming = computed(() => nextOccurrences(rule.value, 5, rule.value.startDate))

/**
 * Mês de destino do prazo.
 *
 * É a resposta para "mudei a data, para qual mês isso vai?" — que hoje é uma
 * segunda escolha manual e some quando alguém esquece de fazê-la.
 */
const targetMonth = computed(() => monthLabel(monthKeyOf(rule.value.startDate)))

const hasEnd = computed(() => rule.value.endDate !== null)

function toggleEnd(): void {
  patch({ endDate: hasEnd.value ? null : rule.value.startDate })
}
</script>

<template>
  <div class="rule-editor">
    <!-- Frequência -->
    <div class="field">
      <span class="label">
        <Repeat :size="12" />
        Repetição
      </span>
      <div class="freq-grid">
        <button
          v-for="option in FREQUENCIES"
          :key="option.value"
          type="button"
          class="freq-card press"
          :class="{ 'freq-card--active': rule.frequency === option.value }"
          :aria-pressed="rule.frequency === option.value"
          @click="setFrequency(option.value)"
        >
          <component :is="option.icon" :size="15" class="freq-icon" />
          <span class="freq-label">{{ option.label }}</span>
          <span class="freq-hint">{{ option.hint }}</span>
        </button>
      </div>
    </div>

    <!-- Dias da semana (só semanal) -->
    <div v-if="rule.frequency === 'weekly'" class="field">
      <span class="label">Dias da semana</span>
      <div class="week-row">
        <button
          v-for="day in WEEKDAYS"
          :key="day.value"
          type="button"
          class="day-btn press"
          :class="{ 'day-btn--active': rule.weekdays.includes(day.value) }"
          :title="day.label"
          :aria-label="day.label"
          :aria-pressed="rule.weekdays.includes(day.value)"
          @click="toggleWeekday(day.value)"
        >
          {{ day.short }}
        </button>
      </div>
    </div>

    <!-- Dia do mês (só fixa do mês) -->
    <div v-if="rule.frequency === 'monthly'" class="field">
      <span class="label">Dia do mês</span>
      <div class="monthday-row">
        <select
          class="input input--select"
          :value="String(rule.monthDay)"
          aria-label="Dia do mês em que a tarefa aparece"
          @change="patch({ monthDay: ($event.target as HTMLSelectElement).value === 'last' ? 'last' : Number(($event.target as HTMLSelectElement).value) })"
        >
          <option v-for="d in monthDayOptions" :key="String(d)" :value="String(d)">
            {{ d === 'last' ? 'Último dia do mês' : `Dia ${d}` }}
          </option>
        </select>
        <p class="hint">
          Dias 29, 30 e 31 não existem em todo mês — use <strong>último dia</strong> para
          a tarefa nunca sumir em fevereiro.
        </p>
      </div>
    </div>

    <!-- Pular fim de semana (só diária) -->
    <label v-if="rule.frequency === 'daily'" class="switch-row">
      <input
        type="checkbox"
        class="switch-input"
        :checked="rule.skipWeekends"
        @change="patch({ skipWeekends: ($event.target as HTMLInputElement).checked })"
      />
      <span class="switch-text">
        Pular sábado e domingo
        <span class="switch-hint">A tarefa só nasce em dia útil</span>
      </span>
    </label>

    <!-- Intervalo (todas as recorrentes) -->
    <div v-if="rule.frequency !== 'once'" class="field">
      <span class="label">Intervalo</span>
      <div class="interval-row">
        <span class="interval-text">A cada</span>
        <input
          type="number"
          class="input input--num"
          min="1"
          max="12"
          :value="rule.interval"
          aria-label="Intervalo da repetição"
          @input="patch({ interval: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })"
        />
        <span class="interval-text">{{ intervalLabel }}</span>
      </div>
    </div>

    <!-- Prazo / início -->
    <div class="row">
      <label class="field flex-1">
        <span class="label">
          <CalendarDays :size="12" />
          {{ rule.frequency === 'once' ? 'Prazo' : 'Começa em' }}
        </span>
        <input
          type="date"
          class="input"
          :value="rule.startDate"
          @input="patch({ startDate: ($event.target as HTMLInputElement).value || rule.startDate })"
        />
        <!-- O mês não é um campo: ele é consequência da data. -->
        <span class="month-target">
          <Sparkles :size="11" />
          Vai para <strong>{{ targetMonth }}</strong>
        </span>
      </label>

      <div v-if="rule.frequency !== 'once'" class="field flex-1">
        <span class="label">Termina em</span>
        <div class="end-row">
          <button
            type="button"
            class="ghost-toggle press"
            :class="{ 'ghost-toggle--active': !hasEnd }"
            @click="hasEnd && toggleEnd()"
          >
            Sem fim
          </button>
          <input
            v-if="hasEnd"
            type="date"
            class="input"
            :value="rule.endDate ?? ''"
            :min="rule.startDate"
            aria-label="Data final da recorrência"
            @input="patch({ endDate: ($event.target as HTMLInputElement).value || null })"
          />
          <button v-else type="button" class="ghost-toggle press" @click="toggleEnd()">
            Definir data
          </button>
        </div>
      </div>
    </div>

    <!-- Prévia: a frase + as próximas datas geradas -->
    <div class="preview">
      <p class="preview-sentence">{{ sentence }}</p>
      <div v-if="rule.frequency !== 'once'" class="preview-dates">
        <span class="preview-caption">Próximas:</span>
        <span v-for="date in upcoming" :key="date" class="preview-pill">{{ dayLabel(date) }}</span>
        <span v-if="!upcoming.length" class="preview-empty">
          Nenhuma data cai nessa regra — revise os campos acima.
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rule-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.flex-1 {
  flex: 1;
}

.row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-3);
}

.input {
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.input:focus {
  border-color: var(--accent);
}

.input--num {
  width: 62px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.input--select {
  max-width: 220px;
}

/* ─── Frequência ─── */
.freq-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.freq-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 11px;
  text-align: left;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.freq-card:hover {
  border-color: var(--border-strong);
}

.freq-card--active {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: var(--accent);
}

.freq-icon {
  color: var(--text-3);
  margin-bottom: 2px;
}

.freq-card--active .freq-icon {
  color: var(--accent);
}

.freq-label {
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text);
}

.freq-hint {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}

/* ─── Dias da semana ─── */
.week-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.day-btn {
  width: 36px;
  height: 34px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.day-btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.day-btn--active {
  color: var(--accent-fg);
  background: var(--accent);
  border-color: var(--accent);
}

/* ─── Dia do mês ─── */
.monthday-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

.hint strong {
  color: var(--text-2);
  font-weight: 600;
}

/* ─── Switch ─── */
.switch-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 11px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}

.switch-input {
  margin-top: 2px;
  accent-color: var(--accent);
}

.switch-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.switch-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
}

/* ─── Intervalo ─── */
.interval-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.interval-text {
  font-size: 12.5px;
  color: var(--text-2);
}

/* ─── Fim ─── */
.end-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ghost-toggle {
  height: 34px;
  padding: 0 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast);
}

.ghost-toggle:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.ghost-toggle--active {
  color: var(--text);
  border-color: var(--accent);
}

/* ─── Mês de destino ─── */
.month-target {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--text-3);
}

.month-target strong {
  color: var(--accent);
  font-weight: 650;
  text-transform: capitalize;
}

/* ─── Prévia ─── */
.preview {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--accent) 7%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-radius: var(--radius);
}

.preview-sentence {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.preview-dates {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.preview-caption {
  font-size: 11px;
  color: var(--text-3);
}

.preview-pill {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.preview-empty {
  font-size: 11.5px;
  color: var(--warn);
}
</style>
