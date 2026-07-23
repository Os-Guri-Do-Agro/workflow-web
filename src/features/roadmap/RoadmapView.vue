<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  Activity,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  CircleDot,
  FileDown,
  Flag,
  ImagePlus,
  Megaphone,
  Milestone,
  Plus,
  Rocket,
  Sparkles,
  StickyNote,
  Target,
  UsersRound,
  Video,
  X,
  type LucideIcon,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import roadmapMonthlyService, {
  type RoadmapCategory,
  type RoadmapDelivery,
  type RoadmapDeliveryStatus,
  type RoadmapEntry,
  type RoadmapMonth,
  type RoadmapPhoto,
} from '@/service/roadmap/roadmap-monthly-service'
import roadmapMilestonesService, {
  type RoadmapMilestoneType,
} from '@/service/roadmap/roadmap-milestones-service'
import quarterService from '@/service/quarters/quarters-service'
import exportService from '@/service/export/export-service'
import shareService from '@/service/share/share-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { dateOnlyDiffDays, todayDateOnly } from '@/utils/date'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import aiService from '@/service/ai/ai-service'
// Rótulo e cor de status vêm do mesmo lugar que o board e o detalhe da tarefa:
// duplicar aqui deixaria o roadmap divergir quando alguém renomear um status.
import { statusSpec } from '@/features/tasks/task-meta'

const { success, error: showError, info } = useToast()
const workspace = useWorkspaceStore()
const router = useRouter()

type RoadmapStatus = 'done' | 'active' | 'planned' | 'risk'

type RoadmapLane = {
  id: string
  title: string
  description: string
  owner: string
  status: RoadmapStatus
  color: string
  icon: LucideIcon
}

type RoadmapItem = {
  id: string
  laneId: string
  title: string
  shortTitle?: string
  start: string
  end: string
  progress: number
  status: RoadmapStatus
  /** `month` é a barra agregada do mês (contagem), não uma entrega individual. */
  kind: 'activity' | 'event' | 'month'
  dueDate?: string
  overdue?: boolean
  assignees?: string[]
  monthName?: string
  /** Só nas barras de mês: quantas atividades entraram e quantas ficaram sem data. */
  scheduledCount?: number
  undatedCount?: number
}

type RoadmapTotals = {
  activities: number
  completed: number
  scheduled: number
  undated: number
  overdue: number
}

type MilestoneKind = 'milestone' | 'review'

type RoadmapMilestone = {
  id: string
  // laneId é opcional: o contrato novo ancora por `quarterId`/`date`, não por área.
  laneId: string | null
  quarterId: string | null
  title: string
  date: string
  status: RoadmapStatus
  type: MilestoneKind
}

type RoadmapSelection =
  | { type: 'item'; value: RoadmapItem }
  | { type: 'milestone'; value: RoadmapMilestone }

type QuarterFilter = 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
type StatusFilter = 'all' | RoadmapStatus
type RoadmapMode = 'timeline' | 'monthly'
type CalendarCategory = 'milestone' | 'meeting' | 'delivery' | 'recording' | 'note' | 'risk'

type CalendarEntry = {
  id: string
  date: string
  title: string
  description?: string
  category: CalendarCategory
}

/** Entrega real (atividade com data de entrega) projetada no calendário do mês. */
type CalendarDelivery = {
  activityId: string
  monthId: string
  date: string
  title: string
  status: RoadmapDeliveryStatus
  priorityNumber: number
  overdue: boolean
  responsibles: string[]
}

/**
 * Item da agenda do mês. A anotação manual e a entrega convivem na mesma lista
 * ordenada por data, mas nunca viram o mesmo tipo: a origem tem que ficar
 * óbvia para quem lê a tela e para quem lê o código.
 */
type MonthAgendaItem =
  | { kind: 'entry'; key: string; date: string; entry: CalendarEntry }
  | { kind: 'delivery'; key: string; date: string; delivery: CalendarDelivery }

type MonthlyPlan = {
  id: string | null
  key: string
  year: number
  month: number
  title: string
  main: string
  order: number
  persisted: boolean
  bullets: string[]
  entries: CalendarEntry[]
  deliveries: CalendarDelivery[]
}

type CalendarCategoryMeta = {
  label: string
  icon: LucideIcon
  tone: string
}

const roadmapMode = ref<RoadmapMode>('monthly')
const showMonthlyHelp = ref(false)
const isRoadmapPrinting = ref(false)
const roadmapPrompt = ref('')
const roadmapPromptLoading = ref(false)
const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']

const calendarCategoryMeta: Record<CalendarCategory, CalendarCategoryMeta> = {
  milestone: { label: 'Marco', icon: Target, tone: 'var(--accent)' },
  meeting: { label: 'Reuni\u00e3o', icon: Megaphone, tone: 'var(--info)' },
  delivery: { label: 'Entrega', icon: CheckCircle2, tone: 'var(--success)' },
  recording: { label: 'Grava\u00e7\u00e3o', icon: Video, tone: 'var(--status-test)' },
  note: { label: 'Nota', icon: StickyNote, tone: 'var(--warn)' },
  risk: { label: 'Risco', icon: Flag, tone: 'var(--err)' },
}

const roadmapYear = new Date().getFullYear()
const roadmapStart = new Date(roadmapYear, 0, 1, 0, 0, 0)
const roadmapEnd = new Date(roadmapYear, 11, 31, 23, 59, 59)

// R\u00e9gua trimestral derivada do ano corrente (estrutura de eixo, n\u00e3o dados de roadmap).
// Os itens, \u00e1reas e marcos do timeline v\u00eam da API (annualLanes/annualItems/annualMilestones).
const quarters = [
  { label: 'Q1', period: 'Jan - Mar', start: `${roadmapYear}-01-01`, end: `${roadmapYear}-03-31` },
  { label: 'Q2', period: 'Abr - Jun', start: `${roadmapYear}-04-01`, end: `${roadmapYear}-06-30` },
  { label: 'Q3', period: 'Jul - Set', start: `${roadmapYear}-07-01`, end: `${roadmapYear}-09-30` },
  { label: 'Q4', period: 'Out - Dez', start: `${roadmapYear}-10-01`, end: `${roadmapYear}-12-31` },
] as const

const statusMeta: Record<RoadmapStatus, { label: string; icon: LucideIcon }> = {
  done: { label: 'Conclu\u00eddo', icon: CheckCircle2 },
  active: { label: 'Em andamento', icon: Activity },
  planned: { label: 'Planejado', icon: CalendarClock },
  risk: { label: 'Aten\u00e7\u00e3o', icon: Flag },
}

