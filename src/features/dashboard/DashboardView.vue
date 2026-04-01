<script setup lang="ts">
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import companiesServices from '@/service/companies/companies-services'
import { ref, onMounted, computed } from 'vue'
import { useActiveCompanyId } from '@/stores/authStores'
import { useDashboardMetrics } from '@/composables/useDashboardMetrics'
import { useBacklog } from '@/composables/useBacklog'

const activeCompanyStore = useActiveCompanyId()

const showCompanyModal = ref(false)
const showUserModal = ref(false)
const companies = ref<any[]>([])
const loadingCompanies = ref(true)

const companyId = computed(() => activeCompanyStore.companyId ?? localStorage.getItem('activeCompany') ?? '')

const { data: metricsData, isLoading: loading } = useDashboardMetrics(companyId)
const { data: backlogData, isLoading: loadingBacklog } = useBacklog(companyId)

const metrics = computed(() => metricsData.value ?? null)
const backlog = computed(() => backlogData.value ?? [])

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
      console.error('Erro ao buscar empresas:', e)
    }
  }
}

onMounted(async () => {
  await ensureActiveCompany()
  findCompanies()
})

const stats = computed(() => {
  if (!metrics.value?.metrics) return []
  const m = metrics.value.metrics
  return [
    {
      title: 'Total',
      value: m.total?.toString() || '0',
      icon: 'mdi-folder',
      color: '#000080',
      trend: `${m.progress || 0}%`,
    },
    {
      title: 'Concluídas',
      value: m.status?.completed?.toString() || '0',
      icon: 'mdi-check-circle',
      color: '#008000',
      trend: `${Math.round((m.status?.completed / m.total) * 100) || 0}%`,
    },
    {
      title: 'Em Progresso',
      value: m.status?.inProgress?.toString() || '0',
      icon: 'mdi-progress-clock',
      color: '#808000',
      trend: `${Math.round((m.status?.inProgress / m.total) * 100) || 0}%`,
    },
    {
      title: 'Atrasadas',
      value: m.time?.overdue?.toString() || '0',
      icon: 'mdi-alert-circle',
      color: '#800000',
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
  todo: { color: '#000080', label: 'A Fazer' },
  'in-progress': { color: '#808000', label: 'Em Andamento' },
  testing: { color: '#800080', label: 'Em Teste' },
  done: { color: '#008000', label: 'Concluído' },
  completed: { color: '#008000', label: 'Concluído' },
  planning: { color: '#000080', label: 'Planejamento' },
  review: { color: '#800080', label: 'Em Revisão' },
}

const handleProjectClick = (projectName: string) => {
  console.log('Projeto clicado:', projectName)
}
</script>

<template>
  <div class="win-desktop">

    <!-- ── Title bar window ── -->
    <div class="win-window">

      <!-- Window chrome title bar -->
      <div class="win-titlebar">
        <div class="win-titlebar-left">
          <img src="/icone.png" class="win-titlebar-icon" alt="" />
          <span>Dashboard – Visão Geral</span>
        </div>
        <div class="win-titlebar-buttons">
          <button class="win-chrome-btn win-min" title="Minimizar">_</button>
          <button class="win-chrome-btn win-max" title="Maximizar">□</button>
          <button class="win-chrome-btn win-close" title="Fechar">✕</button>
        </div>
      </div>

      <!-- Menu bar -->
      <div class="win-menubar">
        <span class="win-menu-item">Arquivo</span>
        <span class="win-menu-item">Editar</span>
        <span class="win-menu-item">Exibir</span>
        <span class="win-menu-item">Ferramentas</span>
        <span class="win-menu-item">Ajuda</span>
      </div>

      <!-- Toolbar strip -->
      <div class="win-toolbar">
        <button class="win-toolbar-btn">
          <v-icon size="14">mdi-refresh</v-icon>
          <span>Atualizar</span>
        </button>
        <div class="win-toolbar-sep"></div>
        <button class="win-toolbar-btn">
          <v-icon size="14">mdi-printer</v-icon>
          <span>Imprimir</span>
        </button>
        <button class="win-toolbar-btn">
          <v-icon size="14">mdi-help-circle-outline</v-icon>
          <span>Ajuda</span>
        </button>
      </div>

      <!-- Address bar -->
      <div class="win-addressbar">
        <span class="win-addressbar-label">Endereço:</span>
        <div class="win-addressbar-input">
          <v-icon size="13">mdi-folder-outline</v-icon>
          <span>C:\Forge\Dashboard</span>
        </div>
        <button class="win-addressbar-go">Ir</button>
      </div>

      <!-- Window body -->
      <div class="win-body">

        <!-- Stats row -->
        <div class="stats-row">
          <div v-for="stat in stats" :key="stat.title" class="win-stat-card">
            <div class="win-stat-card-title">
              <v-icon size="14" :color="stat.color">{{ stat.icon }}</v-icon>
              {{ stat.title }}
            </div>
            <div v-if="loading" class="win-skeleton" style="height:28px;" />
            <template v-else>
              <div class="win-stat-value" :style="{ color: stat.color }">{{ stat.value }}</div>
              <div class="win-stat-trend">{{ stat.trend }}</div>
            </template>
          </div>
        </div>

        <!-- Main content -->
        <div class="dash-content">

          <!-- Recent activity panel -->
          <div class="win-panel">
            <div class="win-panel-titlebar">
              <v-icon size="12" color="white">mdi-clock-outline</v-icon>
              Atividades Recentes
            </div>
            <div class="win-panel-body win-list-container">
              <div v-if="loadingBacklog" class="win-loading">
                <v-icon size="20" class="win-spin">mdi-loading</v-icon>
                Carregando...
              </div>
              <div v-else-if="recentActivities.length === 0" class="win-empty">
                <v-icon size="32">mdi-inbox-outline</v-icon>
                <span>Nenhuma atividade recente</span>
              </div>
              <table v-else class="win-table">
                <thead>
                  <tr>
                    <th class="win-th">Nome</th>
                    <th class="win-th">Responsável</th>
                    <th class="win-th">Data</th>
                    <th class="win-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(activity, idx) in recentActivities"
                    :key="idx"
                    class="win-tr"
                    :class="{ 'win-tr-alt': idx % 2 === 1 }"
                  >
                    <td class="win-td win-td-name">
                      <span
                        class="win-status-dot"
                        :style="{ background: statusConfig[activity.status]?.color }"
                      />
                      {{ activity.title }}
                    </td>
                    <td class="win-td">{{ activity.company }}</td>
                    <td class="win-td win-td-time">{{ activity.time }}</td>
                    <td class="win-td">
                      <span
                        class="win-badge"
                        :style="{ color: statusConfig[activity.status]?.color, borderColor: statusConfig[activity.status]?.color }"
                      >
                        {{ statusConfig[activity.status]?.label }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Chart panel -->
          <div class="win-panel">
            <div class="win-panel-titlebar">
              <v-icon size="12" color="white">mdi-chart-pie</v-icon>
              Distribuição
            </div>
            <div class="win-panel-body">
              <div v-if="loading" class="win-skeleton" style="height:200px;" />
              <OverviewChart v-else :metrics="metrics?.metrics" />
            </div>
          </div>
        </div>

        <!-- Projects section -->
        <div class="win-section-header">
          <v-icon size="15">mdi-folder-multiple</v-icon>
          <span>Projetos</span>
          <span class="win-section-count">{{ projects.length }} objetos</span>
        </div>

        <div v-if="loadingCompanies" class="projects-grid">
          <div v-for="i in 4" :key="i" class="win-skeleton" style="height:120px;" />
        </div>

        <div v-else class="projects-grid">
          <div
            v-for="project in projects"
            :key="project.name"
            class="win-project-icon"
            @dblclick="handleProjectClick(project.name)"
          >
            <div class="win-folder-icon">
              <v-icon size="32" :color="statusConfig[project.status]?.color">mdi-folder</v-icon>
              <div
                class="win-folder-badge"
                :style="{ background: statusConfig[project.status]?.color }"
              >{{ project.progress }}%</div>
            </div>
            <span class="win-project-name">{{ project.name }}</span>
            <div class="win-project-detail">
              <div class="win-progress-bar">
                <div
                  class="win-progress-fill"
                  :style="{
                    width: project.progress + '%',
                    background: statusConfig[project.status]?.color,
                  }"
                />
              </div>
            </div>
            <span class="win-project-stats">{{ project.completed }}/{{ project.total }} tarefas</span>
          </div>
        </div>

      </div>

      <!-- Status bar -->
      <div class="win-statusbar">
        <span class="win-status-item">{{ projects.length }} empresa(s)</span>
        <span class="win-status-sep">|</span>
        <span class="win-status-item">{{ recentActivities.length }} atividades</span>
        <span class="win-status-sep">|</span>
        <span class="win-status-item">Microsoft Forge 2000</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── Base / Desktop ── */
.win-desktop {
  padding: 12px;
  min-width: 720px;
  background: #008080;
  min-height: 100vh;
  font-family: 'MS Sans Serif', 'Tahoma', 'Arial', sans-serif;
  font-size: 11px;
  color: #000;
}

/* ── Window chrome ── */
.win-window {
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  box-shadow: 1px 1px 0 #808080;
}

/* ── Title bar ── */
.win-titlebar {
  background: linear-gradient(to right, #000080, #1084D0);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: bold;
  padding: 3px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}
.win-titlebar-left {
  display: flex;
  align-items: center;
  gap: 5px;
}
.win-titlebar-icon {
  width: 16px;
  height: 16px;
  image-rendering: pixelated;
}
.win-titlebar-buttons {
  display: flex;
  gap: 2px;
}
.win-chrome-btn {
  width: 16px;
  height: 14px;
  font-size: 9px;
  line-height: 1;
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  background: #D4D0C8;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'MS Sans Serif', Tahoma, sans-serif;
  padding: 0;
}
.win-chrome-btn:active {
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
}
.win-close { background: #D4D0C8; }

/* ── Menu bar ── */
.win-menubar {
  background: #D4D0C8;
  border-bottom: 1px solid #808080;
  padding: 1px 4px;
  display: flex;
  gap: 0;
}
.win-menu-item {
  padding: 2px 7px;
  font-size: 11px;
  cursor: pointer;
}
.win-menu-item:hover {
  background: #000080;
  color: #FFFFFF;
}

/* ── Toolbar ── */
.win-toolbar {
  background: #D4D0C8;
  border-bottom: 1px solid #808080;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  gap: 2px;
}
.win-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  background: #D4D0C8;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
}
.win-toolbar-btn:hover {
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
}
.win-toolbar-btn:active {
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
}
.win-toolbar-sep {
  width: 1px;
  height: 20px;
  background: #808080;
  margin: 0 3px;
  box-shadow: 1px 0 #FFFFFF;
}

/* ── Address bar ── */
.win-addressbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-bottom: 1px solid #808080;
  background: #D4D0C8;
  font-size: 11px;
}
.win-addressbar-label {
  font-size: 11px;
  white-space: nowrap;
}
.win-addressbar-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  background: #FFFFFF;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
  padding: 1px 6px;
  font-size: 11px;
}
.win-addressbar-go {
  padding: 1px 10px;
  font-size: 11px;
  font-family: inherit;
  background: #D4D0C8;
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  cursor: pointer;
}
.win-addressbar-go:active {
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
}

/* ── Body ── */
.win-body {
  padding: 8px;
  background: #D4D0C8;
}

/* ── Stats ── */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
.win-stat-card {
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  padding: 6px 10px;
}
.win-stat-card-title {
  font-size: 10px;
  font-weight: bold;
  color: #000;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.win-stat-value {
  font-size: 28px;
  font-weight: bold;
  line-height: 1;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
}
.win-stat-trend {
  font-size: 10px;
  color: #444;
  margin-top: 2px;
}

/* ── Panels ── */
.dash-content {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 8px;
  margin-bottom: 10px;
}
.win-panel {
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
}
.win-panel-titlebar {
  background: linear-gradient(to right, #000080, #1084D0);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 6px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.win-panel-body {
  padding: 6px;
}
.win-list-container {
  max-height: 360px;
  overflow-y: auto;
}

/* ── Table ── */
.win-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.win-th {
  background: #D4D0C8;
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #808080;
  border-bottom: 1px solid #808080;
  padding: 2px 8px;
  text-align: left;
  font-weight: bold;
  white-space: nowrap;
  cursor: pointer;
}
.win-tr:hover td {
  background: #000080 !important;
  color: #FFFFFF !important;
}
.win-tr-alt td {
  background: #E8E4DC;
}
.win-td {
  padding: 2px 8px;
  border-bottom: 1px solid #C8C4BC;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.win-td-name {
  display: flex;
  align-items: center;
  gap: 5px;
}
.win-td-time {
  font-size: 10px;
  color: #444;
}
.win-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
.win-badge {
  font-size: 10px;
  padding: 1px 5px;
  border: 1px solid;
  background: transparent;
}

/* ── Section header ── */
.win-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: bold;
  border-bottom: 1px solid #808080;
  padding-bottom: 3px;
  margin-bottom: 8px;
}
.win-section-count {
  font-weight: normal;
  color: #555;
  margin-left: 4px;
}

/* ── Projects / folder icons ── */
.projects-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.win-project-icon {
  width: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 0;
}
.win-project-icon:hover {
  background: #000080;
  color: #FFFFFF;
  border: 1px dotted #AAAAFF;
}
.win-project-icon:hover .win-project-name,
.win-project-icon:hover .win-project-stats {
  color: #FFFFFF;
}
.win-folder-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.win-folder-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 8px;
  font-weight: bold;
  color: #FFFFFF;
  padding: 1px 3px;
  border-radius: 0;
  line-height: 1;
}
.win-project-name {
  font-size: 10px;
  text-align: center;
  word-break: break-word;
  max-width: 80px;
  line-height: 1.3;
  color: #000;
}
.win-project-stats {
  font-size: 9px;
  color: #555;
  text-align: center;
}
.win-project-detail {
  width: 80px;
}
.win-progress-bar {
  height: 8px;
  background: #FFFFFF;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
  overflow: hidden;
}
.win-progress-fill {
  height: 100%;
  transition: width 0.3s;
}

/* ── Status bar ── */
.win-statusbar {
  display: flex;
  align-items: center;
  gap: 0;
  border-top: 1px solid #808080;
  background: #D4D0C8;
  padding: 2px 6px;
  font-size: 11px;
}
.win-status-item {
  padding: 0 8px;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
  margin-right: 4px;
  line-height: 18px;
}
.win-status-sep {
  color: #808080;
  margin: 0 2px;
  display: none;
}

/* ── Utilities ── */
.win-skeleton {
  background: #C8C4BC;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
  width: 100%;
}
.win-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 16px;
  font-size: 11px;
  color: #555;
}
.win-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 6px;
  font-size: 12px;
  color: #555;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.win-spin {
  animation: spin 1s linear infinite;
}
</style>
