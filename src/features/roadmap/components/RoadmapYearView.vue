<script setup lang="ts">
/**
 * Visão Ano do roadmap (spec v2-celular-roadmap-notas, R2 e R3).
 *
 * Linha do tempo com os meses no eixo e três faixas: o objetivo de cada mês,
 * os marcos (com a janela de teste antes) e as entregas (tarefas com prazo),
 * empilhadas sem colisão de rótulo. Q1 a Q4 dão zoom. As "lanes por trimestre"
 * antigas saíram: cada linha só tinha conteúdo no próprio trimestre.
 *
 * No celular a linha do tempo vira uma lista por mês, aberta no mês atual.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarCheck, Flag, Plus } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import { ACTIVITY_STATUSES, statusSpec } from '@/features/tasks/task-meta'
import { todayDateOnly } from '@/utils/date'
import type { RoadmapDelivery } from '@/service/roadmap/roadmap-monthly-service'
import type { RoadmapMilestoneDto } from '@/service/roadmap/roadmap-milestones-service'
import type { RoadmapStore } from '../composables/useRoadmap'
import {
  MONTH_NAMES,
  MONTH_SHORT,
  addDays,
  dateKey,
  daysBetween,
  daysInMonth,
  formatDayMonth,
  formatRange,
  labelWidth,
  monthKeyOf,
  packRows,
  weekdayOf,
} from '../roadmap-meta'
import { testBands, type TestBand } from '../roadmap-items'

const props = defineProps<{ rm: RoadmapStore }>()
const emit = defineEmits<{
  'open-milestone': [milestone: RoadmapMilestoneDto]
  'open-month': [monthKey: string]
  'add-milestone': []
}>()

const today = todayDateOnly()
const year = computed(() => props.rm.year.value)
type Zoom = 'year' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
const ZOOMS: Zoom[] = ['year', 'Q1', 'Q2', 'Q3', 'Q4']
const currentQuarter = computed<Zoom>(() => `Q${Math.floor(new Date().getMonth() / 3) + 1}` as Zoom)
// Abre no trimestre atual: no ano inteiro os rótulos ficam espremidos e o
// que importa agora está perto de hoje. "Ano" fica a um clique.
const zoom = ref<Zoom>(props.rm.year.value === new Date().getFullYear() ? currentQuarter.value : 'year')

// ── Filtros (só nas entregas; marco sempre aparece) ─────────────────────────
const person = ref('all')
const status = ref('all')
const onlyLate = ref(false)

const allDeliveries = computed<RoadmapDelivery[]>(() => props.rm.months.value.flatMap((m) => m.deliveries ?? []))
const personItems = computed(() => {
  const seen = new Map<string, string>()
  for (const d of allDeliveries.value) for (const r of d.responsibles) seen.set(r.id, r.name)
  return [
    { label: 'Todas as pessoas', value: 'all' },
    { label: 'Sem responsável', value: 'none' },
    ...[...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([value, label]) => ({ label, value })),
  ]
})
const statusItems = [{ label: 'Todos os status', value: 'all' }, ...ACTIVITY_STATUSES.map((s) => ({ label: s.label, value: s.value }))]
const filtering = computed(() => person.value !== 'all' || status.value !== 'all' || onlyLate.value)
function clearFilters() {
  person.value = 'all'
  status.value = 'all'
  onlyLate.value = false
}

const deliveries = computed(() =>
  allDeliveries.value.filter((d) => {
    if (onlyLate.value && !d.overdue) return false
    if (status.value !== 'all' && d.status !== status.value) return false
    if (person.value === 'none') return d.responsibles.length === 0
    if (person.value !== 'all') return d.responsibles.some((r) => r.id === person.value)
    return true
  }),
)

const milestones = computed(() => props.rm.milestones.value.filter((m) => m.date.startsWith(String(year.value)) || (m.testStart ?? '').startsWith(String(year.value))))
const bands = computed(() => testBands(milestones.value))
const bandOf = computed(() => new Map(bands.value.map((b) => [b.id, b])))

// ── Faixa de datas e escala ────────────────────────────────────────────────
const range = computed(() => {
  const y = year.value
  if (zoom.value === 'year') return { start: dateKey(y, 0, 1), end: dateKey(y, 11, 31) }
  const q = Number(zoom.value.slice(1)) - 1
  return { start: dateKey(y, q * 3, 1), end: dateKey(y, q * 3 + 2, daysInMonth(y, q * 3 + 2)) }
})
const totalDays = computed(() => daysBetween(range.value.start, range.value.end) + 1)
const track = ref<HTMLElement | null>(null)
const trackW = ref(900)
let ro: ResizeObserver | null = null

function x(date: string): number {
  return (daysBetween(range.value.start, date) / totalDays.value) * trackW.value
}
/** Centro do dia, para pino e ponto ficarem no meio da data. */
function xc(date: string): number {
  return x(date) + trackW.value / totalDays.value / 2
}
function inRange(date: string): boolean {
  return date >= range.value.start && date <= range.value.end
}

