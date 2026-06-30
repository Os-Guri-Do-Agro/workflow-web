<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  Activity,
  BarChart3,
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
import { useToast } from '@/composables/useToast'
import roadmapMonthlyService, {
  type RoadmapCategory,
  type RoadmapEntry,
  type RoadmapMonth,
  type RoadmapPhoto,
} from '@/service/roadmap/roadmap-monthly-service'
import quarterService from '@/service/quarters/quarters-service'
import exportService from '@/service/export/export-service'
import shareService from '@/service/share/share-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import aiService from '@/service/ai/ai-service'

const { success, error: showError, info } = useToast()
const workspace = useWorkspaceStore()

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
  kind: 'activity' | 'event'
}

type RoadmapMilestone = {
  id: string
  laneId: string
  title: string
  date: string
  status: RoadmapStatus
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
const selected = ref<RoadmapSelection | null>(null)
const noteDraft = ref('')
const noteMonthKey = ref(`${roadmapYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`)
const noteDate = ref(new Date().toISOString().slice(0, 10))
const exportMonthKey = ref<'all' | string>('all')
const selectedMonthDetailsKey = ref<string | null>(null)
const annualRoadmapLoading = ref(false)
const annualRoadmapUnavailable = ref(false)
const roadmapMonthlyLoading = ref(false)
const usingRoadmapMonthlyApi = ref(false)
const annualLanes = ref<RoadmapLane[]>([])
const annualItems = ref<RoadmapItem[]>([])
const annualMilestones = ref<RoadmapMilestone[]>([])
const focusDrafts = ref<Record<string, string>>({})
const extraFocusItems = ref<Record<string, string[]>>({})
const focusPhotos = ref<Record<string, string[]>>({})
const focusIds = ref<Record<string, string[]>>({})
const focusPhotoIds = ref<Record<string, string[]>>({})
const showAllMonthlyPlans = ref(false)
const monthEntryPreviewLimit = 8

const monthlyPlans = ref<MonthlyPlan[]>([])

const canEditMonthlyRoadmap = computed(() => {
  if (!workspace.activeRole) return true
  return workspace.canEdit
})

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
  const left = positionPercent(new Date(Math.max(toTime(item.start), toTime(viewport.value.start))))
  const right = positionPercent(new Date(Math.min(toTime(item.end), toTime(viewport.value.end))))
  return {
    left: `${left}%`,
    width: `${Math.max(right - left, 1.4)}%`,
  }
}

function markerStyle(date: string) {
  return {
    left: `${positionPercent(date)}%`,
  }
}

function laneItems(laneId: string): RoadmapItem[] {
  return annualItems.value.filter(
    (item) =>
      item.laneId === laneId &&
      (activeStatus.value === 'all' || item.status === activeStatus.value) &&
      overlapsDate(item.start, item.end),
  )
}

function laneMilestones(laneId: string): RoadmapMilestone[] {
  return annualMilestones.value.filter(
    (milestone) =>
      milestone.laneId === laneId &&
      (activeStatus.value === 'all' || milestone.status === activeStatus.value) &&
      overlapsDate(milestone.date, milestone.date),
  )
}

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
    annualLanes.value = []
    annualItems.value = []
    annualMilestones.value = []
    annualRoadmapUnavailable.value = true
    annualRoadmapLoading.value = false
    return
  }

  try {
    const response = await quarterService.getCompanyRoadMap(companyId)
    applyAnnualRoadmapResponse(response)
    annualRoadmapUnavailable.value = false
  } catch (err) {
    annualLanes.value = []
    annualItems.value = []
    annualMilestones.value = []
    selected.value = null
    annualRoadmapUnavailable.value = true
    showError(apiErrorMessage(err, 'API da timeline anual indisponível'))
  } finally {
    annualRoadmapLoading.value = false
  }
}

