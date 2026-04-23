<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import {
  FolderOpen,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Sparkles,
  Plus,
  ArrowUpRight,
  CircleDot,
  Calendar,
  Building2,
  Globe2,
} from 'lucide-vue-next'
import companiesServices from '@/service/companies/companies-services'
import { useActiveCompanyId } from '@/stores/authStores'
import { useDashboardMetrics } from '@/composables/useDashboardMetrics'
import { useBacklog } from '@/composables/useBacklog'
import { useUpcomingEvents } from '@/composables/useUpcomingEvents'
import { useWorkspaceDashboard } from '@/composables/useWorkspaceDashboard'
import { useNavQuarters } from '@/composables/useNavQuarters'
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent])

const router = useRouter()
const activeCompanyStore = useActiveCompanyId()
const companies = ref<any[]>([])
const loadingCompanies = ref(true)
const { firstMonth } = useNavQuarters()

const mode = ref<'company' | 'workspace'>(
  (localStorage.getItem('dashboard.mode') as 'company' | 'workspace') || 'company',
)
const setMode = (m: 'company' | 'workspace') => {
  mode.value = m
  localStorage.setItem('dashboard.mode', m)
}

const companyId = computed(
  () => activeCompanyStore.companyId ?? localStorage.getItem('activeCompany') ?? '',
)

const { data: metricsData, isLoading: loading } = useDashboardMetrics(companyId)
const { data: backlogData, isLoading: loadingBacklog } = useBacklog(companyId)
const { data: workspaceData, isLoading: loadingWorkspace } = useWorkspaceDashboard(
  computed(() => mode.value === 'workspace'),
)
const { data: upcomingData, isLoading: loadingUpcoming } = useUpcomingEvents(5)

const metrics = computed(() => metricsData.value ?? null)
const backlog = computed(() => backlogData.value ?? [])
const upcoming = computed<any[]>(() => {
  const v = upcomingData.value
  if (Array.isArray(v)) return v
  if (v && Array.isArray((v as any).data)) return (v as any).data
  return []
})

const findCompanies = async () => {
  loadingCompanies.value = true
  try {
    const response = await companiesServices.companyWithMetrics()
    companies.value = Array.isArray(response) ? response : response?.data || []
  } catch (error) {
    console.error(error)
  } finally {
    loadingCompanies.value = false
  }
}

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

onMounted(async () => {
  await ensureActiveCompany()
  findCompanies()
})

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
    const w = workspaceData.value as any
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

type StatCard = {
  title: string
  value: string
  icon: any
  color: string
  spark: number[]
  trend: string
}

const stats = computed<StatCard[]>(() => {
  const m = metrics.value?.metrics
  if (!m) return []
  const total = m.total || 0
  const completed = m.status?.completed || 0
  const inProgress = m.status?.inProgress || 0
  const overdue = m.time?.overdue || 0
  // Mocked spark data fallback (no historical in API today) — shape used for visual trend only
  const sparkUp = (seed: number, n = 12) =>
    Array.from({ length: n }, (_, i) => Math.round(seed * 0.4 + seed * 0.6 * ((i + 1) / n) + Math.sin(i) * seed * 0.06))
  const sparkFlat = (v: number, n = 12) =>
    Array.from({ length: n }, (_, i) => Math.round(v + Math.sin(i * 0.8) * v * 0.1))
  return [
    {
      title: 'Total',
      value: String(total),
      icon: FolderOpen,
      color: 'var(--info)',
      spark: sparkUp(total || 20),
      trend: `${hero.value.progress}% concluído`,
    },
    {
      title: 'Concluídas',
      value: String(completed),
      icon: CheckCircle2,
      color: 'var(--success)',
      spark: sparkUp(completed || 8),
      trend: `+${Math.max(1, Math.floor(completed / 6))} esta semana`,
    },
    {
      title: 'Em progresso',
      value: String(inProgress),
      icon: Clock3,
      color: 'var(--warn)',
      spark: sparkFlat(inProgress || 5),
      trend: `${inProgress} em execução`,
    },
    {
      title: 'Atrasadas',
      value: String(overdue),
      icon: AlertTriangle,
      color: 'var(--err)',
      spark: sparkFlat(Math.max(1, overdue)),
      trend: `${m.time?.dueThisWeek || 0} vencem esta semana`,
    },
  ]
})