const monthCols = computed(() => {
  const cols: { key: string; label: string; short: string; left: number; width: number; done: number; total: number; late: number; main: string }[] = []
  const y = year.value
  for (let m = 0; m < 12; m++) {
    const first = dateKey(y, m, 1)
    if (!inRange(first)) continue
    const last = dateKey(y, m, daysInMonth(y, m))
    const key = monthKeyOf(y, m)
    const ds = (props.rm.monthByKey(key)?.deliveries ?? [])
    cols.push({
      key,
      label: MONTH_NAMES[m]!,
      short: MONTH_SHORT[m]!,
      left: x(first),
      width: x(last) - x(first) + trackW.value / totalDays.value,
      done: ds.filter((d) => d.status === 'DONE').length,
      total: ds.length,
      late: ds.filter((d) => d.overdue).length,
      main: props.rm.monthByKey(key)?.main ?? '',
    })
  }
  return cols
})

/** Linhas finas nas segundas, só no zoom do trimestre. */
const weekLines = computed(() => {
  if (zoom.value === 'year') return []
  const lines: number[] = []
  let d = range.value.start
  const offset = (8 - weekdayOf(d)) % 7
  d = addDays(d, offset)
  while (d <= range.value.end) {
    lines.push(x(d))
    d = addDays(d, 7)
  }
  return lines
})

const todayX = computed(() => (inRange(today) ? xc(today) : null))

// ── Marcos (com janela de teste) ───────────────────────────────────────────
const PIN_ROW = 30
interface PinLayout {
  m: RoadmapMilestoneDto
  band: TestBand | null
  pinX: number
  bandLeft: number
  bandWidth: number
  row: number
  flip: boolean
  labelMax: number
}
const pinLayout = computed(() => {
  const visible = milestones.value.filter((m) => {
    const band = bandOf.value.get(m.id)
    return inRange(m.date) || (band && band.end >= range.value.start && band.start <= range.value.end)
  })
  const flipOf = (m: RoadmapMilestoneDto) => {
    const w = labelWidth(`${m.title} 00/00`, 12)
    // Sem janela de teste, o rótulo pode ir para a esquerda do pino quando não
    // cabe à direita (com janela, ele cobriria a faixa).
    return !bandOf.value.get(m.id) && xc(m.date) + 12 + w > trackW.value && xc(m.date) - 12 - w > 0
  }
  const inputs = visible.map((m) => {
    const band = bandOf.value.get(m.id) ?? null
    const pinX = xc(m.date)
    const w = labelWidth(`${m.title} 00/00`, 12)
    if (flipOf(m)) return { id: m.id, start: pinX - 12 - w, end: pinX + 9 }
    const start = band ? Math.max(0, x(band.start)) : pinX - 8
    return { id: m.id, start, end: pinX + 12 + w }
  })
  const { row, rows } = packRows(inputs, 8)
  const items: PinLayout[] = visible.map((m) => {
    const band = bandOf.value.get(m.id) ?? null
    const pinX = xc(m.date)
    const bandLeft = band ? Math.max(0, x(band.start)) : 0
    const bandRight = band ? Math.min(trackW.value, x(band.end) + trackW.value / totalDays.value) : 0
    return {
      m,
      band,
      pinX,
      bandLeft,
      bandWidth: Math.max(0, bandRight - bandLeft),
      row: row.get(m.id) ?? 0,
      flip: flipOf(m),
      labelMax: flipOf(m) ? Math.max(40, pinX - 14) : Math.max(40, trackW.value - pinX - 14),
    }
  })
  return { items, rows: Math.max(rows, 1) }
})

