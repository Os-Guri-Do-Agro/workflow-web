import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FolderOpen,
  type LucideIcon,
} from 'lucide-vue-next'
import companiesServices from '@/service/companies/companies-services'
import dashboardService from '@/service/dashboard/dashboard-service'
import collaborationService from '@/service/collaboration/collaboration-service'
import aiService, { type SearchHit } from '@/service/ai/ai-service'
import { useActiveCompanyId } from '@/stores/authStores'
import { useDashboardMetrics } from '@/composables/useDashboardMetrics'
import { useWorkspaceDashboard } from '@/composables/useWorkspaceDashboard'
import { useNavQuarters } from '@/composables/useNavQuarters'
import { useToast } from '@/composables/useToast'
import { useAssistant } from '@/composables/useAssistant'
import type { CalendarEvent } from '@/service/events/events-service'

export type DashboardMode = 'company' | 'workspace'

type DashboardMetricSummary = {
  total?: number
  completed?: number
  inProgress?: number
  overdue?: number
  progress?: number
  status?: {
    completed?: number
    inProgress?: number
  }
  time?: {
    overdue?: number
    dueThisWeek?: number
  }
}

type WorkspaceDashboardPayload = {
  totals?: DashboardMetricSummary
  metrics?: DashboardMetricSummary
}

type WeeklyTrendPayload = {
  series?: Array<{
    created?: number
    completed?: number
  }>
}

export type BacklogChange = {
  activityTitle?: string
  changedBy?: {
    name?: string
  } | null
  changedAt: string
  newStatus?: string
}

type CompanyProject = {
  id?: string
  name?: string
  cnpj?: string
  metrics?: {
    progress?: number
    total?: number
    completed?: number
    inProgress?: number
  }
}

type CompanyProjectSource = {
  company?: CompanyProject
}

export type UpcomingEvent = Pick<CalendarEvent, 'id' | 'title' | 'startDate' | 'type'> & {
  start?: string
  start_date?: string
  date?: string
  summary?: string
  description?: string | null
}

export type StatCard = {
  title: string
  /** Numérico: o card renderiza via CountUp (string formatada viraria NaN→0). */
  value: number
  icon: LucideIcon
  color: string
  spark: number[]
  /** `true` quando o sparkline não tem dados reais — renderizar "sem atividade". */
  noData: boolean
  trend: string
}

export type DashboardProject = {
  id: string
  name: string
  progress: number
  cnpj: string
  total: number
  completed: number
  inProgress: number
  status: string
}

export const statusMeta: Record<string, { color: string; label: string }> = {
  todo: { color: 'var(--status-todo)', label: 'A fazer' },
  'in-progress': { color: 'var(--status-prog)', label: 'Em andamento' },
  testing: { color: 'var(--status-test)', label: 'Em teste' },
  done: { color: 'var(--status-done)', label: 'Concluído' },
  completed: { color: 'var(--status-done)', label: 'Concluído' },
  planning: { color: 'var(--status-todo)', label: 'Planejando' },
  review: { color: 'var(--status-test)', label: 'Revisão' },
  blocked: { color: 'var(--status-block)', label: 'Bloqueado' },
}

/** Classe utilitária por status para o pill de atividade (color-mix pré-computado em CSS). */
export function statusPillClass(status: string): string {
  const meta = statusMeta[status] ? status : 'todo'
  return `pill--${meta}`
}

