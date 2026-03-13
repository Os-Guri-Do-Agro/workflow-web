<script setup lang="ts">
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import dashboardService from '@/service/dashboard/dashboard-service'
import companiesServices from '@/service/companies/companies-services'
import { ref, onMounted, computed } from 'vue'
import backlogService from '@/service/backlog/backlog-service'
import { getUserToken} from '@/utils/authContent'

const metrics = ref<any>(null)
const backlog = ref<any[]>([])
const showCompanyModal = ref(false)
const showUserModal = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')
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
  <div style="overflow-x: auto">
    <v-container fluid class="pa-4 bg-background" style="min-width: 800px">
      <v-sheet color="transparent" class="mb-4">
        <div class="d-flex align-center justify-space-between">
          <div>
            <h1 style="font-size: 16px" class="font-weight-bold text-secondary mb-1">Dashboard</h1>
            <div
              class="d-flex align-center"
              style="font-size: 11px; color: var(--v-primary-lighten)"
            >
              <v-icon size="11" class="mr-1">mdi-view-dashboard-outline</v-icon>
              Visão geral do sistema
            </div>
          </div>
        </div>
      </v-sheet>

      <div style="overflow-x: auto" class="mb-4 pa-2">
        <div style="display: flex; gap: 12px; min-width: min-content">
          <div v-for="stat in stats" :key="stat.title" style="min-width: 280px; flex: 1">
            <v-card color="primary" elevation="1" rounded="lg" hover class="pa-3">
              <v-skeleton-loader v-if="loading" type="list-item-avatar" />
              <div v-else>
                <div class="d-flex align-center justify-space-between mb-2">
                  <div class="d-flex align-center ga-2">
                    <v-sheet
                      :color="stat.color + '20'"
                      rounded="lg"
                      class="pa-2 d-flex"
                      width="36"
                      height="36"
                    >
                      <v-icon :color="stat.color" size="20">{{ stat.icon }}</v-icon>
                    </v-sheet>
                    <div>
                      <div style="font-size: 18px" class="font-weight-bold text-secondary">
                        {{ stat.value }}
                      </div>
                      <div style="font-size: 11px" class="text-primary-lighten font-weight-medium">
                        {{ stat.title }}
                      </div>
                    </div>
                  </div>
                  <div class="">
                    <v-chip
                      class="d-flex align-center px-4"
                      style="font-size: 12px; font-weight: 600"
                      :style="{ color: stat.color }"
                      prepend-icon="mdi-trending-up"
                    >
                      {{ stat.trend }}
                    </v-chip>
                  </div>
                </div>
              </div>
            </v-card>
          </div>
        </div>
      </div>

      <v-row class="ma-0">
        <v-col cols="12" lg="7" class="pa-2">
          <v-card color="primary" elevation="1" rounded="lg">
            <v-card-title class="pa-3 bg-surface d-flex align-center ga-2">
              <v-icon size="15">mdi-clock-outline</v-icon>
              <span style="font-size: 12px" class="font-weight-bold text-secondary"
                >Atividades Recentes</span
              >
            </v-card-title>
            <v-card-text class="pa-2" style="max-height: 400px; overflow-y: auto">
              <v-skeleton-loader v-if="loadingBacklog" type="list-item@5" />
              <div
                v-else-if="recentActivities.length === 0"
                class="d-flex flex-column align-center justify-center pa-8"
              >
                <v-icon size="48" color="primary-lighten" class="mb-3">mdi-inbox-outline</v-icon>
                <span style="font-size: 12px" class="text-primary-lighten font-weight-medium"
                  >Nenhuma atividade recente</span
                >
              </div>
              <v-card
                v-else
                v-for="(activity, idx) in recentActivities"
                :key="idx"
                color="surface"
                elevation="0"
                rounded="lg"
                hover
                class="mb-2 pa-3"
              >
                <div class="d-flex align-center ga-3">
                  <v-sheet
                    :color="statusConfig[activity.status]?.color"
                    rounded="sm"
                    width="3"
                    height="28"
                  />
                  <div class="flex-grow-1">
                    <div style="font-size: 12px" class="font-weight-semibold text-secondary mb-1">
                      {{ activity.title }}
                    </div>
                    <div class="d-flex align-center ga-2 flex-wrap">
                      <v-chip
                        size="x-small"
                        variant="flat"
                        color="surface"
                        class="text-primary-lighten"
                      >
                        <v-icon size="9" start>mdi-domain</v-icon>
                        {{ activity.company }}
                      </v-chip>
                      <span
                        style="font-size: 11px"
                        class="text-primary-lighten font-weight-medium"
                        >{{ activity.time }}</span
                      >
                    </div>
                  </div>
                  <v-chip
                    v-if="statusConfig[activity.status]"
                    size="x-small"
                    variant="flat"
                    :style="{
                      backgroundColor: (statusConfig[activity.status]?.color || '#000') + '20',
                      color: statusConfig[activity.status]?.color || '#000',
                    }"
                  >
                    {{ statusConfig[activity.status]?.label }}
                  </v-chip>
                </div>
              </v-card>
            </v-card-text>
          </v-card>
        </v-col>

        <v-col cols="12" lg="5" class="pa-2">
          <v-card color="primary" elevation="1" rounded="lg">
            <v-card-title class="pa-3 bg-surface d-flex align-center ga-2">
              <v-icon size="15">mdi-chart-box-outline</v-icon>
              <span style="font-size: 12px" class="font-weight-bold text-secondary"
                >Visão Geral</span
              >
            </v-card-title>
            <v-card-text class="pa-4">
              <v-skeleton-loader v-if="loading" type="image" height="200" />
              <OverviewChart v-else :metrics="metrics?.metrics" />
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <v-sheet color="transparent" class="mb-2 mt-4">
        <div class="d-flex align-center ga-2">
          <v-icon size="15">mdi-folder-outline</v-icon>
          <span style="font-size: 12px" class="font-weight-bold text-secondary">Projetos</span>
        </div>
      </v-sheet>

      <div class="pa-2" style="overflow-x: auto">
        <div style="display: flex; gap: 12px; min-width: min-content">
          <template v-if="loadingCompanies">
            <div v-for="i in 4" :key="i" style="min-width: 250px; flex: 1">
              <v-card color="primary" elevation="1" rounded="lg" class="pa-4">
                <v-skeleton-loader type="list-item-avatar, divider, list-item" />
              </v-card>
            </div>
          </template>
          <div
            v-else
            v-for="project in projects"
            :key="project.name"
            style="min-width: 250px; flex: 1"
          >
            <v-card
              color="primary"
              elevation="1"
              rounded="lg"
              hover
              class="pa-4 project-card"
              @click="handleProjectClick(project.name)"
            >
              <div class="d-flex align-center justify-space-between mb-3">
                <v-sheet
                  :color="statusConfig[project.status]?.color + '20'"
                  rounded="lg"
                  class="pa-2"
                >
                  <v-icon :color="statusConfig[project.status]?.color" size="18"
                    >mdi-folder-open-outline</v-icon
                  >
                </v-sheet>
                <v-chip
                  size="x-small"
                  variant="flat"
                  :style="{
                    backgroundColor: (statusConfig[project.status]?.color || '#000') + '20',
                    color: statusConfig[project.status]?.color || '#000',
                  }"
                >
                  {{ statusConfig[project.status]?.label }}
                </v-chip>
              </div>

              <div style="font-size: 13px" class="font-weight-bold text-secondary mb-1">
                {{ project.name }}
              </div>
              <div style="font-size: 10px" class="text-primary-lighten font-weight-medium mb-3">
                {{ project.cnpj }}
              </div>

              <div class="mb-2">
                <div class="d-flex align-center justify-space-between mb-1">
                  <span style="font-size: 10px" class="text-primary-lighten font-weight-medium"
                    >Progresso</span
                  >
                  <span
                    style="font-size: 11px"
                    class="font-weight-bold"
                    :style="{ color: statusConfig[project.status]?.color }"
                    >{{ project.progress }}%</span
                  >
                </div>
                <v-progress-linear
                  :model-value="project.progress"
                  :color="statusConfig[project.status]?.color"
                  height="6"
                  rounded
                />
              </div>

              <v-divider class="my-3" />

              <div class="d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-1">
                  <v-icon size="12" color="primary-lighten">mdi-check-circle</v-icon>
                  <span style="font-size: 11px" class="text-primary-lighten font-weight-medium"
                    >{{ project.completed }}/{{ project.total }}</span
                  >
                </div>
                <div class="d-flex align-center ga-1">
                  <v-icon size="12" color="primary-lighten">mdi-progress-clock</v-icon>
                  <span style="font-size: 11px" class="text-primary-lighten font-weight-medium">{{
                    project.inProgress
                  }}</span>
                </div>
              </div>
            </v-card>
          </div>
        </div>
      </div>
    </v-container>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<style scoped>
.v-card:hover {
  transform: translateY(-2px);
  transition: transform 0.2s ease;
}

.project-card {
  cursor: pointer;
}
</style>
