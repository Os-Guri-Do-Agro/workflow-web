<script setup lang="ts">
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import dashboardService from '@/service/dashboard/dashboard-service'
import companiesServices from '@/service/companies/companies-services'
import { ref, onMounted, computed, watch } from 'vue'
import backlogService from '@/service/backlog/backlog-service'
import { useActiveCompanyId } from '@/stores/authStores'

const activeCompanyStore = useActiveCompanyId()

const metrics = ref<any>(null)
const backlog = ref<any[]>([])
const showCompanyModal = ref(false)
const showUserModal = ref(false)
const companies = ref<any[]>([])
const loading = ref(true)
const loadingCompanies = ref(true)
const loadingBacklog = ref(true)

const findCompanies = async () => {
  loadingCompanies.value = true
  try {
    const response = await companiesServices.companyWithMetrics()
    companies.value = Array.isArray(response) ? response : response?.data || []
  } catch (error) {
    console.error('Erro ao buscar empresas:', error)
  } finally {
    loadingCompanies.value = false
  }
}

const findMetrics = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  loading.value = true
  try {
    const res = await dashboardService.getCompanyMetrics(companyId)
    metrics.value = res
  } catch (e) {
    console.error('Erro ao buscar métricas:', e)
  } finally {
    loading.value = false
  }
}

const findBacklog = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  loadingBacklog.value = true
  try {
    const response = await backlogService.getBacklogByCompany(companyId)
    backlog.value = response
  } catch (e) {
    console.error('Erro ao buscar backlog:', e)
  } finally {
    loadingBacklog.value = false
  }
}

const ensureActiveCompany = async () => {
  if (!localStorage.getItem('activeCompany')) {
    try {
      const response = await companiesServices.getCompany()
      const companies = Array.isArray(response) ? response : response?.data || []
      if (companies.length > 0) {
        const firstCompanyId = companies[0]?.company?.id || companies[0]?.id
        if (firstCompanyId) {
          localStorage.setItem('activeCompany', firstCompanyId)
        }
      }
    } catch (e) {
      console.error('Erro ao buscar empresas:', e)
    }
  }
}

onMounted(async () => {
  await ensureActiveCompany()
  await findMetrics()
  await findBacklog()
  await findCompanies()
})

watch(
  () => activeCompanyStore.companyId,
  async (newId) => {
    if (newId) {
      await findMetrics()
      await findBacklog()
    }
  },
)

const stats = computed(() => {
  if (!metrics.value?.metrics) return []
  const m = metrics.value.metrics
  return [
    {
      title: 'Total',
      value: m.total?.toString() || '0',
      icon: 'mdi-folder-outline',
      color: '#3B82F6',
      trend: `${m.progress || 0}%`,
    },
    {
      title: 'Concluídas',
      value: m.status?.completed?.toString() || '0',
      icon: 'mdi-check-circle-outline',
      color: '#10B981',
      trend: `${Math.round((m.status?.completed / m.total) * 100) || 0}%`,
    },
    {
      title: 'Em Progresso',
      value: m.status?.inProgress?.toString() || '0',
      icon: 'mdi-progress-clock',
      color: '#F59E0B',
      trend: `${Math.round((m.status?.inProgress / m.total) * 100) || 0}%`,
    },
    {
      title: 'Atrasadas',
      value: m.time?.overdue?.toString() || '0',
      icon: 'mdi-alert-circle-outline',
      color: '#EF4444',
      trend: `${m.time?.dueThisWeek || 0} esta semana`,
    },
  ]
})

const recentActivities = computed(() => {
  return backlog.value.slice(0, 10).map((item) => ({
    title: item.activityTitle,
    company: item.changedBy?.name || 'Sem responsável',
    time: new Date(item.changedAt).toLocaleString('pt-BR'),
    status: item.newStatus?.toLowerCase().replace('_', '-') || 'todo',
  }))
})

