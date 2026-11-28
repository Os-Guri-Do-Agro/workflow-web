<script setup lang="ts">
/**
 * Visão Mês do roadmap (spec v2-celular-roadmap-notas, R1 e R3).
 *
 * Um mês por vez. No computador, o calendário mostra o título dos itens dentro
 * do dia (até 3 e "+N") e o painel lateral tem a agenda, o "Em teste agora", o
 * foco, as fotos e os comentários. No celular o calendário encolhe para pontos
 * e tudo desce em uma coluna, com a agenda logo abaixo.
 *
 * As faixas de teste (janela antes de um marco) atravessam os dias da semana
 * por cima dos itens, como um evento de vários dias.
 */
import { computed, ref, watch } from 'vue'
import { ChevronDown, ImagePlus, Plus, Target, X } from 'lucide-vue-next'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'
import PlatformIcon from '@/components/tasks/PlatformIcon.vue'
import { TEST_PLATFORMS } from '@/features/tasks/test-platforms'
import { statusSpec } from '@/features/tasks/task-meta'
import { safeStorage } from '@/utils/safe-storage'
import { todayDateOnly } from '@/utils/date'
import type { RoadmapEntry, RoadmapInTesting } from '@/service/roadmap/roadmap-monthly-service'
import type { RoadmapMilestoneDto } from '@/service/roadmap/roadmap-milestones-service'
import type { RoadmapStore } from '../composables/useRoadmap'
import {
  MONTH_NAMES,
  ROADMAP_CATEGORIES,
  WEEKDAYS_SHORT,
  addDays,
  dateKey,
  daysBetween,
  daysInMonth,
  formatDayMonth,
  formatLongDay,
  formatRange,
  monthGrid,
  parseDate,
  type CalendarCell,
} from '../roadmap-meta'
import {
  buildItems,
  filterKeyOf,
  testBands,
  type ItemFilterKey,
  type RoadmapItem,
  type TestBand,
} from '../roadmap-items'
import RoadmapAgendaList from './RoadmapAgendaList.vue'

const props = defineProps<{
  rm: RoadmapStore
  monthKey: string
}>()

const emit = defineEmits<{
  add: [date: string]
  'open-entry': [entry: RoadmapEntry, monthKey: string]
  'open-milestone': [milestone: RoadmapMilestoneDto]
}>()

const today = todayDateOnly()
const ymd = computed(() => parseDate(`${props.monthKey}-01`))
const month = computed(() => props.rm.monthByKey(props.monthKey))
const weeks = computed(() => monthGrid(ymd.value.year, ymd.value.month0))
const isCurrentMonth = computed(() => props.monthKey === today.slice(0, 7))
const monthName = computed(() => MONTH_NAMES[ymd.value.month0]!)

