<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import dashboardService from '@/service/dashboard/dashboard-service'

const router = useRouter()
const workspace = useWorkspaceStore()

const loading = ref(true)
const selectedCompanyId = ref<string | null>(null)

const stats = computed(() => {
  if (!workspace.workspaceData?.summary) return []
  const s = workspace.workspaceData.summary
  
  return [
    {
      title: 'Empresas',
      value: s.totalCompanies.toString(),
      icon: 'mdi-domain',
      color: '#3B82F6',
      trend: `${s.totalCompanies} ativas`,
    },
    {
      title: 'Minhas Tarefas',
      value: s.totalMyAssignments.toString(),
      icon: 'mdi-account-check',
      color: '#10B981',
      trend: `${s.totalMyAssignments} atribuídas`,
    },
    {
      title: 'Em Progresso',
      value: s.totalInProgress.toString(),
      icon: 'mdi-progress-clock',
      color: '#F59E0B',
      trend: `${s.totalInProgress} ativas`,
    },
    {
      title: 'Atrasadas',
      value: s.totalOverdue.toString(),
      icon: 'mdi-alert-circle',
      color: '#EF4444',
      trend: s.totalOverdue > 0 ? 'Atenção!' : 'Tudo certo',
    },
  ]
})

const filteredActivities = computed(() => {
  let activities = workspace.workspaceData?.activities || []
  
  // Filtro por empresa
  if (selectedCompanyId.value) {
    activities = activities.filter(a => a.companyId === selectedCompanyId.value)
  }
  
  // Ordenar: prioridade alta primeiro, depois por data
  return activities.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    return 0
  }).slice(0, 20) // Limitar a 20 atividades
})

const companiesWithMetrics = computed(() => {
  return workspace.workspaceData?.companies || []
})

const statusConfig: Record<string, { color: string; label: string }> = {
  'TODO': { color: '#3B82F6', label: 'A Fazer' },
  'IN_PROGRESS': { color: '#F59E0B', label: 'Em Andamento' },
  'IN_TESTING': { color: '#8B5CF6', label: 'Em Teste' },
  'DONE': { color: '#10B981', label: 'Concluído' },
}

const roleConfig: Record<string, { color: string; label: string }> = {
  'OWNER': { color: '#EF4444', label: 'Proprietário' },
  'ADMIN': { color: '#F59E0B', label: 'Admin' },
  'WORKER': { color: '#3B82F6', label: 'Membro' },
  'VIEWER': { color: '#6B7280', label: 'Visualizador' },
  'CLIENT': { color: '#10B981', label: 'Cliente' },
}

onMounted(async () => {
  try {
    await workspace.fetchWorkspace()
  } catch (e) {
    console.error('Erro ao carregar workspace:', e)
  } finally {
    loading.value = false
  }
})

function enterCompany(companyId: string) {
  workspace.setActiveCompany(companyId)
  router.push('/')
}

function filterByCompany(companyId: string | null) {
  selectedCompanyId.value = companyId
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Sem data'
  const date = new Date(dateString)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  
  if (days < 0) return `Atrasada ${Math.abs(days)} dias`
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  return `Em ${days} dias`
}

function getPriorityLabel(priority: number): string {
  return `P${priority}`
}
</script>