function applyAnnualRoadmapResponse(response: unknown) {
  const payload = unwrapApiPayload(response)
  const quartersPayload = firstArray(payload, ['quarters'])

  if (quartersPayload.length) {
    applyAnnualQuarterRoadmap(quartersPayload)
    return
  }

  const lanesPayload = firstArray(payload, ['lanes', 'areas', 'columns'])
  const itemsPayload = firstArray(payload, ['items', 'activities', 'tasks', 'entries'])
  const milestonesPayload = firstArray(payload, ['milestones', 'markers'])
  annualLanes.value = lanesPayload.map(mapAnnualLane).filter(Boolean) as RoadmapLane[]
  annualItems.value = itemsPayload.map(mapAnnualItem).filter(Boolean) as RoadmapItem[]
  annualMilestones.value = milestonesPayload.map(mapAnnualMilestone).filter(Boolean) as RoadmapMilestone[]

  const laneIds = new Set(annualLanes.value.map((lane) => lane.id))
  annualItems.value = annualItems.value.filter((item) => laneIds.has(item.laneId))
  annualMilestones.value = annualMilestones.value.filter((milestone) => laneIds.has(milestone.laneId))

  if (selected.value?.type === 'item' && !annualItems.value.some((item) => item.id === selected.value?.value.id)) {
    selected.value = null
  }
  if (selected.value?.type === 'milestone' && !annualMilestones.value.some((item) => item.id === selected.value?.value.id)) {
    selected.value = null
  }
  if (activeLaneId.value !== 'all' && !laneIds.has(activeLaneId.value)) {
    activeLaneId.value = 'all'
  }
}

function applyAnnualQuarterRoadmap(quartersPayload: any[]) {
  annualLanes.value = quartersPayload.map((quarter, index) => ({
    id: String(quarter?.id ?? quarter?.label ?? `quarter-${index + 1}`),
    title: String(quarter?.label ?? `Q${index + 1}`),
    description: `${Array.isArray(quarter?.months) ? quarter.months.length : 0} meses cadastrados`,
    owner: 'Empresa',
    status: normalizeQuarterStatus(quarter),
    color: fallbackLaneColor(index),
    icon: fallbackLaneIcon(index),
  }))

  annualItems.value = quartersPayload.flatMap((quarter, quarterIndex) => {
    const laneId = String(quarter?.id ?? quarter?.label ?? `quarter-${quarterIndex + 1}`)
    const months = Array.isArray(quarter?.months) ? quarter.months : []

    return months
      .map((month: any) => mapQuarterMonthItem(month, laneId))
      .filter(Boolean) as RoadmapItem[]
  })
  annualMilestones.value = []

  const laneIds = new Set(annualLanes.value.map((lane) => lane.id))
  if (activeLaneId.value !== 'all' && !laneIds.has(activeLaneId.value)) {
    activeLaneId.value = 'all'
  }
  if (selected.value?.type === 'item' && !annualItems.value.some((item) => item.id === selected.value?.value.id)) {
    selected.value = null
  }
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
    kind: 'activity',
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
  const laneId = String(input?.laneId ?? input?.areaId ?? input?.columnId ?? input?.lane?.id ?? '')
  const title = String(input?.title ?? input?.name ?? '')
  const start = normalizeDateOnly(input?.start ?? input?.startDate ?? input?.startsAt ?? input?.from)
  const end = normalizeDateOnly(input?.end ?? input?.endDate ?? input?.endsAt ?? input?.to ?? start)
  if (!id || !laneId || !title || !start || !end) return null

  return {
    id,
    laneId,
    title,
    start,
    end,
    progress: clamp(Number(input?.progress ?? input?.percentage ?? 0), 0, 100),
    status: normalizeRoadmapStatus(input?.status),
    kind: input?.kind === 'event' || input?.type === 'event' ? 'event' : 'activity',
  }
}