// ── Filtro da legenda (lembrado no aparelho) ───────────────────────────────
const HIDDEN_KEY = 'roadmap.hidden'
const hidden = ref<Set<ItemFilterKey>>(new Set(readHidden()))
function readHidden(): ItemFilterKey[] {
  try {
    const raw = JSON.parse(safeStorage.getItem(HIDDEN_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}
function toggleFilter(key: ItemFilterKey) {
  const next = new Set(hidden.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  hidden.value = next
  safeStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]))
}
function showAll() {
  hidden.value = new Set()
  safeStorage.removeItem(HIDDEN_KEY)
}

// ── Itens ────────────────────────────────────────────────────────────────
const allItems = computed(() => buildItems(props.rm.months.value, props.rm.milestones.value))
const visibleItems = computed(() => allItems.value.filter((item) => !hidden.value.has(filterKeyOf(item))))
const bands = computed<TestBand[]>(() => (hidden.value.has('test') ? [] : testBands(props.rm.milestones.value)))

const itemsByDate = computed(() => {
  const map = new Map<string, RoadmapItem[]>()
  for (const item of visibleItems.value) {
    const list = map.get(item.date)
    if (list) list.push(item)
    else map.set(item.date, [item])
  }
  return map
})

const monthItems = computed(() => visibleItems.value.filter((i) => i.date.startsWith(props.monthKey)))
const monthFirst = computed(() => `${props.monthKey}-01`)
const monthLast = computed(() => dateKey(ymd.value.year, ymd.value.month0, daysInMonth(ymd.value.year, ymd.value.month0)))
function bandInMonth(band: TestBand): boolean {
  return band.start <= monthLast.value && band.end >= monthFirst.value
}

/** Contagens da legenda: sobre o mês inteiro, com ou sem filtro. */
const legend = computed(() => {
  const inMonth = allItems.value.filter((i) => i.date.startsWith(props.monthKey))
  const count = (key: ItemFilterKey) => inMonth.filter((i) => filterKeyOf(i) === key).length
  const chips: { key: ItemFilterKey; label: string; tone: string; count: number }[] = [
    { key: 'milestones', label: 'Marcos', tone: 'var(--accent)', count: count('milestones') },
    { key: 'tasks', label: 'Tarefas', tone: 'var(--task-status-prog)', count: count('tasks') },
    ...ROADMAP_CATEGORIES.filter((c) => c.value !== 'milestone').map((c) => ({
      key: c.value as ItemFilterKey,
      label: c.label,
      tone: c.tone,
      count: count(c.value),
    })),
  ]
  // Teste conta também a janela de teste que cruza o mês.
  const testChip = chips.find((c) => c.key === 'test')
  if (testChip) testChip.count += testBands(props.rm.milestones.value).filter(bandInMonth).length
  return chips.filter((c) => c.count > 0 || hidden.value.has(c.key))
})

const deliveries = computed(() => month.value?.deliveries ?? [])
const doneCount = computed(() => deliveries.value.filter((d) => d.status === 'DONE').length)
const lateCount = computed(() => deliveries.value.filter((d) => d.overdue).length)
const entriesCount = computed(() => month.value?.entries.length ?? 0)
const progressPct = computed(() => (deliveries.value.length ? Math.round((doneCount.value / deliveries.value.length) * 100) : 0))

// ── Calendário ─────────────────────────────────────────────────────────────
const MAX_CHIPS = 3

function dayItems(date: string): RoadmapItem[] {
  return itemsByDate.value.get(date) ?? []
}

interface BandSegment {
  band: TestBand
  col: number
  span: number
  lane: number
  /** Rótulo só onde a faixa começa (ou no início da semana, quando continua). */
  label: string
  continues: boolean
}

function weekSegments(week: CalendarCell[]): BandSegment[] {
  const first = week[0]!.date
  const last = week[6]!.date
  const segs: BandSegment[] = []
  const laneEnds: number[] = []
  for (const band of bands.value) {
    if (band.end < first || band.start > last) continue
    const col = Math.max(0, daysBetween(first, band.start))
    const end = Math.min(6, daysBetween(first, band.end))
    let lane = laneEnds.findIndex((e) => e < col)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else laneEnds[lane] = end
    segs.push({
      band,
      col,
      span: end - col + 1,
      lane,
      label: `Teste · ${band.title}`,
      continues: band.start < first,
    })
  }
  return segs
}

const weekRows = computed(() =>
  weeks.value.map((week) => {
    const segments = weekSegments(week)
    const lanes = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0)
    return { week, segments, lanes }
  }),
)

function chipTone(item: RoadmapItem): string {
  if (item.kind === 'entry') return item.cat.tone
  if (item.kind === 'milestone') return item.milestone.type === 'REVIEW' ? 'var(--info)' : 'var(--accent)'
  return item.delivery.overdue ? 'var(--due-late)' : statusSpec(item.delivery.status).token
}

function cellLabel(cell: CalendarCell): string {
  const items = dayItems(cell.date)
  const inBand = bands.value.filter((b) => b.start <= cell.date && b.end >= cell.date)
  const parts = [formatLongDay(cell.date)]
  if (cell.date === today) parts.push('hoje')
  if (items.length) parts.push(`${items.length} ${items.length === 1 ? 'item' : 'itens'}`)
  if (inBand.length) parts.push(`em teste: ${inBand.map((b) => b.title).join(', ')}`)
  return parts.join(', ')
}