<template>
  <div class="workspace-page">
    <!-- Header -->
    <div class="workspace-header">
      <div>
        <h1 class="workspace-title">Workspace Central</h1>
        <p class="workspace-sub">Visão unificada de todas as suas empresas</p>
      </div>
    </div>

    <!-- Stats -->
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

    <!-- Main Content -->
    <div class="workspace-content">
      <!-- Companies Grid -->
      <div class="workspace-panel">
        <div class="panel-header">
          <span class="panel-title">Suas Empresas</span>
          <span class="panel-count">{{ companiesWithMetrics.length }}</span>
        </div>
        <div class="panel-body">
          <div v-if="loading" class="companies-skeleton">
            <div v-for="i in 3" :key="i" class="company-skeleton" />
          </div>
          <div v-else-if="companiesWithMetrics.length === 0" class="panel-empty">
            <v-icon size="36" color="grey-darken-2">mdi-domain-off</v-icon>
            <span>Nenhuma empresa encontrada</span>
          </div>
          <div v-else class="companies-grid">
            <div
              v-for="item in companiesWithMetrics"
              :key="item.company.id"
              class="company-card"
              :class="{ 'company-card--active': selectedCompanyId === item.company.id }"
              @click="filterByCompany(item.company.id)"
            >
              <div class="company-card-top">
                <div class="company-info">
                  <span class="company-name">{{ item.company.name }}</span>
                  <span class="company-cnpj">{{ item.company.cnpj }}</span>
                </div>
                <div
                  class="role-badge"
                  :style="{ 
                    color: roleConfig[item.company.myRole]?.color,
                    backgroundColor: (roleConfig[item.company.myRole]?.color || '#000') + '14'
                  }"
                >
                  {{ roleConfig[item.company.myRole]?.label || item.company.myRole }}
                </div>
              </div>

              <div class="company-metrics">
                <div class="metric">
                  <span class="metric-value">{{ item.metrics.total }}</span>
                  <span class="metric-label">Total</span>
                </div>
                <div class="metric">
                  <span class="metric-value" style="color: #10B981">{{ item.metrics.completed }}</span>
                  <span class="metric-label">Concluídas</span>
                </div>
                <div class="metric">
                  <span class="metric-value" style="color: #F59E0B">{{ item.metrics.inProgress }}</span>
                  <span class="metric-label">Andamento</span>
                </div>
                <div class="metric">
                  <span class="metric-value" :style="{ color: item.metrics.overdue > 0 ? '#EF4444' : '#6B7280' }">
                    {{ item.metrics.overdue }}
                  </span>
                  <span class="metric-label">Atrasadas</span>
                </div>
              </div>

              <div class="company-actions">
                <button class="action-btn action-btn--enter" @click.stop="enterCompany(item.company.id)">
                  <v-icon size="14">mdi-arrow-right</v-icon>
                  Entrar
                </button>
              </div>
            </div>
          </div>

          <!-- Filter indicator -->
          <div v-if="selectedCompanyId" class="filter-indicator">
            <span>Filtrando por empresa selecionada</span>
            <button class="clear-filter" @click="filterByCompany(null)">
              <v-icon size="14">mdi-close</v-icon>
              Limpar filtro
            </button>
          </div>
        </div>
      </div>

      <!-- Activities List -->
      <div class="workspace-panel workspace-panel--wide">
        <div class="panel-header">
          <span class="panel-title">Atividades Consolidadas</span>
          <span class="panel-count">{{ filteredActivities.length }}</span>
        </div>
        <div class="panel-body">
          <div v-if="loading" class="activities-skeleton">
            <div v-for="i in 5" :key="i" class="activity-skeleton" />
          </div>
          <div v-else-if="filteredActivities.length === 0" class="panel-empty">
            <v-icon size="36" color="grey-darken-2">mdi-check-all</v-icon>
            <span>Nenhuma atividade pendente</span>
          </div>
          <div v-else class="activities-list">
            <div
              v-for="activity in filteredActivities"
              :key="activity.id"
              class="activity-item"
              :class="{ 'activity-item--mine': activity.isMine }"
            >
              <div class="activity-left">
                <div
                  class="activity-status-dot"
                  :style="{ backgroundColor: statusConfig[activity.status]?.color }"
                />
                <div class="activity-info">
                  <div class="activity-header">
                    <span class="activity-title">{{ activity.title }}</span>
                    <div class="activity-badges">
                      <span
                        v-if="activity.priority < 3"
                        class="priority-badge"
                        :class="`priority-${activity.priority}`"
                      >
                        {{ getPriorityLabel(activity.priority) }}
                      </span>
                      <span
                        class="company-badge"
                        :style="{ backgroundColor: roleConfig[activity.myRole]?.color + '14' }"
                      >
                        {{ activity.companyName }} • {{ activity.quarter }}
                      </span>
                    </div>
                  </div>
                  <div class="activity-meta">
                    <span
                      class="activity-date"
                      :class="{ 'activity-date--overdue': activity.dueDate && new Date(activity.dueDate) < new Date() && activity.status !== 'DONE' }"
                    >
                      {{ formatDate(activity.dueDate) }}
                    </span>
                    <span class="activity-responsibles">
                      <span
                        v-for="(resp, idx) in activity.responsibles.slice(0, 2)"
                        :key="resp.id"
                        class="responsible-tag"
                        :class="{ 'responsible-tag--me': resp.isMe }"
                      >
                        {{ resp.isMe ? 'Eu' : resp.name }}
                        <span v-if="idx < activity.responsibles.slice(0, 2).length - 1">, </span>
                      </span>
                      <span v-if="activity.responsibles.length > 2" class="more-responsibles">
                        +{{ activity.responsibles.length - 2 }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  padding: 24px;
  min-width: 720px;
}