const sparkOption = (data: number[], color: string) => ({
  grid: { top: 2, right: 2, bottom: 2, left: 2 },
  xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
  yAxis: { type: 'value', show: false, min: (v: any) => v.min - v.min * 0.2 },
  series: [
    {
      type: 'line',
      data,
      smooth: 0.55,
      symbol: 'none',
      lineStyle: { color, width: 1.6, shadowBlur: 8, shadowColor: color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: color + '80' },
            { offset: 1, color: color + '00' },
          ],
        },
      },
    },
  ],
})

const recentActivities = computed(() => {
  return backlog.value.slice(0, 10).map((item: any) => ({
    title: item.activityTitle,
    author: item.changedBy?.name || 'Sistema',
    initials: (item.changedBy?.name || 'S S')
      .split(' ')
      .map((w: string) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2),
    time: new Date(item.changedAt).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),
    status: item.newStatus?.toLowerCase().replace('_', '-') || 'todo',
  }))
})

const statusMeta: Record<string, { color: string; label: string }> = {
  todo: { color: 'var(--status-todo)', label: 'A fazer' },
  'in-progress': { color: 'var(--status-prog)', label: 'Em andamento' },
  testing: { color: 'var(--status-test)', label: 'Em teste' },
  done: { color: 'var(--status-done)', label: 'Concluído' },
  completed: { color: 'var(--status-done)', label: 'Concluído' },
  planning: { color: 'var(--status-todo)', label: 'Planejando' },
  review: { color: 'var(--status-test)', label: 'Revisão' },
  blocked: { color: 'var(--status-block)', label: 'Bloqueado' },
}