// ── Dia escolhido ────────────────────────────────────────────────────────
const selectedDay = ref<string | null>(null)
watch(
  () => props.monthKey,
  () => {
    selectedDay.value = null
    editingMain.value = false
  },
)
function selectDay(date: string) {
  selectedDay.value = selectedDay.value === date ? null : date
}
const selectedItems = computed(() => (selectedDay.value ? dayItems(selectedDay.value) : []))
const selectedBands = computed(() =>
  selectedDay.value ? bands.value.filter((b) => b.start <= selectedDay.value! && b.end >= selectedDay.value!) : [],
)

// ── Agenda do painel ─────────────────────────────────────────────────────
/** No mês corrente: os próximos 14 dias (cruza o mês). Nos outros: o mês inteiro. */
const agendaItems = computed(() => {
  if (isCurrentMonth.value) {
    const end = addDays(today, 13)
    return visibleItems.value.filter((i) => i.date >= today && i.date <= end)
  }
  return monthItems.value
})
const agendaTitle = computed(() => (isCurrentMonth.value ? 'Próximos 14 dias' : `Agenda de ${monthName.value.toLowerCase()}`))
const activeBands = computed(() =>
  isCurrentMonth.value
    ? bands.value.filter((b) => b.end >= today && b.start <= addDays(today, 13))
    : bands.value.filter(bandInMonth),
)

function openItem(item: RoadmapItem) {
  if (item.kind === 'entry') emit('open-entry', item.entry, item.monthKey)
  else if (item.kind === 'milestone') emit('open-milestone', item.milestone)
  else props.rm.openTask(item.delivery)
}

// ── Em teste agora ───────────────────────────────────────────────────────
const testing = computed(() => props.rm.inTesting.value)
function checked(task: RoadmapInTesting, platform: string): boolean {
  return (task.testChecks ?? []).some((c) => c.platform === platform)
}
function checkedCount(task: RoadmapInTesting): number {
  return TEST_PLATFORMS.filter((p) => checked(task, p.value)).length
}

// ── Objetivo do mês ─────────────────────────────────────────────────────
const editingMain = ref(false)
const mainDraft = ref('')
function startMain() {
  if (!props.rm.canEdit.value) return
  mainDraft.value = month.value?.main ?? ''
  editingMain.value = true
}
async function saveMain() {
  if (!editingMain.value) return
  editingMain.value = false
  const next = mainDraft.value.trim()
  if (next === (month.value?.main ?? '').trim()) return
  await props.rm.updateMain(props.monthKey, next)
}

// ── Foco, fotos e comentários ───────────────────────────────────────────
const focusDraft = ref('')
async function addFocus() {
  const text = focusDraft.value.trim()
  if (!text) return
  if (await props.rm.addFocus(props.monthKey, text)) focusDraft.value = ''
}
function onPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length) void props.rm.uploadPhotos(props.monthKey, files)
}
const showComments = ref(false)
</script>

