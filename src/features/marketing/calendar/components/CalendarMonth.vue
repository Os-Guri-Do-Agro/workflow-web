<script setup lang="ts">
/**
 * Visão Mês do calendário editorial. No computador: título no dia (até 3 e
 * "+N"), faixas de vários dias por cima (campanha, ativação), arrastar um card
 * para outro dia e clicar no dia para criar. No celular: calendário de pontos;
 * tocar no dia escolhe o dia e a agenda dele aparece embaixo (quem desenha a
 * agenda é a view).
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle, Plus } from 'lucide-vue-next'
import { toneStyle } from '../../marketing-labels'
import { singlesByDay, weekBands, type CalendarItemView, type PlacedItem } from '../calendar-layout'
import { WEEKDAYS_MON, formatLongDay, type CalendarCell } from '../calendar-time'

const props = defineProps<{
  weeks: CalendarCell[][]
  placed: PlacedItem[]
  today: string
  selectedDay: string | null
  canCreate: boolean
  canDrag: (item: CalendarItemView) => boolean
  phone: boolean
  brandToneOf: (companyId: string | null) => string
  brandNameOf: (companyId: string | null) => string
}>()

const emit = defineEmits<{
  create: [day: string]
  open: [item: CalendarItemView]
  move: [item: CalendarItemView, day: string]
  select: [day: string]
}>()

const router = useRouter()
const MAX_CHIPS = 3

const singles = computed(() => singlesByDay(props.placed))
const rows = computed(() =>
  props.weeks.map((week) => {
    const { segments, lanes } = weekBands(
      props.placed,
      week.map((c) => c.date),
    )
    return { week, segments, lanes }
  }),
)

function dayItems(day: string): PlacedItem[] {
  return singles.value.get(day) ?? []
}

// ── "+N": abre o dia na própria grade ───────────────────────────────────
const expanded = ref<string | null>(null)
function visibleItems(day: string): PlacedItem[] {
  const list = dayItems(day)
  return expanded.value === day ? list : list.slice(0, MAX_CHIPS)
}

function hrefOf(item: CalendarItemView): string {
  return router.resolve(item.to).href
}

function itemLabel(p: PlacedItem): string {
  const parts = [p.time ?? 'dia todo', p.item.title]
  if (p.item.kindLabel) parts.push(p.item.kindLabel)
  if (p.item.statusLabel) parts.push(p.item.statusLabel)
  const brand = props.brandNameOf(p.item.companyId)
  if (brand) parts.push(brand)
  if (p.item.flag === 'late') parts.push('prazo vencido')
  return parts.join(', ')
}

function cellLabel(cell: CalendarCell): string {
  const n = dayItems(cell.date).length
  const parts = [formatLongDay(cell.date)]
  if (cell.date === props.today) parts.push('hoje')
  parts.push(n ? `${n} ${n === 1 ? 'item' : 'itens'}` : 'sem itens')
  return parts.join(', ')
}

function onOpen(event: MouseEvent, item: CalendarItemView) {
  // Ctrl/Cmd/meio: deixa o navegador abrir em outra aba.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
  event.preventDefault()
  emit('open', item)
}

function onCellClick(cell: CalendarCell) {
  if (props.phone) emit('select', cell.date)
  else if (props.canCreate) emit('create', cell.date)
}

// ── Arrastar (HTML5; no celular não tem arrastar) ───────────────────────
const dragging = ref<CalendarItemView | null>(null)
const overDay = ref<string | null>(null)

function onDragStart(event: DragEvent, item: CalendarItemView) {
  if (!props.canDrag(item)) {
    event.preventDefault()
    return
  }
  dragging.value = item
  event.dataTransfer?.setData('text/plain', item.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  dragging.value = null
  overDay.value = null
}

function onDragOver(event: DragEvent, cell: CalendarCell) {
  if (!dragging.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  overDay.value = cell.date
}

function onDrop(event: DragEvent, cell: CalendarCell) {
  const item = dragging.value
  onDragEnd()
  if (!item) return
  event.preventDefault()
  emit('move', item, cell.date)
}
</script>

<template>
  <section class="mkc-month" :class="{ 'is-phone': phone }" aria-label="Calendário do mês">
    <div class="mkc-month__wd" aria-hidden="true">
      <span v-for="d in WEEKDAYS_MON" :key="d">{{ d }}</span>
    </div>
    <div
      v-for="row in rows"
      :key="row.week[0]!.date"
      class="mkc-month__week"
      :style="{ '--lanes': row.lanes }"
    >
      <div
        v-for="cell in row.week"
        :key="cell.date"
        class="mkc-day"
        :class="{
          'is-out': !cell.inMonth,
          'is-today': cell.date === today,
          'is-past': cell.date < today,
          'is-selected': phone && cell.date === selectedDay,
          'is-drop': overDay === cell.date,
          'can-create': canCreate && !phone,
        }"
        :data-day="cell.date"
        @click="onCellClick(cell)"
        @dragover="onDragOver($event, cell)"
        @dragleave="overDay === cell.date && (overDay = null)"
        @drop="onDrop($event, cell)"
      >
        <div class="mkc-day__top">
          <button
            v-if="phone"
            type="button"
            class="mkc-day__num"
            :aria-label="cellLabel(cell)"
            :aria-pressed="cell.date === selectedDay"
            @click.stop="emit('select', cell.date)"
          >
            {{ cell.day }}
          </button>
          <span v-else class="mkc-day__num">{{ cell.day }}</span>
          <button
            v-if="canCreate && !phone"
            type="button"
            class="mkc-day__add"
            :aria-label="`Criar card em ${formatLongDay(cell.date)}`"
            @click.stop="emit('create', cell.date)"
          >
            <Plus :size="13" aria-hidden="true" />
          </button>
        </div>

        <div v-if="!phone" class="mkc-day__items">
          <a
            v-for="p in visibleItems(cell.date)"
            :key="p.item.id"
            :href="hrefOf(p.item)"
            class="mkc-chip"
            :class="{
              'is-late': p.item.flag === 'late',
              'is-fixed': !canDrag(p.item),
              'is-dragging': dragging?.id === p.item.id,
            }"
            :style="toneStyle(p.item.tone)"
            :draggable="canDrag(p.item) ? 'true' : 'false'"
            :data-item="p.item.id"
            :aria-label="itemLabel(p)"
            :title="itemLabel(p)"
            @click.stop="onOpen($event, p.item)"
            @dragstart="onDragStart($event, p.item)"
            @dragend="onDragEnd"
          >
            <span class="mk-dot mkc-chip__brand" :style="toneStyle(brandToneOf(p.item.companyId))" aria-hidden="true" />
            <span v-if="p.time" class="mkc-chip__time">{{ p.time }}</span>
            <span class="mkc-chip__title">{{ p.item.title }}</span>
            <AlertCircle v-if="p.item.flag === 'late'" :size="12" class="mkc-chip__late" aria-hidden="true" />
          </a>
          <button
            v-if="dayItems(cell.date).length > MAX_CHIPS"
            type="button"
            class="mkc-more"
            :aria-expanded="expanded === cell.date"
            @click.stop="expanded = expanded === cell.date ? null : cell.date"
          >
            {{ expanded === cell.date ? 'Mostrar menos' : `+${dayItems(cell.date).length - MAX_CHIPS}` }}
          </button>
        </div>

        <div v-else class="mkc-day__dots" aria-hidden="true">
          <i v-for="p in dayItems(cell.date).slice(0, 3)" :key="p.item.id" :style="toneStyle(p.item.tone)" />
        </div>
      </div>

      <a
        v-for="seg in row.segments"
        :key="`${seg.placed.item.id}-${seg.col}`"
        :href="hrefOf(seg.placed.item)"
        class="mkc-band"
        :class="{ 'is-cont-before': seg.continuesBefore, 'is-cont-after': seg.continuesAfter }"
        :style="{ '--col': seg.col, '--span': seg.span, '--lane': seg.lane, ...toneStyle(seg.placed.item.tone) }"
        draggable="false"
        :data-item="seg.placed.item.id"
        :data-band-col="seg.col"
        :data-band-span="seg.span"
        :title="`${seg.placed.item.kindLabel ? seg.placed.item.kindLabel + ': ' : ''}${seg.placed.item.title}`"
        :aria-label="`${seg.placed.item.kindLabel ?? 'Item'} ${seg.placed.item.title}, de ${formatLongDay(seg.placed.day)} a ${formatLongDay(seg.placed.endDay)}`"
        :tabindex="phone ? -1 : 0"
        @click.stop="onOpen($event, seg.placed.item)"
      >
        <span v-if="seg.placed.item.kindLabel" class="mkc-band__kind">{{ seg.placed.item.kindLabel }}</span>
        <span class="mkc-band__title">{{ seg.placed.item.title }}</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.mkc-month {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.mkc-month__wd {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.mkc-month__wd span {
  padding: 6px 8px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
}

.mkc-month__week {
  --lane-h: 22px;
  --top-h: 26px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}

.mkc-month__week:last-child {
  border-bottom: 0;
}

.mkc-day {
  position: relative;
  min-width: 0;
  min-height: calc(112px + var(--lanes) * var(--lane-h));
  padding: 3px 4px 6px;
  border-right: 1px solid var(--border);
}

.mkc-day:last-child {
  border-right: 0;
}

.mkc-day.can-create {
  cursor: cell;
}

.mkc-day.can-create:hover {
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
}

.mkc-day.is-out {
  background: var(--surface-2);
}

.mkc-day.is-drop {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 2px var(--accent);
}

.mkc-day__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--top-h);
}

.mkc-day__num {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 5px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.mkc-day.is-out .mkc-day__num {
  color: var(--text-4);
}

.mkc-day.is-today .mkc-day__num {
  background: var(--accent);
  color: var(--accent-fg);
}

.mkc-day__add {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  opacity: 0;
  cursor: pointer;
}

.mkc-day:hover .mkc-day__add,
.mkc-day__add:focus-visible {
  opacity: 1;
}

.mkc-day__add:hover {
  background: var(--surface-3);
  color: var(--text);
}

.mkc-day__add:focus-visible,
.mkc-chip:focus-visible,
.mkc-band:focus-visible,
.mkc-more:focus-visible,
.mkc-day__num:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mkc-day__items {
  display: grid;
  gap: 2px;
  margin-top: calc(var(--lanes) * var(--lane-h));
}

.mkc-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  min-height: 21px;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--mk-tone) 13%, transparent);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  text-decoration: none;
  cursor: grab;
}

.mkc-chip:hover {
  background: color-mix(in srgb, var(--mk-tone) 24%, transparent);
}

.mkc-chip.is-fixed {
  cursor: pointer;
}

.mkc-chip.is-dragging {
  opacity: 0.45;
}

.mkc-chip__brand {
  width: 7px;
  height: 7px;
}

.mkc-chip__time {
  flex: none;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.mkc-chip__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkc-chip.is-late .mkc-chip__title {
  color: var(--due-late);
}

.mkc-chip__late {
  flex: none;
  color: var(--due-late);
}

.mkc-more {
  justify-self: start;
  padding: 0 5px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.mkc-more:hover {
  color: var(--accent-ink);
}

.mkc-band {
  position: absolute;
  top: calc(var(--top-h) + 3px + var(--lane) * var(--lane-h));
  left: calc(var(--col) * (100% / 7) + 4px);
  width: calc(var(--span) * (100% / 7) - 8px);
  height: calc(var(--lane-h) - 3px);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--mk-tone) 22%, var(--surface));
  color: var(--text);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
  overflow: hidden;
  cursor: pointer;
}

.mkc-band:hover {
  background: color-mix(in srgb, var(--mk-tone) 30%, var(--surface));
}

.mkc-band.is-cont-before {
  left: calc(var(--col) * (100% / 7));
  width: calc(var(--span) * (100% / 7) - 4px);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.mkc-band.is-cont-after {
  width: calc(var(--span) * (100% / 7) - 4px);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.mkc-band.is-cont-before.is-cont-after {
  width: calc(var(--span) * (100% / 7));
}

.mkc-band__kind {
  flex: none;
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 650;
}

.mkc-band__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkc-day__dots {
  display: none;
}

/* Celular: calendário de pontos */
.mkc-month.is-phone .mkc-month__wd span {
  padding: 6px 0;
  text-align: center;
}

.mkc-month.is-phone .mkc-month__week {
  --lane-h: 0px;
}

.mkc-month.is-phone .mkc-day {
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 2px;
  min-height: 54px;
  padding: 2px 0 8px;
  cursor: pointer;
}

.mkc-month.is-phone .mkc-day.is-selected {
  background: var(--accent-soft);
}

.mkc-month.is-phone .mkc-day__top {
  justify-content: center;
  height: auto;
}

.mkc-month.is-phone .mkc-day__num {
  min-width: 36px;
  height: 36px;
  font-size: 14px;
  cursor: pointer;
}

.mkc-month.is-phone .mkc-day__dots {
  display: flex;
  gap: 3px;
  height: 6px;
}

.mkc-month.is-phone .mkc-day__dots i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--mk-tone);
}

.mkc-month.is-phone .mkc-band {
  top: auto;
  bottom: calc(2px + var(--lane) * 4px);
  height: 3px;
  padding: 0;
  background: var(--mk-tone);
  pointer-events: none;
}

.mkc-month.is-phone .mkc-band span {
  display: none;
}
</style>