.workspace-header {
  margin-bottom: 20px;
}

.workspace-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  letter-spacing: -0.02em;
  margin: 0 0 3px;
}

.workspace-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
  margin: 0;
}

/* Stats */
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

/* Content Layout */
.workspace-content {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 16px;
}

.workspace-panel {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  overflow: hidden;
}

.workspace-panel--wide {
  grid-column: 2;
  grid-row: 1 / span 2;
}

.panel-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-title {
  font-size: 13.5px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  letter-spacing: 0.01em;
}

.panel-count {
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.35);
  background: rgba(var(--v-theme-secondary), 0.07);
  padding: 1px 7px;
  border-radius: 999px;
}

.panel-body {
  padding: 12px;
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

/* Companies */
.companies-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.company-skeleton {
  height: 120px;
  border-radius: 10px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
}

.companies-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.company-card {
  background: rgba(var(--v-theme-secondary), 0.03);
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.company-card:hover {
  border-color: rgba(var(--v-theme-secondary), 0.15);
  background: rgba(var(--v-theme-secondary), 0.05);
}

.company-card--active {
  border-color: rgba(var(--v-theme-secondary), 0.25);
  background: rgba(var(--v-theme-secondary), 0.08);
}

.company-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.company-info {
  flex: 1;
  min-width: 0;
}

.company-name {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.company-cnpj {
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.role-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.company-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}

.metric {
  text-align: center;
  padding: 6px;
  background: rgba(var(--v-theme-secondary), 0.04);
  border-radius: 6px;
}

.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  display: block;
}

.metric-label {
  font-size: 10px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.company-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
  font-family: inherit;
}

.action-btn--enter {
  background: rgba(var(--v-theme-secondary), 0.08);
  color: rgba(var(--v-theme-secondary), 0.8);
}

.action-btn--enter:hover {
  background: rgba(var(--v-theme-secondary), 0.12);
  color: rgb(var(--v-theme-secondary));
}

.filter-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(var(--v-theme-secondary), 0.06);
  border-radius: 8px;
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.6);
}

.clear-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  border: none;
  background: transparent;
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.7);
  cursor: pointer;
  transition: all 0.12s ease;
}

.clear-filter:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

/* Activities */
.activities-skeleton {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-skeleton {
  height: 60px;
  border-radius: 8px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
}

.activities-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 600px;
  overflow-y: auto;
}

.activity-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  transition: background 0.12s ease;
  border: 1px solid transparent;
}

.activity-item:hover {
  background: rgba(var(--v-theme-secondary), 0.04);
  border-color: rgba(var(--v-theme-secondary), 0.08);
}

.activity-item--mine {
  background: rgba(59, 130, 246, 0.04);
  border-color: rgba(59, 130, 246, 0.1);
}

.activity-item--mine:hover {
  background: rgba(59, 130, 246, 0.06);
}

.activity-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.activity-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.activity-info {
  flex: 1;
  min-width: 0;
}

.activity-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.activity-title {
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.priority-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
}

.priority-0 { background: rgba(239, 68, 68, 0.15); color: #EF4444; }
.priority-1 { background: rgba(245, 158, 11, 0.15); color: #F59E0B; }
.priority-2 { background: rgba(59, 130, 246, 0.15); color: #3B82F6; }

.company-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  color: rgba(var(--v-theme-secondary), 0.6);
}

.activity-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.45);
}

.activity-date {
  font-weight: 500;
}

.activity-date--overdue {
  color: #EF4444;
  font-weight: 600;
}

.activity-responsibles {
  display: flex;
  align-items: center;
  gap: 4px;
}

.responsible-tag {
  color: rgba(var(--v-theme-secondary), 0.5);
}

.responsible-tag--me {
  color: #3B82F6;
  font-weight: 600;
}

.more-responsibles {
  font-size: 10px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.activity-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