<template>
  <div class="rmv">
    <!-- Objetivo e resumo do mês -->
    <header class="rmv-head">
      <div class="rmv-goal">
        <textarea
          v-if="editingMain"
          v-model="mainDraft"
          class="rmv-goal-input"
          rows="2"
          maxlength="400"
          aria-label="Objetivo do mês"
          placeholder="Qual é o objetivo do mês?"
          autofocus
          @blur="saveMain"
          @keydown.enter.exact.prevent="saveMain"
          @keydown.esc.prevent="editingMain = false"
        />
        <button
          v-else
          type="button"
          class="rmv-goal-text"
          :class="{ 'rmv-goal-text--empty': !month?.main, 'rmv-goal-text--ro': !rm.canEdit.value }"
          :disabled="!rm.canEdit.value"
          :aria-label="month?.main ? `Objetivo do mês: ${month.main}. Editar` : 'Escrever o objetivo do mês'"
          @click="startMain"
        >
          <Target :size="15" aria-hidden="true" />
          <span>{{ month?.main || (rm.canEdit.value ? 'Escreva o objetivo do mês' : 'Sem objetivo escrito') }}</span>
        </button>
      </div>
      <p class="rmv-summary">
        <span>{{ entriesCount }} {{ entriesCount === 1 ? 'item' : 'itens' }} na agenda</span>
        <span v-if="deliveries.length" class="rmv-progress">
          <span class="rmv-bar" role="progressbar" :aria-valuenow="progressPct" aria-valuemin="0" aria-valuemax="100" :aria-label="`${doneCount} de ${deliveries.length} tarefas concluídas`">
            <i :style="{ width: `${progressPct}%` }" />
          </span>
          {{ doneCount }} de {{ deliveries.length }} tarefas concluídas
        </span>
        <strong v-if="lateCount" class="rmv-late">{{ lateCount }} {{ lateCount === 1 ? 'atrasada' : 'atrasadas' }}</strong>
      </p>
      <div v-if="legend.length" class="rmv-legend" role="group" aria-label="Mostrar ou esconder tipos no calendário">
        <button
          v-for="chip in legend"
          :key="chip.key"
          type="button"
          class="rmv-chip"
          :class="{ 'rmv-chip--off': hidden.has(chip.key) }"
          :style="{ '--tone': chip.tone }"
          :aria-pressed="!hidden.has(chip.key)"
          @click="toggleFilter(chip.key)"
        >
          <i aria-hidden="true" />
          {{ chip.label }}
          <span>{{ chip.count }}</span>
        </button>
        <button v-if="hidden.size" type="button" class="rmv-chip-reset" @click="showAll">Mostrar tudo</button>
      </div>
    </header>

    <!-- Calendário -->
    <section class="rmv-cal" :aria-label="`Calendário de ${monthName}`">
      <div class="rmv-weekdays" aria-hidden="true">
        <span v-for="d in WEEKDAYS_SHORT" :key="d">{{ d }}</span>
      </div>
      <div
        v-for="row in weekRows"
        :key="row.week[0]!.date"
        class="rmv-week"
        :style="{ '--lanes': row.lanes }"
      >
        <div
          v-for="cell in row.week"
          :key="cell.date"
          class="rmv-day"
          :class="{
            'rmv-day--out': !cell.inMonth,
            'rmv-day--today': cell.date === today,
            'rmv-day--selected': cell.date === selectedDay,
            'rmv-day--past': cell.date < today,
          }"
          @click="selectDay(cell.date)"
        >
          <div class="rmv-day-top">
            <button
              type="button"
              class="rmv-daynum"
              :aria-label="cellLabel(cell)"
              :aria-pressed="cell.date === selectedDay"
              @click.stop="selectDay(cell.date)"
            >
              {{ cell.day }}
            </button>
            <button
              v-if="rm.canEdit.value && cell.inMonth"
              type="button"
              class="rmv-day-add"
              :aria-label="`Adicionar em ${formatLongDay(cell.date)}`"
              @click.stop="emit('add', cell.date)"
            >
              <Plus :size="13" />
            </button>
          </div>
          <div class="rmv-chips">
            <button
              v-for="item in dayItems(cell.date).slice(0, MAX_CHIPS)"
              :key="item.key"
              type="button"
              class="rmv-item"
              :class="{
                'rmv-item--task': item.kind === 'delivery',
                'rmv-item--done': item.kind === 'delivery' && item.delivery.status === 'DONE',
                'rmv-item--late': item.kind === 'delivery' && item.delivery.overdue,
                'rmv-item--milestone': item.kind === 'milestone',
              }"
              :style="{ '--tone': chipTone(item) }"
              :title="item.title"
              @click.stop="openItem(item)"
            >
              <i aria-hidden="true" />
              <span>{{ item.title }}</span>
            </button>
            <button
              v-if="dayItems(cell.date).length > MAX_CHIPS"
              type="button"
              class="rmv-more"
              @click.stop="selectedDay = cell.date"
            >
              +{{ dayItems(cell.date).length - MAX_CHIPS }}
            </button>
          </div>
          <!-- Celular: só pontos -->
          <div class="rmv-dots" aria-hidden="true">
            <i v-for="item in dayItems(cell.date).slice(0, 3)" :key="item.key" :style="{ background: chipTone(item) }" />
          </div>
        </div>
        <button
          v-for="seg in row.segments"
          :key="`${seg.band.id}-${seg.col}`"
          type="button"
          class="rmv-band"
          :class="{ 'rmv-band--cont': seg.continues }"
          :style="{ '--col': seg.col, '--span': seg.span, '--lane': seg.lane }"
          :title="`${seg.label} (${formatRange(seg.band.start, seg.band.end)})`"
          :aria-label="`Janela de teste de ${seg.band.title}, ${formatRange(seg.band.start, seg.band.end)}`"
          @click.stop="emit('open-milestone', seg.band.milestone)"
        >
          <span>{{ seg.label }}</span>
        </button>
      </div>
    </section>

    <!-- Painel: dia, agenda, em teste, foco, fotos, comentários -->
    <aside class="rmv-rail">
      <section v-if="selectedDay" class="rmv-panel rmv-panel--day" aria-live="polite">
        <header class="rmv-panel-head">
          <h3>{{ formatLongDay(selectedDay) }}</h3>
          <button type="button" class="rmv-icon-btn" aria-label="Fechar o dia" @click="selectedDay = null">
            <X :size="15" />
          </button>
        </header>
        <p v-for="band in selectedBands" :key="band.id" class="rmv-band-line">
          Em teste: <strong>{{ band.title }}</strong> ({{ formatRange(band.start, band.end) }})
        </p>
        <RoadmapAgendaList :items="selectedItems" :today="today" hide-headings empty-text="Nada marcado neste dia." @open="openItem" />
        <button v-if="rm.canEdit.value" type="button" class="rmv-add-day" @click="emit('add', selectedDay)">
          <Plus :size="14" aria-hidden="true" />
          Adicionar neste dia
        </button>
      </section>

      <section class="rmv-panel">
        <header class="rmv-panel-head">
          <h3>{{ agendaTitle }}</h3>
          <small>{{ agendaItems.length }}</small>
        </header>
        <p v-for="band in activeBands" :key="band.id" class="rmv-band-line">
          Teste de <strong>{{ band.title }}</strong>: {{ formatRange(band.start, band.end) }}
        </p>
        <RoadmapAgendaList
          :items="agendaItems"
          :today="today"
          :empty-text="isCurrentMonth ? 'Nada marcado nos próximos 14 dias.' : 'Nada marcado neste mês.'"
          @open="openItem"
        />
      </section>

      <section v-if="rm.inTestingAvailable.value" class="rmv-panel">
        <header class="rmv-panel-head">
          <h3>Em teste agora</h3>
          <small>{{ testing.length }}</small>
        </header>
        <p v-if="!testing.length" class="rmv-muted">Nenhuma tarefa em Em teste.</p>
        <ul v-else class="rmv-testing">
          <li v-for="task in testing" :key="task.activityId">
            <button type="button" class="rmv-testing-title" @click="rm.openTask(task)">
              <strong>{{ task.title }}</strong>
              <small :class="{ 'rmv-late': task.overdue }">
                {{ task.date ? `prazo ${formatDayMonth(task.date)}` : 'sem prazo' }}{{ task.overdue ? ' · atrasada' : '' }}
              </small>
            </button>
            <span
              v-if="task.testChecks"
              class="rmv-platforms"
              :aria-label="`${checkedCount(task)} de 3 plataformas testadas`"
              role="img"
            >
              <span
                v-for="p in TEST_PLATFORMS"
                :key="p.value"
                class="rmv-platform"
                :class="{ 'rmv-platform--on': checked(task, p.value) }"
                :title="`${p.label}: ${checked(task, p.value) ? 'testado' : 'falta testar'}`"
              >
                <PlatformIcon :path="p.icon" :size="13" />
              </span>
            </span>
          </li>
        </ul>
      </section>

      <section class="rmv-panel">
        <header class="rmv-panel-head">
          <h3>Foco do mês</h3>
          <small>{{ month?.focusItems.length ?? 0 }}</small>
        </header>
        <ul v-if="month?.focusItems.length" class="rmv-focus">
          <li v-for="focus in month.focusItems" :key="focus.id">
            <span>{{ focus.text }}</span>
            <button
              v-if="rm.canEdit.value"
              type="button"
              class="rmv-icon-btn rmv-icon-btn--sm"
              :aria-label="`Remover o foco ${focus.text}`"
              @click="rm.removeFocus(monthKey, focus.id)"
            >
              <X :size="13" />
            </button>
          </li>
        </ul>
        <p v-else class="rmv-muted">Sem foco definido.</p>
        <form v-if="rm.canEdit.value" class="rmv-focus-add" @submit.prevent="addFocus">
          <input v-model="focusDraft" type="text" maxlength="300" placeholder="Novo foco" aria-label="Novo foco do mês" />
          <button type="submit" class="rmv-icon-btn" :disabled="!focusDraft.trim()" aria-label="Adicionar foco">
            <Plus :size="15" />
          </button>
        </form>
      </section>

      <section v-if="month?.photos.length || rm.canEdit.value" class="rmv-panel">
        <header class="rmv-panel-head">
          <h3>Imagens</h3>
          <label v-if="rm.canEdit.value" class="rmv-upload">
            <ImagePlus :size="14" aria-hidden="true" />
            Adicionar
            <input type="file" accept="image/*" multiple @change="onPhotos" />
          </label>
        </header>
        <div v-if="month?.photos.length" class="rmv-photos">
          <figure v-for="photo in month.photos" :key="photo.id">
            <a :href="photo.url" target="_blank" rel="noopener" :aria-label="`Abrir ${photo.fileName}`">
              <img :src="photo.url" :alt="photo.fileName" loading="lazy" />
            </a>
            <button
              v-if="rm.canEdit.value"
              type="button"
              class="rmv-photo-x"
              :aria-label="`Remover ${photo.fileName}`"
              @click="rm.removePhoto(monthKey, photo.id)"
            >
              <X :size="12" />
            </button>
          </figure>
        </div>
        <p v-else class="rmv-muted">Prints, referências, a foto do quadro da reunião.</p>
      </section>

      <section class="rmv-panel">
        <button type="button" class="rmv-panel-toggle" :aria-expanded="showComments" @click="showComments = !showComments">
          <h3>Comentários do mês</h3>
          <ChevronDown :size="15" :class="{ 'rmv-rot': showComments }" aria-hidden="true" />
        </button>
        <template v-if="showComments">
          <CommentsPanel v-if="month?.id" entity-type="ROADMAP_MONTH" :entity-id="month.id" title="Comentários do mês" compact />
          <p v-else class="rmv-muted">Os comentários abrem quando o mês tiver algum conteúdo.</p>
        </template>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.rmv {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  grid-template-areas:
    'head rail'
    'cal rail';
  grid-template-rows: auto 1fr;
  gap: 14px 18px;
  align-items: start;
}
.rmv-head {
  grid-area: head;
  display: grid;
  gap: 8px;
  min-width: 0;
}
.rmv-cal {
  grid-area: cal;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
}
.rmv-rail {
  grid-area: rail;
  display: grid;
  gap: 10px;
  min-width: 0;
  position: sticky;
  top: 0;
}