export function useDashboardOrchestration() {
  const router = useRouter()
  const route = useRoute()
  const activeCompanyStore = useActiveCompanyId()
  const assistant = useAssistant()
  const { firstMonth } = useNavQuarters()
  const { error: showError, success } = useToast()

  // ── Mode (company / workspace) ──
  const mode = ref<DashboardMode>(
    (localStorage.getItem('dashboard.mode') as DashboardMode) || 'company',
  )
  const setMode = (m: DashboardMode) => {
    mode.value = m
    localStorage.setItem('dashboard.mode', m)
  }

  const companyId = computed(
    () => activeCompanyStore.companyId ?? localStorage.getItem('activeCompany') ?? '',
  )

  // ── Critical-path queries (hero + stats) ──
  const { data: metricsData, isLoading: loading } = useDashboardMetrics(companyId)
  const { data: workspaceData } = useWorkspaceDashboard(
    computed(() => mode.value === 'workspace'),
  )

  const { data: weeklyTrendData } = useQuery({
    queryKey: computed(() => ['weeklyTrend', companyId.value]),
    queryFn: () => dashboardService.getWeeklyTrend(companyId.value!),
    enabled: computed(() => !!companyId.value),
  })

  const weeklySeries = computed<{ created: number[]; completed: number[] }>(() => {
    const w = weeklyTrendData.value as WeeklyTrendPayload | undefined
    const series = w?.series ?? []
    return {
      created: series.map((d) => d.created ?? 0),
      completed: series.map((d) => d.completed ?? 0),
    }
  })

  const metrics = computed(() => metricsData.value ?? null)

  const greeting = computed(() => {
    const h = new Date().getHours()
    if (h < 5) return 'Boa madrugada'
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })

  const todayLabel = computed(() => {
    const d = new Date()
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  })

  const hero = computed(() => {
    if (mode.value === 'workspace') {
      const w = workspaceData.value as WorkspaceDashboardPayload | undefined
      const agg = w?.totals || w?.metrics || {}
      const total = agg?.total ?? 0
      const done = agg?.completed ?? agg?.status?.completed ?? 0
      const progress = agg?.progress ?? Math.round(total ? (done / total) * 100 : 0)
      const overdue = agg?.overdue ?? agg?.time?.overdue ?? 0
      return { total, done, progress, overdue }
    }
    const m = metrics.value?.metrics
    const total = m?.total ?? 0
    const done = m?.status?.completed ?? 0
    const progress = m?.progress ?? Math.round(total ? (done / total) * 100 : 0)
    const overdue = m?.time?.overdue ?? 0
    return { total, done, progress, overdue }
  })

  const stats = computed<StatCard[]>(() => {
    const m = metrics.value?.metrics
    if (!m) return []
    const total = m.total || 0
    const completed = m.status?.completed || 0
    const inProgress = m.status?.inProgress || 0
    const overdue = m.time?.overdue || 0

    const createdSeries = weeklySeries.value.created
    const completedSeries = weeklySeries.value.completed
    const hasCreated = createdSeries.length > 0
    const hasCompleted = completedSeries.length > 0

    const completedThisWeek = completedSeries.reduce((a, b) => a + b, 0)
    const createdThisWeek = createdSeries.reduce((a, b) => a + b, 0)

    return [
      {
        title: 'Total',
        value: total,
        icon: FolderOpen,
        color: 'var(--info)',
        spark: hasCreated ? createdSeries : [],
        noData: !hasCreated,
        trend: `${hero.value.progress}% concluído`,
      },
      {
        title: 'Concluídas',
        value: completed,
        icon: CheckCircle2,
        color: 'var(--success)',
        spark: hasCompleted ? completedSeries : [],
        noData: !hasCompleted,
        trend:
          completedThisWeek > 0
            ? `+${completedThisWeek} esta semana`
            : 'Nenhuma fechada esta semana',
      },
      {
        title: 'Em progresso',
        value: inProgress,
        icon: Clock3,
        color: 'var(--warn)',
        spark: hasCreated ? createdSeries : [],
        noData: !hasCreated,
        trend:
          createdThisWeek > 0 ? `${createdThisWeek} novas esta semana` : `${inProgress} em execução`,
      },
      {
        title: 'Atrasadas',
        // Atrasadas não têm série temporal própria; sem sparkline honesto.
        value: overdue,
        icon: AlertTriangle,
        color: 'var(--err)',
        spark: [],
        noData: true,
        trend: `${m.time?.dueThisWeek || 0} vencem esta semana`,
      },
    ]
  })

  // ── Lazy: companies / projects ──
  const companies = ref<CompanyProjectSource[]>([])
  const loadingCompanies = ref(true)
  let companiesLoaded = false

  const findCompanies = async () => {
    if (companiesLoaded) return
    companiesLoaded = true
    loadingCompanies.value = true
    try {
      const response = await companiesServices.companyWithMetrics()
      companies.value = Array.isArray(response) ? response : response?.data || []
    } catch (error) {
      showError('Não foi possível carregar os projetos')
      console.error(error)
    } finally {
      loadingCompanies.value = false
    }
  }

  const projects = computed<DashboardProject[]>(() => {
    return companies.value.map((item) => {
      const company = item.company
      const m = company?.metrics || {}
      const progress = m.progress || 0
      let status = 'planning'
      if (progress === 100) status = 'done'
      else if (progress >= 50) status = 'in-progress'
      return {
        id: company?.id || '',
        name: company?.name || '—',
        progress,
        cnpj: company?.cnpj || '',
        total: m.total || 0,
        completed: m.completed || 0,
        inProgress: m.inProgress || 0,
        status,
      }
    })
  })

  const ensureActiveCompany = async () => {
    if (!localStorage.getItem('activeCompany')) {
      try {
        const response = await companiesServices.getCompany()
        const list = Array.isArray(response) ? response : response?.data || []
        if (list.length > 0) {
          const firstCompanyId = list[0]?.company?.id || list[0]?.id
          if (firstCompanyId) {
            localStorage.setItem('activeCompany', firstCompanyId)
            activeCompanyStore.setCompanyId(firstCompanyId)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
  }

  // ── Navigation handlers ──
  const handleProjectClick = (companyIdForNav: string | undefined) => {
    if (!companyIdForNav) return
    localStorage.setItem('activeCompany', companyIdForNav)
    activeCompanyStore.setCompanyId(companyIdForNav)
    router.push('/variables')
  }

  const handleNewTask = () => {
    if (firstMonth.value) router.push(`/tasks/${firstMonth.value.id}?new=1`)
  }

  const openCalendar = () => router.push('/calendar')

  // ── AI / assistant ──
  const digestLoading = ref(false)
  const digestSummary = ref('')
  const workspaceQuestion = ref('')
  const workspaceAnswer = ref('')
  const workspaceSources = ref<SearchHit[]>([])
  const askLoading = ref(false)
  const searchStatus = ref<{ indexed: boolean; lastIndexedAt: string | null } | null>(null)

  function openAiTool(tool: 'ask' | 'digest') {
    assistant.open()
    if (tool === 'digest') assistant.runDigest()
  }

  function handleAiQueryParam(value: unknown) {
    if (value === 'ask' || value === 'digest') {
      openAiTool(value)
      router.replace({ query: { ...route.query, ai: undefined } })
    }
  }

  function openWorkspaceSearch() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
  }

  async function loadSearchStatus() {
    try {
      searchStatus.value = await aiService.searchStatus()
    } catch {
      searchStatus.value = null
    }
  }

  async function askWorkspace() {
    const question = workspaceQuestion.value.trim()
    if (!question) return
    askLoading.value = true
    try {
      const response = await aiService.ask(question)
      workspaceAnswer.value = response.answer
      workspaceSources.value = response.sources
    } catch {
      showError('Não foi possível perguntar ao workspace')
    } finally {
      askLoading.value = false
    }
  }

  async function generateDigest() {
    digestLoading.value = true
    try {
      const digest = await collaborationService.digest(7)
      digestSummary.value = digest.summary
      success('Digest gerado')
    } catch {
      showError('Não foi possível gerar o digest')
    } finally {
      digestLoading.value = false
    }
  }

  // ── Formatters ──
  const formatFeedDate = (value: string) =>
    new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  onMounted(async () => {
    await ensureActiveCompany()
    void loadSearchStatus()
    handleAiQueryParam(route.query.ai)
  })

  watch(
    () => route.query.ai,
    (value) => handleAiQueryParam(value),
  )

  return {
    // mode
    mode,
    setMode,
    companyId,
    // critical-path data
    loading,
    metrics,
    hero,
    stats,
    greeting,
    todayLabel,
    weeklySeries,
    weeklyTrendData,
    firstMonth,
    // companies / projects (lazy)
    loadingCompanies,
    projects,
    findCompanies,
    // handlers
    handleProjectClick,
    handleNewTask,
    openCalendar,
    // ai
    digestLoading,
    digestSummary,
    workspaceQuestion,
    workspaceAnswer,
    workspaceSources,
    askLoading,
    searchStatus,
    openAiTool,
    openWorkspaceSearch,
    askWorkspace,
    generateDigest,
    // formatters
    formatFeedDate,
  }
}

export type DashboardOrchestration = ReturnType<typeof useDashboardOrchestration>