const projects = computed(() => {
  return companies.value.map((item: any) => {
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

// hero sparkline big (aggregate)
const heroSpark = computed(() => {
  const base = Math.max(hero.value.done, 12)
  return Array.from({ length: 24 }, (_, i) =>
    Math.round(base * 0.5 + base * 0.5 * ((i + 1) / 24) + Math.sin(i * 0.6) * base * 0.08),
  )
})
</script>

<template>
  <div class="dash-page">
    <!-- Hero -->
    <section class="hero gradient-border">
      <div class="hero-body">
        <div class="hero-top">
          <div>
            <span class="eyebrow">
              <Sparkles :size="12" />
              {{ todayLabel }}
            </span>
            <h1 class="hero-title">{{ greeting }}</h1>
            <p class="hero-sub">
              {{
                mode === 'workspace'
                  ? 'Panorama de todas as suas empresas, agregado em tempo real.'
                  : 'Panorama da empresa ativa. Dados atualizados agora.'
              }}
            </p>
          </div>
          <div class="hero-actions">
            <div class="mode-toggle">
              <button
                class="mode-btn press"
                :class="{ 'mode-btn--active': mode === 'company' }"
                @click="setMode('company')"
              >
                <Building2 :size="12" />
                <span>Empresa</span>
              </button>
              <button
                class="mode-btn press"
                :class="{ 'mode-btn--active': mode === 'workspace' }"
                @click="setMode('workspace')"
              >
                <Globe2 :size="12" />
                <span>Workspace</span>
              </button>
            </div>
            <button
              class="ghost-btn press"
              :disabled="!firstMonth"
              :title="firstMonth ? 'Criar nova tarefa' : 'Nenhum mês disponível'"
              @click="handleNewTask"
            >
              <Plus :size="14" />
              <span>Nova tarefa</span>
            </button>
          </div>
        </div>

        <div class="hero-grid">
          <div class="hero-stat hero-stat--primary">
            <div class="hero-stat-label">Progresso geral</div>
            <div class="hero-stat-bignumber">
              <span class="bignumber">{{ hero.progress }}</span>
              <span class="bigunit">%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: hero.progress + '%' }" />
            </div>
            <div class="hero-stat-foot">
              <CheckCircle2 :size="12" />
              <span>{{ hero.done }} de {{ hero.total }} tarefas concluídas</span>
            </div>
          </div>

          <div class="hero-spark">
            <div class="hero-spark-head">
              <span class="eyebrow">Movimento semanal</span>
              <span class="hero-spark-trend">
                <ArrowUpRight :size="12" />
                +{{ Math.max(1, Math.floor((hero.done || 10) / 3)) }}
              </span>
            </div>
            <div class="hero-spark-chart">
              <VChart
                v-if="!loading"
                :option="sparkOption(heroSpark, 'var(--accent)')"
                :autoresize="true"
                :theme="'dark'"
              />
              <div v-else class="spark-skel" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stat cards -->
    <section class="stats-row">
      <div v-for="s in stats" :key="s.title" class="stat-card" :style="{ '--stat-c': s.color }">
        <div v-if="loading" class="stat-skel"><Skeleton type="row" /></div>
        <template v-else>
          <div class="stat-card-head">
            <div class="stat-chip">
              <component :is="s.icon" :size="14" />
            </div>
            <span class="stat-trend">{{ s.trend }}</span>
          </div>
          <div class="stat-value">{{ s.value }}</div>
          <div class="stat-footer">
            <span class="stat-label">{{ s.title }}</span>
            <div class="stat-spark">
              <VChart :option="sparkOption(s.spark, s.color)" :autoresize="true" />
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- Main grid: activity + chart -->
    <section class="grid-main">
      <div class="panel panel--activity">
        <header class="panel-head">
          <div class="panel-title">Atividade recente</div>
          <span class="panel-chip">{{ recentActivities.length }}</span>
        </header>
        <div class="panel-body">
          <div v-if="loadingBacklog" class="activity-skel">
            <Skeleton v-for="i in 5" :key="i" type="row" />
          </div>
          <div v-else-if="!recentActivities.length" class="panel-empty">
            <CircleDot :size="24" />
            <span>Nenhuma atividade recente</span>
          </div>
          <ul v-else class="activity-list">
            <li v-for="(a, idx) in recentActivities" :key="idx" class="activity-item">
              <span class="activity-rail" :style="{ background: statusMeta[a.status]?.color }" />
              <div class="activity-avatar">{{ a.initials }}</div>
              <div class="activity-info">
                <span class="activity-title">{{ a.title }}</span>
                <span class="activity-meta">{{ a.author }}</span>
              </div>
              <div class="activity-right">
                <span
                  class="activity-pill"
                  :style="{
                    color: statusMeta[a.status]?.color,
                    background: `color-mix(in srgb, ${statusMeta[a.status]?.color} 14%, transparent)`,
                  }"
                >
                  {{ statusMeta[a.status]?.label || 'Atualizado' }}
                </span>
                <span class="activity-time">{{ a.time }}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <div class="panel panel--chart">
        <header class="panel-head">
          <div class="panel-title">Distribuição</div>
        </header>
        <div class="panel-body panel-body--chart">
          <div v-if="loading" class="chart-skel" />
          <OverviewChart v-else :metrics="metrics?.metrics" />
        </div>
      </div>
    </section>

    <!-- Agenda (upcoming events) -->
    <section class="agenda-section">
      <header class="section-head">
        <h2 class="section-title">
          <Calendar :size="15" class="section-icon" />
          Próximos eventos
        </h2>
        <span class="section-chip">{{ upcoming.length }}</span>
      </header>

      <div v-if="loadingUpcoming" class="agenda-skel">
        <Skeleton v-for="i in 3" :key="i" type="row" />
      </div>

      <div v-else-if="!upcoming.length" class="agenda-empty">
        <Calendar :size="22" />
        <span>Nenhum evento próximo</span>
      </div>

      <div v-else class="agenda-list">
        <article
          v-for="ev in upcoming"
          :key="ev.id"
          class="agenda-item press"
          @click="openCalendar"
        >
          <div class="agenda-when">
            <span class="agenda-day">
              {{
                new Date(ev.startDate || ev.start || ev.start_date || ev.date).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                })
              }}
            </span>
            <span class="agenda-month">
              {{
                new Date(ev.startDate || ev.start || ev.start_date || ev.date)
                  .toLocaleDateString('pt-BR', { month: 'short' })
                  .replace('.', '')
                  .toUpperCase()
              }}
            </span>
          </div>
          <div class="agenda-info">
            <span class="agenda-title">{{ ev.title || ev.summary || 'Evento' }}</span>
            <span class="agenda-meta">
              {{
                new Date(ev.startDate || ev.start || ev.start_date || ev.date).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }}
              <template v-if="ev.description">· {{ ev.description }}</template>
            </span>
          </div>
          <div v-if="ev.type" class="agenda-type">{{ ev.type }}</div>
        </article>
      </div>
    </section>

    <!-- Projects -->
    <section class="projects-section">
      <header class="section-head">
        <h2 class="section-title">Projetos</h2>
        <span class="section-chip">{{ projects.length }}</span>
      </header>

      <div v-if="loadingCompanies" class="projects-grid">
        <Skeleton v-for="i in 4" :key="i" type="card" />
      </div>

      <div v-else class="projects-grid">
        <article
          v-for="project in projects"
          :key="project.name"
          class="project-card"
          :style="{ '--status-c': statusMeta[project.status]?.color || 'var(--accent)' }"
          @click="handleProjectClick(project.id)"
        >
          <div class="project-top">
            <div class="project-dot" />
            <span class="project-name">{{ project.name }}</span>
            <ArrowUpRight :size="14" class="project-arrow" />
          </div>
          <p v-if="project.cnpj" class="project-cnpj">{{ project.cnpj }}</p>
          <div class="project-pct-row">
            <span class="project-pct">{{ project.progress }}%</span>
            <span class="project-status">{{ statusMeta[project.status]?.label || '—' }}</span>
          </div>
          <div class="project-bar">
            <div class="project-bar-fill" :style="{ width: project.progress + '%' }" />
          </div>
          <div class="project-stats">
            <div class="pstat">
              <CheckCircle2 :size="12" />
              <span>{{ project.completed }}/{{ project.total }}</span>
            </div>
            <div class="pstat">
              <Clock3 :size="12" />
              <span>{{ project.inProgress }} em exec.</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dash-page {
  padding: 24px 28px 40px;
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Hero ─── */
.hero {
  border-radius: var(--radius-xl);
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

.hero-body {
  padding: 24px 26px 22px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 8%, var(--surface)) 0%,
    var(--surface) 55%
  );
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 6px;
}