/* Objetivo */
.rmv-goal-text {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  margin: 0 -8px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  text-align: left;
  cursor: text;
}
.rmv-goal-text svg {
  flex: none;
  margin-top: 3px;
  color: var(--accent-ink);
}
.rmv-goal-text:hover:not(:disabled) {
  border-color: var(--border);
  background: var(--surface);
}
.rmv-goal-text--empty {
  color: var(--text-3);
  font-weight: 500;
}
.rmv-goal-text--ro {
  cursor: default;
}
.rmv-goal-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  resize: vertical;
}
.rmv-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}
.rmv-progress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rmv-bar {
  display: inline-block;
  width: 72px;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}
.rmv-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--task-status-done);
}
.rmv-late {
  color: var(--due-late);
  font-weight: 650;
}
.rmv-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rmv-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.rmv-chip i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tone);
}
.rmv-chip span {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.rmv-chip:hover {
  border-color: var(--border-strong);
}
.rmv-chip--off {
  color: var(--text-4);
  border-style: dashed;
  background: transparent;
}
.rmv-chip--off i {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--tone);
}
.rmv-chip-reset {
  border: 0;
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

/* Calendário */
.rmv-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.rmv-weekdays span {
  padding: 7px 8px;
  font-size: 11px;
  font-weight: 650;
  color: var(--text-3);
}
.rmv-week {
  --lane-h: 20px;
  --top-h: 28px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}
.rmv-week:last-child {
  border-bottom: 0;
}
.rmv-day {
  position: relative;
  min-width: 0;
  min-height: calc(108px + var(--lanes) * var(--lane-h));
  padding: 4px 5px 6px;
  border-right: 1px solid var(--border);
  cursor: pointer;
}
.rmv-day:last-child {
  border-right: 0;
}
.rmv-day:hover {
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
}
.rmv-day--out {
  background: var(--surface-2);
}
.rmv-day--out .rmv-daynum {
  color: var(--text-4);
}
.rmv-day--selected {
  background: var(--accent-soft);
}
.rmv-day--selected:hover {
  background: var(--accent-soft);
}
.rmv-day-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--top-h);
}
.rmv-daynum {
  min-width: 26px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.rmv-day--today .rmv-daynum {
  background: var(--accent);
  color: var(--accent-fg);
}
.rmv-day-add {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  opacity: 0;
  cursor: pointer;
}
.rmv-day:hover .rmv-day-add,
.rmv-day-add:focus-visible {
  opacity: 1;
}
.rmv-day-add:hover {
  background: var(--surface-3);
  color: var(--text);
}
.rmv-chips {
  display: grid;
  gap: 2px;
  margin-top: calc(var(--lanes) * var(--lane-h));
}
.rmv-item {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  min-height: 20px;
  padding: 1px 5px;
  border: 0;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--tone) 12%, transparent);
  color: var(--text);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.rmv-item i {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tone);
}
.rmv-item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rmv-item:hover {
  background: color-mix(in srgb, var(--tone) 22%, transparent);
}
.rmv-item--task {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--border);
}
.rmv-item--task i {
  border-radius: 2px;
}
.rmv-item--task:hover {
  background: var(--surface-2);
}
.rmv-item--done span {
  color: var(--text-3);
  text-decoration: line-through;
}
.rmv-item--late {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--due-late) 45%, transparent);
}
.rmv-item--late span {
  color: var(--due-late);
}
.rmv-item--milestone {
  background: color-mix(in srgb, var(--tone) 16%, transparent);
  font-weight: 700;
}
.rmv-item--milestone i {
  border-radius: 1px;
  transform: rotate(45deg);
}
.rmv-more {
  justify-self: start;
  padding: 0 5px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 11.5px;
  font-weight: 650;
  cursor: pointer;
}
.rmv-more:hover {
  color: var(--accent-ink);
}
.rmv-dots {
  display: none;
}
.rmv-band {
  position: absolute;
  top: calc(var(--top-h) + 4px + var(--lane) * var(--lane-h));
  left: calc(var(--col) * (100% / 7) + 4px);
  width: calc(var(--span) * (100% / 7) - 8px);
  height: calc(var(--lane-h) - 3px);
  display: flex;
  align-items: center;
  padding: 0 7px;
  border: 0;
  border-radius: var(--radius-xs);
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--task-status-test) 20%, var(--surface)),
    color-mix(in srgb, var(--task-status-test) 20%, var(--surface)) 6px,
    color-mix(in srgb, var(--task-status-test) 12%, var(--surface)) 6px,
    color-mix(in srgb, var(--task-status-test) 12%, var(--surface)) 12px
  );
  color: var(--text);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  overflow: hidden;
}
.rmv-band span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rmv-band--cont {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  left: calc(var(--col) * (100% / 7));
  width: calc(var(--span) * (100% / 7) - 4px);
}
.rmv-band:hover {
  box-shadow: inset 0 0 0 1px var(--task-status-test);
}