const projects = computed(() => {
  return companies.value.map((item) => {
    const { company, role } = item
    const { metrics } = company
    const progress = metrics?.progress || 0
    let status = 'planning'
    if (progress === 100) status = 'done'
    else if (progress >= 50) status = 'in-progress'
    else if (progress > 0) status = 'planning'

    return {
      name: company.name,
      progress,
      cnpj: company.cnpj,
      total: metrics?.total || 0,
      completed: metrics?.completed || 0,
      inProgress: metrics?.inProgress || 0,
      status,
    }
  })
})

const statusConfig: Record<string, { color: string; label: string }> = {
  todo: { color: '#3B82F6', label: 'A Fazer' },
  'in-progress': { color: '#F59E0B', label: 'Em Andamento' },
  testing: { color: '#8B5CF6', label: 'Em Teste' },
  done: { color: '#10B981', label: 'Concluído' },
  completed: { color: '#10B981', label: 'Concluído' },
  planning: { color: '#3B82F6', label: 'Planejamento' },
  review: { color: '#8B5CF6', label: 'Em Revisão' },
}

const handleProjectClick = (projectName: string) => {
  console.log('Projeto clicado:', projectName)
  // Implementação futura: navegação para detalhes do projeto
}
</script>

<template>
  <div class="dashboard-page">
    <!-- Header -->
    <div class="dash-header">
      <div>
        <h1 class="dash-title">Dashboard</h1>
        <p class="dash-sub">Visão geral da empresa ativa</p>
      </div>
    </div>

    <!-- Stats row -->
    <div class="stats-row">
      <div v-for="stat in stats" :key="stat.title" class="stat-card">
        <div v-if="loading" class="stat-skeleton" />
        <template v-else>
          <div class="stat-left">
            <div class="stat-icon-wrap" :style="{ backgroundColor: stat.color + '18' }">
              <v-icon :color="stat.color" size="18">{{ stat.icon }}</v-icon>
            </div>
            <div>
              <div class="stat-value">{{ stat.value }}</div>
              <div class="stat-label">{{ stat.title }}</div>
            </div>
          </div>
          <div class="stat-trend" :style="{ color: stat.color, backgroundColor: stat.color + '12' }">
            {{ stat.trend }}
          </div>
        </template>
      </div>
    </div>

    <!-- Main content -->
    <div class="dash-content">
      <!-- Recent activity -->
      <div class="dash-panel dash-panel--wide">
        <div class="panel-header">
          <span class="panel-title">Atividades Recentes</span>
        </div>
        <div class="panel-body activity-list">
          <div v-if="loadingBacklog" class="activity-skeletons">
            <div v-for="i in 5" :key="i" class="activity-skeleton" />
          </div>
          <div v-else-if="recentActivities.length === 0" class="panel-empty">
            <v-icon size="36" color="grey-darken-2">mdi-inbox-outline</v-icon>
            <span>Nenhuma atividade recente</span>
          </div>
          <div
            v-else
            v-for="(activity, idx) in recentActivities"
            :key="idx"
            class="activity-item"
          >
            <div
              class="activity-dot"
              :style="{ backgroundColor: statusConfig[activity.status]?.color }"
            />
            <div class="activity-info">
              <span class="activity-title-text">{{ activity.title }}</span>
              <span class="activity-meta">{{ activity.company }} · {{ activity.time }}</span>
            </div>
            <div
              v-if="statusConfig[activity.status]"
              class="activity-status-badge"
              :style="{
                color: statusConfig[activity.status]?.color,
                backgroundColor: (statusConfig[activity.status]?.color || '#000') + '14',
              }"
            >
              {{ statusConfig[activity.status]?.label }}
            </div>
          </div>
        </div>
      </div>

      <!-- Chart -->
      <div class="dash-panel">
        <div class="panel-header">
          <span class="panel-title">Distribuição</span>
        </div>
        <div class="panel-body">
          <div v-if="loading" class="chart-skeleton" />
          <OverviewChart v-else :metrics="metrics?.metrics" />
        </div>
      </div>
    </div>

    <!-- Projects section -->
    <div class="section-header">
      <span class="section-title">Projetos</span>
      <span class="section-count">{{ projects.length }}</span>
    </div>

    <div v-if="loadingCompanies" class="projects-grid">
      <div v-for="i in 4" :key="i" class="project-skeleton" />
    </div>

    <div v-else class="projects-grid">
      <div
        v-for="project in projects"
        :key="project.name"
        class="project-card"
        @click="handleProjectClick(project.name)"
      >
        <div class="project-top">
          <span class="project-name">{{ project.name }}</span>
          <div
            class="project-status-dot"
            :style="{ backgroundColor: statusConfig[project.status]?.color }"
          />
        </div>

        <p class="project-cnpj">{{ project.cnpj }}</p>

        <div class="project-progress-row">
          <div class="project-bar-bg">
            <div
              class="project-bar-fill"
              :style="{
                width: project.progress + '%',
                backgroundColor: statusConfig[project.status]?.color,
              }"
            />
          </div>
          <span
            class="project-pct"
            :style="{ color: statusConfig[project.status]?.color }"
          >{{ project.progress }}%</span>
        </div>

        <div class="project-stats">
          <span class="project-stat">
            <v-icon size="13">mdi-check-circle-outline</v-icon>
            {{ project.completed }}/{{ project.total }}
          </span>
          <span class="project-stat">
            <v-icon size="13">mdi-progress-clock</v-icon>
            {{ project.inProgress }} em andamento
          </span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ─── Layout ─── */