// ── Entregas ───────────────────────────────────────────────────────────────
const DOT_ROW = 24
const MAX_ROWS = 9
const deliveryLayout = computed(() => {
  const visible = deliveries.value.filter((d) => inRange(d.date))
  const widthOf = (d: RoadmapDelivery) => labelWidth(d.title, 11.5, 14)
  const flipOf = (d: RoadmapDelivery) => xc(d.date) + 8 + widthOf(d) > trackW.value && xc(d.date) - 8 - widthOf(d) > 0
  const inputs = visible.map((d) =>
    flipOf(d)
      ? { id: d.activityId, start: xc(d.date) - 8 - widthOf(d), end: xc(d.date) + 6 }
      : { id: d.activityId, start: xc(d.date) - 6, end: xc(d.date) + 8 + widthOf(d) },
  )
  const { row, rows } = packRows(inputs, 6)
  const aggregated = zoom.value === 'year' && rows > MAX_ROWS
  return {
    visible,
    aggregated,
    rows: aggregated ? 1 : Math.max(rows, 1),
    items: visible.map((d) => ({
      d,
      x: xc(d.date),
      row: row.get(d.activityId) ?? 0,
      flip: flipOf(d),
      labelMax: flipOf(d) ? Math.max(40, xc(d.date) - 12) : Math.max(40, trackW.value - xc(d.date) - 12),
    })),
  }
})
const undatedLabel = computed(() => {
  const n = props.rm.totals.value.undated
  if (!n) return ''
  return narrow.value ? `${n} sem prazo` : `${n} sem prazo ficam fora da linha`
})

function zoomTo(key: string) {
  const m = Number(key.slice(5, 7)) - 1
  zoom.value = `Q${Math.floor(m / 3) + 1}` as Zoom
}

function deliveryAria(d: RoadmapDelivery): string {
  const parts = [d.title, formatDayMonth(d.date), statusSpec(d.status).label]
  if (d.overdue) parts.push('atrasada')
  return `Abrir a tarefa ${parts.join(', ')}`
}

// ── Celular: lista por mês ─────────────────────────────────────────────────
const narrow = ref(false)
let mq: MediaQueryList | null = null
const onMq = () => (narrow.value = Boolean(mq?.matches))
const showPast = ref(false)
const listHost = ref<HTMLElement | null>(null)

type ListRow =
  | { kind: 'milestone'; key: string; date: string; m: RoadmapMilestoneDto; band: TestBand | null }
  | { kind: 'delivery'; key: string; date: string; d: RoadmapDelivery }

const monthList = computed(() => {
  const y = year.value
  const nowKey = today.slice(0, 7)
  const out: { key: string; label: string; main: string; done: number; total: number; rows: ListRow[]; past: boolean }[] = []
  for (let m = 0; m < 12; m++) {
    const key = monthKeyOf(y, m)
    const ds = deliveries.value.filter((d) => d.date.startsWith(key))
    const all = props.rm.monthByKey(key)?.deliveries ?? []
    const rows: ListRow[] = [
      ...milestones.value.filter((ms) => ms.date.startsWith(key)).map((ms) => ({ kind: 'milestone' as const, key: `m:${ms.id}`, date: ms.date, m: ms, band: bandOf.value.get(ms.id) ?? null })),
      ...ds.map((d) => ({ kind: 'delivery' as const, key: `d:${d.activityId}`, date: d.date, d })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'milestone' ? -1 : 1))
    const main = props.rm.monthByKey(key)?.main ?? ''
    if (!rows.length && !main && key !== nowKey) continue
    out.push({ key, label: MONTH_NAMES[m]!, main, done: all.filter((d) => d.status === 'DONE').length, total: all.length, rows, past: key < nowKey })
  }
  return out
})
const visibleMonthList = computed(() => (showPast.value ? monthList.value : monthList.value.filter((m) => !m.past)))
const hiddenPast = computed(() => monthList.value.filter((m) => m.past).length)

onMounted(() => {
  mq = window.matchMedia('(max-width: 640px)')
  onMq()
  mq.addEventListener('change', onMq)
  if (track.value) {
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) trackW.value = w
    })
    ro.observe(track.value)
  }
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMq)
  ro?.disconnect()
})
watch(
  () => track.value,
  (el) => {
    if (!el) return
    ro?.disconnect()
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) trackW.value = w
    })
    ro.observe(el)
  },
)
</script>