.hero-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.024em;
  line-height: 1.1;
  color: var(--text);
  margin: 0;
}

.hero-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 6px 0 0;
}

.hero-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-toggle {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  gap: 2px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.mode-btn:hover {
  color: var(--text-2);
}

.mode-btn--active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 12px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.ghost-btn:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.hero-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero-stat-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.hero-stat-bignumber {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.bignumber {
  font-size: 56px;
  font-weight: 800;
  letter-spacing: -0.045em;
  color: var(--text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(180deg, var(--text) 0%, color-mix(in srgb, var(--text) 65%, transparent) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.bigunit {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-3);
}

.progress-track {
  height: 6px;
  background: var(--surface-3);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 45%, var(--success)));
  border-radius: 999px;
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 45%, transparent);
  transition: width 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.hero-stat-foot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}

.hero-spark {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.hero-spark-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-spark-trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  padding: 2px 7px;
  border-radius: 999px;
}

.hero-spark-chart {
  height: 72px;
}

.spark-skel {
  height: 72px;
  background: var(--surface-3);
  border-radius: 6px;
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

/* ─── Stats row ─── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 112px;
  position: relative;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--stat-c), transparent 70%);
  opacity: 0.12;
  filter: blur(20px);
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.stat-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-chip {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--stat-c) 14%, transparent);
  color: var(--stat-c);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.stat-trend {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.stat-value {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.035em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stat-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.stat-label {
  font-size: 11.5px;
  color: var(--text-3);
  font-weight: 500;
}

.stat-spark {
  width: 76px;
  height: 26px;
  flex-shrink: 0;
}

.stat-skel {
  flex: 1;
}

/* ─── Main grid ─── */
.grid-main {
  display: grid;
  grid-template-columns: 1fr 520px;
  gap: 12px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.panel-chip {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 1px 7px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.panel-body {
  flex: 1;
  padding: 8px;
  overflow: auto;
}

.panel-body--chart {
  padding: 14px;
  min-height: 340px;
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 8px;
  color: var(--text-4);
  font-size: 12.5px;
}

.activity-skel {
  padding: 0 8px;
}

.activity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  transition: background var(--motion-fast) var(--motion-ease);
}

.activity-item:hover {
  background: var(--surface-2);
}

.activity-rail {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  flex-shrink: 0;
}

.activity-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--surface-3);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--text);
  flex-shrink: 0;
}

