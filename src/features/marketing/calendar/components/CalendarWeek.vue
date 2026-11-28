<script setup lang="ts">
/**
 * Visão Semana (computador): 7 colunas pela hora, de segunda a domingo. Em
 * cima, a faixa "Dia todo" com os itens de vários dias e os sem hora. Card é
 * um instante: ocupa um bloco curto na hora dele. Arrastar para outra coluna
 * muda o DIA e mantém a hora (spec M1-B); clicar num horário vazio cria o card
 * naquela hora.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle } from 'lucide-vue-next'
import { toneStyle } from '../../marketing-labels'
import {
  singlesByDay,
  timedBlocks,
  weekBands,
  type CalendarItemView,
  type PlacedItem,
} from '../calendar-layout'
import { WEEKDAYS_MON, formatLongDay, spMinutes } from '../calendar-time'

const props = defineProps<{
  days: string[]
  placed: PlacedItem[]
  today: string
  canCreate: boolean
  canDrag: (item: CalendarItemView) => boolean
  brandToneOf: (companyId: string | null) => string
  brandNameOf: (companyId: string | null) => string
}>()

const emit = defineEmits<{
  create: [day: string, time: string]
  open: [item: CalendarItemView]
  move: [item: CalendarItemView, day: string]
}>()

const router = useRouter()
const HOUR = 44
const SLOT_MIN = 50
const hours = Array.from({ length: 24 }, (_, h) => h)

const singles = computed(() => singlesByDay(props.placed))
const bands = computed(() => weekBands(props.placed, props.days))
const allDayByDay = computed(() =>
  props.days.map((day) => (singles.value.get(day) ?? []).filter((p) => p.minutes < 0)),
)
const allDayRows = computed(() => Math.max(bands.value.lanes, 0) + Math.max(0, ...allDayByDay.value.map((l) => l.length)))
const blocksByDay = computed(() => props.days.map((day) => timedBlocks(singles.value.get(day) ?? [], SLOT_MIN)))

const nowTop = ref(-1)
function tickNow() {
  nowTop.value = props.days.includes(props.today) ? (spMinutes(new Date()) / 60) * HOUR : -1
}

const scroller = ref<HTMLElement | null>(null)
function scrollToMorning() {
  const first = Math.min(
    ...blocksByDay.value.flat().map((b) => b.start),
    8 * 60,
  )
  if (scroller.value) scroller.value.scrollTop = Math.max(0, (first / 60 - 1) * HOUR)
}
onMounted(() => {
  tickNow()
  void nextTick(scrollToMorning)
})
watch(
  () => props.days[0],
  () => {
    tickNow()
    void nextTick(scrollToMorning)
  },
)

function hrefOf(item: CalendarItemView): string {
  return router.resolve(item.to).href
}

function label(p: PlacedItem): string {
  const parts = [p.time ?? 'dia todo', p.item.title]
  if (p.item.kindLabel) parts.push(p.item.kindLabel)
  if (p.item.statusLabel) parts.push(p.item.statusLabel)
  const brand = props.brandNameOf(p.item.companyId)
  if (brand) parts.push(brand)
  if (p.item.flag === 'late') parts.push('prazo vencido')
  return parts.join(', ')
}

function onOpen(event: MouseEvent, item: CalendarItemView) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
  event.preventDefault()
  emit('open', item)
}

function onColumnClick(event: MouseEvent, day: string) {
  if (!props.canCreate) return
  const col = event.currentTarget as HTMLElement
  const y = event.clientY - col.getBoundingClientRect().top
  const hour = Math.min(23, Math.max(0, Math.floor(y / HOUR)))
  emit('create', day, `${String(hour).padStart(2, '0')}:00`)
}

// ── Arrastar ────────────────────────────────────────────────────────────
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
function onDragOver(event: DragEvent, day: string) {
  if (!dragging.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  overDay.value = day
}
function onDrop(event: DragEvent, day: string) {
  const item = dragging.value
  onDragEnd()
  if (!item) return
  event.preventDefault()
  emit('move', item, day)
}
</script>

<template>
  <section class="mkc-wk" aria-label="Calendário da semana">
    <div class="mkc-wk__head">
      <span class="mkc-wk__gutter" aria-hidden="true" />
      <div
        v-for="(day, i) in days"
        :key="day"
        class="mkc-wk__dh"
        :class="{ 'is-today': day === today }"
        :aria-label="formatLongDay(day)"
      >
        <span>{{ WEEKDAYS_MON[i] }}</span>
        <strong>{{ Number(day.slice(8, 10)) }}</strong>
      </div>
    </div>

    <div v-if="allDayRows" class="mkc-wk__allday" :style="{ '--lanes': bands.lanes }">
      <span class="mkc-wk__gutter mkc-wk__gutter--label">Dia todo</span>
      <div class="mkc-wk__allday-grid">
        <div
          v-for="(day, i) in days"
          :key="day"
          class="mkc-wk__allday-cell"
          :class="{ 'is-drop': overDay === day }"
          @dragover="onDragOver($event, day)"
          @drop="onDrop($event, day)"
        >
          <a
            v-for="p in allDayByDay[i]"
            :key="p.item.id"
            :href="hrefOf(p.item)"
            class="mkc-wk__pill"
            :style="toneStyle(p.item.tone)"
            :draggable="canDrag(p.item) ? 'true' : 'false'"
            :data-item="p.item.id"
            :aria-label="label(p)"
            @click.stop="onOpen($event, p.item)"
            @dragstart="onDragStart($event, p.item)"
            @dragend="onDragEnd"
          >
            {{ p.item.title }}
          </a>
        </div>
        <a
          v-for="seg in bands.segments"
          :key="`${seg.placed.item.id}-${seg.col}`"
          :href="hrefOf(seg.placed.item)"
          class="mkc-wk__band"
          :class="{ 'is-cont-before': seg.continuesBefore, 'is-cont-after': seg.continuesAfter }"
          :style="{ '--col': seg.col, '--span': seg.span, '--lane': seg.lane, ...toneStyle(seg.placed.item.tone) }"
          draggable="false"
          :data-item="seg.placed.item.id"
          :aria-label="`${seg.placed.item.kindLabel ?? 'Item'} ${seg.placed.item.title}, de ${formatLongDay(seg.placed.day)} a ${formatLongDay(seg.placed.endDay)}`"
          @click.stop="onOpen($event, seg.placed.item)"
        >
          <span v-if="seg.placed.item.kindLabel" class="mkc-wk__band-kind">{{ seg.placed.item.kindLabel }}</span>
          <span class="mkc-wk__band-title">{{ seg.placed.item.title }}</span>
        </a>
      </div>
    </div>

    <div ref="scroller" class="mkc-wk__scroll">
      <div class="mkc-wk__body" :style="{ height: `${24 * HOUR}px` }">
        <div class="mkc-wk__hours" aria-hidden="true">
          <span v-for="h in hours" :key="h" :style="{ top: `${h * HOUR}px` }">{{ String(h).padStart(2, '0') }}:00</span>
        </div>
        <div
          v-for="(day, i) in days"
          :key="day"
          class="mkc-wk__col"
          :class="{ 'is-today': day === today, 'is-drop': overDay === day, 'can-create': canCreate }"
          :data-day="day"
          @click="onColumnClick($event, day)"
          @dragover="onDragOver($event, day)"
          @dragleave="overDay === day && (overDay = null)"
          @drop="onDrop($event, day)"
        >
          <a
            v-for="b in blocksByDay[i]"
            :key="b.placed.item.id"
            :href="hrefOf(b.placed.item)"
            class="mkc-blk"
            :class="{ 'is-late': b.placed.item.flag === 'late', 'is-fixed': !canDrag(b.placed.item), 'is-dragging': dragging?.id === b.placed.item.id }"
            :style="{
              top: `${(b.start / 60) * HOUR + 1}px`,
              height: `${(SLOT_MIN / 60) * HOUR - 2}px`,
              left: `calc(${(b.col / b.cols) * 100}% + 2px)`,
              width: `calc(${100 / b.cols}% - 4px)`,
              ...toneStyle(b.placed.item.tone),
            }"
            :draggable="canDrag(b.placed.item) ? 'true' : 'false'"
            :data-item="b.placed.item.id"
            :aria-label="label(b.placed)"
            :title="label(b.placed)"
            @click.stop="onOpen($event, b.placed.item)"
            @dragstart="onDragStart($event, b.placed.item)"
            @dragend="onDragEnd"
          >
            <span class="mkc-blk__line">
              <span class="mk-dot mkc-blk__brand" :style="toneStyle(brandToneOf(b.placed.item.companyId))" aria-hidden="true" />
              <span class="mkc-blk__time">{{ b.placed.time }}</span>
              <AlertCircle v-if="b.placed.item.flag === 'late'" :size="11" class="mkc-blk__late" aria-hidden="true" />
            </span>
            <span class="mkc-blk__title">{{ b.placed.item.title }}</span>
          </a>
          <div v-if="day === today && nowTop >= 0" class="mkc-wk__now" :style="{ top: `${nowTop}px` }" aria-hidden="true" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mkc-wk {
  --gutter: 52px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.mkc-wk__head,
.mkc-wk__allday {
  display: grid;
  grid-template-columns: var(--gutter) minmax(0, 1fr);
  border-bottom: 1px solid var(--border);
}

.mkc-wk__head {
  grid-template-columns: var(--gutter) repeat(7, minmax(0, 1fr));
  background: var(--surface-2);
}

.mkc-wk__gutter {
  border-right: 1px solid var(--border);
}

.mkc-wk__gutter--label {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px 6px 0 0;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
}

.mkc-wk__dh {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 8px;
  border-right: 1px solid var(--border);
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
}

.mkc-wk__dh:last-child {
  border-right: 0;
}

.mkc-wk__dh strong {
  color: var(--text);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.mkc-wk__dh.is-today strong {
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 22px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 13px;
}

.mkc-wk__allday-grid {
  --lane-h: 22px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  min-height: calc(var(--lanes) * var(--lane-h) + 8px);
}

.mkc-wk__allday-cell {
  display: grid;
  align-content: start;
  gap: 2px;
  padding: calc(var(--lanes) * var(--lane-h) + 4px) 3px 4px;
  border-right: 1px solid var(--border);
}

.mkc-wk__allday-cell:last-child {
  border-right: 0;
}

.mkc-wk__allday-cell.is-drop {
  background: var(--accent-soft);
}

.mkc-wk__pill {
  overflow: hidden;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--mk-tone) 14%, transparent);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkc-wk__band {
  position: absolute;
  top: calc(4px + var(--lane) * var(--lane-h));
  left: calc(var(--col) * (100% / 7) + 3px);
  width: calc(var(--span) * (100% / 7) - 6px);
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
}

.mkc-wk__band:hover {
  background: color-mix(in srgb, var(--mk-tone) 30%, var(--surface));
}

.mkc-wk__band.is-cont-before {
  left: calc(var(--col) * (100% / 7));
  width: calc(var(--span) * (100% / 7) - 3px);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.mkc-wk__band.is-cont-after {
  width: calc(var(--span) * (100% / 7) - 3px);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.mkc-wk__band.is-cont-before.is-cont-after {
  width: calc(var(--span) * (100% / 7));
}

.mkc-wk__band-kind {
  flex: none;
  color: var(--text-2);
  font-size: 11.5px;
}

.mkc-wk__band-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkc-wk__scroll {
  max-height: min(640px, calc(100vh - 300px));
  min-height: 320px;
  overflow-y: auto;
}

.mkc-wk__body {
  position: relative;
  display: grid;
  grid-template-columns: var(--gutter) repeat(7, minmax(0, 1fr));
  background-image: repeating-linear-gradient(
    to bottom,
    var(--border) 0,
    var(--border) 1px,
    transparent 1px,
    transparent 44px
  );
}

.mkc-wk__hours {
  position: relative;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.mkc-wk__hours span {
  position: absolute;
  right: 6px;
  transform: translateY(3px);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.mkc-wk__col {
  position: relative;
  border-right: 1px solid var(--border);
}

.mkc-wk__col:last-child {
  border-right: 0;
}

.mkc-wk__col.can-create {
  cursor: cell;
}

.mkc-wk__col.is-today {
  background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}

.mkc-wk__col.is-drop {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 2px var(--accent);
}

.mkc-blk {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 2px 6px;
  border: 1px solid color-mix(in srgb, var(--mk-tone) 40%, transparent);
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--mk-tone) 16%, var(--surface));
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  text-decoration: none;
  overflow: hidden;
  cursor: grab;
}

.mkc-blk:hover {
  background: color-mix(in srgb, var(--mk-tone) 26%, var(--surface));
}

.mkc-blk.is-fixed {
  cursor: pointer;
}

.mkc-blk.is-dragging {
  opacity: 0.45;
}

.mkc-blk__line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mkc-blk__brand {
  width: 7px;
  height: 7px;
}

.mkc-blk__time {
  color: var(--text-2);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.mkc-blk__late {
  color: var(--due-late);
}

.mkc-blk__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkc-blk.is-late .mkc-blk__title {
  color: var(--due-late);
}

.mkc-wk__now {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--err);
  pointer-events: none;
}

.mkc-blk:focus-visible,
.mkc-wk__band:focus-visible,
.mkc-wk__pill:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