<template>
  <div class="ryv">
    <div class="ryv-tools">
      <div v-if="!narrow" class="ryv-zoom" role="group" aria-label="Período">
        <button
          v-for="z in ZOOMS"
          :key="z"
          type="button"
          class="ryv-zoom-btn"
          :class="{ 'ryv-zoom-btn--on': zoom === z }"
          :aria-pressed="zoom === z"
          @click="zoom = z"
        >
          {{ z === 'year' ? 'Ano' : z }}
          <i v-if="z === currentQuarter && year === new Date().getFullYear()" class="ryv-now-dot" aria-label="trimestre atual" />
        </button>
      </div>
      <div class="ryv-filter">
        <AppSelect v-model="person" :items="personItems" label="Filtrar por pessoa" density="compact" />
      </div>
      <div class="ryv-filter">
        <AppSelect v-model="status" :items="statusItems" label="Filtrar por status" density="compact" />
      </div>
      <button type="button" class="ryv-toggle" :class="{ 'ryv-toggle--on': onlyLate }" :aria-pressed="onlyLate" @click="onlyLate = !onlyLate">
        Só atrasadas
      </button>
      <button v-if="filtering" type="button" class="ryv-link" @click="clearFilters">Limpar</button>
      <span class="ryv-spacer" />
      <button v-if="rm.canEdit.value" type="button" class="ryv-add" @click="emit('add-milestone')">
        <Plus :size="14" aria-hidden="true" />
        Novo marco
      </button>
    </div>
    <p class="ryv-summary">
      {{ rm.totals.value.scheduled }} com prazo · {{ rm.totals.value.completed }} concluídas
      <strong v-if="rm.totals.value.overdue" class="ryv-late">· {{ rm.totals.value.overdue }} atrasadas</strong>
      <span v-if="undatedLabel"> · {{ undatedLabel }}</span>
      <span v-if="rm.milestonesUnavailable.value" class="ryv-late"> · marcos indisponíveis agora</span>
    </p>

    <!-- Computador: linha do tempo -->
    <div v-if="!narrow" class="ryv-board">
      <div class="ryv-row ryv-row--head">
        <div class="ryv-label" />
        <div ref="track" class="ryv-track ryv-track--head">
          <button
            v-for="col in monthCols"
            :key="col.key"
            type="button"
            class="ryv-month"
            :class="{ 'ryv-month--now': col.key === today.slice(0, 7) }"
            :style="{ left: `${col.left}px`, width: `${col.width}px` }"
            :title="`Abrir ${col.label} na visão Mês`"
            @click="emit('open-month', col.key)"
          >
            <strong>{{ zoom === 'year' ? col.short : col.label }}</strong>
            <span v-if="col.total" class="ryv-month-prog">
              <i :style="{ width: `${Math.round((col.done / col.total) * 100)}%` }" />
            </span>
            <small v-if="col.total">{{ col.done }}/{{ col.total }}</small>
          </button>
          <span v-if="todayX !== null" class="ryv-today-flag" :style="{ left: `${todayX}px` }" title="Hoje" aria-label="Hoje" role="img" />
        </div>
      </div>

      <div class="ryv-row">
        <div class="ryv-label">Objetivos</div>
        <div class="ryv-track ryv-track--goals">
          <button
            v-for="col in monthCols"
            :key="col.key"
            type="button"
            class="ryv-goal"
            :class="{ 'ryv-goal--empty': !col.main }"
            :style="{ left: `${col.left}px`, width: `${Math.max(0, col.width - 6)}px` }"
            :title="col.main || `Sem objetivo em ${col.label}`"
            @click="emit('open-month', col.key)"
          >
            {{ col.main }}
          </button>
        </div>
      </div>

      <div class="ryv-row">
        <div class="ryv-label">
          Marcos e testes
          <small>{{ pinLayout.items.length }}</small>
        </div>
        <div class="ryv-track" :style="{ height: `${pinLayout.rows * PIN_ROW + 12}px` }">
          <template v-for="p in pinLayout.items" :key="p.m.id">
            <span
              v-if="p.band && p.bandWidth > 0"
              class="ryv-band"
              :style="{ left: `${p.bandLeft}px`, width: `${p.bandWidth}px`, top: `${p.row * PIN_ROW + 8}px` }"
              :title="`Teste de ${p.m.title}: ${formatRange(p.band.start, p.band.end)}`"
              aria-hidden="true"
            >
              <span v-if="p.bandWidth >= 44">Teste</span>
            </span>
            <button
              type="button"
              class="ryv-pin"
              :class="{ 'ryv-pin--review': p.m.type === 'REVIEW', 'ryv-pin--past': p.m.date < today, 'ryv-pin--flip': p.flip }"
              :style="{ left: `${p.pinX}px`, top: `${p.row * PIN_ROW + 6}px` }"
              :aria-label="`${p.m.type === 'REVIEW' ? 'Review' : 'Marco'} ${p.m.title}, ${formatDayMonth(p.m.date)}${p.band ? `, teste de ${formatRange(p.band.start, p.band.end)}` : ''}`"
              @click="emit('open-milestone', p.m)"
            >
              <span class="ryv-pin-mark" aria-hidden="true">
                <CalendarCheck v-if="p.m.type === 'REVIEW'" :size="11" />
                <Flag v-else :size="11" />
              </span>
              <span class="ryv-pin-label" :style="{ maxWidth: `${p.labelMax}px` }">
                {{ p.m.title }}
                <small>{{ formatDayMonth(p.m.date) }}</small>
              </span>
            </button>
          </template>
          <p v-if="!pinLayout.items.length" class="ryv-empty">Nenhum marco neste período.</p>
        </div>
      </div>

      <div class="ryv-row">
        <div class="ryv-label">
          Entregas
          <small>{{ deliveryLayout.visible.length }}</small>
        </div>
        <div class="ryv-track" :style="{ height: `${deliveryLayout.rows * DOT_ROW + 14}px` }">
          <template v-if="deliveryLayout.aggregated">
            <button
              v-for="col in monthCols.filter((c) => deliveryLayout.visible.some((d) => d.date.startsWith(c.key)))"
              :key="col.key"
              type="button"
              class="ryv-agg"
              :style="{ left: `${col.left + 4}px`, width: `${col.width - 8}px` }"
              @click="zoomTo(col.key)"
            >
              {{ deliveryLayout.visible.filter((d) => d.date.startsWith(col.key)).length }} entregas
            </button>
          </template>
          <template v-else>
            <button
              v-for="it in deliveryLayout.items"
              :key="it.d.activityId"
              type="button"
              class="ryv-dot"
              :class="{ 'ryv-dot--late': it.d.overdue, 'ryv-dot--done': it.d.status === 'DONE', 'ryv-dot--flip': it.flip }"
              :style="{ left: `${it.x - 5}px`, top: `${it.row * DOT_ROW + 7}px`, '--tone': statusSpec(it.d.status).token }"
              :title="`${it.d.title} · ${formatDayMonth(it.d.date)} · ${statusSpec(it.d.status).label}`"
              :aria-label="deliveryAria(it.d)"
              @click="rm.openTask(it.d)"
            >
              <i aria-hidden="true" />
              <span :style="{ maxWidth: `${it.labelMax}px` }">{{ it.d.title }}</span>
            </button>
          </template>
          <p v-if="!deliveryLayout.visible.length" class="ryv-empty">
            {{ filtering ? 'Nenhuma entrega com esse filtro neste período.' : 'Nenhuma tarefa com prazo neste período.' }}
          </p>
        </div>
      </div>

      <!-- Grade e hoje por cima das faixas -->
      <div class="ryv-overlay" aria-hidden="true">
        <span v-for="col in monthCols" :key="`g-${col.key}`" class="ryv-grid-line" :style="{ left: `${col.left}px` }" />
        <span v-for="(wx, i) in weekLines" :key="`w-${i}`" class="ryv-grid-line ryv-grid-line--week" :style="{ left: `${wx}px` }" />
        <span v-if="todayX !== null" class="ryv-today" :style="{ left: `${todayX}px` }" />
      </div>
    </div>

    <!-- Celular: lista por mês -->
    <div v-else ref="listHost" class="ryv-list">
      <button v-if="hiddenPast && !showPast" type="button" class="ryv-past" @click="showPast = true">
        Mostrar {{ hiddenPast }} {{ hiddenPast === 1 ? 'mês anterior' : 'meses anteriores' }}
      </button>
      <section
        v-for="m in visibleMonthList"
        :key="m.key"
        class="ryv-lmonth"
        :data-current="m.key === today.slice(0, 7)"
      >
        <button type="button" class="ryv-lhead" @click="emit('open-month', m.key)">
          <strong :class="{ 'ryv-lnow': m.key === today.slice(0, 7) }">{{ m.label }}</strong>
          <span v-if="m.total" class="ryv-lprog">
            <span class="ryv-month-prog"><i :style="{ width: `${Math.round((m.done / m.total) * 100)}%` }" /></span>
            {{ m.done }}/{{ m.total }}
          </span>
        </button>
        <p v-if="m.main" class="ryv-lgoal">{{ m.main }}</p>
        <ul class="ryv-lrows">
          <li v-for="row in m.rows" :key="row.key">
            <button
              v-if="row.kind === 'milestone'"
              type="button"
              class="ryv-lrow"
              @click="emit('open-milestone', row.m)"
            >
              <span class="ryv-ldate">{{ formatDayMonth(row.date) }}</span>
              <span class="ryv-lmark ryv-lmark--pin" aria-hidden="true">
                <CalendarCheck v-if="row.m.type === 'REVIEW'" :size="13" />
                <Flag v-else :size="13" />
              </span>
              <span class="ryv-ltext">
                <strong>{{ row.m.title }}</strong>
                <small v-if="row.band">Teste de {{ formatRange(row.band.start, row.band.end) }}</small>
              </span>
            </button>
            <button v-else type="button" class="ryv-lrow" :aria-label="deliveryAria(row.d)" @click="rm.openTask(row.d)">
              <span class="ryv-ldate">{{ formatDayMonth(row.date) }}</span>
              <span class="ryv-lmark" aria-hidden="true">
                <component :is="statusSpec(row.d.status).icon" :size="14" />
              </span>
              <span class="ryv-ltext">
                <strong :class="{ 'ryv-ldone': row.d.status === 'DONE' }">{{ row.d.title }}</strong>
                <small :class="{ 'ryv-late': row.d.overdue }">
                  {{ statusSpec(row.d.status).label }}{{ row.d.overdue ? ' · atrasada' : '' }}
                </small>
              </span>
            </button>
          </li>
          <li v-if="!m.rows.length" class="ryv-lempty">Nada com data neste mês.</li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ryv {
  display: grid;
  gap: 10px;
  min-width: 0;
}
.ryv-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ryv-zoom {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
.ryv-zoom-btn {
  position: relative;
  min-width: 44px;
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.ryv-zoom-btn--on {
  background: var(--surface);
  color: var(--accent-ink);
  box-shadow: var(--shadow-sm);
}
.ryv-now-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}
.ryv-filter {
  width: 190px;
}
.ryv-toggle {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.ryv-toggle--on {
  border-color: color-mix(in srgb, var(--due-late) 45%, var(--border));
  background: color-mix(in srgb, var(--due-late) 10%, var(--surface));
  color: var(--due-late);
}
.ryv-link {
  border: 0;
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.ryv-spacer {
  flex: 1 1 auto;
}
.ryv-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.ryv-add:hover {
  border-color: var(--border-strong);
}
.ryv-summary {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}
.ryv-late {
  color: var(--due-late);
}

/* Linha do tempo */
.ryv-board {
  --label-w: 132px;
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
}
.ryv-row {
  display: grid;
  grid-template-columns: var(--label-w) minmax(0, 1fr);
  border-bottom: 1px solid var(--border);
}
.ryv-row:last-of-type {
  border-bottom: 0;
}
.ryv-row--head {
  background: var(--surface-2);
}
.ryv-label {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-right: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}
.ryv-label small {
  color: var(--text-3);
  font-weight: 650;
}
.ryv-track {
  position: relative;
  min-width: 0;
  min-height: 44px;
  overflow: hidden;
}
.ryv-track--head {
  height: 46px;
  overflow: visible;
}
.ryv-track--goals {
  height: 64px;
}
.ryv-month {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}
.ryv-month strong {
  font-size: 12.5px;
  font-weight: 700;
  text-transform: capitalize;
}
.ryv-month small {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.ryv-month:hover {
  background: var(--surface-3);
}
.ryv-month--now strong {
  color: var(--accent-ink);
}
.ryv-month-prog {
  display: block;
  width: min(56px, 100%);
  height: 4px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}
.ryv-month-prog i {
  display: block;
  height: 100%;
  background: var(--task-status-done);
}
.ryv-today-flag {
  position: absolute;
  bottom: -5px;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--surface-2);
  z-index: 2;
}
.ryv-goal {
  position: absolute;
  top: 6px;
  bottom: 6px;
  margin: 0 3px;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  cursor: pointer;
  box-sizing: border-box;
}
.ryv-goal:hover {
  background: var(--accent-soft);
}
.ryv-goal--empty {
  background: transparent;
  color: var(--text-4);
  font-weight: 500;
}
.ryv-band {
  position: absolute;
  display: flex;
  align-items: center;
  padding: 0 5px;
  height: 14px;
  color: var(--text-2);
  font-size: 10px;
  font-weight: 700;
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--task-status-test) 28%, var(--surface)),
    color-mix(in srgb, var(--task-status-test) 28%, var(--surface)) 5px,
    color-mix(in srgb, var(--task-status-test) 14%, var(--surface)) 5px,
    color-mix(in srgb, var(--task-status-test) 14%, var(--surface)) 10px
  );
}
.ryv-pin {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  transform: translateX(-9px);
  cursor: pointer;
  z-index: 1;
}
.ryv-pin-mark {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  box-shadow: 0 0 0 2px var(--surface);
}
.ryv-pin--review .ryv-pin-mark {
  background: var(--info);
}
.ryv-pin--past .ryv-pin-mark {
  opacity: 0.6;
}
.ryv-pin-label {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 700;
}
.ryv-pin-label small {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}
.ryv-pin--flip {
  flex-direction: row-reverse;
  transform: translateX(calc(-100% + 9px));
}
.ryv-pin:hover .ryv-pin-label {
  color: var(--accent-ink);
  text-decoration: underline;
}
.ryv-dot {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 18px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.ryv-dot i {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 3px;
  background: var(--tone);
  box-shadow: 0 0 0 2px var(--surface);
}
.ryv-dot span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ryv-dot--flip {
  flex-direction: row-reverse;
  transform: translateX(calc(-100% + 10px));
}
.ryv-dot:hover span {
  color: var(--accent-ink);
  text-decoration: underline;
}
.ryv-dot--late span {
  color: var(--due-late);
}
.ryv-dot--done span {
  color: var(--text-3);
}
.ryv-agg {
  position: absolute;
  top: 7px;
  height: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.ryv-agg:hover {
  color: var(--accent-ink);
  border-color: var(--accent);
}
.ryv-empty {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}
.ryv-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--label-w) + 1px);
  right: 0;
  pointer-events: none;
}
.ryv-grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}
.ryv-grid-line--week {
  top: 46px;
  background: color-mix(in srgb, var(--border) 50%, transparent);
}
.ryv-today {
  position: absolute;
  top: 46px;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--accent);
  opacity: 0.8;
}

