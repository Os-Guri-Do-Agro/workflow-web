<script setup lang="ts">
/**
 * Agenda do mês: o calendário onde as ocorrências aparecem sozinhas nos dias.
 *
 * Duas faixas, e a separação é o ponto da tela:
 *
 * - **Fixas do mês** ficam numa faixa no topo, fora da grade. Elas valem para o
 *   mês inteiro, não para um dia; empurrá-las para uma célula do calendário
 *   diria que são de terça, o que é falso, e esconderia justamente o que a
 *   pessoa quer ver de relance ao abrir o mês.
 * - **O resto** cai na grade, no dia em que a regra manda.
 *
 * A grade começa no domingo e completa as semanas com os dias vizinhos em tom
 * apagado: mês que começa numa quinta sem preenchimento vira uma primeira linha
 * torta que ninguém consegue ler como calendário.
 */
import { computed } from 'vue'
import { CalendarOff, Pin, RotateCcw, Undo2 } from 'lucide-vue-next'
import TagChip from '@/components/ui/TagChip.vue'
import { statusSpec } from '../../task-meta'
import type { RecurringOccurrence } from '../recurrence-types'
import {
  WEEKDAYS,
  addDays,
  daysInMonth,
  monthKeyOf,
  today,
  weekdayOf,
} from '../recurrence-engine'

const props = defineProps<{
  monthKey: string
  /** Ocorrências que caem num dia (as fixas do mês vêm por `fixed`). */
  scheduled: RecurringOccurrence[]
  /** Fixas do mês, exibidas na faixa própria. */
  fixed: RecurringOccurrence[]
}>()

const emit = defineEmits<{
  open: [occurrence: RecurringOccurrence]
  skip: [occurrence: RecurringOccurrence]
  restore: [occurrence: RecurringOccurrence]
  reset: [occurrence: RecurringOccurrence]
}>()

interface Cell {
  date: string
  day: number
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
  occurrences: RecurringOccurrence[]
}

const byDate = computed(() => {
  const map: Record<string, RecurringOccurrence[]> = {}
  for (const occurrence of props.scheduled) (map[occurrence.date] ??= []).push(occurrence)
  return map
})

const cells = computed<Cell[]>(() => {
  const first = `${props.monthKey}-01`
  const total = daysInMonth(props.monthKey)
  const lead = weekdayOf(first) // quantos dias do mês anterior completam a 1ª semana
  const start = addDays(first, -lead)
  const now = today()

  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(start, i)
    return {
      date,
      day: Number(date.slice(8, 10)),
      inMonth: monthKeyOf(date) === props.monthKey,
      isToday: date === now,
      isWeekend: weekdayOf(date) === 0 || weekdayOf(date) === 6,
      occurrences: byDate.value[date] ?? [],
    }
  }).slice(0, total + lead > 35 ? 42 : 35)
})

const statusToken = (occurrence: RecurringOccurrence) => statusSpec(occurrence.status).token
</script>