const activeLaneId = ref<string>('all')
const activeStatus = ref<StatusFilter>('all')
const activeQuarter = ref<QuarterFilter>('all')
const onlyOverdue = ref(false)
const selected = ref<RoadmapSelection | null>(null)
const noteDraft = ref('')
const noteMonthKey = ref(`${roadmapYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
const noteDate = ref(todayDateOnly())
const noteCategory = ref<CalendarCategory>('note')
const exportMonthKey = ref<'all' | string>('all')
const selectedMonthDetailsKey = ref<string | null>(null)
const selectedDayKey = ref<string | null>(null)
const annualRoadmapLoading = ref(false)
const annualRoadmapUnavailable = ref(false)
const roadmapMonthlyLoading = ref(false)
const usingRoadmapMonthlyApi = ref(false)
const monthlyLoadError = ref('')
const annualLanes = ref<RoadmapLane[]>([])
/** Entregas reais: uma barra por atividade, posicionada pelo `dueDate`. */
const annualDeliveries = ref<RoadmapItem[]>([])
/** Agregado por mês (contagem de tarefas), mantido como leitura secundária. */
const annualMonthBars = ref<RoadmapItem[]>([])
const annualTotals = ref<RoadmapTotals>({
  activities: 0,
  completed: 0,
  scheduled: 0,
  undated: 0,
  overdue: 0,
})
const annualViewMode = ref<'delivery' | 'month'>('delivery')
const annualMilestones = ref<RoadmapMilestone[]>([])
const milestoneFormOpen = ref(false)
const milestoneSaving = ref(false)
const milestoneDraft = ref<{
  title: string
  date: string
  type: RoadmapMilestoneType
  quarterId: string
}>({ title: '', date: todayDateOnly(), type: 'MILESTONE', quarterId: '' })

const annualItems = computed<RoadmapItem[]>(() =>
  annualViewMode.value === 'month' ? annualMonthBars.value : annualDeliveries.value,
)
const focusDrafts = ref<Record<string, string>>({})
const extraFocusItems = ref<Record<string, string[]>>({})
const focusPhotos = ref<Record<string, string[]>>({})
const focusIds = ref<Record<string, string[]>>({})
const focusPhotoIds = ref<Record<string, string[]>>({})
const showAllMonthlyPlans = ref(false)
const monthEntryPreviewLimit = 8

const monthlyPlans = ref<MonthlyPlan[]>([])
/** Só o primeiro carregamento escolhe o mês por conteúdo; depois respeita o usuário. */
const monthlyFirstLoad = ref(true)

// Sem papel resolvido ainda, a tela não bloqueia: o backend é quem nega.
const canEditRoadmap = computed(() => {
  if (!workspace.activeRole) return true
  return workspace.canEdit
})

const canEditMonthlyRoadmap = canEditRoadmap

const laneFilterItems = computed<{ label: string; value: string }[]>(() => [
  { label: 'Todas as áreas', value: 'all' },
  ...annualLanes.value.map((lane) => ({ label: lane.title, value: lane.id })),
])

const statusFilterItems = computed<{ label: string; value: string }[]>(() => [
  { label: 'Todos', value: 'all' },
  ...(Object.entries(statusMeta) as [RoadmapStatus, { label: string; icon: LucideIcon }][]).map(
    ([status, meta]) => ({ label: meta.label, value: status }),
  ),
])

const noteMonthItems = computed<{ label: string; value: string }[]>(() =>
  visibleMonthlyPlans.value.map((month) => ({ label: month.title, value: month.key })),
)

const exportMonthItems = computed<{ label: string; value: string }[]>(() => [
  { label: 'Todos os meses', value: 'all' },
  ...monthlyPlans.value.map((month) => ({ label: month.title, value: month.key })),
])

onMounted(() => {
  void fetchMonthlyRoadmap()
  void fetchAnnualRoadmap()
})

const viewport = computed(() => {
  if (activeQuarter.value === 'all') {
    return { start: roadmapStart, end: roadmapEnd }
  }
  const quarter = quarters.find((item) => item.label === activeQuarter.value)
  return {
    start: new Date(`${quarter?.start ?? `${roadmapYear}-01-01`}T00:00:00`),
    end: new Date(`${quarter?.end ?? `${roadmapYear}-12-31`}T23:59:59`),
  }
})

const visibleLanes = computed(() => {
  if (activeLaneId.value === 'all') return annualLanes.value
  return annualLanes.value.filter((lane) => lane.id === activeLaneId.value)
})

const visibleQuarters = computed(() => {
  if (activeQuarter.value === 'all') return quarters
  return quarters.filter((quarter) => quarter.label === activeQuarter.value)
})

const selectedLane = computed(() => {
  const laneId = selected.value?.value.laneId
  return annualLanes.value.find((lane) => lane.id === laneId) ?? null
})

const selectedStatus = computed(() => selected.value ? statusMeta[selected.value.value.status] : null)

function toTime(date: string | Date): number {
  return date instanceof Date ? date.getTime() : new Date(`${date}T00:00:00`).getTime()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positionPercent(date: string | Date): number {
  const total = toTime(viewport.value.end) - toTime(viewport.value.start)
  const current = toTime(date) - toTime(viewport.value.start)
  return clamp((current / total) * 100, 0, 100)
}

function itemStyle(item: RoadmapItem) {
  const rawLeft = positionPercent(
    new Date(Math.max(toTime(item.start), toTime(viewport.value.start))),
  )
  const right = positionPercent(new Date(Math.min(toTime(item.end), toTime(viewport.value.end))))
  const width = Math.max(right - rawLeft, 1.4)
  // Entrega de dia único (start === end) no fim do viewport cairia em left ~100%
  // e a barra sairia inteira da célula, que tem `overflow: hidden`.
  const left = Math.min(rawLeft, 100 - width)
  return {
    left: `${left}%`,
    width: `${width}%`,
  }
}

// ─── Empilhamento da timeline (colisão zero) ────────────────────────────────
// Barras e marcos eram posicionados só por data (`left: X%`), numa faixa fixa.
// Dois itens em datas próximas colidiam e o rótulo virava texto ilegível. Aqui
// cada item ganha uma LINHA: quem se sobrepõe horizontalmente (contando a
// largura estimada do rótulo) desce para a próxima linha. A célula cresce para
// caber todas as linhas.
// Duas faixas independentes: marcos (losango alto + rótulo de 2 linhas) em cima,
// entregas (pílula baixa) embaixo. Cada faixa é empacotada por conta própria, e
// separá-las garante que um rótulo de marco nunca encoste numa pílula.
const ANNUAL_MS_ROW_H = 58
const ANNUAL_BAR_ROW_H = 32
const ANNUAL_BAND_TOP = 10
const ANNUAL_BAND_GAP = 6
const ANNUAL_BAR_H = 26
// Estimativa de largura da célula em px para converter texto→%. Não precisa ser
// exata: erra para "mais linhas" (seguro), nunca para sobreposição.
const ANNUAL_CELL_PX = 860
const ANNUAL_CHAR_PX = 6.2

function labelWidthPercent(text: string, padding = 20): number {
  return ((text.length * ANNUAL_CHAR_PX + padding) / ANNUAL_CELL_PX) * 100
}

interface PackEntry {
  key: string
  left: number
  right: number
}

/** Interval packing guloso: menor linha livre, senão abre uma nova. */
function packRows(entries: PackEntry[]): { row: Record<string, number>; count: number } {
  const rowsRight: number[] = []
  const row: Record<string, number> = {}
  const GAP = 0.6
  for (const entry of [...entries].sort((a, b) => a.left - b.left)) {
    let placed = rowsRight.findIndex((right) => entry.left >= right + GAP)
    if (placed === -1) {
      placed = rowsRight.length
      rowsRight.push(entry.right)
    } else {
      rowsRight[placed] = entry.right
    }
    row[entry.key] = placed
  }
  return { row, count: entries.length ? Math.max(rowsRight.length, 1) : 0 }
}

interface LaneLayout {
  bars: { row: Record<string, number>; count: number }
  milestones: { row: Record<string, number>; count: number }
  /** Altura total da célula em px. */
  height: number
  /** Onde a faixa de entregas começa (px). */
  barTop: number
}

function packLane(items: RoadmapItem[], milestones: RoadmapMilestone[]): LaneLayout {
  const barEntries: PackEntry[] = items.map((item) => {
    const style = itemStyle(item)
    const left = parseFloat(style.left)
    const width = parseFloat(style.width)
    const label = item.shortTitle ?? item.title
    return { key: `bar-${item.id}`, left, right: left + Math.max(width, labelWidthPercent(label, 28)) }
  })

  const msEntries: PackEntry[] = milestones.map((milestone) => {
    const center = positionPercent(milestone.date)
    const half = labelWidthPercent(milestone.title, 12) / 2
    return { key: `ms-${milestone.id}`, left: center - half, right: center + half }
  })

  const bars = packRows(barEntries)
  const ms = packRows(msEntries)
  const msBand = ms.count * ANNUAL_MS_ROW_H
  const barBand = bars.count * ANNUAL_BAR_ROW_H
  const barTop = ANNUAL_BAND_TOP + msBand + (msBand && barBand ? ANNUAL_BAND_GAP : 0)
  const height = barTop + barBand + ANNUAL_BAND_TOP

  return { bars, milestones: ms, height: Math.max(height, 96), barTop }
}

const annualLaneLayout = computed(() => {
  const map = new Map<string, LaneLayout>()
  for (const lane of visibleLanes.value) {
    map.set(lane.id, packLane(laneItems(lane.id), laneMilestones(lane.id)))
  }
  return map
})

const floatingLayout = computed(() => packLane([], floatingMilestones.value))

function laneCellStyle(laneId: string) {
  return { minHeight: `${annualLaneLayout.value.get(laneId)?.height ?? 96}px` }
}

const floatingCellStyle = computed(() => ({ minHeight: `${floatingLayout.value.height}px` }))

function laneItemStyle(item: RoadmapItem, laneId: string) {
  const base = itemStyle(item)
  const layout = annualLaneLayout.value.get(laneId)
  const row = layout?.bars.row[`bar-${item.id}`] ?? 0
  const top = `${(layout?.barTop ?? ANNUAL_BAND_TOP) + row * ANNUAL_BAR_ROW_H + (ANNUAL_BAR_ROW_H - ANNUAL_BAR_H) / 2}px`
  // Entrega de dia único (start === end) não estica: a barra viraria uns 12px e
  // o título ficaria cortado em "Ent". A pílula passa a ter a largura do texto,
  // ancorada na data. O packing já reservou essa largura, então não colide.
  if (item.kind !== 'month' && item.start === item.end) {
    return { left: base.left, top, width: 'auto', maxWidth: '190px' }
  }
  return { ...base, top }
}

function laneMilestoneStyle(milestone: RoadmapMilestone, laneId: string) {
  const row = annualLaneLayout.value.get(laneId)?.milestones.row[`ms-${milestone.id}`] ?? 0
  return { left: `${positionPercent(milestone.date)}%`, top: `${ANNUAL_BAND_TOP + row * ANNUAL_MS_ROW_H}px` }
}

function floatingMilestoneStyle(milestone: RoadmapMilestone) {
  const row = floatingLayout.value.milestones.row[`ms-${milestone.id}`] ?? 0
  return { left: `${positionPercent(milestone.date)}%`, top: `${ANNUAL_BAND_TOP + row * ANNUAL_MS_ROW_H}px` }
}

/** Entrega de dia único: pílula do tamanho do conteúdo, não da barra de 1 dia. */
function isPointItem(item: RoadmapItem): boolean {
  return item.kind !== 'month' && item.start === item.end
}

function laneItems(laneId: string): RoadmapItem[] {
  return annualItems.value
    .filter(
      (item) =>
        item.laneId === laneId &&
        (activeStatus.value === 'all' || item.status === activeStatus.value) &&
        // Barra de mês é agregado e não tem noção de atraso: o filtro não se aplica.
        (!onlyOverdue.value || annualViewMode.value === 'month' || item.overdue === true) &&
        overlapsDate(item.start, item.end),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
}

const todayKey = todayDateOnly()

const todayInViewport = computed(
  () =>
    toTime(todayKey) >= toTime(viewport.value.start) && toTime(todayKey) <= toTime(viewport.value.end),
)

const todayStyle = computed(() => ({ left: `${positionPercent(todayKey)}%` }))

const overdueItems = computed(() => annualDeliveries.value.filter((item) => item.overdue))

const hasTimelineContent = computed(
  () => annualItems.value.length > 0 || annualMilestones.value.length > 0,
)

/** Rótulo honesto de prazo: só existe quando a atividade tem `dueDate`. */
function dueLabel(item: RoadmapItem): string {
  if (!item.dueDate) return 'Sem data de entrega'
  const diff = dateOnlyDiffDays(`${item.dueDate}T12:00:00.000Z`)
  if (item.status === 'done') return `Entregue em ${formatDate(item.dueDate)}`
  if (diff === 0) return 'Entrega hoje'
  if (diff === 1) return 'Entrega amanhã'
  if (diff < 0) return `Atrasada ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'dia' : 'dias'}`
  return `Faltam ${diff} dias`
}

function milestonePassesFilters(milestone: RoadmapMilestone): boolean {
  return (
    (activeStatus.value === 'all' || milestone.status === activeStatus.value) &&
    overlapsDate(milestone.date, milestone.date)
  )
}

/** Marco/review ancorado a esta lane via `quarterId` (shape quarters) ou `laneId` (shape lanes). */
function milestoneAnchoredToLane(milestone: RoadmapMilestone, laneId: string): boolean {
  return milestone.quarterId === laneId || milestone.laneId === laneId
}

function laneMilestones(laneId: string): RoadmapMilestone[] {
  return annualMilestones.value.filter(
    (milestone) => milestoneAnchoredToLane(milestone, laneId) && milestonePassesFilters(milestone),
  )
}

/**
 * Marcos/reviews sem âncora de área (sem `quarterId` nem `laneId` válido). O contrato novo
 * permite `quarterId` opcional. Renderizados numa faixa própria sobre o eixo, posicionados por data.
 */
const floatingMilestones = computed<RoadmapMilestone[]>(() => {
  const laneIds = new Set(annualLanes.value.map((lane) => lane.id))
  return annualMilestones.value.filter((milestone) => {
    if (!milestonePassesFilters(milestone)) return false
    const anchored =
      (milestone.quarterId != null && laneIds.has(milestone.quarterId)) ||
      (milestone.laneId != null && laneIds.has(milestone.laneId))
    return !anchored
  })
})

const hasFloatingMilestones = computed(() => floatingMilestones.value.length > 0)

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function overlapsDate(start: string, end: string): boolean {
  return toTime(end) >= toTime(viewport.value.start) && toTime(start) <= toTime(viewport.value.end)
}

function selectItem(item: RoadmapItem) {
  selected.value = { type: 'item', value: item }
}

function selectMilestone(milestone: RoadmapMilestone) {
  selected.value = { type: 'milestone', value: milestone }
}

function isSelected(type: RoadmapSelection['type'], id: string): boolean {
  return selected.value?.type === type && selected.value.value.id === id
}

async function fetchAnnualRoadmap() {
  const companyId = workspace.activeCompanyId ?? localStorage.getItem('activeCompany')
  annualRoadmapLoading.value = true

  if (!companyId) {
    resetAnnualRoadmap()
    annualRoadmapUnavailable.value = true
    annualRoadmapLoading.value = false
    return
  }

  try {
    const response = await quarterService.getCompanyRoadMap(companyId)
    applyAnnualRoadmapResponse(response)
    annualRoadmapUnavailable.value = false
  } catch (err) {
    // Falha de rede não apaga o que já estava na tela: zerar aqui faria o
    // usuário ler "sem dados" quando o dado existe e a API é que caiu.
    annualRoadmapUnavailable.value = true
    showError(apiErrorMessage(err, 'API da timeline anual indisponível'))
  } finally {
    annualRoadmapLoading.value = false
  }
}

function resetAnnualRoadmap() {
  annualLanes.value = []
  annualDeliveries.value = []
  annualMonthBars.value = []
  annualMilestones.value = []
  annualTotals.value = { activities: 0, completed: 0, scheduled: 0, undated: 0, overdue: 0 }
  selected.value = null
}

function parseAnnualMilestones(payload: any): RoadmapMilestone[] {
  // Contrato novo: `milestones[]` traz MILESTONE e REVIEW no mesmo array (com `type`).
  const milestonesPayload = firstArray(payload, ['milestones', 'markers'])
  const milestones = milestonesPayload.map(mapAnnualMilestone).filter(Boolean) as RoadmapMilestone[]

  // Compat legado: reviews separados (sem `type`) são normalizados como type='review'.
  const reviewsPayload = firstArray(payload, ['reviews', 'reviewMarkers'])
  const reviews = reviewsPayload
    .map((input: any) => mapAnnualMilestone({ ...input, type: input?.type ?? 'REVIEW' }))
    .filter(Boolean) as RoadmapMilestone[]

  const seen = new Set(milestones.map((milestone) => milestone.id))
  return [...milestones, ...reviews.filter((review) => !seen.has(review.id))]
}

function applyAnnualRoadmapResponse(response: unknown) {
  const payload = unwrapApiPayload(response)
  const quartersPayload = firstArray(payload, ['quarters'])
  const itemsPayload = firstArray(payload, ['items', 'activities', 'tasks', 'entries'])
  annualTotals.value = parseAnnualTotals(payload)

  if (quartersPayload.length) {
    applyAnnualQuarterRoadmap(quartersPayload, parseAnnualMilestones(payload), itemsPayload)
    return
  }

  const lanesPayload = firstArray(payload, ['lanes', 'areas', 'columns'])
  annualLanes.value = lanesPayload.map(mapAnnualLane).filter(Boolean) as RoadmapLane[]
  annualMonthBars.value = []
  annualMilestones.value = parseAnnualMilestones(payload)

  const laneIds = new Set(annualLanes.value.map((lane) => lane.id))
  annualDeliveries.value = (itemsPayload.map(mapAnnualItem).filter(Boolean) as RoadmapItem[]).filter(
    (item) => laneIds.has(item.laneId),
  )
  // Marcos só são descartados se estiverem presos a um laneId inexistente.
  // Marcos sem laneId (ancorados por quarter/data) são preservados.
  annualMilestones.value = annualMilestones.value.filter(
    (milestone) => milestone.laneId == null || laneIds.has(milestone.laneId),
  )

  syncAnnualSelection(laneIds)
}

function parseAnnualTotals(payload: any): RoadmapTotals {
  const totals = payload?.totals ?? {}
  const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
  return {
    activities: num(totals.activities),
    completed: num(totals.completed),
    scheduled: num(totals.scheduled),
    undated: num(totals.undated),
    overdue: num(totals.overdue),
  }
}

function syncAnnualSelection(laneIds: Set<string>) {
  if (activeLaneId.value !== 'all' && !laneIds.has(activeLaneId.value)) {
    activeLaneId.value = 'all'
  }
  if (selected.value?.type === 'item' && !annualItems.value.some((item) => item.id === selected.value?.value.id)) {
    selected.value = null
  }
  if (selected.value?.type === 'milestone' && !annualMilestones.value.some((item) => item.id === selected.value?.value.id)) {
    selected.value = null
  }
}

function applyAnnualQuarterRoadmap(
  quartersPayload: any[],
  milestones: RoadmapMilestone[] = [],
  itemsPayload: any[] = [],
) {
  const laneIdOf = (quarter: any, index: number) =>
    String(quarter?.id ?? quarter?.label ?? `quarter-${index + 1}`)

  // Entregas reais primeiro: a lane precisa delas para descrever responsáveis
  // e contagem sem inventar rótulo.
  annualDeliveries.value = itemsPayload.map(mapAnnualItem).filter(Boolean) as RoadmapItem[]

  annualMonthBars.value = quartersPayload.flatMap((quarter, quarterIndex) => {
    const laneId = laneIdOf(quarter, quarterIndex)
    const months = Array.isArray(quarter?.months) ? quarter.months : []

    return months
      .map((month: any) => mapQuarterMonthItem(month, laneId))
      .filter(Boolean) as RoadmapItem[]
  })

  annualLanes.value = quartersPayload.map((quarter, index) => {
    const laneId = laneIdOf(quarter, index)
    return {
      id: laneId,
      title: String(quarter?.label ?? `Q${index + 1}`),
      description: quarterDescription(quarter, laneId),
      owner: quarterOwners(laneId),
      status: normalizeQuarterStatus(quarter),
      color: fallbackLaneColor(index),
      icon: fallbackLaneIcon(index),
    }
  })

  // Marcos/reviews do contrato novo ancoram por `quarterId` (lane = quarter) ou por data.
  // Aqui as lanes SÃO os quarters, então resolvemos o quarterId para o id da lane.
  const laneIds = new Set(annualLanes.value.map((lane) => lane.id))
  annualMilestones.value = milestones.filter(
    (milestone) =>
      milestone.quarterId == null ||
      milestone.laneId == null ||
      laneIds.has(milestone.quarterId) ||
      laneIds.has(milestone.laneId),
  )

  syncAnnualSelection(laneIds)
}

/** Descrição da faixa a partir de contagem real: nunca "N meses cadastrados" solto. */
function quarterDescription(quarter: any, laneId: string): string {
  const months = Array.isArray(quarter?.months) ? quarter.months : []
  const undated = months.reduce((sum: number, month: any) => sum + Number(month?.undatedTasks ?? 0), 0)
  const scheduled = annualDeliveries.value.filter((item) => item.laneId === laneId).length

  const parts: string[] = []
  parts.push(scheduled === 1 ? '1 entrega com data' : `${scheduled} entregas com data`)
  if (undated > 0) parts.push(`${undated} sem data`)
  return parts.join(' · ')
}

/** Responsáveis reais das entregas do trimestre. Sem entrega, diz que não há. */
function quarterOwners(laneId: string): string {
  const names = new Set<string>()
  for (const item of annualDeliveries.value) {
    if (item.laneId !== laneId) continue
    for (const name of item.assignees ?? []) names.add(name)
  }

  if (!names.size) return 'Sem responsável'
  const list = [...names]
  if (list.length <= 2) return list.join(', ')
  return `${list.slice(0, 2).join(', ')} +${list.length - 2}`
}

function mapQuarterMonthItem(month: any, laneId: string): RoadmapItem | null {
  const monthNumber = Number(month?.number)
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null

  const id = String(month?.id ?? `${laneId}-month-${monthNumber}`)
  const title = String(month?.name ?? monthNameFromNumber(monthNumber))
  const start = dateKey(roadmapStart.getFullYear(), monthNumber - 1, 1)
  const end = dateKey(roadmapStart.getFullYear(), monthNumber - 1, new Date(roadmapStart.getFullYear(), monthNumber, 0).getDate())
  const progress = clamp(Number(month?.progress ?? 0), 0, 100)

  return {
    id,
    laneId,
    title,
    shortTitle: monthAbbreviation(title),
    start,
    end,
    progress,
    status: statusFromProgress(progress, Number(month?.totalTasks ?? 0)),
    kind: 'month',
    monthName: title,
    scheduledCount: Number(month?.scheduledTasks ?? 0),
    undatedCount: Number(month?.undatedTasks ?? 0),
  }
}

function monthNameFromNumber(monthNumber: number): string {
  return new Date(roadmapStart.getFullYear(), monthNumber - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
}

function monthAbbreviation(monthName: string): string {
  return monthName.trim().slice(0, 3)
}

function statusFromProgress(progress: number, totalTasks: number): RoadmapStatus {
  if (totalTasks === 0) return 'planned'
  if (progress >= 100) return 'done'
  if (progress > 0) return 'active'
  return 'planned'
}

function normalizeQuarterStatus(quarter: any): RoadmapStatus {
  const months = Array.isArray(quarter?.months) ? quarter.months : []
  if (!months.length) return 'planned'
  const totalTasks = months.reduce((sum: number, month: any) => sum + Number(month?.totalTasks ?? 0), 0)
  const completedTasks = months.reduce((sum: number, month: any) => sum + Number(month?.completedTasks ?? 0), 0)
  if (totalTasks > 0 && completedTasks >= totalTasks) return 'done'
  if (completedTasks > 0) return 'active'
  return 'planned'
}

function unwrapApiPayload(response: unknown): any {
  const raw = response as any
  return raw?.data?.data ?? raw?.data ?? raw
}

function firstArray(payload: any, keys: string[]): any[] {
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

function mapAnnualLane(input: any, index: number): RoadmapLane | null {
  const id = String(input?.id ?? input?.laneId ?? input?.key ?? input?.name ?? '')
  const title = String(input?.title ?? input?.name ?? input?.label ?? '')
  if (!id || !title) return null

  return {
    id,
    title,
    description: String(input?.description ?? input?.summary ?? ''),
    owner: String(input?.owner ?? input?.responsible ?? input?.responsavel ?? ''),
    status: normalizeRoadmapStatus(input?.status),
    color: String(input?.color ?? fallbackLaneColor(index)),
    icon: fallbackLaneIcon(index),
  }
}

function mapAnnualItem(input: any): RoadmapItem | null {
  const id = String(input?.id ?? input?.activityId ?? '')
  const laneId = String(
    input?.laneId ?? input?.quarterId ?? input?.areaId ?? input?.columnId ?? input?.lane?.id ?? '',
  )
  const title = String(input?.title ?? input?.name ?? '')
  const dueDate = normalizeDateOnly(input?.dueDate ?? input?.due ?? input?.deliveryDate)
  const start = normalizeDateOnly(input?.start ?? input?.startDate ?? input?.startsAt ?? input?.from) ?? dueDate
  const end =
    normalizeDateOnly(input?.end ?? input?.endDate ?? input?.endsAt ?? input?.to) ?? dueDate ?? start
  if (!id || !laneId || !title || !start || !end) return null

  const status = normalizeRoadmapStatus(input?.status)
  // A API já calcula o atraso; o fallback local cobre contrato legado sem o campo.
  const overdue =
    typeof input?.overdue === 'boolean'
      ? input.overdue
      : status !== 'done' && !!dueDate && dateOnlyDiffDays(`${dueDate}T12:00:00.000Z`) < 0

  return {
    id,
    laneId,
    title,
    start,
    end,
    dueDate: dueDate ?? undefined,
    overdue,
    assignees: Array.isArray(input?.assignees)
      ? input.assignees
          .map((assignee: any) => String(assignee?.name ?? assignee ?? '').trim())
          .filter((name: string) => name.length > 0)
      : [],
    monthName: input?.monthName ? String(input.monthName) : undefined,
    progress: clamp(Number(input?.progress ?? input?.percentage ?? 0), 0, 100),
    status,
    kind: input?.kind === 'event' || input?.type === 'event' ? 'event' : 'activity',
  }
}

function normalizeMilestoneKind(value: unknown): MilestoneKind {
  return String(value ?? '').toUpperCase() === 'REVIEW' ? 'review' : 'milestone'
}

function mapAnnualMilestone(input: any): RoadmapMilestone | null {
  const id = String(input?.id ?? input?.milestoneId ?? '')
  // Contrato novo: marco/review ancora por `quarterId`/`date`. `laneId` pode não existir.
  const rawLaneId = input?.laneId ?? input?.areaId ?? input?.lane?.id
  const rawQuarterId = input?.quarterId ?? input?.quarter?.id ?? input?.quarterID
  const title = String(input?.title ?? input?.name ?? input?.label ?? '')
  const date = normalizeDateOnly(input?.date ?? input?.dueDate ?? input?.startsAt)
  if (!id || !title || !date) return null

  return {
    id,
    laneId: rawLaneId != null ? String(rawLaneId) : null,
    quarterId: rawQuarterId != null ? String(rawQuarterId) : null,
    title,
    date,
    status: normalizeRoadmapStatus(input?.status),
    type: normalizeMilestoneKind(input?.type),
  }
}

function normalizeRoadmapStatus(status: unknown): RoadmapStatus {
  const value = String(status ?? '').toLowerCase()
  if (['done', 'completed', 'complete', 'concluido', 'concluído'].includes(value)) return 'done'
  if (['active', 'progress', 'in_progress', 'em andamento'].includes(value)) return 'active'
  if (['risk', 'blocked', 'attention', 'atenção', 'atencao'].includes(value)) return 'risk'
  return 'planned'
}

function normalizeDateOnly(value: unknown): string | null {
  if (!value) return null
  const raw = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  // Extrai o dia-calendário UTC (dueDates são gravados a meio-dia UTC)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function fallbackLaneColor(index: number): string {
  const colors = ['var(--accent)', 'var(--err)', 'var(--success)', 'var(--info)', 'var(--warn)']
  return colors[index % colors.length] ?? 'var(--accent)'
}

function fallbackLaneIcon(index: number): LucideIcon {
  const icons = [Target, Flag, Rocket, BarChart3, Activity]
  return icons[index % icons.length] ?? Target
}

const monthlySummary = computed(() => {
  const entries = monthlyPlans.value.flatMap((month) => month.entries)
  const uniqueDates = new Set(entries.map((entry) => entry.date))

  return {
    months: monthlyPlans.value.length,
    dates: uniqueDates.size,
    entries: entries.length,
    notes: entries.filter((entry) => entry.category === 'note').length,
  }
})

const hasMonthlyPlans = computed(() => monthlyPlans.value.length > 0)

const currentMonthKey = computed(() => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
})

const visibleMonthlyPlans = computed(() => {
  if (showAllMonthlyPlans.value) return monthlyPlans.value
  return monthlyPlans.value.filter((month) => month.key >= currentMonthKey.value)
})

const hiddenPastMonthsCount = computed(() => monthlyPlans.value.length - visibleMonthlyPlans.value.length)
const hasVisibleMonthlyPlans = computed(() => visibleMonthlyPlans.value.length > 0)

const selectedNoteMonth = computed(() =>
  visibleMonthlyPlans.value.find((month) => month.key === noteMonthKey.value) ?? visibleMonthlyPlans.value[0] ?? monthlyPlans.value[0],
)

const printedMonthlyPlans = computed(() =>
  exportMonthKey.value === 'all'
    ? monthlyPlans.value
    : monthlyPlans.value.filter((month) => month.key === exportMonthKey.value),
)

async function fetchMonthlyRoadmap() {
  roadmapMonthlyLoading.value = true
  try {
    const response = await roadmapMonthlyService.getYear(roadmapStart.getFullYear())
    applyRoadmapApiMonths(response.months)
    usingRoadmapMonthlyApi.value = true
    monthlyLoadError.value = ''
  } catch (err) {
    // Erro de carga não apaga o que já está na tela: zerar aqui fazia o usuário
    // ler "nenhum mês cadastrado" quando o problema era a API fora do ar.
    const message = apiErrorMessage(err, 'API de roadmap mensal indisponível')
    monthlyLoadError.value = message
    usingRoadmapMonthlyApi.value = false
    showError(message)
  } finally {
    roadmapMonthlyLoading.value = false
  }
}

function applyRoadmapApiMonths(months: RoadmapMonth[]) {
  const nextFocusPhotos: Record<string, string[]> = {}
  const nextFocusPhotoIds: Record<string, string[]> = {}
  const nextFocusIds: Record<string, string[]> = {}

  monthlyPlans.value = months.map((month) => {
    const focusItems = [...month.focusItems].sort((a, b) => a.order - b.order)
    const photos = orderPhotos(month.photos)

    nextFocusIds[month.key] = focusItems.map((focus) => focus.id)
    nextFocusPhotos[month.key] = photos.map((photo) => photo.url)
    nextFocusPhotoIds[month.key] = photos.map((photo) => photo.id)

    return {
      id: month.id,
      key: month.key,
      year: month.year,
      month: month.month,
      title: month.title,
      main: month.main,
      order: month.order,
      persisted: month.persisted,
      bullets: focusItems.map((focus) => focus.text),
      entries: month.entries.map(mapRoadmapEntry),
      deliveries: (month.deliveries ?? []).map(mapRoadmapDelivery),
    }
  })

  extraFocusItems.value = {}
  focusDrafts.value = {}
  focusIds.value = nextFocusIds
  focusPhotos.value = nextFocusPhotos
  focusPhotoIds.value = nextFocusPhotoIds

  // Primeiro load: abre no melhor mês com conteúdo em vez de num futuro vazio.
  // Se esse conteúdo só existe no passado, revela os meses passados. Depois
  // disso, só corrige se o mês selecionado deixou de existir (respeita a
  // escolha do usuário em refetches).
  if (monthlyFirstLoad.value) {
    const target = defaultMonthTarget()
    noteMonthKey.value = target.key
    if (target.expandPast) showAllMonthlyPlans.value = true
    monthlyFirstLoad.value = false
  } else if (!monthlyPlans.value.some((month) => month.key === noteMonthKey.value)) {
    noteMonthKey.value = defaultMonthTarget().key
  }
  if (exportMonthKey.value !== 'all' && !monthlyPlans.value.some((month) => month.key === exportMonthKey.value)) {
    exportMonthKey.value = 'all'
  }
  if (selectedMonthDetailsKey.value && !monthlyPlans.value.some((month) => month.key === selectedMonthDetailsKey.value)) {
    selectedMonthDetailsKey.value = null
  }
}

function toggleAllMonthlyPlans() {
  showAllMonthlyPlans.value = !showAllMonthlyPlans.value
  if (!showAllMonthlyPlans.value && !visibleMonthlyPlans.value.some((month) => month.key === noteMonthKey.value)) {
    noteMonthKey.value = visibleMonthlyPlans.value[0]?.key ?? noteMonthKey.value
  }
}

function mapRoadmapEntry(entry: RoadmapEntry): CalendarEntry {
  return {
    id: entry.id,
    date: entry.date,
    title: entry.title,
    description: entry.description ?? undefined,
    category: normalizeRoadmapCategory(entry.category),
  }
}

function mapRoadmapDelivery(delivery: RoadmapDelivery): CalendarDelivery {
  return {
    activityId: delivery.activityId,
    monthId: delivery.monthId,
    date: delivery.date,
    title: delivery.title,
    status: delivery.status,
    priorityNumber: delivery.priorityNumber,
    overdue: delivery.overdue,
    responsibles: delivery.responsibles.map((person) => person.name),
  }
}

function normalizeRoadmapCategory(category: RoadmapCategory): CalendarCategory {
  return calendarCategoryMeta[category] ? category : 'note'
}

function orderPhotos(photos: RoadmapPhoto[]): RoadmapPhoto[] {
  return [...photos].sort((a, b) => a.id.localeCompare(b.id))
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as any)?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return message || fallback
}

function monthApiId(monthKey: string): string | null {
  return monthlyPlans.value.find((month) => month.key === monthKey)?.id ?? null
}

async function ensureMonthId(month: MonthlyPlan): Promise<string> {
  if (month.id) return month.id

  const ensured = await roadmapMonthlyService.ensureMonth({
    key: month.key,
    year: month.year,
    month: month.month,
    title: month.title,
    main: month.main,
    order: month.order,
  })

  month.id = ensured.id
  month.persisted = ensured.persisted
  month.title = ensured.title
  month.main = ensured.main
  month.order = ensured.order

  if (!ensured.id) {
    throw new Error('A API não retornou o id do mês garantido.')
  }

  return ensured.id
}

/** Dias com alguma marcação: anotação manual ou entrega de tarefa. */
function monthMarkedDays(month: MonthlyPlan): number {
  return new Set([
    ...month.entries.map((entry) => entry.date),
    ...month.deliveries.map((delivery) => delivery.date),
  ]).size
}

/** Total de itens da agenda do mês (anotações + entregas). */
function monthItemsCount(month: MonthlyPlan): number {
  return month.entries.length + month.deliveries.length
}

/** Mês tem algo para mostrar: foco escrito, agenda ou entrega. */
function monthHasContent(month: MonthlyPlan): boolean {
  return !!month.main?.trim() || month.bullets.length > 0 || monthItemsCount(month) > 0
}

/**
 * Melhor mês para abrir o workbench, evitando cair num mês vazio:
 *  1. o mês atual, se tiver conteúdo;
 *  2. o próximo mês futuro com conteúdo;
 *  3. o mês passado mais recente com conteúdo (revela os passados);
 *  4. o mês atual/primeiro, se nada tiver conteúdo.
 * Retorna também se precisa expandir os meses passados para o alvo aparecer.
 */
function defaultMonthTarget(): { key: string; expandPast: boolean } {
  const all = monthlyPlans.value
  const currentKey = currentMonthKey.value

  const current = all.find((month) => month.key === currentKey)
  if (current && monthHasContent(current)) return { key: current.key, expandPast: false }

  const futureWithContent = all
    .filter((month) => month.key >= currentKey && monthHasContent(month))
    .sort((a, b) => a.key.localeCompare(b.key))[0]
  if (futureWithContent) return { key: futureWithContent.key, expandPast: false }

  const pastWithContent = all
    .filter((month) => month.key < currentKey && monthHasContent(month))
    .sort((a, b) => b.key.localeCompare(a.key))[0]
  if (pastWithContent) return { key: pastWithContent.key, expandPast: true }

  const fallback = visibleMonthlyPlans.value[0] ?? all[0]
  return { key: fallback?.key ?? noteMonthKey.value, expandPast: false }
}

function monthOverdueCount(month: MonthlyPlan): number {
  return month.deliveries.filter((delivery) => delivery.overdue).length
}

function deliveryTone(delivery: CalendarDelivery): string {
  return delivery.overdue ? 'var(--err)' : statusSpec(delivery.status).token
}

function deliveryStatusLabel(delivery: CalendarDelivery): string {
  const label = statusSpec(delivery.status).label
  return delivery.overdue ? `${label} · atrasada` : label
}

/** Agenda unificada do mês, ordenada por data; empate mantém a anotação antes. */
function monthAgenda(month: MonthlyPlan): MonthAgendaItem[] {
  const items: MonthAgendaItem[] = [
    ...month.entries.map<MonthAgendaItem>((entry) => ({
      kind: 'entry',
      key: `entry-${entry.id}`,
      date: entry.date,
      entry,
    })),
    ...month.deliveries.map<MonthAgendaItem>((delivery) => ({
      kind: 'delivery',
      key: `delivery-${delivery.activityId}`,
      date: delivery.date,
      delivery,
    })),
  ]
  return items.sort((a, b) => a.date.localeCompare(b.date))
}

function agendaItemStyle(item: MonthAgendaItem) {
  return {
    '--entry-c':
      item.kind === 'entry'
        ? calendarCategoryMeta[item.entry.category].tone
        : deliveryTone(item.delivery),
  }
}

function visibleMonthAgenda(month: MonthlyPlan): MonthAgendaItem[] {
  return monthAgenda(month).slice(0, monthEntryPreviewLimit)
}

function monthAgendaForCard(month: MonthlyPlan): MonthAgendaItem[] {
  return isRoadmapPrinting.value ? monthAgenda(month) : visibleMonthAgenda(month)
}

function hiddenMonthAgendaCount(month: MonthlyPlan): number {
  return Math.max(monthAgenda(month).length - visibleMonthAgenda(month).length, 0)
}

/** Abre a tarefa da entrega no detalhe, preservando a empresa ativa. */
function openDelivery(delivery: CalendarDelivery) {
  const companyId = workspace.activeCompanyId ?? localStorage.getItem('activeCompany')
  void router.push({
    path: `/tasks/${delivery.monthId}/${delivery.activityId}`,
    ...(companyId ? { query: { company: companyId } } : {}),
  })
}

function monthCategories(month: MonthlyPlan): Array<{ category: CalendarCategory; count: number; meta: CalendarCategoryMeta }> {
  return Object.entries(calendarCategoryMeta)
    .map(([category, meta]) => ({
      category: category as CalendarCategory,
      count: month.entries.filter((entry) => entry.category === category).length,
      meta,
    }))
    .filter((item) => item.count > 0)
}

const selectedMonthDetails = computed(() =>
  monthlyPlans.value.find((month) => month.key === selectedMonthDetailsKey.value) ?? null,
)

function openMonthDetails(monthKey: string, date?: string) {
  selectedMonthDetailsKey.value = monthKey
  selectedDayKey.value = date ?? null
}

function closeMonthDetails() {
  selectedMonthDetailsKey.value = null
  selectedDayKey.value = null
}

/** Clique num dia do calendário: abre o mês já filtrado naquela data. */
function openDayDetails(month: MonthlyPlan, date?: string) {
  if (!date || !dayItemsCount(month, date)) return
  openMonthDetails(month.key, date)
}

function selectDrawerDay(date?: string) {
  if (!date) return
  selectedDayKey.value = selectedDayKey.value === date ? null : date
}

const drawerAgenda = computed<MonthAgendaItem[]>(() => {
  const month = selectedMonthDetails.value
  if (!month) return []
  const all = monthAgenda(month)
  if (!selectedDayKey.value) return all
  return all.filter((item) => item.date === selectedDayKey.value)
})

function focusItemsFor(month: MonthlyPlan): string[] {
  return [...month.bullets, ...(extraFocusItems.value[month.key] ?? [])]
}

function visibleFocusItems(month: MonthlyPlan): string[] {
  return focusItemsFor(month).slice(0, 4)
}

function focusItemsForCard(month: MonthlyPlan): string[] {
  return isRoadmapPrinting.value ? focusItemsFor(month) : visibleFocusItems(month)
}

function hiddenFocusItemsCount(month: MonthlyPlan): number {
  return Math.max(focusItemsFor(month).length - visibleFocusItems(month).length, 0)
}

function focusDraftFor(monthKey: string): string {
  return focusDrafts.value[monthKey] ?? ''
}

function setFocusDraft(monthKey: string, value: string) {
  focusDrafts.value = {
    ...focusDrafts.value,
    [monthKey]: value,
  }
}

async function addFocusItem(monthKey: string) {
  const text = focusDraftFor(monthKey).trim()
  if (!text) return

  const month = monthlyPlans.value.find((item) => item.key === monthKey)
  if (!month) {
    showError('Mês não encontrado para receber este foco.')
    return
  }

  try {
    const apiMonthId = await ensureMonthId(month)
    const created = await roadmapMonthlyService.addFocus(apiMonthId, {
      text,
      order: focusItemsFor(month).length + 1,
    })
    month.bullets.push(created.text)
    focusIds.value = {
      ...focusIds.value,
      [monthKey]: [...(focusIds.value[monthKey] ?? []), created.id],
    }
    setFocusDraft(monthKey, '')
    success('Foco adicionado')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível salvar o foco'))
  }
}

async function removeFocusItem(month: MonthlyPlan, focusIndex: number) {
  const apiMonthId = month.id
  const apiFocusId = focusIds.value[month.key]?.[focusIndex]

  if (!apiMonthId || !apiFocusId) {
    showError('Este foco não possui vínculo com a API.')
    return
  }

  try {
    await roadmapMonthlyService.removeFocus(apiMonthId, apiFocusId)
    month.bullets = month.bullets.filter((_, index) => index !== focusIndex)
    focusIds.value = {
      ...focusIds.value,
      [month.key]: (focusIds.value[month.key] ?? []).filter((_, index) => index !== focusIndex),
    }
    success('Foco removido')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível remover o foco'))
  }
}

function focusPhotosFor(monthKey: string): string[] {
  return focusPhotos.value[monthKey] ?? []
}

function visibleFocusPhotos(monthKey: string): string[] {
  return focusPhotosFor(monthKey).slice(0, 2)
}

function hiddenFocusPhotosCount(monthKey: string): number {
  return Math.max(focusPhotosFor(monthKey).length - visibleFocusPhotos(monthKey).length, 0)
}

async function handleFocusPhotoUpload(monthKey: string, event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return

  const validFiles = files.filter((file) => file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024)
  const invalidCount = files.length - validFiles.length
  if (invalidCount) info(`${invalidCount} arquivo(s) ignorado(s). Use imagens de até 5 MB.`)
  if (!validFiles.length) {
    input.value = ''
    return
  }

  const month = monthlyPlans.value.find((item) => item.key === monthKey)
  if (!month) {
    showError('Mês não encontrado para receber imagens.')
    input.value = ''
    return
  }

  try {
    const apiMonthId = await ensureMonthId(month)
    const photos = await roadmapMonthlyService.uploadPhotos(apiMonthId, validFiles)
    focusPhotos.value = {
      ...focusPhotos.value,
      [monthKey]: [...focusPhotosFor(monthKey), ...photos.map((photo) => photo.url)],
    }
    focusPhotoIds.value = {
      ...focusPhotoIds.value,
      [monthKey]: [...(focusPhotoIds.value[monthKey] ?? []), ...photos.map((photo) => photo.id)],
    }
    success('Imagem adicionada')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível enviar a imagem'))
  } finally {
    input.value = ''
  }
}

async function removeFocusPhoto(monthKey: string, photoIndex: number) {
  const apiMonthId = monthApiId(monthKey)
  const apiPhotoId = focusPhotoIds.value[monthKey]?.[photoIndex]

  if (!apiMonthId || !apiPhotoId) {
    showError('Esta imagem não possui vínculo com a API.')
    return
  }

  try {
    await roadmapMonthlyService.removePhoto(apiMonthId, apiPhotoId)
    focusPhotoIds.value = {
      ...focusPhotoIds.value,
      [monthKey]: (focusPhotoIds.value[monthKey] ?? []).filter((_, index) => index !== photoIndex),
    }
    success('Imagem removida')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível remover a imagem'))
    return
  }

  focusPhotos.value = {
    ...focusPhotos.value,
    [monthKey]: focusPhotosFor(monthKey).filter((_, index) => index !== photoIndex),
  }
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function calendarCells(month: MonthlyPlan): Array<{ key: string; day: number | null; date?: string }> {
  // `month.month` é 1-based (Jan = 1); `Date` e `dateKey` são 0-based. Sem o
  // `-1` o calendário renderizava o layout do mês SEGUINTE e as datas das
  // células nunca batiam com as dos itens: nenhum dia era marcado e os dias da
  // semana ficavam deslocados em um mês.
  const monthIndex = month.month - 1
  const firstDay = new Date(month.year, monthIndex, 1)
  const lastDay = new Date(month.year, monthIndex + 1, 0)
  const cells: Array<{ key: string; day: number | null; date?: string }> = []

  for (let i = 0; i < firstDay.getDay(); i++) {
    cells.push({ key: `${month.key}-empty-start-${i}`, day: null })
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    cells.push({ key: dateKey(month.year, monthIndex, day), day, date: dateKey(month.year, monthIndex, day) })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `${month.key}-empty-end-${cells.length}`, day: null })
  }

  return cells
}

function entriesForDate(month: MonthlyPlan, date?: string): CalendarEntry[] {
  if (!date) return []
  return month.entries.filter((entry) => entry.date === date)
}

function primaryEntry(month: MonthlyPlan, date?: string): CalendarEntry | null {
  return entriesForDate(month, date)[0] ?? null
}

function deliveriesForDate(month: MonthlyPlan, date?: string): CalendarDelivery[] {
  if (!date) return []
  return month.deliveries.filter((delivery) => delivery.date === date)
}

function dayItemsCount(month: MonthlyPlan, date?: string): number {
  return entriesForDate(month, date).length + deliveriesForDate(month, date).length
}

function dayHasOverdue(month: MonthlyPlan, date?: string): boolean {
  return deliveriesForDate(month, date).some((delivery) => delivery.overdue)
}

/**
 * Cor de fundo do dia: atraso manda em tudo, depois a anotação (que o usuário
 * escolheu o tipo) e por último o status da entrega.
 */
function dayCellStyle(month: MonthlyPlan, date?: string) {
  const deliveries = deliveriesForDate(month, date)
  const entry = primaryEntry(month, date)
  const deliveryToneValue = deliveries[0] ? deliveryTone(deliveries[0]) : 'var(--accent)'
  const tone = dayHasOverdue(month, date)
    ? 'var(--err)'
    : entry
      ? calendarCategoryMeta[entry.category].tone
      : deliveries.length
        ? deliveryToneValue
        : 'var(--accent)'

  return { '--entry-c': tone, '--deliv-c': deliveryToneValue }
}

/** Texto do dia no calendário: precisa dizer o que tem lá sem precisar clicar. */
function dayCellLabel(month: MonthlyPlan, date?: string): string | undefined {
  if (!date) return undefined
  const entries = entriesForDate(month, date)
  const deliveries = deliveriesForDate(month, date)
  if (!entries.length && !deliveries.length) return undefined

  const parts: string[] = []
  if (deliveries.length) {
    parts.push(`${deliveries.length} entrega${deliveries.length > 1 ? 's' : ''} de tarefa`)
  }
  if (entries.length) {
    parts.push(`${entries.length} anotaç${entries.length > 1 ? 'ões' : 'ão'}`)
  }
  return `${formatDayMonth(date)}: ${parts.join(' e ')}. Abrir detalhes.`
}

function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

const noteCategoryItems = computed<{ label: string; value: string }[]>(() =>
  (Object.entries(calendarCategoryMeta) as [CalendarCategory, CalendarCategoryMeta][]).map(
    ([category, meta]) => ({ label: meta.label, value: category }),
  ),
)

async function addMonthlyEntry() {
  const text = noteDraft.value.trim()
  const month = monthlyPlans.value.find((item) => item.key === noteMonthKey.value)
  if (!text || !month || !noteDate.value) return

  try {
    const apiMonthId = await ensureMonthId(month)
    const created = await roadmapMonthlyService.addEntry(apiMonthId, {
      date: noteDate.value,
      title: text,
      category: noteCategory.value,
      source: noteCategory.value === 'note' ? 'quick_note' : 'manual',
    })
    month.entries.push(mapRoadmapEntry(created))
    noteDraft.value = ''
    success(`${calendarCategoryMeta[noteCategory.value].label} adicionado à agenda`)
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível salvar o item da agenda'))
  }
}

async function removeMonthEntry(month: MonthlyPlan, entry: CalendarEntry) {
  if (!month.id) {
    showError('Este mês ainda não existe na API.')
    return
  }

  try {
    await roadmapMonthlyService.removeEntry(month.id, entry.id)
    month.entries = month.entries.filter((item) => item.id !== entry.id)
    success('Item removido da agenda')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível remover o item'))
  }
}

async function exportMonthlyPdf() {
  if (!monthlyPlans.value.length) {
    info('Não há meses do roadmap mensal para exportar.')
    return
  }

  // O PDF do servidor só aceita o ano. Com um mês escolhido, a impressão local é
  // o único caminho que respeita a seleção; mandar pro servidor entregaria o ano
  // inteiro sem avisar.
  if (exportMonthKey.value === 'all') {
    try {
      await exportService.downloadRoadmapPdf(roadmapStart.getFullYear())
      success('Download do PDF iniciado')
      return
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível exportar pelo servidor. Abrindo impressão local.'))
    }
  }

  isRoadmapPrinting.value = true
  document.body.classList.add('roadmap-printing')
  const cleanup = () => {
    isRoadmapPrinting.value = false
    document.body.classList.remove('roadmap-printing')
  }

  window.addEventListener('afterprint', cleanup, { once: true })
  await nextTick()
  window.print()
  window.setTimeout(cleanup, 800)
}

async function shareRoadmap() {
  try {
    const link = await shareService.shareRoadmap(roadmapStart.getFullYear())
    await navigator.clipboard.writeText(`${window.location.origin}${link.path}`)
    success('Link público do roadmap copiado')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível compartilhar o roadmap'))
  }
}

async function generateRoadmapFromPrompt() {
  const prompt = roadmapPrompt.value.trim()
  if (!prompt) return

  roadmapPromptLoading.value = true
  try {
    await aiService.roadmap(prompt, roadmapStart.getFullYear())
    roadmapPrompt.value = ''
    await fetchMonthlyRoadmap()
    success('Roadmap gerado pela IA')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível gerar o roadmap'))
  } finally {
    roadmapPromptLoading.value = false
  }
}

function resetFilters() {
  activeLaneId.value = 'all'
  activeStatus.value = 'all'
  activeQuarter.value = 'all'
  onlyOverdue.value = false
}

// ─── Marcos e reviews da timeline anual ──────────────────────────────────────

const milestoneQuarterItems = computed<{ label: string; value: string }[]>(() => [
  { label: 'Sem trimestre (fica no eixo)', value: '' },
  ...annualLanes.value.map((lane) => ({ label: lane.title, value: lane.id })),
])

const milestoneTypeItems: { label: string; value: RoadmapMilestoneType }[] = [
  { label: 'Marco', value: 'MILESTONE' },
  { label: 'Review', value: 'REVIEW' },
]

function resetMilestoneDraft() {
  milestoneDraft.value = { title: '', date: todayDateOnly(), type: 'MILESTONE', quarterId: '' }
}

async function createMilestone() {
  const companyId = workspace.activeCompanyId ?? localStorage.getItem('activeCompany')
  const title = milestoneDraft.value.title.trim()
  if (!companyId || !title || !milestoneDraft.value.date) return

  milestoneSaving.value = true
  try {
    await roadmapMilestonesService.create(companyId, {
      title,
      date: milestoneDraft.value.date,
      type: milestoneDraft.value.type,
      ...(milestoneDraft.value.quarterId ? { quarterId: milestoneDraft.value.quarterId } : {}),
    })
    resetMilestoneDraft()
    milestoneFormOpen.value = false
    await fetchAnnualRoadmap()
    success('Marco adicionado à timeline')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível salvar o marco'))
  } finally {
    milestoneSaving.value = false
  }
}

async function removeSelectedMilestone() {
  const companyId = workspace.activeCompanyId ?? localStorage.getItem('activeCompany')
  if (!companyId || selected.value?.type !== 'milestone') return

  const milestoneId = selected.value.value.id
  try {
    await roadmapMilestonesService.remove(companyId, milestoneId)
    selected.value = null
    // Some da tela na hora: se o refetch falhar, o catch de `fetchAnnualRoadmap`
    // preserva a carga anterior e o marco já removido voltaria a aparecer.
    annualMilestones.value = annualMilestones.value.filter((item) => item.id !== milestoneId)
    await fetchAnnualRoadmap()
    success('Marco removido')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível remover o marco'))
  }
}
</script>

<template>
  <section class="roadmap-page">
    <div class="roadmap-mode-switch no-print" aria-label="Tipo de roadmap">
      <button
        class="mode-btn"
        :class="{ 'mode-btn--active': roadmapMode === 'monthly' }"
        @click="roadmapMode = 'monthly'"
      >
        <CalendarDays :size="14" />
        Calendários mensais
      </button>
      <button
        class="mode-btn"
        :class="{ 'mode-btn--active': roadmapMode === 'timeline' }"
        @click="roadmapMode = 'timeline'"
      >
        <Milestone :size="14" />
        Timeline anual
      </button>
    </div>

    <template v-if="roadmapMode === 'monthly'">
      <div v-if="showMonthlyHelp" class="monthly-help-modal-layer no-print" role="dialog" aria-modal="true">
        <button class="monthly-help-backdrop" type="button" aria-label="Fechar ajuda" @click="showMonthlyHelp = false" />
        <section class="monthly-help-modal">
          <header class="monthly-help-head">
            <div>
              <span class="text-eyebrow">Guia rápido</span>
              <h2>Como usar os calendários mensais</h2>
              <p>Esta tela serve para transformar o roadmap em uma leitura simples por mês: foco, datas importantes, agenda e notas.</p>
            </div>
            <button class="monthly-help-close press" type="button" aria-label="Fechar ajuda" @click="showMonthlyHelp = false">
              <X :size="18" />
            </button>
          </header>

          <div class="monthly-help-steps">
            <article>
              <span>1</span>
              <div>
                <strong>Leia o foco do mês</strong>
                <p>O bloco de foco mostra as prioridades principais. No card aparecem só os primeiros itens; a lista completa fica em detalhes.</p>
              </div>
            </article>
            <article>
              <span>2</span>
              <div>
                <strong>Use o calendário para localizar datas</strong>
                <p>Dias coloridos indicam que existe algo marcado. Quando um dia tem mais de um item, ele mostra um contador.</p>
              </div>
            </article>
            <article>
              <span>3</span>
              <div>
                <strong>Abra os detalhes do mês</strong>
                <p>Em "Ver detalhes" você encontra calendário ampliado, agenda completa, todos os focos e a galeria de imagens.</p>
              </div>
            </article>
            <article>
              <span>4</span>
              <div>
                <strong>Registre notas e exporte o PDF</strong>
                <p>Use anotações rápidas para decisões pontuais e escolha se o PDF deve sair com todos os meses ou apenas um.</p>
              </div>
            </article>
          </div>
        </section>
      </div>

      <section class="monthly-workbench no-print" aria-label="Ferramentas do roadmap mensal">
        <div class="monthly-note-panel" aria-label="Adicionar anotacao">
          <div class="monthly-note-head">
            <div class="monthly-note-title">
              <span class="text-eyebrow">
                Agenda do roadmap
                <small class="roadmap-data-source">
                  {{ roadmapMonthlyLoading ? 'Sincronizando...' : usingRoadmapMonthlyApi ? 'Dados da API' : 'API indisponível' }}
                </small>
              </span>
              <h2>Registre um marco, entrega, reunião ou nota</h2>
              <p>Escolha o tipo, o mês e a data para marcar o item no calendário correspondente.</p>
            </div>
            <div class="monthly-help-row no-print">
              <button class="monthly-help-btn press" type="button" @click="showMonthlyHelp = true">
                <CircleHelp :size="15" />
                Como funciona esta tela?
              </button>
            </div>
          </div>
          <div v-if="selectedNoteMonth" class="monthly-action-context" aria-label="Contexto do mes selecionado">
            <article>
              <Target :size="14" />
              <div>
                <span>Foco selecionado</span>
                <strong>{{ selectedNoteMonth.main }}</strong>
              </div>
            </article>
            <article>
              <CalendarClock :size="14" />
              <div>
                <span>Agenda do mês</span>
                <strong>{{ monthItemsCount(selectedNoteMonth) }} itens planejados</strong>
              </div>
            </article>
            <article>
              <CircleDot :size="14" />
              <div>
                <span>Dias com atenção</span>
                <strong>{{ monthMarkedDays(selectedNoteMonth) }} datas marcadas</strong>
              </div>
            </article>
          </div>
          <div v-if="hasVisibleMonthlyPlans && canEditMonthlyRoadmap" class="monthly-note-form">
            <div class="monthly-select-wrap">
              <AppSelect
                v-model="noteMonthKey"
                :items="noteMonthItems"
                label="Mês da nota"
                density="compact"
              />
            </div>
            <div class="monthly-select-wrap">
              <AppSelect
                :model-value="noteCategory"
                :items="noteCategoryItems"
                label="Tipo do item"
                density="compact"
                @update:model-value="noteCategory = $event as CalendarCategory"
              />
            </div>
            <input v-model="noteDate" type="date" class="monthly-control" aria-label="Data do item" />
            <input
              v-model="noteDraft"
              type="text"
              class="monthly-control monthly-control--text"
              placeholder="Ex: alinhar campanha com parceiros"
              @keydown.enter.prevent="addMonthlyEntry"
            />
            <button class="monthly-add-btn press" :disabled="!noteDraft.trim()" @click="addMonthlyEntry">
              <Plus :size="14" />
              Adicionar
            </button>
          </div>
          <p v-else-if="!hasMonthlyPlans" class="monthly-readonly-hint">
            Nenhum mês cadastrado na API para receber anotações.
          </p>
          <p v-else-if="!hasVisibleMonthlyPlans" class="monthly-readonly-hint">
            Não há meses atuais ou futuros para anotações. Use "Ver todos" para acessar meses anteriores.
          </p>
          <p v-else class="monthly-readonly-hint">Seu perfil pode visualizar o roadmap mensal, mas não pode criar anotações.</p>

          <section class="monthly-legend" aria-label="Legenda dos calendarios">
            <strong>Legenda</strong>
            <span
              v-for="(meta, category) in calendarCategoryMeta"
              :key="category"
              class="monthly-legend-item"
              :style="{ '--entry-c': meta.tone }"
            >
              <component :is="meta.icon" :size="12" />
              {{ meta.label }}
            </span>
            <span class="monthly-legend-item monthly-legend-item--delivery">
              <CalendarCheck :size="12" />
              Entrega de tarefa (quadrado no dia)
            </span>
            <span class="monthly-legend-item" :style="{ '--entry-c': 'var(--err)' }">
              <Flag :size="12" />
              Entrega atrasada
            </span>
          </section>
        </div>

        <aside class="monthly-side-panel">
          <div class="monthly-export-card monthly-prompt-card">
            <Sparkles :size="16" />
            <div>
              <strong>Gerar por prompt</strong>
              <p>Descreva objetivos, entregas e restrições para a IA gerar e persistir o roadmap mensal.</p>
            </div>
            <textarea
              v-model="roadmapPrompt"
              class="monthly-control monthly-ai-prompt"
              rows="4"
              placeholder="Ex: planeje o roadmap do ano para lançar onboarding, billing e métricas..."
              :disabled="roadmapPromptLoading || !canEditMonthlyRoadmap"
            />
            <button
              class="monthly-export-btn press"
              :disabled="!roadmapPrompt.trim() || roadmapPromptLoading || !canEditMonthlyRoadmap"
              @click="generateRoadmapFromPrompt"
            >
              {{ roadmapPromptLoading ? 'Gerando...' : 'Gerar roadmap' }}
            </button>
          </div>

          <div class="monthly-export-card">
            <FileDown :size="16" />
            <div>
              <strong>Exportação</strong>
              <p>Escolha um mês ou exporte todos os calendários em uma versão limpa para PDF.</p>
            </div>
            <div class="monthly-select-wrap monthly-export-select">
              <AppSelect
                v-model="exportMonthKey"
                :items="exportMonthItems"
                label="Mês para exportar"
                density="compact"
              />
            </div>
            <button class="monthly-export-btn press" :disabled="!hasMonthlyPlans" @click="exportMonthlyPdf">Exportar PDF</button>
            <button class="monthly-export-btn press" :disabled="!hasMonthlyPlans || !canEditMonthlyRoadmap" @click="shareRoadmap">Compartilhar</button>
          </div>
        </aside>
      </section>

      <section v-if="monthlyLoadError" class="monthly-empty-state monthly-empty-state--error no-print">
        <Flag :size="22" />
        <div>
          <span class="text-eyebrow">Falha ao carregar</span>
          <h2>Não foi possível falar com a API do roadmap mensal</h2>
          <p>
            {{ monthlyLoadError }}
            <template v-if="hasMonthlyPlans">O que está na tela é a última carga bem-sucedida.</template>
          </p>
          <button class="monthly-filter-btn press" type="button" @click="fetchMonthlyRoadmap">
            Tentar de novo
          </button>
        </div>
      </section>

      <section
        v-else-if="!roadmapMonthlyLoading && !hasMonthlyPlans"
        class="monthly-empty-state"
      >
        <CalendarDays :size="22" />
        <div>
          <span class="text-eyebrow">Sem dados do roadmap mensal</span>
          <h2>Nenhum mês cadastrado para {{ roadmapStart.getFullYear() }}</h2>
          <p>
            A empresa ativa ainda não tem meses no roadmap mensal, e por isso a agenda acima fica
            indisponível. Os meses são criados no quadro do trimestre; assim que existir um, esta
            tela passa a aceitar itens de agenda.
          </p>
        </div>
      </section>

      <section v-if="hasMonthlyPlans" class="monthly-filter-bar no-print">
        <div>
          <span class="text-eyebrow">Filtro de meses</span>
          <p>
            {{
              showAllMonthlyPlans
                ? 'Mostrando todos os meses do ano.'
                : hiddenPastMonthsCount > 0
                  ? `${hiddenPastMonthsCount} meses anteriores ocultos.`
                  : 'Mostrando meses atuais e futuros.'
            }}
          </p>
        </div>
        <button
          v-if="hiddenPastMonthsCount > 0 || showAllMonthlyPlans"
          class="monthly-filter-btn press"
          type="button"
          @click="toggleAllMonthlyPlans"
        >
          {{ showAllMonthlyPlans ? 'Ocultar anteriores' : 'Ver todos' }}
        </button>
      </section>

      <section v-if="hasMonthlyPlans && !hasVisibleMonthlyPlans" class="monthly-empty-state">
        <CalendarDays :size="22" />
        <div>
          <span class="text-eyebrow">Todos os meses estão no passado</span>
          <h2>Nenhum mês atual ou futuro para exibir</h2>
          <p>Use "Ver todos" para consultar meses anteriores deste roadmap.</p>
        </div>
      </section>

      <div v-if="hasVisibleMonthlyPlans" class="months-grid">
        <article
          v-for="(month, index) in visibleMonthlyPlans"
          :key="month.key"
          class="month-card"
        >
          <header class="month-head">
            <span>Etapa {{ monthlyPlans.findIndex((item) => item.key === month.key) + 1 }} de {{ monthlyPlans.length }}</span>
            <div>
              <h2>{{ month.title }}</h2>
              <p>{{ month.main }}</p>
            </div>
            <div class="month-head-metrics" aria-label="Resumo do mes">
              <span>
                <strong>{{ monthMarkedDays(month) }}</strong>
                <small>datas</small>
              </span>
              <span>
                <strong>{{ monthItemsCount(month) }}</strong>
                <small>itens</small>
              </span>
              <span :class="{ 'month-head-metrics--danger': monthOverdueCount(month) > 0 }">
                <strong>{{ month.deliveries.length }}</strong>
                <small>entregas</small>
              </span>
              <span>
                <strong>{{ monthCategories(month).length }}</strong>
                <small>tipos</small>
              </span>
            </div>
          </header>

          <div class="month-card-body">
            <div class="mini-calendar" :aria-label="`Calendario de ${month.title}`">
              <div v-for="day in weekDays" :key="`${month.key}-${day}`" class="weekday">
                {{ day }}
              </div>
              <button
                v-for="cell in calendarCells(month)"
                :key="cell.key"
                class="day-cell"
                :class="{
                  'day-cell--empty': !cell.day,
                  'day-cell--marked': dayItemsCount(month, cell.date) > 0,
                  'day-cell--busy': dayItemsCount(month, cell.date) > 1,
                  'day-cell--overdue': dayHasOverdue(month, cell.date),
                }"
                :style="dayCellStyle(month, cell.date)"
                :title="dayCellLabel(month, cell.date)"
                :disabled="!cell.day || !dayItemsCount(month, cell.date)"
                :aria-label="dayCellLabel(month, cell.date)"
                @click="openDayDetails(month, cell.date)"
              >
                <span class="day-number">{{ cell.day }}</span>
                <span class="day-marks">
                  <i v-if="deliveriesForDate(month, cell.date).length" class="day-mark--delivery" />
                  <i v-if="entriesForDate(month, cell.date).length" class="day-mark--entry" />
                </span>
                <span v-if="dayItemsCount(month, cell.date) > 1" class="day-count">
                  {{ dayItemsCount(month, cell.date) }}
                </span>
              </button>
            </div>

            <section class="month-guidance">
              <div class="month-section-title">
                <Target :size="14" />
                Foco do mês
              </div>
              <ul>
                <li v-for="bullet in focusItemsForCard(month)" :key="bullet">{{ bullet }}</li>
                <li v-if="!isRoadmapPrinting && hiddenFocusItemsCount(month)" class="focus-more-item" @click="openMonthDetails(month.key)">
                  +{{ hiddenFocusItemsCount(month) }} focos
                </li>
              </ul>

              <div class="focus-photo-area">
                <div v-if="focusPhotosFor(month.key).length" class="focus-photo-grid">
                  <figure v-for="(photo, photoIndex) in visibleFocusPhotos(month.key)" :key="`${month.key}-photo-${photoIndex}`">
                    <img :src="photo" alt="Foto do foco do mes" />
                  </figure>
                  <button
                    v-if="hiddenFocusPhotosCount(month.key)"
                    class="focus-photo-more"
                    type="button"
                    @click="openMonthDetails(month.key)"
                  >
                    +{{ hiddenFocusPhotosCount(month.key) }}
                    <span>imagens</span>
                  </button>
                </div>
              </div>

              <div class="month-category-row" aria-label="Tipos de item do mes">
                <span
                  v-for="item in monthCategories(month)"
                  :key="`${month.key}-${item.category}`"
                  class="month-category-chip"
                  :style="{ '--entry-c': item.meta.tone }"
                >
                  <component :is="item.meta.icon" :size="11" />
                  {{ item.count }} {{ item.meta.label }}
                </span>
              </div>
            </section>

            <section
              class="month-entry-list"
              :aria-label="`Agenda de ${month.title}`"
            >
              <div class="month-section-title month-section-title--split">
                <span>
                  <CalendarClock :size="14" />
                  Agenda do mês
                </span>
                <small>{{ monthAgendaForCard(month).length }} de {{ monthItemsCount(month) }}</small>
              </div>
              <div class="month-entry-scroll">
                <article
                  v-for="item in monthAgendaForCard(month)"
                  :key="item.key"
                  class="month-entry"
                  :class="{ 'month-entry--delivery': item.kind === 'delivery' }"
                  :style="agendaItemStyle(item)"
                >
                  <span class="month-entry-date">{{ formatDayMonth(item.date) }}</span>
                  <span class="month-entry-dot" :class="{ 'month-entry-dot--delivery': item.kind === 'delivery' }" />
                  <div v-if="item.kind === 'entry'">
                    <strong>{{ item.entry.title }}</strong>
                    <small v-if="item.entry.description">{{ item.entry.description }}</small>
                  </div>
                  <button
                    v-else
                    class="month-entry-task"
                    type="button"
                    :aria-label="`Abrir a tarefa ${item.delivery.title}`"
                    @click="openDelivery(item.delivery)"
                  >
                    <strong>{{ item.delivery.title }}</strong>
                    <small>
                      <span class="month-entry-tag">Tarefa</span>
                      {{ deliveryStatusLabel(item.delivery) }}
                    </small>
                  </button>
                </article>
              </div>
              <button
                v-if="hiddenMonthAgendaCount(month)"
                class="month-entry-toggle press"
                type="button"
                @click="openMonthDetails(month.key)"
              >
                Ver mais {{ hiddenMonthAgendaCount(month) }} itens
              </button>
              <button
                v-else
                class="month-entry-toggle month-entry-toggle--ghost press"
                type="button"
                @click="openMonthDetails(month.key)"
              >
                Ver detalhes do mês
              </button>
            </section>
          </div>
        </article>
      </div>

      <section class="monthly-print-report" aria-label="Relatorio para PDF">
        <article
          v-for="(month, index) in printedMonthlyPlans"
          :key="`print-${month.key}`"
          class="print-month"
        >
          <header class="print-month-head">
            <div>
              <span>Roadmap mensal · etapa {{ monthlyPlans.findIndex((item) => item.key === month.key) + 1 }} de {{ monthlyPlans.length }}</span>
              <h2>{{ month.title }}</h2>
              <p>{{ month.main }}</p>
            </div>
            <div class="print-month-kpis" aria-label="Resumo do mes no PDF">
              <span>
                <strong>{{ monthMarkedDays(month) }}</strong>
                datas
              </span>
              <span>
                <strong>{{ monthItemsCount(month) }}</strong>
                itens
              </span>
              <span>
                <strong>{{ month.deliveries.length }}</strong>
                entregas
              </span>
              <span>
                <strong>{{ monthCategories(month).length }}</strong>
                tipos
              </span>
            </div>
          </header>

          <div class="print-month-grid">
            <section class="print-panel">
              <h3>Foco do mês</h3>
              <ul class="print-focus-list">
                <li v-for="bullet in focusItemsFor(month)" :key="`print-${month.key}-${bullet}`">
                  {{ bullet }}
                </li>
              </ul>
            </section>

            <section class="print-panel">
              <h3>Categorias</h3>
              <div class="print-category-list">
                <span
                  v-for="item in monthCategories(month)"
                  :key="`print-${month.key}-${item.category}`"
                  :style="{ '--entry-c': item.meta.tone }"
                >
                  {{ item.count }} {{ item.meta.label }}
                </span>
              </div>
            </section>
          </div>

          <section class="print-panel print-agenda-panel">
            <div class="print-section-head">
              <h3>Agenda completa</h3>
              <span>{{ monthItemsCount(month) }} itens</span>
            </div>
            <div class="print-entry-list">
              <article
                v-for="item in monthAgenda(month)"
                :key="`print-${month.key}-${item.key}`"
                class="print-entry"
                :style="agendaItemStyle(item)"
              >
                <span class="print-entry-date">{{ formatDayMonth(item.date) }}</span>
                <div v-if="item.kind === 'entry'">
                  <strong>{{ item.entry.title }}</strong>
                  <small v-if="item.entry.description">{{ item.entry.description }}</small>
                </div>
                <div v-else>
                  <strong>{{ item.delivery.title }}</strong>
                  <small>{{ deliveryStatusLabel(item.delivery) }}</small>
                </div>
                <em v-if="item.kind === 'entry'">{{ calendarCategoryMeta[item.entry.category].label }}</em>
                <em v-else>Tarefa</em>
              </article>
            </div>
          </section>

          <footer class="print-month-footer">
            <span>Workflow · Stack Roads</span>
            <span v-if="printedMonthlyPlans.length > 1">{{ index + 1 }} / {{ printedMonthlyPlans.length }}</span>
          </footer>
        </article>
      </section>

      <div v-if="selectedMonthDetails" class="month-drawer-layer no-print" role="dialog" aria-modal="true">
        <button class="month-drawer-backdrop" type="button" aria-label="Fechar detalhes" @click="closeMonthDetails" />

        <aside class="month-drawer">
          <header class="month-drawer-head">
            <div>
              <span class="text-eyebrow">Detalhes do mês</span>
              <h2>{{ selectedMonthDetails.title }}</h2>
              <p>{{ selectedMonthDetails.main }}</p>
            </div>
            <button class="month-drawer-close press" type="button" aria-label="Fechar detalhes" @click="closeMonthDetails">
              <X :size="18" />
            </button>
          </header>

          <section class="drawer-calendar-card" aria-label="Calendario completo do mes">
            <div class="drawer-calendar-summary">
              <span>
                <strong>{{ monthMarkedDays(selectedMonthDetails) }}</strong>
                datas marcadas
              </span>
              <span>
                <strong>{{ monthItemsCount(selectedMonthDetails) }}</strong>
                itens
              </span>
              <span>
                <strong>{{ selectedMonthDetails.deliveries.length }}</strong>
                entregas
              </span>
              <span>
                <strong>{{ monthCategories(selectedMonthDetails).length }}</strong>
                tipos
              </span>
            </div>

            <div class="mini-calendar drawer-calendar" :aria-label="`Calendario de ${selectedMonthDetails.title}`">
              <div v-for="day in weekDays" :key="`${selectedMonthDetails.key}-drawer-${day}`" class="weekday">
                {{ day }}
              </div>
              <button
                v-for="cell in calendarCells(selectedMonthDetails)"
                :key="`${cell.key}-drawer`"
                class="day-cell"
                :class="{
                  'day-cell--empty': !cell.day,
                  'day-cell--marked': dayItemsCount(selectedMonthDetails, cell.date) > 0,
                  'day-cell--busy': dayItemsCount(selectedMonthDetails, cell.date) > 1,
                  'day-cell--overdue': dayHasOverdue(selectedMonthDetails, cell.date),
                  'day-cell--active': !!cell.date && cell.date === selectedDayKey,
                }"
                :style="dayCellStyle(selectedMonthDetails, cell.date)"
                :title="dayCellLabel(selectedMonthDetails, cell.date)"
                :aria-label="dayCellLabel(selectedMonthDetails, cell.date)"
                :disabled="!cell.day || !dayItemsCount(selectedMonthDetails, cell.date)"
                @click="selectDrawerDay(cell.date)"
              >
                <span class="day-number">{{ cell.day }}</span>
                <span class="day-marks">
                  <i v-if="deliveriesForDate(selectedMonthDetails, cell.date).length" class="day-mark--delivery" />
                  <i v-if="entriesForDate(selectedMonthDetails, cell.date).length" class="day-mark--entry" />
                </span>
                <span v-if="dayItemsCount(selectedMonthDetails, cell.date) > 1" class="day-count">
                  {{ dayItemsCount(selectedMonthDetails, cell.date) }}
                </span>
              </button>
            </div>
          </section>

          <section class="drawer-section">
            <div class="month-section-title">
              <Target :size="14" />
              Foco do mês
            </div>
            <div v-if="canEditMonthlyRoadmap" class="drawer-focus-actions">
              <div class="focus-add-row">
                <input
                  class="focus-add-input"
                  type="text"
                  :value="focusDraftFor(selectedMonthDetails.key)"
                  placeholder="Novo foco do mês"
                  @input="setFocusDraft(selectedMonthDetails.key, ($event.target as HTMLInputElement).value)"
                  @keydown.enter.prevent="addFocusItem(selectedMonthDetails.key)"
                />
                <button class="focus-add-btn press" type="button" @click="addFocusItem(selectedMonthDetails.key)">
                  <Plus :size="13" />
                  Adicionar foco
                </button>
              </div>

              <label class="focus-photo-btn press">
                <ImagePlus :size="13" />
                Adicionar imagem
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  @change="handleFocusPhotoUpload(selectedMonthDetails.key, $event)"
                />
              </label>
            </div>
            <ul class="drawer-focus-list">
              <li
                v-for="(bullet, focusIndex) in focusItemsFor(selectedMonthDetails)"
                :key="`${selectedMonthDetails.key}-focus-${focusIndex}`"
              >
                <span>{{ bullet }}</span>
                <button
                  v-if="canEditMonthlyRoadmap"
                  type="button"
                  aria-label="Remover foco"
                  @click="removeFocusItem(selectedMonthDetails, focusIndex)"
                >
                  <X :size="12" />
                </button>
              </li>
            </ul>
            <div v-if="focusPhotosFor(selectedMonthDetails.key).length" class="drawer-photo-grid">
              <figure
                v-for="(photo, photoIndex) in focusPhotosFor(selectedMonthDetails.key)"
                :key="`${selectedMonthDetails.key}-drawer-photo-${photoIndex}`"
              >
                <img :src="photo" alt="Foto do foco do mes" />
                <button
                  v-if="canEditMonthlyRoadmap"
                  type="button"
                  aria-label="Remover foto"
                  @click="removeFocusPhoto(selectedMonthDetails.key, photoIndex)"
                >
                  <X :size="12" />
                </button>
              </figure>
            </div>
          </section>

          <section class="drawer-section">
            <div class="month-section-title">
              <CircleDot :size="14" />
              Categorias
            </div>
            <div class="month-category-row">
              <span
                v-for="item in monthCategories(selectedMonthDetails)"
                :key="`${selectedMonthDetails.key}-drawer-${item.category}`"
                class="month-category-chip"
                :style="{ '--entry-c': item.meta.tone }"
              >
                <component :is="item.meta.icon" :size="11" />
                {{ item.count }} {{ item.meta.label }}
              </span>
            </div>
          </section>

          <section class="drawer-section drawer-agenda">
            <div class="month-section-title month-section-title--split">
              <span>
                <CalendarClock :size="14" />
                {{ selectedDayKey ? `Agenda de ${formatDayMonth(selectedDayKey)}` : 'Agenda completa' }}
              </span>
              <small>{{ drawerAgenda.length }} de {{ monthItemsCount(selectedMonthDetails) }}</small>
            </div>
            <button
              v-if="selectedDayKey"
              class="drawer-day-clear press"
              type="button"
              @click="selectedDayKey = null"
            >
              <X :size="12" />
              Ver o mês inteiro
            </button>
            <article
              v-for="item in drawerAgenda"
              :key="`${selectedMonthDetails.key}-drawer-${item.key}`"
              class="month-entry drawer-entry"
              :class="{ 'month-entry--delivery': item.kind === 'delivery' }"
              :style="agendaItemStyle(item)"
            >
              <span class="month-entry-date">{{ formatDayMonth(item.date) }}</span>
              <span class="month-entry-dot" :class="{ 'month-entry-dot--delivery': item.kind === 'delivery' }" />
              <div v-if="item.kind === 'entry'">
                <strong>{{ item.entry.title }}</strong>
                <small v-if="item.entry.description">{{ item.entry.description }}</small>
              </div>
              <button
                v-else
                class="month-entry-task"
                type="button"
                :aria-label="`Abrir a tarefa ${item.delivery.title}`"
                @click="openDelivery(item.delivery)"
              >
                <strong>{{ item.delivery.title }}</strong>
                <small>
                  <span class="month-entry-tag">Tarefa</span>
                  {{ deliveryStatusLabel(item.delivery) }}
                  <template v-if="item.delivery.responsibles.length">
                    · {{ item.delivery.responsibles.join(', ') }}
                  </template>
                </small>
              </button>
              <button
                v-if="canEditMonthlyRoadmap && item.kind === 'entry'"
                class="drawer-entry-remove"
                type="button"
                aria-label="Remover item da agenda"
                @click="removeMonthEntry(selectedMonthDetails, item.entry)"
              >
                <X :size="12" />
              </button>
            </article>
            <p v-if="!drawerAgenda.length" class="monthly-readonly-hint">
              Nenhum item nesta seleção.
            </p>
          </section>

          <CommentsPanel
            v-if="selectedMonthDetails.id"
            entity-type="ROADMAP_MONTH"
            :entity-id="selectedMonthDetails.id"
            title="Comentários do mês"
            compact
          />
        </aside>
      </div>
    </template>

    <section v-if="roadmapMode === 'timeline'" class="interaction-grid" aria-label="Controles do roadmap">
      <div class="controls-card">
        <div class="controls-intro">
          <div>
            <span class="text-eyebrow">Como usar</span>
            <h2>Explore as entregas do ano por trimestre e status</h2>
          </div>
          <p>
            Cada barra é uma atividade posicionada pela data de entrega. Clique nela para ver prazo,
            responsáveis e progresso no painel ao lado.
          </p>
        </div>

        <div class="annual-summary" aria-label="Resumo das entregas do ano">
          <span>
            <strong>{{ annualTotals.scheduled }}</strong>
            <small>com data</small>
          </span>
          <span :class="{ 'annual-summary--warn': annualTotals.undated > 0 }">
            <strong>{{ annualTotals.undated }}</strong>
            <small>sem data</small>
          </span>
          <span :class="{ 'annual-summary--danger': annualTotals.overdue > 0 }">
            <strong>{{ annualTotals.overdue }}</strong>
            <small>atrasadas</small>
          </span>
          <span>
            <strong>{{ annualTotals.completed }}</strong>
            <small>concluídas</small>
          </span>
        </div>

        <p v-if="annualTotals.undated > 0" class="annual-undated-note">
          {{ annualTotals.undated }} atividade(s) não têm data de entrega e por isso não aparecem na
          timeline. Defina o prazo no quadro para elas entrarem aqui.
        </p>

        <div class="controls-row">
          <div class="control-group">
            <span class="control-label">Visão</span>
            <div class="segmented">
              <button
                class="segmented-btn"
                :class="{ 'segmented-btn--active': annualViewMode === 'delivery' }"
                @click="annualViewMode = 'delivery'"
              >
                Por entrega
              </button>
              <button
                class="segmented-btn"
                :class="{ 'segmented-btn--active': annualViewMode === 'month' }"
                @click="annualViewMode = 'month'"
              >
                Por mês
              </button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Trimestre</span>
            <div class="segmented">
              <button
                class="segmented-btn"
                :class="{ 'segmented-btn--active': activeQuarter === 'all' }"
                @click="activeQuarter = 'all'"
              >
                Ano
              </button>
              <button
                v-for="quarter in quarters"
                :key="quarter.label"
                class="segmented-btn"
                :class="{ 'segmented-btn--active': activeQuarter === quarter.label }"
                @click="activeQuarter = quarter.label"
              >
                {{ quarter.label }}
              </button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Área</span>
            <AppSelect
              v-model="activeLaneId"
              :items="laneFilterItems"
              label="Filtrar por área"
              density="compact"
            />
          </div>

          <div class="control-group">
            <span class="control-label">Status</span>
            <AppSelect
              :model-value="activeStatus"
              :items="statusFilterItems"
              label="Filtrar por status"
              density="compact"
              @update:model-value="activeStatus = $event as StatusFilter"
            />
          </div>

          <button
            class="ghost-btn"
            :class="{ 'ghost-btn--active': onlyOverdue }"
            :disabled="annualViewMode === 'month'"
            @click="onlyOverdue = !onlyOverdue"
          >
            Só atrasadas
          </button>

          <button class="ghost-btn" @click="resetFilters">Limpar filtros</button>
        </div>

        <section class="milestone-composer" aria-label="Marcos e reviews">
          <div class="milestone-composer-head">
            <span>
              <Flag :size="14" />
              Marcos e reviews
              <small>{{ annualMilestones.length }} na timeline</small>
            </span>
            <button
              v-if="canEditRoadmap"
              class="ghost-btn"
              type="button"
              @click="milestoneFormOpen = !milestoneFormOpen"
            >
              {{ milestoneFormOpen ? 'Cancelar' : 'Novo marco' }}
            </button>
          </div>

          <div v-if="milestoneFormOpen && canEditRoadmap" class="milestone-composer-form">
            <input
              v-model="milestoneDraft.title"
              type="text"
              class="monthly-control monthly-control--text"
              placeholder="Ex: lançamento da versão 2"
              @keydown.enter.prevent="createMilestone"
            />
            <input v-model="milestoneDraft.date" type="date" class="monthly-control" aria-label="Data do marco" />
            <div class="monthly-select-wrap">
              <AppSelect
                :model-value="milestoneDraft.type"
                :items="milestoneTypeItems"
                label="Tipo"
                density="compact"
                @update:model-value="milestoneDraft.type = $event as RoadmapMilestoneType"
              />
            </div>
            <div class="monthly-select-wrap">
              <AppSelect
                :model-value="milestoneDraft.quarterId"
                :items="milestoneQuarterItems"
                label="Trimestre"
                density="compact"
                @update:model-value="milestoneDraft.quarterId = String($event ?? '')"
              />
            </div>
            <button
              class="monthly-add-btn press"
              :disabled="!milestoneDraft.title.trim() || !milestoneDraft.date || milestoneSaving"
              @click="createMilestone"
            >
              <Plus :size="14" />
              {{ milestoneSaving ? 'Salvando...' : 'Adicionar' }}
            </button>
          </div>
        </section>
      </div>

      <aside class="detail-card" aria-live="polite">
        <template v-if="selected">
          <div class="detail-head">
            <span class="detail-type">
              {{
                selected.type === 'item'
                  ? 'Atividade'
                  : selected.value.type === 'review'
                    ? 'Review'
                    : 'Marco'
              }}
            </span>
            <span v-if="selectedStatus" class="detail-status">
              <component :is="selectedStatus.icon" :size="12" />
              {{ selectedStatus.label }}
            </span>
          </div>
          <h2>{{ selected.value.title }}</h2>
          <p v-if="selectedLane">{{ selectedLane.title }}</p>
          <dl class="detail-list">
            <div v-if="selected.type === 'item' && selected.value.kind === 'month'">
              <dt>Período</dt>
              <dd>{{ formatDate(selected.value.start) }} a {{ formatDate(selected.value.end) }}</dd>
            </div>
            <div v-else-if="selected.type === 'item'">
              <dt>Entrega</dt>
              <dd :class="{ 'detail-overdue': selected.value.overdue }">
                {{ selected.value.dueDate ? formatDate(selected.value.dueDate) : 'Sem data' }}
                <small>{{ dueLabel(selected.value) }}</small>
              </dd>
            </div>
            <div v-else-if="selected.type === 'milestone'">
              <dt>Data</dt>
              <dd>{{ formatDate(selected.value.date) }}</dd>
            </div>
            <div v-if="selected.type === 'item' && selected.value.assignees?.length">
              <dt>Responsáveis</dt>
              <dd>{{ selected.value.assignees?.join(', ') }}</dd>
            </div>
            <div v-if="selected.type === 'item'">
              <dt>Progresso</dt>
              <dd>{{ selected.value.progress }}%</dd>
            </div>
            <div v-if="selected.type === 'item' && selected.value.kind === 'month'">
              <dt>Atividades</dt>
              <dd>
                {{ selected.value.scheduledCount ?? 0 }} com data
                <template v-if="selected.value.undatedCount">
                  · {{ selected.value.undatedCount }} sem data
                </template>
              </dd>
            </div>
          </dl>
          <button
            v-if="selected.type === 'milestone' && canEditRoadmap"
            class="ghost-btn ghost-btn--danger"
            type="button"
            @click="removeSelectedMilestone"
          >
            Remover marco
          </button>
        </template>
        <template v-else>
          <div class="detail-empty">
            <Milestone :size="22" />
            <h2>Selecione uma atividade</h2>
            <p v-if="annualItems.length || annualMilestones.length">Clique em uma barra ou marco do roadmap para ver mais informações aqui.</p>
            <p v-else>A timeline anual ainda não possui dados para detalhar.</p>
          </div>
        </template>
      </aside>
    </section>

    <section v-if="roadmapMode === 'timeline' && annualRoadmapLoading" class="monthly-empty-state">
      <CalendarClock :size="22" />
      <div>
        <span class="text-eyebrow">Sincronizando timeline</span>
        <h2>Carregando roadmap anual</h2>
        <p>Buscando os dados reais da API para montar a timeline anual.</p>
      </div>
    </section>

    <EmptyState
      v-else-if="roadmapMode === 'timeline' && !annualLanes.length"
      :icon="Milestone"
      title="Nenhum trimestre cadastrado"
      description="A empresa ativa ainda não tem trimestres nem atividades. Crie o quadro do mês e as entregas aparecem aqui."
    />

    <EmptyState
      v-else-if="roadmapMode === 'timeline' && !hasTimelineContent"
      :icon="CalendarClock"
      :title="annualTotals.undated > 0 ? 'Nenhuma entrega tem data' : 'Nenhuma entrega cadastrada'"
      :description="
        annualTotals.undated > 0
          ? `Existem ${annualTotals.undated} atividade(s) na empresa ativa, mas nenhuma tem data de entrega. A timeline só posiciona o que tem prazo definido.`
          : 'Assim que as atividades da empresa ativa ganharem data de entrega, elas aparecem posicionadas aqui.'
      "
    />

    <div v-else-if="roadmapMode === 'timeline'" class="roadmap-shell">
      <div class="roadmap-scroll" role="region" aria-label="Linha do tempo do roadmap" tabindex="0">
        <div class="roadmap-board">
          <div class="board-header">
            <div class="side-header">Trimestre</div>
            <div class="meta-header">Responsáveis</div>
            <div class="meta-header">Status</div>
            <div class="timeline-header">
              <div
                v-for="quarter in visibleQuarters"
                :key="quarter.label"
                class="quarter-cell"
              >
                <span>{{ quarter.label }}</span>
                <small>{{ quarter.period }}</small>
              </div>
              <div v-if="todayInViewport" class="timeline-today-flag" :style="todayStyle">
                <span>Hoje</span>
              </div>
            </div>
          </div>

          <div
            v-for="lane in visibleLanes"
            :key="lane.id"
            class="lane-row"
            :style="{ '--lane-color': lane.color }"
          >
            <div class="lane-title">
              <div class="lane-icon">
                <component :is="lane.icon" :size="18" />
              </div>
              <div>
                <strong>{{ lane.title }}</strong>
                <span>{{ lane.description }}</span>
              </div>
            </div>

            <div class="lane-owner">{{ lane.owner }}</div>

            <div class="lane-status" :class="`lane-status--${lane.status}`">
              <component :is="statusMeta[lane.status].icon" :size="13" />
              {{ statusMeta[lane.status].label }}
            </div>

            <div class="timeline-cell" :style="laneCellStyle(lane.id)">
              <div class="timeline-grid" aria-hidden="true" />
              <div v-if="todayInViewport" class="timeline-today" :style="todayStyle" aria-hidden="true" />

              <article
                v-for="item in laneItems(lane.id)"
                :key="item.id"
                class="roadmap-bar"
                :class="[
                  `roadmap-bar--${item.status}`,
                  { 'roadmap-bar--event': item.kind === 'event' },
                  { 'roadmap-bar--month': item.kind === 'month' },
                  { 'roadmap-bar--overdue': item.overdue },
                  { 'roadmap-bar--point': isPointItem(item) },
                  { 'roadmap-bar--selected': isSelected('item', item.id) },
                ]"
                :style="laneItemStyle(item, lane.id)"
                :aria-label="
                  item.kind === 'month'
                    ? `${item.title}: ${item.progress}% concluído`
                    : `${item.title}. ${dueLabel(item)}`
                "
                role="button"
                tabindex="0"
                @click="selectItem(item)"
                @keydown.enter.prevent="selectItem(item)"
                @keydown.space.prevent="selectItem(item)"
              >
                <span class="bar-progress" :style="{ width: `${item.progress}%` }" />
                <span class="bar-label">{{ item.shortTitle ?? item.title }}</span>
                <small v-if="item.kind === 'month' && item.progress > 0">{{ item.progress }}%</small>
                <small v-else-if="item.overdue" class="bar-overdue">atrasada</small>
              </article>

              <div
                v-for="milestone in laneMilestones(lane.id)"
                :key="milestone.id"
                class="milestone-pin"
                :class="[
                  `milestone-pin--${milestone.status}`,
                  `milestone-pin--${milestone.type}`,
                  { 'milestone-pin--selected': isSelected('milestone', milestone.id) },
                ]"
                :style="laneMilestoneStyle(milestone, lane.id)"
                role="button"
                tabindex="0"
                :aria-label="`${milestone.type === 'review' ? 'Review' : 'Marco'}: ${milestone.title} (${formatDate(milestone.date)})`"
                @click="selectMilestone(milestone)"
                @keydown.enter.prevent="selectMilestone(milestone)"
                @keydown.space.prevent="selectMilestone(milestone)"
              >
                <component :is="milestone.type === 'review' ? CalendarCheck : Flag" :size="11" class="milestone-icon" />
                <span class="milestone-label">{{ milestone.title }}</span>
                <span class="milestone-date">{{ formatDate(milestone.date) }}</span>
              </div>
            </div>
          </div>

          <div v-if="hasFloatingMilestones" class="lane-row lane-row--markers" :style="{ '--lane-color': 'var(--accent)' }">
            <div class="lane-title">
              <div class="lane-icon">
                <Milestone :size="18" />
              </div>
              <div>
                <strong>Marcos &amp; reviews</strong>
                <span>Eventos pontuais ancorados por data</span>
              </div>
            </div>

            <div class="lane-owner">{{ floatingMilestones.length }} itens</div>

            <div class="lane-status lane-status--planned">
              <Flag :size="13" />
              No eixo
            </div>

            <div class="timeline-cell" :style="floatingCellStyle">
              <div class="timeline-grid" aria-hidden="true" />
              <div v-if="todayInViewport" class="timeline-today" :style="todayStyle" aria-hidden="true" />

              <div
                v-for="milestone in floatingMilestones"
                :key="milestone.id"
                class="milestone-pin"
                :class="[
                  `milestone-pin--${milestone.status}`,
                  `milestone-pin--${milestone.type}`,
                  { 'milestone-pin--selected': isSelected('milestone', milestone.id) },
                ]"
                :style="floatingMilestoneStyle(milestone)"
                role="button"
                tabindex="0"
                :aria-label="`${milestone.type === 'review' ? 'Review' : 'Marco'}: ${milestone.title} (${formatDate(milestone.date)})`"
                @click="selectMilestone(milestone)"
                @keydown.enter.prevent="selectMilestone(milestone)"
                @keydown.space.prevent="selectMilestone(milestone)"
              >
                <component :is="milestone.type === 'review' ? CalendarCheck : Flag" :size="11" class="milestone-icon" />
                <span class="milestone-label">{{ milestone.title }}</span>
                <span class="milestone-date">{{ formatDate(milestone.date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer v-if="roadmapMode === 'timeline'" class="roadmap-note">
      <CircleDot :size="14" />
      <span v-if="annualRoadmapUnavailable">
        API da timeline anual indisponível. O que está na tela pode estar desatualizado.
      </span>
      <span v-else-if="annualViewMode === 'month'">
        Visão agregada: cada barra cobre o mês inteiro e mostra o percentual de tarefas concluídas.
      </span>
      <span v-else>
        Cada barra é uma entrega posicionada pela data real da atividade.
        <template v-if="overdueItems.length">
          {{ overdueItems.length }} em atraso.
        </template>
      </span>
    </footer>
  </section>
</template>

<style scoped>
.roadmap-page {
  min-height: 100%;
  padding: 28px;
  color: var(--text);
}

.roadmap-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 20px;
  align-items: stretch;
  margin-bottom: 18px;
}

.hero-copy,
.hero-card,
.roadmap-shell,
.roadmap-note,
.summary-card {
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.hero-copy {
  border-radius: var(--radius-xl);
  padding: 24px;
  position: relative;
  overflow: hidden;
}

.hero-copy::after {
  content: '';
  position: absolute;
  inset: auto 24px -70px auto;
  width: 210px;
  height: 210px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  filter: blur(40px);
  pointer-events: none;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--accent);
}

.hero-title {
  margin: 10px 0 8px;
  letter-spacing: -0.04em;
}

.hero-description {
  max-width: 680px;
  color: var(--text-2);
  margin: 0;
}

.hero-card {
  border-radius: var(--radius-xl);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.hero-card-label,
.summary-card span,
.roadmap-note {
  color: var(--text-3);
}

.hero-card strong {
  font-size: 38px;
  line-height: 1;
  letter-spacing: -0.06em;
}

.hero-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.hero-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 30%, var(--text)));
}

.hero-card small {
  color: var(--text-4);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-card {
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
}

.summary-card svg {
  color: var(--accent);
}

.summary-card strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.interaction-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
  margin-bottom: 18px;
}

.controls-card,
.detail-card {
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.controls-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 16px;
}

.controls-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.controls-intro h2 {
  margin: 6px 0 0;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.03em;
}

.controls-intro p {
  max-width: 520px;
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.55;
}

.controls-row {
  display: flex;
  align-items: end;
  gap: 14px;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.control-label {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.segmented-btn,
.ghost-btn {
  font-family: inherit;
  font-size: 12.5px;
}

.segmented-btn,
.ghost-btn {
  border: none;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.segmented-btn {
  min-width: 46px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  color: var(--text-3);
  background: transparent;
  font-weight: 700;
}

.segmented-btn:hover,
.segmented-btn--active {
  background: var(--surface);
  color: var(--text);
}

.control-group :deep(.app-select__trigger) {
  min-width: 178px;
}

.ghost-btn {
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--border);
  font-weight: 700;
}

.ghost-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.detail-card {
  padding: 16px;
  min-height: 138px;
}

.detail-empty {
  min-height: 106px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.detail-empty svg {
  color: var(--accent);
  margin-bottom: 10px;
}

.detail-head,
.detail-status {
  display: flex;
  align-items: center;
  gap: 7px;
}

.detail-head {
  justify-content: space-between;
  margin-bottom: 8px;
}

.detail-type {
  color: var(--accent);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-status {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
}

.detail-card h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.03em;
}

.detail-card p {
  margin: 5px 0 12px;
  color: var(--text-3);
  font-size: 12.5px;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.detail-list div {
  padding: 9px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.detail-list dt {
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-list dd {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.roadmap-shell {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.roadmap-scroll {
  overflow-x: auto;
  scrollbar-width: thin;
}

.roadmap-board {
  min-width: 1240px;
  position: relative;
}

.board-header,
.lane-row {
  display: grid;
  grid-template-columns: 180px 90px 90px minmax(880px, 1fr);
}

.board-header {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.side-header,
.meta-header {
  min-height: 78px;
  display: flex;
  align-items: flex-end;
  padding: 0 12px 12px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timeline-header {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: end;
  padding-top: 34px;
}

.quarter-cell {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  background: color-mix(in srgb, var(--accent) 34%, var(--surface-3));
  border-right: 1px solid color-mix(in srgb, var(--surface) 55%, transparent);
}

.quarter-cell:first-child {
  border-top-left-radius: var(--radius-sm);
}

.quarter-cell:last-child {
  border-right: none;
  border-top-right-radius: var(--radius-sm);
}

.quarter-cell span {
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
}

.quarter-cell small {
  color: var(--text-3);
  font-weight: 700;
}

.lane-row {
  min-height: 132px;
  border-bottom: 1px solid var(--border);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--lane-color) 16%, transparent),
      color-mix(in srgb, var(--lane-color) 7%, transparent)
    );
}

.lane-row:last-child {
  border-bottom: none;
}

.lane-title {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 18px 14px;
  background: color-mix(in srgb, var(--lane-color) 22%, var(--surface));
  border-right: 1px solid var(--border);
}

.lane-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  background: color-mix(in srgb, var(--lane-color) 28%, transparent);
  flex-shrink: 0;
}

.lane-title strong {
  display: block;
  font-size: 13px;
  line-height: 1.2;
}

.lane-title span {
  display: block;
  margin-top: 4px;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.35;
}

.lane-owner,
.lane-status {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-right: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}

.lane-status {
  gap: 6px;
  font-weight: 700;
}

.lane-status--done {
  color: var(--success);
}

.lane-status--active {
  color: var(--accent);
}

.lane-status--planned {
  color: var(--text-3);
}

.lane-status--risk {
  color: var(--warn);
}

.timeline-cell {
  position: relative;
  min-height: 132px;
  overflow: hidden;
}

.timeline-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to right, color-mix(in srgb, var(--border) 85%, transparent) 1px, transparent 1px) 0 0 / 25% 100%,
    linear-gradient(to right, color-mix(in srgb, var(--border) 42%, transparent) 1px, transparent 1px) 0 0 / calc(100% / 12) 100%;
  opacity: 0.85;
}

.roadmap-bar {
  position: absolute;
  /* `top` vem do packing (laneItemStyle); o fallback evita salto antes do JS. */
  top: 12px;
  min-width: 44px;
  height: 26px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lane-color) 68%, var(--surface));
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--lane-color) 55%, var(--border));
  transition:
    transform var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.roadmap-bar:hover,
.roadmap-bar:focus-visible {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--lane-color) 78%, var(--surface));
  border-color: color-mix(in srgb, var(--text) 38%, var(--lane-color));
  outline: none;
}

.roadmap-bar--event {
  height: 18px;
  border-radius: var(--radius-sm);
  padding-inline: 8px;
}

/* Entrega de dia único: largura do conteúdo, título legível (não "Ent"). */
.roadmap-bar--point {
  min-width: 0;
  width: auto;
}

.roadmap-bar--point .bar-label {
  min-width: 0;
  text-overflow: ellipsis;
}

.roadmap-bar--planned {
  background: color-mix(in srgb, var(--lane-color) 24%, var(--surface-3));
  color: var(--text-2);
  border-style: dashed;
}

.roadmap-bar--done {
  background: color-mix(in srgb, var(--success) 54%, var(--surface));
  border-color: color-mix(in srgb, var(--success) 58%, var(--border));
}

.roadmap-bar--risk {
  background: color-mix(in srgb, var(--warn) 50%, var(--surface));
  border-color: color-mix(in srgb, var(--warn) 58%, var(--border));
}

.roadmap-bar--selected {
  border-color: var(--text);
  outline: 2px solid color-mix(in srgb, var(--text) 18%, transparent);
  outline-offset: 2px;
}

.bar-progress {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--text) 10%, transparent);
  pointer-events: none;
}

.bar-label,
.roadmap-bar small {
  position: relative;
  z-index: 1;
  overflow: hidden;
}

.bar-label {
  min-width: 3ch;
  text-overflow: clip;
}

.roadmap-bar small {
  text-overflow: ellipsis;
}

.roadmap-bar small {
  margin-left: auto;
  color: var(--text-2);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.milestone-pin {
  position: absolute;
  /* `top` vem do packing (laneMilestoneStyle). */
  top: 12px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
  z-index: 2;
  cursor: pointer;
}

/* Rótulo do marco: cabe em 2 linhas curtas em vez de estourar numa só. */
.milestone-label {
  max-width: 120px;
  text-align: center;
  white-space: normal;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.milestone-pin:focus-visible {
  outline: none;
}

.milestone-pin::after {
  content: '';
  width: 15px;
  height: 15px;
  transform: rotate(45deg);
  border-radius: 3px;
  background: var(--surface);
  border: 3px solid var(--lane-color);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.milestone-pin:hover::after,
.milestone-pin:focus-visible::after,
.milestone-pin--selected::after {
  transform: rotate(45deg) scale(1.18);
}

/* Tipo: marco normal usa o acento; review usa um marcador distinto (info/warn). */
.milestone-pin--milestone::after {
  border-color: var(--accent);
}

.milestone-pin--review::after {
  /* Review é renderizado como um marcador circular (não-diamante) na cor info. */
  border-radius: 50%;
  transform: rotate(0deg);
  border-color: var(--info);
  background: color-mix(in srgb, var(--info) 16%, var(--surface));
}

.milestone-pin--review:hover::after,
.milestone-pin--review:focus-visible::after,
.milestone-pin--review.milestone-pin--selected::after {
  transform: rotate(0deg) scale(1.18);
}

.milestone-pin--review .milestone-label {
  color: var(--info);
}

/* Status mantém prioridade visual sobre o tipo (concluído/atenção). */
.milestone-pin--done::after {
  border-color: var(--success);
}

.milestone-pin--risk::after {
  border-color: var(--warn);
}

.milestone-pin--review.milestone-pin--risk::after {
  border-color: var(--warn);
  background: color-mix(in srgb, var(--warn) 16%, var(--surface));
}

.milestone-icon {
  color: var(--lane-color);
}

.milestone-pin--review .milestone-icon {
  color: var(--info);
}

/* Faixa dedicada para marcos/reviews sem âncora de área (quarterId opcional). */
.lane-row--markers {
  border-top: 1px dashed var(--border);
}

.lane-row--markers .lane-title strong {
  color: var(--accent);
}

.milestone-date {
  color: var(--text-4);
  font-weight: 700;
}

.roadmap-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  font-size: 12.5px;
}

.roadmap-mode-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.mode-btn {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 800;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.mode-btn:hover,
.mode-btn--active {
  background: var(--surface-2);
  color: var(--text);
}

.monthly-help-btn {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 850;
  box-shadow: var(--shadow-sm);
}

.monthly-help-btn svg {
  color: var(--accent);
}

.monthly-help-modal-layer {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: grid;
  place-items: center;
  padding: 18px;
}

.monthly-help-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: color-mix(in srgb, var(--bg) 68%, transparent);
  cursor: pointer;
}

.monthly-help-modal {
  position: relative;
  width: min(720px, 100%);
  max-height: min(760px, calc(100dvh - 36px));
  overflow-y: auto;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}

.monthly-help-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: start;
  margin-bottom: 16px;
}

.monthly-help-head h2 {
  margin: 6px 0 7px;
  color: var(--text);
  font-size: clamp(22px, 3vw, 32px);
  line-height: 1;
  letter-spacing: -0.06em;
}

.monthly-help-head p {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.55;
}

.monthly-help-close {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}

.monthly-help-steps {
  display: grid;
  gap: 10px;
}

.monthly-help-steps article {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 12px;
  padding: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.monthly-help-steps article > span {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 950;
}

.monthly-help-steps strong {
  display: block;
  color: var(--text);
  font-size: 13.5px;
}

.monthly-help-steps p {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.55;
}

.monthly-overview,
.monthly-workbench,
.month-card {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.monthly-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
  gap: 18px;
  align-items: stretch;
  margin-bottom: 16px;
  padding: 18px;
  border-radius: var(--radius-xl);
}

.monthly-overview-copy h2 {
  max-width: 720px;
  margin: 6px 0 8px;
  color: var(--text);
  font-size: clamp(22px, 3vw, 34px);
  line-height: 1.04;
  letter-spacing: -0.06em;
}

.monthly-overview-copy p {
  max-width: 720px;
  margin: 0;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.65;
}

.monthly-howto {
  display: grid;
  gap: 10px;
}

.monthly-howto article {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 4px 10px;
  align-items: center;
  padding: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.monthly-howto span {
  grid-row: span 2;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 900;
}

.monthly-howto strong {
  color: var(--text);
  font-size: 13px;
}

.monthly-howto small,
.monthly-stat small {
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.4;
}

.monthly-summary-grid {
  margin-bottom: 16px;
}

.monthly-stat {
  min-height: 126px;
}

.monthly-stat strong {
  margin-bottom: 2px;
}

.monthly-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 420px);
  gap: 18px;
  align-items: start;
  margin-bottom: 18px;
  padding: 14px;
  border-radius: var(--radius-xl);
}

.monthly-note-panel {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(360px, 1.1fr);
  gap: 16px;
  align-items: start;
  padding: 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.monthly-note-head {
  display: flex;
  grid-column: 1 / -1;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.monthly-note-title {
  min-width: 0;
}

.roadmap-data-source {
  margin-left: 8px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.monthly-note-title p {
  max-width: 720px;
}

.monthly-help-row {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding-top: 0;
}

.monthly-note-panel h2 {
  margin: 5px 0 6px;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.04em;
}

.monthly-note-panel p,
.monthly-export-card p {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
}

.monthly-readonly-hint {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.monthly-action-context {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.monthly-action-context article {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: start;
  min-height: 72px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.monthly-action-context svg {
  margin-top: 1px;
  color: var(--accent);
}

.monthly-action-context div {
  min-width: 0;
}

.monthly-action-context span {
  display: block;
  margin-bottom: 3px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.monthly-action-context strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.monthly-note-form {
  display: grid;
  grid-template-columns: minmax(150px, 0.85fr) minmax(150px, 0.85fr);
  gap: 12px;
  align-content: start;
}

.monthly-note-form .monthly-control--text {
  grid-column: 1 / -1;
}

.monthly-note-form .monthly-add-btn {
  grid-column: 1 / -1;
  justify-self: end;
  min-width: 132px;
}

.monthly-control {
  height: 40px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  padding: 0 34px 0 11px;
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}

.monthly-select-wrap {
  min-width: 0;
}

.monthly-control:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.monthly-ai-prompt {
  min-height: 96px;
  height: auto;
  resize: vertical;
  padding: 10px 12px;
  line-height: 1.45;
}

.monthly-add-btn,
.monthly-export-btn {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 9px 15px;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--accent) 72%, transparent);
  background: var(--accent);
  color: var(--accent-fg);
  cursor: pointer;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 800;
}

.monthly-add-btn:disabled,
.monthly-export-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.monthly-side-panel {
  display: grid;
  gap: 14px;
  align-content: start;
}

.monthly-export-card,
.monthly-legend {
  padding: 14px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.monthly-export-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: start;
}

.monthly-export-card > svg {
  color: var(--accent);
}

.monthly-export-card strong,
.monthly-legend > strong {
  color: var(--text);
  font-size: 12.5px;
}

.monthly-export-btn {
  grid-column: 1 / -1;
  background: var(--surface);
  color: var(--text);
  border-color: var(--border);
}

.monthly-export-card .monthly-export-btn + .monthly-export-btn {
  margin-top: -4px;
}

.monthly-export-select {
  grid-column: 1 / -1;
  width: 100%;
}

.monthly-legend {
  grid-column: 1 / -1;
}

.monthly-note-panel .monthly-legend {
  margin-top: 2px;
  background: var(--surface);
}

.monthly-prompt-card {
  grid-template-columns: 1fr;
}

.monthly-prompt-card > svg {
  display: inline-block;
  width: 18px;
  height: 18px;
  margin-bottom: -4px;
  color: var(--accent);
}

.monthly-prompt-card > div {
  display: grid;
  gap: 4px;
}

.monthly-prompt-card > div::before {
  content: none;
}

.monthly-prompt-card .monthly-ai-prompt {
  min-height: 118px;
  grid-column: auto;
  width: 100%;
}

.monthly-prompt-card .monthly-export-btn {
  min-height: 44px;
  grid-column: auto;
}

.monthly-legend {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.monthly-legend-item,
.month-category-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  color: var(--entry-c);
  background: color-mix(in srgb, var(--entry-c) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--entry-c) 24%, transparent);
  font-size: 11px;
  font-weight: 800;
}

.monthly-empty-state {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: start;
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.monthly-empty-state > svg {
  color: var(--accent);
}

.monthly-empty-state h2 {
  margin: 5px 0 6px;
  color: var(--text);
  font-size: 20px;
  letter-spacing: -0.04em;
}

.monthly-empty-state p {
  max-width: 760px;
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.6;
}

.monthly-legend-item {
  padding: 5px 8px;
}

.monthly-legend-item--delivery {
  --entry-c: var(--accent);
  border-radius: var(--radius-sm);
}

.monthly-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.monthly-filter-bar p {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.monthly-filter-btn {
  min-height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  padding: 8px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
}

.monthly-filter-btn:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.months-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.month-card {
  overflow: hidden;
  border-radius: var(--radius-xl);
}

.month-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: end;
  padding: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent 55%),
    var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.month-head > span {
  grid-column: 1 / -1;
  color: var(--accent);
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.month-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 24px;
  line-height: 1;
  letter-spacing: -0.06em;
}

.month-head p {
  max-width: 540px;
  margin: 7px 0 0;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
}

.month-head-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(44px, auto));
  gap: 8px;
  align-items: stretch;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}

.month-head-metrics span {
  display: grid;
  gap: 3px;
  text-align: center;
}

.month-head-metrics strong {
  color: var(--text);
  font-size: 18px;
  line-height: 1;
}

.month-head-metrics small {
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
}

.month-head-metrics--danger strong,
.month-head-metrics--danger small {
  color: var(--err);
}

.month-card-body {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1fr);
  gap: 14px;
  padding: 14px;
}

.mini-calendar {
  align-self: start;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.weekday {
  min-height: 32px;
  display: grid;
  place-items: center;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.05em;
}

.weekday:nth-child(7n),
.day-cell:nth-child(7n) {
  border-right: none;
}

.day-cell {
  position: relative;
  min-height: 42px;
  border: none;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 800;
}

.day-cell:not(:disabled) {
  cursor: pointer;
}

.day-cell:not(:disabled):hover {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--entry-c, var(--accent)) 62%, transparent);
}

.day-cell--active {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.day-number {
  position: absolute;
  top: 7px;
  left: 8px;
}

.day-cell--empty {
  background: color-mix(in srgb, var(--surface-2) 42%, transparent);
}

.day-cell--marked {
  background: color-mix(in srgb, var(--entry-c) 16%, var(--surface));
  color: var(--text);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--entry-c) 38%, transparent);
}

.day-cell--busy {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--entry-c) 22%, transparent), transparent 58%),
    color-mix(in srgb, var(--entry-c) 12%, var(--surface));
}

/* Dia com entrega atrasada: o contorno vermelho tem que gritar mais que o tipo. */
.day-cell--overdue {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--err) 55%, transparent);
}

.day-marks {
  position: absolute;
  left: 7px;
  bottom: 7px;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* Anotação manual é bolinha; entrega de tarefa é quadrado. A forma diferencia
   as duas origens mesmo para quem não distingue as cores. */
.day-mark--entry {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--entry-c);
}

.day-mark--delivery {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--deliv-c, var(--accent));
}

.day-count {
  position: absolute;
  right: 7px;
  bottom: 7px;
  min-width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--entry-c);
  color: var(--surface);
  font-size: 10px;
  font-weight: 900;
}

.month-guidance,
.month-entry-list {
  min-width: 0;
  padding: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.month-guidance {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.month-section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text);
  font-size: 11.5px;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.month-section-title--split {
  justify-content: space-between;
  gap: 10px;
}

.month-section-title--split span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.month-section-title--split small {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}

.month-section-title svg {
  color: var(--accent);
}

.month-guidance ul {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.5;
  min-width: 0;
}

.month-guidance li {
  position: relative;
  padding-left: 14px;
  display: -webkit-box;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.month-guidance li::before {
  content: '';
  position: absolute;
  top: 0.68em;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}

.month-guidance li + li {
  margin-top: 7px;
}

.focus-more-item {
  width: max-content;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  -webkit-line-clamp: unset;
  line-clamp: unset;
}

.month-guidance .focus-more-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-left: 12px;
  overflow: visible;
  -webkit-box-orient: unset;
}

.focus-more-item::before {
  display: none;
}

.focus-photo-area {
  display: grid;
  gap: 8px;
}

.focus-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
}

.focus-add-input {
  min-width: 0;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  padding: 0 10px;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  overflow-wrap: anywhere;
}

.focus-add-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
}

.focus-add-btn,
.focus-photo-btn {
  width: max-content;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px dashed color-mix(in srgb, var(--accent) 46%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 900;
}

.focus-add-btn {
  border-style: solid;
  background: var(--accent);
  color: var(--accent-fg);
}

.focus-photo-btn input {
  display: none;
}

.focus-photo-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.focus-photo-grid figure,
.focus-photo-more {
  position: relative;
  aspect-ratio: 1.3;
  overflow: hidden;
  margin: 0;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
}

.focus-photo-more {
  display: grid;
  place-items: center;
  gap: 2px;
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-size: 22px;
  font-weight: 900;
}

.focus-photo-more span {
  color: var(--text-3);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.focus-photo-grid img,
.drawer-photo-grid img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.month-category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding-top: 2px;
}

.month-category-chip {
  padding: 5px 8px;
}

.month-entry-list {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.month-entry-scroll {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.month-entry {
  display: grid;
  grid-template-columns: 44px auto 1fr;
  gap: 9px;
  align-items: start;
  padding: 9px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--entry-c) 9%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--entry-c) 22%, transparent);
}

.month-entry-date {
  color: var(--entry-c);
  font-size: 11px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.month-entry-dot {
  width: 10px;
  height: 10px;
  margin-top: 2px;
  border-radius: 999px;
  background: var(--entry-c);
}

/* Mesma linguagem do calendário: quadrado é entrega, círculo é anotação. */
.month-entry-dot--delivery {
  border-radius: 3px;
}

/* Entrega vs anotação já se distinguem pela forma do marcador (quadrado vs
   círculo) e pela cor da data. A borda lateral esquerda saiu: além de
   redundante, é a cara de template genérico. Realce fica na borda inteira. */
.month-entry--delivery {
  border-color: color-mix(in srgb, var(--entry-c) 40%, transparent);
}

.month-entry-task {
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.month-entry-task:hover strong,
.month-entry-task:focus-visible strong {
  text-decoration: underline;
}

.month-entry-task:focus-visible {
  outline: 2px solid var(--entry-c);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.month-entry-tag {
  display: inline-block;
  margin-right: 5px;
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--entry-c) 18%, transparent);
  color: var(--entry-c);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.month-entry strong {
  display: block;
  color: var(--text);
  font-size: 12.5px;
  line-height: 1.25;
}

.month-entry small {
  display: block;
  margin-top: 3px;
  color: var(--text-3);
  font-size: 11.2px;
  line-height: 1.35;
}

.month-entry-toggle {
  width: 100%;
  min-height: 34px;
  border: 1px dashed color-mix(in srgb, var(--accent) 42%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 900;
}

.month-entry-toggle:hover,
.month-entry-toggle:focus-visible {
  background: color-mix(in srgb, var(--accent) 13%, transparent);
  outline: none;
}

.month-entry-toggle--ghost {
  border-style: solid;
  background: var(--surface);
  color: var(--text-2);
}

.month-drawer-layer {
  position: fixed;
  inset: 56px 0 0;
  z-index: 3000;
  display: flex;
  justify-content: flex-end;
}

.month-drawer-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: color-mix(in srgb, var(--bg) 58%, transparent);
  cursor: pointer;
}

.month-drawer {
  position: relative;
  width: min(560px, 100vw);
  height: calc(100dvh - 56px);
  overflow-y: auto;
  padding: 18px;
  background: var(--surface);
  /* Sem borda esquerda: a sombra do overlay já separa o drawer da página. */
  box-shadow: var(--shadow-overlay);
}

.month-drawer-head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: start;
  margin-bottom: 14px;
}

.month-drawer-head h2 {
  margin: 6px 0 7px;
  color: var(--text);
  font-size: 30px;
  line-height: 1;
  letter-spacing: -0.06em;
}

.month-drawer-head p {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.55;
}

.month-drawer-close {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}

.drawer-calendar-card,
.drawer-section {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.drawer-calendar-card {
  margin-bottom: 12px;
}

.drawer-calendar-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.drawer-calendar-summary span {
  display: grid;
  gap: 3px;
  padding: 9px;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
}

.drawer-calendar-summary strong {
  color: var(--text);
  font-size: 20px;
  line-height: 1;
}

.drawer-calendar .day-cell {
  min-height: 52px;
}

.drawer-section {
  display: grid;
  gap: 10px;
}

.drawer-section + .drawer-section {
  margin-top: 12px;
}

.drawer-focus-actions {
  display: grid;
  gap: 8px;
}

.drawer-focus-list {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
  min-width: 0;
}

.drawer-focus-list li {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: start;
  padding-left: 15px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.drawer-focus-list li span {
  min-width: 0;
}

.drawer-focus-list li button {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  line-height: 0;
}

.drawer-focus-list li button:hover {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 42%, var(--border));
}

.drawer-focus-list li::before {
  content: '';
  position: absolute;
  top: 0.68em;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--accent);
}

.drawer-focus-list li + li {
  margin-top: 7px;
}

.drawer-photo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.drawer-photo-grid figure {
  position: relative;
  overflow: hidden;
  margin: 0;
  border-radius: var(--radius);
}

.drawer-photo-grid img {
  aspect-ratio: 1.6;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.drawer-photo-grid button {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text);
  cursor: pointer;
  line-height: 0;
}

.drawer-photo-grid button svg {
  display: block;
}

.drawer-agenda {
  padding-bottom: 14px;
}

.drawer-entry {
  background: color-mix(in srgb, var(--entry-c) 8%, var(--surface));
}

.monthly-print-report {
  display: none;
}

:global(:root[data-theme='light']) .hero-copy,
:global(:root[data-theme='light']) .hero-card,
:global(:root[data-theme='light']) .summary-card,
:global(:root[data-theme='light']) .controls-card,
:global(:root[data-theme='light']) .detail-card,
:global(:root[data-theme='light']) .roadmap-shell,
:global(:root[data-theme='light']) .roadmap-note,
:global(:root[data-theme='light']) .monthly-overview,
:global(:root[data-theme='light']) .monthly-workbench,
:global(:root[data-theme='light']) .month-card {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--border) 86%, var(--text));
}

:global(:root[data-theme='light']) .hero-copy::after {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

:global(:root[data-theme='light']) .quarter-cell {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  border-right-color: var(--border);
}

:global(:root[data-theme='light']) .lane-row {
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--lane-color) 7%, var(--surface)),
      color-mix(in srgb, var(--lane-color) 3%, var(--surface))
    );
}

:global(:root[data-theme='light']) .lane-title {
  background: color-mix(in srgb, var(--lane-color) 9%, var(--surface));
}

:global(:root[data-theme='light']) .timeline-grid {
  background:
    linear-gradient(to right, color-mix(in srgb, var(--border) 92%, var(--text)) 1px, transparent 1px) 0 0 / 25% 100%,
    linear-gradient(to right, color-mix(in srgb, var(--border) 58%, transparent) 1px, transparent 1px) 0 0 / calc(100% / 12) 100%;
  opacity: 1;
}

:global(:root[data-theme='light']) .roadmap-bar {
  background: color-mix(in srgb, var(--lane-color) 20%, var(--surface));
  color: var(--text);
  border-color: color-mix(in srgb, var(--lane-color) 54%, var(--border));
}

:global(:root[data-theme='light']) .roadmap-bar:hover,
:global(:root[data-theme='light']) .roadmap-bar:focus-visible {
  background: color-mix(in srgb, var(--lane-color) 28%, var(--surface));
}

:global(:root[data-theme='light']) .roadmap-bar--planned {
  background: color-mix(in srgb, var(--lane-color) 10%, var(--surface));
  color: var(--text-2);
}

:global(:root[data-theme='light']) .roadmap-bar--done {
  background: color-mix(in srgb, var(--success) 16%, var(--surface));
  border-color: color-mix(in srgb, var(--success) 50%, var(--border));
}

:global(:root[data-theme='light']) .roadmap-bar--risk {
  background: color-mix(in srgb, var(--warn) 18%, var(--surface));
  border-color: color-mix(in srgb, var(--warn) 52%, var(--border));
}

:global(:root[data-theme='light']) .bar-progress {
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

:global(:root[data-theme='light']) .milestone-pin::after {
  background: var(--surface);
}

@media (max-width: 960px) {
  .roadmap-page {
    padding: 18px;
  }

  .roadmap-hero {
    grid-template-columns: 1fr;
  }

  .interaction-grid {
    grid-template-columns: 1fr;
  }

  .monthly-overview,
  .monthly-workbench,
  .month-card-body {
    grid-template-columns: 1fr;
  }

  .mini-calendar,
  .month-entry-list {
    grid-column: auto;
    grid-row: auto;
  }

  .month-entry-list {
    grid-column: 1 / -1;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .monthly-note-panel,
  .monthly-action-context,
  .months-grid {
    grid-template-columns: 1fr;
  }

  .monthly-note-form {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .detail-list {
    grid-template-columns: 1fr;
  }

  .month-head {
    grid-template-columns: 1fr;
  }

  .month-head-metrics {
    width: max-content;
  }

  .focus-add-row,
  .month-entry-scroll,
  .drawer-calendar-summary,
  .drawer-photo-grid {
    grid-template-columns: 1fr;
  }

  .monthly-note-head {
    flex-direction: column;
    gap: 10px;
  }

  .monthly-filter-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .monthly-note-form {
    grid-template-columns: 1fr;
  }

  .monthly-help-row {
    justify-content: flex-start;
    padding-top: 0;
  }

  .month-drawer {
    width: min(520px, 100vw);
  }
}

@media print {
  @page {
    size: landscape;
    margin: 10mm;
  }

  *,
  *::before,
  *::after {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .no-print,
  .roadmap-hero,
  .roadmap-mode-switch,
  .monthly-summary-grid,
  .monthly-workbench,
  .monthly-note-panel,
  .monthly-legend,
  .month-drawer-layer,
  .month-entry-toggle,
  .focus-more-item,
  .focus-photo-more {
    display: none !important;
  }

  :global(body.roadmap-printing) {
    --bg: #fff;
    --surface: #fff;
    --surface-2: #fff;
    --surface-3: #fff;
    --border: #d1d5db;
    --border-strong: #9ca3af;
    --text: #111827;
    --text-2: #374151;
    --text-3: #4b5563;
    --text-4: #6b7280;
    background: #fff !important;
    color: #111827 !important;
  }

  :global(body.roadmap-printing .command-shell) {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
  }

  :global(body.roadmap-printing .command-shell .topbar),
  :global(body.roadmap-printing .command-shell .sidebar),
  :global(body.roadmap-printing .command-shell .sidebar-footer),
  :global(body.roadmap-printing .command-shell .sidebar-scroll) {
    display: none !important;
  }

  :global(body.roadmap-printing .command-shell .body) {
    display: block !important;
    min-height: auto !important;
    overflow: visible !important;
  }

  :global(body.roadmap-printing .command-shell .main) {
    overflow: visible !important;
    min-height: auto !important;
  }

  .roadmap-page {
    padding: 0;
    background: #fff;
    color: #111827;
  }

  .months-grid {
    display: none !important;
  }

  .monthly-print-report {
    display: block;
  }

  .print-month {
    display: block;
    min-height: calc(100vh - 20mm);
    padding: 0;
    color: #111827;
    background: #fff;
    break-after: page;
    page-break-after: always;
  }

  .print-month:last-child,
  .print-month:only-child {
    break-after: auto;
    page-break-after: auto;
  }

  .print-month-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14mm;
    align-items: start;
    padding-bottom: 5mm;
    margin-bottom: 5mm;
    border-bottom: 1px solid #d1d5db;
  }

  .print-month-head span {
    display: block;
    margin-bottom: 2mm;
    color: #6b7280;
    font-size: 8.5pt;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .print-month-head h2 {
    margin: 0 0 1.5mm;
    color: #111827;
    font-size: 24pt;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .print-month-head p {
    max-width: 120mm;
    margin: 0;
    color: #374151;
    font-size: 10pt;
    line-height: 1.35;
  }

  .print-month-kpis {
    display: grid;
    grid-template-columns: repeat(3, 23mm);
    gap: 2mm;
  }

  .print-month-kpis span {
    display: grid;
    gap: 1mm;
    margin: 0;
    padding: 3mm 2.5mm;
    border: 1px solid #d1d5db;
    border-radius: 3mm;
    color: #4b5563;
    text-align: center;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .print-month-kpis strong {
    color: #111827;
    font-size: 18pt;
    line-height: 1;
  }

  .print-month-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(72mm, 0.8fr);
    gap: 4mm;
    margin-bottom: 4mm;
  }

  .print-panel {
    padding: 4mm;
    border: 1px solid #d1d5db;
    border-radius: 4mm;
    background: #fff;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .print-panel h3,
  .print-section-head h3 {
    margin: 0;
    color: #111827;
    font-size: 10pt;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .print-focus-list {
    display: grid;
    gap: 2mm;
    margin: 3mm 0 0;
    padding: 0;
    list-style: none;
  }

  .print-focus-list li {
    position: relative;
    padding-left: 4mm;
    color: #374151;
    font-size: 9.5pt;
    line-height: 1.35;
    overflow-wrap: anywhere;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .print-focus-list li::before {
    content: '';
    position: absolute;
    top: 0.55em;
    left: 0;
    width: 1.6mm;
    height: 1.6mm;
    border-radius: 999px;
    background: #111827;
  }

  .print-category-list {
    display: flex;
    flex-wrap: wrap;
    gap: 2mm;
    margin-top: 3mm;
  }

  .print-category-list span {
    padding: 1.7mm 2.4mm;
    border: 1px solid color-mix(in srgb, var(--entry-c) 58%, #d1d5db);
    border-radius: 999px;
    background: color-mix(in srgb, var(--entry-c) 12%, #fff);
    color: #111827;
    font-size: 8.5pt;
    font-weight: 900;
  }

  .print-agenda-panel {
    break-inside: auto;
    page-break-inside: auto;
  }

  .print-section-head {
    display: flex;
    justify-content: space-between;
    gap: 4mm;
    align-items: center;
    margin-bottom: 3mm;
  }

  .print-section-head span {
    color: #4b5563;
    font-size: 9pt;
    font-weight: 900;
  }

  .print-entry-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2.4mm;
  }

  .print-entry {
    display: grid;
    grid-template-columns: 16mm minmax(0, 1fr) auto;
    gap: 3mm;
    align-items: start;
    padding: 2.8mm;
    border: 1px solid color-mix(in srgb, var(--entry-c) 50%, #d1d5db);
    border-radius: 3mm;
    background: color-mix(in srgb, var(--entry-c) 13%, #fff);
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .print-entry-date {
    display: block;
    color: #111827;
    font-size: 9pt;
    font-weight: 950;
    font-variant-numeric: tabular-nums;
  }

  .print-entry strong {
    display: block;
    color: #111827;
    font-size: 9.5pt;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .print-entry small {
    display: block;
    margin-top: 1mm;
    color: #374151;
    font-size: 8.5pt;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .print-entry em {
    align-self: start;
    padding: 1mm 1.8mm;
    border-radius: 999px;
    background: #fff;
    color: #374151;
    font-size: 7.8pt;
    font-style: normal;
    font-weight: 900;
    white-space: nowrap;
  }

  .print-month-footer {
    display: flex;
    justify-content: space-between;
    gap: 4mm;
    margin-top: 5mm;
    padding-top: 3mm;
    border-top: 1px solid #e5e7eb;
    color: #6b7280;
    font-size: 8pt;
    font-weight: 800;
  }
}

/* ─── Timeline: hoje, atraso, resumo e marcos ─────────────────────────────── */

.timeline-today {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-1px);
  background: var(--accent);
  opacity: 0.75;
  pointer-events: none;
  z-index: 1;
}

.timeline-today-flag {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  pointer-events: none;
}

.timeline-today-flag span {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--surface);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.roadmap-bar--overdue {
  outline: 2px solid var(--err);
  outline-offset: 1px;
}

.roadmap-bar .bar-overdue {
  color: var(--err);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.annual-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0 4px;
}

.annual-summary span {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.annual-summary strong {
  font-size: 17px;
  font-weight: 900;
  color: var(--text);
}

.annual-summary small {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
}

.annual-summary .annual-summary--warn strong {
  color: var(--warn);
}

.annual-summary .annual-summary--danger strong {
  color: var(--err);
}

.annual-undated-note {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.ghost-btn--active {
  border-color: var(--err);
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

.ghost-btn--danger {
  margin-top: 12px;
  border-color: color-mix(in srgb, var(--err) 46%, var(--border));
  color: var(--err);
}

.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detail-list .detail-overdue {
  color: var(--err);
}

.detail-list dd small {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
}

.detail-list .detail-overdue small {
  color: var(--err);
}

.milestone-composer {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.milestone-composer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.milestone-composer-head > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
}

.milestone-composer-head small {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-3);
}

.milestone-composer-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.milestone-composer-form .monthly-control--text {
  grid-column: 1 / -1;
}

.monthly-empty-state--error {
  border-color: color-mix(in srgb, var(--err) 42%, var(--border));
}

.monthly-empty-state--error > svg {
  color: var(--err);
}

.drawer-day-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.drawer-entry {
  position: relative;
}

.drawer-entry-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
}

.drawer-entry-remove:hover {
  border-color: color-mix(in srgb, var(--err) 46%, var(--border));
  color: var(--err);
}
</style>