function mapAnnualMilestone(input: any): RoadmapMilestone | null {
  const id = String(input?.id ?? input?.milestoneId ?? '')
  const laneId = String(input?.laneId ?? input?.areaId ?? input?.lane?.id ?? '')
  const title = String(input?.title ?? input?.name ?? '')
  const date = normalizeDateOnly(input?.date ?? input?.dueDate ?? input?.startsAt)
  if (!id || !laneId || !title || !date) return null

  return {
    id,
    laneId,
    title,
    date,
    status: normalizeRoadmapStatus(input?.status),
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
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
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
    if (!response.months.length) {
      monthlyPlans.value = []
      focusDrafts.value = {}
      extraFocusItems.value = {}
      focusPhotos.value = {}
      focusIds.value = {}
      focusPhotoIds.value = {}
      selectedMonthDetailsKey.value = null
      exportMonthKey.value = 'all'
      usingRoadmapMonthlyApi.value = true
      info('Nenhum mês cadastrado no roadmap mensal para este ano.')
      return
    }

    applyRoadmapApiMonths(response.months)
    usingRoadmapMonthlyApi.value = true
  } catch (err) {
    monthlyPlans.value = []
    usingRoadmapMonthlyApi.value = false
    showError(apiErrorMessage(err, 'API de roadmap mensal indisponível'))
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
    }
  })

  extraFocusItems.value = {}
  focusDrafts.value = {}
  focusIds.value = nextFocusIds
  focusPhotos.value = nextFocusPhotos
  focusPhotoIds.value = nextFocusPhotoIds

  if (!visibleMonthlyPlans.value.some((month) => month.key === noteMonthKey.value)) {
    noteMonthKey.value = visibleMonthlyPlans.value[0]?.key ?? monthlyPlans.value[0]?.key ?? noteMonthKey.value
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

function monthMarkedDays(month: MonthlyPlan): number {
  return new Set(month.entries.map((entry) => entry.date)).size
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

function sortedMonthEntries(month: MonthlyPlan): CalendarEntry[] {
  return [...month.entries].sort((a, b) => a.date.localeCompare(b.date))
}

function visibleMonthEntries(month: MonthlyPlan): CalendarEntry[] {
  return sortedMonthEntries(month).slice(0, monthEntryPreviewLimit)
}

function monthEntriesForCard(month: MonthlyPlan): CalendarEntry[] {
  return isRoadmapPrinting.value ? sortedMonthEntries(month) : visibleMonthEntries(month)
}

function hiddenMonthEntriesCount(month: MonthlyPlan): number {
  return Math.max(sortedMonthEntries(month).length - visibleMonthEntries(month).length, 0)
}

const selectedMonthDetails = computed(() =>
  monthlyPlans.value.find((month) => month.key === selectedMonthDetailsKey.value) ?? null,
)

function openMonthDetails(monthKey: string) {
  selectedMonthDetailsKey.value = monthKey
}

function closeMonthDetails() {
  selectedMonthDetailsKey.value = null
}

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
  const firstDay = new Date(month.year, month.month, 1)
  const lastDay = new Date(month.year, month.month + 1, 0)
  const cells: Array<{ key: string; day: number | null; date?: string }> = []

  for (let i = 0; i < firstDay.getDay(); i++) {
    cells.push({ key: `${month.key}-empty-start-${i}`, day: null })
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    cells.push({ key: dateKey(month.year, month.month, day), day, date: dateKey(month.year, month.month, day) })
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

function calendarEntryStyle(entry: CalendarEntry) {
  return {
    '--entry-c': calendarCategoryMeta[entry.category].tone,
  }
}

function primaryEntryStyle(month: MonthlyPlan, date?: string) {
  const entry = primaryEntry(month, date)
  return entry ? calendarEntryStyle(entry) : undefined
}

function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

async function addMonthlyNote() {
  const text = noteDraft.value.trim()
  const month = monthlyPlans.value.find((item) => item.key === noteMonthKey.value)
  if (!text || !month || !noteDate.value) return

  try {
    const apiMonthId = await ensureMonthId(month)
    const created = await roadmapMonthlyService.addQuickNote(
      apiMonthId,
      noteDate.value,
      text,
      'Anotação adicionada manualmente.',
    )
    month.entries.push(mapRoadmapEntry(created))
    noteDraft.value = ''
    success('Anotação adicionada')
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível salvar a anotação'))
  }
}

async function exportMonthlyPdf() {
  if (!monthlyPlans.value.length) {
    info('Não há meses do roadmap mensal para exportar.')
    return
  }

  try {
    await exportService.downloadRoadmapPdf(roadmapStart.getFullYear())
    success('Download do PDF iniciado')
    return
  } catch (err) {
    showError(apiErrorMessage(err, 'Não foi possível exportar pelo servidor. Abrindo impressão local.'))
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
                Anotações rápidas
                <small class="roadmap-data-source">
                  {{ roadmapMonthlyLoading ? 'Sincronizando...' : usingRoadmapMonthlyApi ? 'Dados da API' : 'API indisponível' }}
                </small>
              </span>
              <h2>Registre uma decisão ou lembrete</h2>
              <p>Escolha mês e data para adicionar uma nota diretamente no calendário correspondente.</p>
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
                <strong>{{ selectedNoteMonth.entries.length }} itens planejados</strong>
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
            <input v-model="noteDate" type="date" class="monthly-control" aria-label="Data da nota" />
            <input
              v-model="noteDraft"
              type="text"
              class="monthly-control monthly-control--text"
              placeholder="Ex: alinhar campanha com parceiros"
              @keydown.enter.prevent="addMonthlyNote"
            />
            <button class="monthly-add-btn press" :disabled="!noteDraft.trim()" @click="addMonthlyNote">
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

      <section v-if="!roadmapMonthlyLoading && !hasMonthlyPlans" class="monthly-empty-state">
        <CalendarDays :size="22" />
        <div>
          <span class="text-eyebrow">Sem dados do roadmap mensal</span>
          <h2>Nenhum mês cadastrado para {{ roadmapStart.getFullYear() }}</h2>
          <p>
            A API respondeu sem meses para a empresa ativa. Assim que o backend cadastrar meses, focos e agenda,
            esta tela passa a exibir os dados reais.
          </p>
        </div>
      </section>

      <section v-else-if="hasMonthlyPlans" class="monthly-filter-bar no-print">
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
                <strong>{{ month.entries.length }}</strong>
                <small>itens</small>
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
                  'day-cell--marked': primaryEntry(month, cell.date),
                  'day-cell--busy': entriesForDate(month, cell.date).length > 1,
                }"
                :style="primaryEntryStyle(month, cell.date)"
                :title="primaryEntry(month, cell.date)?.title"
                :disabled="!cell.day"
              >
                <span class="day-number">{{ cell.day }}</span>
                <span v-if="entriesForDate(month, cell.date).length > 1" class="day-count">
                  {{ entriesForDate(month, cell.date).length }}
                </span>
                <i v-else-if="primaryEntry(month, cell.date)" />
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
                <small>{{ monthEntriesForCard(month).length }} de {{ month.entries.length }}</small>
              </div>
              <div class="month-entry-scroll">
                <article
                  v-for="entry in monthEntriesForCard(month)"
                  :key="entry.id"
                  class="month-entry"
                  :style="calendarEntryStyle(entry)"
                >
                  <span class="month-entry-date">{{ formatDayMonth(entry.date) }}</span>
                  <span class="month-entry-dot" />
                  <div>
                    <strong>{{ entry.title }}</strong>
                    <small v-if="entry.description">{{ entry.description }}</small>
                  </div>
                </article>
              </div>
              <button
                v-if="hiddenMonthEntriesCount(month)"
                class="month-entry-toggle press"
                type="button"
                @click="openMonthDetails(month.key)"
              >
                Ver mais {{ hiddenMonthEntriesCount(month) }} itens
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
                <strong>{{ month.entries.length }}</strong>
                itens
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
              <span>{{ sortedMonthEntries(month).length }} itens</span>
            </div>
            <div class="print-entry-list">
              <article
                v-for="entry in sortedMonthEntries(month)"
                :key="`print-${month.key}-${entry.id}`"
                class="print-entry"
                :style="calendarEntryStyle(entry)"
              >
                <span class="print-entry-date">{{ formatDayMonth(entry.date) }}</span>
                <div>
                  <strong>{{ entry.title }}</strong>
                  <small v-if="entry.description">{{ entry.description }}</small>
                </div>
                <em>{{ calendarCategoryMeta[entry.category].label }}</em>
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
                <strong>{{ selectedMonthDetails.entries.length }}</strong>
                itens
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
                  'day-cell--marked': primaryEntry(selectedMonthDetails, cell.date),
                  'day-cell--busy': entriesForDate(selectedMonthDetails, cell.date).length > 1,
                }"
                :style="primaryEntryStyle(selectedMonthDetails, cell.date)"
                :title="primaryEntry(selectedMonthDetails, cell.date)?.title"
                :disabled="!cell.day"
              >
                <span class="day-number">{{ cell.day }}</span>
                <span v-if="entriesForDate(selectedMonthDetails, cell.date).length > 1" class="day-count">
                  {{ entriesForDate(selectedMonthDetails, cell.date).length }}
                </span>
                <i v-else-if="primaryEntry(selectedMonthDetails, cell.date)" />
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
                Agenda completa
              </span>
              <small>{{ selectedMonthDetails.entries.length }} itens</small>
            </div>
            <article
              v-for="entry in sortedMonthEntries(selectedMonthDetails)"
              :key="`${selectedMonthDetails.key}-drawer-entry-${entry.id}`"
              class="month-entry drawer-entry"
              :style="calendarEntryStyle(entry)"
            >
              <span class="month-entry-date">{{ formatDayMonth(entry.date) }}</span>
              <span class="month-entry-dot" />
              <div>
                <strong>{{ entry.title }}</strong>
                <small v-if="entry.description">{{ entry.description }}</small>
              </div>
            </article>
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
            <h2>Explore o roadmap por trimestre, área ou status</h2>
          </div>
          <p>
            Use os filtros para focar em uma parte do ano. Clique em uma barra ou marco da timeline para ver período,
            progresso e contexto no painel ao lado.
          </p>
        </div>

        <div class="controls-row">
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

          <button class="ghost-btn" @click="resetFilters">Limpar filtros</button>
        </div>
      </div>

      <aside class="detail-card" aria-live="polite">
        <template v-if="selected">
          <div class="detail-head">
            <span class="detail-type">
              {{ selected.type === 'item' ? 'Atividade' : 'Marco' }}
            </span>
            <span v-if="selectedStatus" class="detail-status">
              <component :is="selectedStatus.icon" :size="12" />
              {{ selectedStatus.label }}
            </span>
          </div>
          <h2>{{ selected.value.title }}</h2>
          <p v-if="selectedLane">{{ selectedLane.title }} · {{ selectedLane.owner }}</p>
          <dl class="detail-list">
            <div>
              <dt>Período</dt>
              <dd v-if="selected.type === 'item'">
                {{ formatDate(selected.value.start) }} - {{ formatDate(selected.value.end) }}
              </dd>
              <dd v-else>{{ formatDate(selected.value.date) }}</dd>
            </div>
            <div v-if="selected.type === 'item'">
              <dt>Progresso</dt>
              <dd>{{ selected.value.progress }}%</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>Timeline anual</dd>
            </div>
          </dl>
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
      v-else-if="roadmapMode === 'timeline' && (!annualLanes.length || (!annualItems.length && !annualMilestones.length))"
      :icon="Milestone"
      title="Roadmap anual em breve"
      description="A timeline anual ainda não tem áreas, atividades ou marcos cadastrados para a empresa ativa. Assim que o backend disponibilizar esses dados, eles aparecerão aqui."
    />

    <div v-else-if="roadmapMode === 'timeline'" class="roadmap-shell">
      <div class="roadmap-scroll" role="region" aria-label="Linha do tempo do roadmap" tabindex="0">
        <div class="roadmap-board">
          <div class="board-header">
            <div class="side-header">Área</div>
            <div class="meta-header">Responsável</div>
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

            <div class="timeline-cell">
              <div class="timeline-grid" aria-hidden="true" />

              <article
                v-for="item in laneItems(lane.id)"
                :key="item.id"
                class="roadmap-bar"
                :class="[
                  `roadmap-bar--${item.status}`,
                  { 'roadmap-bar--event': item.kind === 'event' },
                  { 'roadmap-bar--selected': isSelected('item', item.id) },
                ]"
                :style="itemStyle(item)"
                :aria-label="`${item.title}: ${formatDate(item.start)} até ${formatDate(item.end)}`"
                role="button"
                tabindex="0"
                @click="selectItem(item)"
                @keydown.enter.prevent="selectItem(item)"
                @keydown.space.prevent="selectItem(item)"
              >
                <span class="bar-progress" :style="{ width: `${item.progress}%` }" />
                <span class="bar-label">{{ item.shortTitle ?? item.title }}</span>
                <small v-if="item.progress > 0">{{ item.progress }}%</small>
              </article>

              <div
                v-for="milestone in laneMilestones(lane.id)"
                :key="milestone.id"
                class="milestone-pin"
                :class="[
                  `milestone-pin--${milestone.status}`,
                  { 'milestone-pin--selected': isSelected('milestone', milestone.id) },
                ]"
                :style="markerStyle(milestone.date)"
                role="button"
                tabindex="0"
                @click="selectMilestone(milestone)"
                @keydown.enter.prevent="selectMilestone(milestone)"
                @keydown.space.prevent="selectMilestone(milestone)"
              >
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
      <span>
        {{ annualRoadmapUnavailable ? 'API da timeline anual indisponível.' : 'Timeline anual carregada pela API.' }}
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
  top: 44px;
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

.roadmap-bar:nth-of-type(2n) {
  top: 76px;
}

.roadmap-bar--event {
  height: 18px;
  top: 90px;
  border-radius: var(--radius-sm);
  padding-inline: 8px;
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

.milestone-pin--done::after {
  border-color: var(--success);
}

.milestone-pin--risk::after {
  border-color: var(--warn);
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
  grid-template-columns: repeat(3, minmax(48px, auto));
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
  cursor: default;
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

.day-cell--marked i,
.day-count {
  position: absolute;
  right: 7px;
  bottom: 7px;
  border-radius: 999px;
  background: var(--entry-c);
}

.day-cell--marked i {
  width: 6px;
  height: 6px;
}

.day-count {
  min-width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
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
  border-left: 1px solid var(--border);
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
</style>