/* Celular */
.ryv-list {
  display: grid;
  gap: 10px;
}
.ryv-past {
  justify-self: start;
  min-height: 36px;
  padding: 0 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.ryv-lmonth {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  scroll-margin-top: 12px;
}
.ryv-lhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.ryv-lhead strong {
  font-size: 15px;
  font-weight: 700;
}
.ryv-lnow {
  color: var(--accent-ink);
}
.ryv-lprog {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.ryv-lgoal {
  margin: 0 0 6px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.4;
}
.ryv-lrows {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ryv-lrow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 0;
  border: 0;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ryv-ldate {
  flex: none;
  width: 38px;
  padding-top: 1px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.ryv-lmark {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
}
.ryv-lmark--pin {
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
}
.ryv-ltext {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.ryv-ltext strong {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.ryv-ltext small {
  font-size: 12px;
  color: var(--text-3);
}
.ryv-ldone {
  color: var(--text-3);
  text-decoration: line-through;
}
.ryv-lempty {
  padding: 8px 0 2px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 13px;
}
@media (max-width: 640px) {
  .ryv-tools {
    flex-wrap: nowrap;
    overflow-x: auto;
    margin: 0 -12px;
    padding: 0 12px 2px;
    scrollbar-width: none;
  }
  .ryv-filter {
    flex: none;
    width: 170px;
  }
  .ryv-toggle,
  .ryv-add,
  .ryv-link {
    flex: none;
  }
  .ryv-spacer {
    display: none;
  }
}
</style>