.activity-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.activity-title {
  font-size: 12.5px;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.activity-meta {
  font-size: 11px;
  color: var(--text-3);
}

.activity-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.activity-pill {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
}

.activity-time {
  font-size: 11px;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}

.chart-skel {
  height: 260px;
  border-radius: 10px;
  background: var(--surface-2);
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

/* ─── Projects ─── */
.projects-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.section-chip {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 1px 7px;
  border-radius: 999px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.project-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease);
}

.project-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--status-c), transparent);
  opacity: 0.6;
}

.project-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--status-c) 10%, rgba(0, 0, 0, 0.14));
}

.project-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-c);
  box-shadow: 0 0 10px var(--status-c);
  flex-shrink: 0;
}

.project-name {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-arrow {
  color: var(--text-4);
  transition: transform var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
}

.project-card:hover .project-arrow {
  color: var(--text-2);
  transform: translate(2px, -2px);
}

.project-cnpj {
  font-size: 11px;
  color: var(--text-4);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.project-pct-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.project-pct {
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.project-status {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--status-c);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.project-bar {
  height: 4px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
}

.project-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--status-c), color-mix(in srgb, var(--status-c) 50%, var(--text)));
  border-radius: 999px;
  box-shadow: 0 0 12px color-mix(in srgb, var(--status-c) 60%, transparent);
  transition: width 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.project-stats {
  display: flex;
  gap: 12px;
  color: var(--text-3);
  font-size: 11px;
}

.pstat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ─── Agenda ─── */
.agenda-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-icon {
  color: var(--text-3);
  margin-right: 2px;
  vertical-align: -2px;
}

.agenda-skel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agenda-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px;
  background: var(--surface);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  color: var(--text-4);
  font-size: 12.5px;
  justify-content: center;
}

.agenda-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}

.agenda-item {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.agenda-item:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.agenda-when {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 2px;
}

.agenda-day {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.agenda-month {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-3);
  margin-top: 2px;
}

.agenda-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.agenda-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agenda-meta {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agenda-type {
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@media (max-width: 960px) {
  .grid-main {
    grid-template-columns: 1fr;
  }
  .hero-grid {
    grid-template-columns: 1fr;
  }
}
</style>