/* Painel */
.rmv-panel {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  min-width: 0;
}
.rmv-panel--day {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.rmv-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
}
.rmv-panel-head h3,
.rmv-panel-toggle h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.rmv-panel-head small {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.rmv-panel-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  cursor: pointer;
}
.rmv-rot {
  transform: rotate(180deg);
}
.rmv-muted {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
}
.rmv-band-line {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--task-status-test) 10%, var(--surface));
  color: var(--text-2);
  font-size: 12.5px;
}
.rmv-band-line strong {
  color: var(--text);
}
.rmv-icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
}
.rmv-icon-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}
.rmv-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rmv-icon-btn--sm {
  width: 24px;
  height: 24px;
  border-color: transparent;
}
.rmv-add-day {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.rmv-add-day:hover {
  background: var(--accent-soft);
}
.rmv-testing {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rmv-testing li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rmv-testing-title {
  display: grid;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 40px;
  padding: 4px 8px;
  margin-left: -8px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rmv-testing-title:hover {
  background: var(--surface-2);
}
.rmv-testing-title strong {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rmv-testing-title small {
  font-size: 12px;
  color: var(--text-3);
}
.rmv-platforms {
  display: inline-flex;
  gap: 3px;
  flex: none;
}
.rmv-platform {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-4);
}
.rmv-platform--on {
  border-color: var(--test-check-on-border);
  background: var(--test-check-on-bg);
  color: var(--test-check-on);
}
.rmv-focus {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rmv-focus li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 0 3px 14px;
  position: relative;
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
}
.rmv-focus li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 10px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}
.rmv-focus li .rmv-icon-btn {
  opacity: 0;
}
.rmv-focus li:hover .rmv-icon-btn,
.rmv-focus li .rmv-icon-btn:focus-visible {
  opacity: 1;
}
.rmv-focus-add {
  display: flex;
  gap: 6px;
}
.rmv-focus-add input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.rmv-focus-add input:focus {
  outline: none;
  border-color: var(--accent);
}
.rmv-upload {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent-ink);
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.rmv-upload input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.rmv-photos {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.rmv-photos figure {
  position: relative;
  margin: 0;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-2);
}
.rmv-photos img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.rmv-photo-x {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: var(--scrim);
  color: var(--surface);
  cursor: pointer;
}

/* Tela média: o painel desce para baixo do calendário, em duas colunas. */
@media (max-width: 1180px) {
  .rmv {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'head'
      'cal'
      'rail';
  }
  .rmv-rail {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
  .rmv-panel--day {
    grid-column: 1 / -1;
  }
}

/* Celular: calendário de pontos, uma coluna. */
@media (max-width: 640px) {
  .rmv {
    gap: 12px;
  }
  .rmv-rail {
    grid-template-columns: minmax(0, 1fr);
  }
  .rmv-legend {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin: 0 -12px;
    padding: 0 12px 2px;
    scrollbar-width: none;
  }
  .rmv-chip {
    flex: none;
    min-height: 32px;
  }
  .rmv-weekdays span {
    padding: 6px 0;
    text-align: center;
  }
  .rmv-week {
    --lane-h: 0px;
  }
  .rmv-day {
    min-height: 52px;
    padding: 3px 0 5px;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 3px;
  }
  .rmv-day-top {
    justify-content: center;
    height: auto;
  }
  .rmv-daynum {
    min-width: 32px;
    height: 32px;
    font-size: 14px;
  }
  .rmv-day-add,
  .rmv-chips {
    display: none;
  }
  .rmv-dots {
    display: flex;
    gap: 3px;
    height: 6px;
  }
  .rmv-dots i {
    width: 6px;
    height: 6px;
    border-radius: 999px;
  }
  .rmv-band {
    top: auto;
    bottom: calc(1px + var(--lane) * 4px);
    height: 3px;
    padding: 0;
    background: var(--task-status-test);
    pointer-events: none;
  }
  .rmv-band span {
    display: none;
  }
}
</style>