.dashboard-page {
  padding: 24px;
  min-width: 720px;
}

.dash-header {
  margin-bottom: 20px;
}

.dash-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  letter-spacing: -0.02em;
  margin: 0 0 3px;
}

.dash-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
  margin: 0;
}

/* ─── Stats ─── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.stat-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  transition: border-color 0.15s ease;
}

.stat-card:hover {
  border-color: rgba(var(--v-theme-secondary), 0.13);
}

.stat-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stat-icon-wrap {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  line-height: 1;
  letter-spacing: -0.03em;
}

.stat-label {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.45);
  margin-top: 2px;
  white-space: nowrap;
}

.stat-trend {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.stat-skeleton {
  height: 48px;
  border-radius: 8px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

/* ─── Main content ─── */
.dash-content {
  display: grid;
  grid-template-columns: 1fr 600px;
  gap: 10px;
  margin-bottom: 20px;
}

/* ─── Panel ─── */
.dash-panel {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  overflow: hidden;
}

.panel-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.06);
}

.panel-title {
  font-size: 13.5px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  letter-spacing: 0.01em;
}

.panel-body {
  padding: 10px;
}

.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 8px;
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.35);
}

/* ─── Activity list ─── */
.activity-list {
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 6px;
  border-radius: 8px;
  transition: background 0.12s ease;
}

.activity-item:hover {
  background: rgba(var(--v-theme-secondary), 0.04);
}

.activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.activity-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.activity-title-text {
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-meta {
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.38);
}

.activity-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.activity-skeletons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-skeleton {
  height: 38px;
  border-radius: 8px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

/* chart panel */
.chart-skeleton {
  height: 200px;
  border-radius: 8px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

/* ─── Projects ─── */
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 13.5px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
}

.section-count {
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.35);
  background: rgba(var(--v-theme-secondary), 0.07);
  padding: 1px 7px;
  border-radius: 999px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.project-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  border-color: rgba(var(--v-theme-secondary), 0.13);
}

.project-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.project-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 8px;
}

.project-cnpj {
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.32);
  margin: 0 0 12px;
}

.project-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.project-bar-bg {
  flex: 1;
  height: 4px;
  background: rgba(var(--v-theme-secondary), 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.project-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.4s ease;
}

.project-pct {
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 32px;
  text-align: right;
}

.project-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.project-stat {
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.38);
  display: flex;
  align-items: center;
  gap: 5px;
}

.project-skeleton {
  height: 140px;
  border-radius: 12px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