<template>
  <div class="agenda">
    <!-- Faixa das fixas do mês -->
    <section class="fixed-rail">
      <header class="rail-head">
        <span class="rail-title">
          <Pin :size="13" />
          Fixas do mês
        </span>
        <span class="rail-sub">
          Valem o mês inteiro. Reaparecem sozinhas no mês seguinte — sem recopiar nada.
        </span>
      </header>

      <div v-if="fixed.length" class="rail-cards">
        <article
          v-for="item in fixed"
          :key="item.id"
          class="fixed-card"
          :class="{ 'fixed-card--skipped': item.skipped }"
          :style="{ '--st-c': statusToken(item) } as Record<string, string>"
          tabindex="0"
          role="button"
          @click="emit('open', item)"
          @keydown.enter="emit('open', item)"
        >
          <div class="fixed-top">
            <span class="status-dot" aria-hidden="true" />
            <span class="fixed-status">{{ statusSpec(item.status).label }}</span>
            <span class="fixed-day">dia {{ Number(item.date.slice(8, 10)) }}</span>
          </div>
          <p class="fixed-title">{{ item.title }}</p>
          <div v-if="item.tags.length" class="fixed-tags">
            <TagChip v-for="tag in item.tags" :key="tag.id" :tag="tag" size="sm" />
          </div>
        </article>
      </div>
      <p v-else class="rail-empty">
        Nenhuma tarefa fixa neste mês. Crie uma com repetição <strong>Fixa do mês</strong>.
      </p>
    </section>

    <!-- Grade do mês -->
    <section class="grid-wrap">
      <div class="grid-head">
        <span v-for="day in WEEKDAYS" :key="day.value" class="grid-head-cell">
          {{ day.abbr }}
        </span>
      </div>

      <div class="grid">
        <div
          v-for="cell in cells"
          :key="cell.date"
          class="cell"
          :class="{
            'cell--out': !cell.inMonth,
            'cell--today': cell.isToday,
            'cell--weekend': cell.isWeekend,
          }"
        >
          <div class="cell-head">
            <span class="cell-day">{{ cell.day }}</span>
            <span v-if="cell.isToday" class="cell-today">hoje</span>
          </div>

          <div class="cell-body">
            <article
              v-for="item in cell.occurrences"
              :key="item.id"
              class="occ"
              :class="{ 'occ--skipped': item.skipped, 'occ--touched': item.touched }"
              :style="{ '--st-c': statusToken(item) } as Record<string, string>"
              tabindex="0"
              role="button"
              :title="item.title"
              @click="emit('open', item)"
              @keydown.enter="emit('open', item)"
            >
              <span class="occ-bar" aria-hidden="true" />
              <span class="occ-title">{{ item.title }}</span>
              <button
                v-if="!item.skipped"
                type="button"
                class="occ-action press"
                title="Dispensar só neste dia (a regra continua valendo)"
                :aria-label="`Dispensar ${item.title} em ${cell.date}`"
                @click.stop="emit('skip', item)"
              >
                <CalendarOff :size="11" />
              </button>
              <button
                v-else
                type="button"
                class="occ-action press"
                title="Trazer de volta"
                :aria-label="`Restaurar ${item.title} em ${cell.date}`"
                @click.stop="emit('restore', item)"
              >
                <Undo2 :size="11" />
              </button>
              <button
                v-if="item.touched && !item.skipped"
                type="button"
                class="occ-action press"
                title="Voltar ao que o modelo diz"
                :aria-label="`Restaurar padrão de ${item.title}`"
                @click.stop="emit('reset', item)"
              >
                <RotateCcw :size="11" />
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.agenda {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

/* ─── Faixa das fixas ─── */
.fixed-rail {
  padding: 12px 13px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.rail-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.rail-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-2);
}

.rail-sub {
  font-size: 11.5px;
  color: var(--text-3);
}

.rail-empty {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.rail-empty strong {
  color: var(--text-2);
  font-weight: 600;
}

.rail-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
  gap: 8px;
}

.fixed-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 11px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 3px solid var(--st-c);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.fixed-card:hover,
.fixed-card:focus-visible {
  border-color: var(--border-strong);
  border-left-color: var(--st-c);
  box-shadow: var(--shadow-sm);
  outline: none;
}

.fixed-card--skipped {
  opacity: 0.45;
}

.fixed-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--st-c);
  flex-shrink: 0;
}

.fixed-status {
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-3);
}

.fixed-day {
  margin-left: auto;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-4);
}

.fixed-title {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text);
}

.fixed-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

/* ─── Grade ─── */
.grid-wrap {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.grid-head {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 6px;
}

.grid-head-cell {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-4);
  padding-left: 2px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 104px;
  padding: 7px 7px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.cell--weekend {
  background: var(--surface-2);
}

.cell--out {
  opacity: 0.4;
}

.cell--today {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}

.cell-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cell-day {
  font-size: 11.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.cell--today .cell-day {
  color: var(--accent);
}

.cell-today {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent);
}

.cell-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

/* ─── Card de ocorrência ─── */
.occ {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 5px 4px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.occ:hover,
.occ:focus-visible {
  background: var(--surface-3);
  border-color: var(--border-strong);
  outline: none;
}

.occ-bar {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--st-c);
}

.occ-title {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 550;
  line-height: 1.3;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.occ--skipped {
  opacity: 0.42;
}

.occ--skipped .occ-title {
  text-decoration: line-through;
}

/* Ponto discreto: esta data foge do modelo (status trocado ou remarcada). */
.occ--touched::after {
  content: '';
  position: absolute;
  top: 3px;
  right: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.occ-action {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--text-4);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-fast), color var(--motion-fast);
}

.occ:hover .occ-action,
.occ:focus-within .occ-action {
  opacity: 1;
}

.occ-action:hover {
  color: var(--text);
  background: var(--surface);
}

@media (max-width: 900px) {
  .cell {
    min-height: 84px;
  }
}
</style>
