<script setup lang="ts">
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import dashboardService from '@/service/dashboard/dashboard-service'
import companiesServices from '@/service/companies/companies-services'
import { ref, onMounted, computed } from 'vue'
import backlogService from '@/service/backlog/backlog-service'

const metrics = ref<any>(null)
const backlog = ref<any[]>([])
const showCompanyModal = ref(false)
const showUserModal = ref(false)
const loadingCompany = ref(false)
const loadingUser = ref(false)
const successCompany = ref(false)
const successUser = ref(false)

const companyForm = ref({
  name: '',
  cnpj: '',
})

const userForm = ref({
  name: '',
  email: '',
  password: '',
  companyId: '',
  role: 'CLIENT',
})

const roles = [
  { title: 'Cliente', value: 'CLIENT' },
  { title: 'Colaborador', value: 'WORKER' },
]

const mockCompanies = [
  { title: 'Empresa A', value: '1' },
  { title: 'Empresa B', value: '2' },
  { title: 'Empresa C', value: '3' },
]

const findMetrics = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  try {
    const res = await dashboardService.getCompanyMetrics(companyId)
    metrics.value = res
  } catch (e) {
    console.error('Erro ao buscar métricas:', e)
  }
}

const findBacklog = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  try {
    const response = await backlogService.getBacklogByCompany(companyId)
    backlog.value = response
  } catch (e) {
    console.error('Erro ao buscar backlog:', e)
  }
}

const createCompany = async () => {
  loadingCompany.value = true
  try {
    await companiesServices.postCompany(companyForm.value)
    successCompany.value = true
    setTimeout(() => {
      companyForm.value = { name: '', cnpj: '' }
      successCompany.value = false
      showCompanyModal.value = false
    }, 2000)
  } catch (error) {
    console.error('Erro ao criar empresa:', error)
  } finally {
    loadingCompany.value = false
  }
}

const createUser = async () => {
  loadingUser.value = true
  try {
    await companiesServices.postUserCompany(userForm.value.companyId, {
      name: userForm.value.name,
      email: userForm.value.email,
      password: userForm.value.password,
      role: userForm.value.role,
    })
    successUser.value = true
    setTimeout(() => {
      userForm.value = { name: '', email: '', password: '', companyId: '', role: 'CLIENT' }
      successUser.value = false
      showUserModal.value = false
    }, 2000)
  } catch (error) {
    console.error('Erro ao criar usuário:', error)
  } finally {
    loadingUser.value = false
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

const projects = [
  { name: 'Website Corporate', progress: 75, team: 4, status: 'in-progress' },
  { name: 'App Mobile', progress: 45, team: 6, status: 'in-progress' },
  { name: 'Sistema ERP', progress: 90, team: 8, status: 'review' },
  { name: 'Plataforma E-commerce', progress: 30, team: 5, status: 'planning' },
]

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
            <div class="d-flex align-center" style="font-size: 11px; color: var(--v-primary-lighten)">
              <v-icon size="11" class="mr-1">mdi-view-dashboard-outline</v-icon>
              Visão geral do sistema
            </div>
          </div>
          <div class="d-flex ga-2">
            <v-btn color="secondary" size="small" prepend-icon="mdi-office-building" @click="showCompanyModal = true">
              Nova Empresa
            </v-btn>
            <v-btn color="secondary" size="small" prepend-icon="mdi-account-plus" @click="showUserModal = true">
              Novo Usuário
            </v-btn>
          </div>
        </div>
      </v-sheet>

      <div style="overflow-x: auto" class="mb-4 pa-2">
        <div style="display: flex; gap: 12px; min-width: min-content">
          <div v-for="stat in stats" :key="stat.title" style="min-width: 280px; flex: 1">
            <v-card color="primary" elevation="1" rounded="lg" hover class="pa-3">
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
              <div v-if="recentActivities.length === 0" class="d-flex flex-column align-center justify-center pa-8">
                <v-icon size="48" color="primary-lighten" class="mb-3">mdi-inbox-outline</v-icon>
                <span style="font-size: 12px" class="text-primary-lighten font-weight-medium">Nenhuma atividade recente</span>
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
              <OverviewChart :metrics="metrics?.metrics" />
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
          <div v-for="project in projects" :key="project.name" style="min-width: 250px; flex: 1">
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

              <div style="font-size: 13px" class="font-weight-bold text-secondary mb-3">
                {{ project.name }}
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

              <div class="d-flex align-center ga-1">
                <v-icon size="12" color="primary-lighten">mdi-account-group</v-icon>
                <span style="font-size: 11px" class="text-primary-lighten font-weight-medium"
                  >{{ project.team }} membros</span
                >
              </div>
            </v-card>
          </div>
        </div>
      </div>
    </v-container>

    <v-dialog v-model="showCompanyModal" max-width="700">
      <v-card rounded="lg">
        <v-card-title class="bg-primary text-secondary pa-4">
          <v-icon start>mdi-office-building</v-icon>
          Cadastrar Empresa
        </v-card-title>
        <v-card-text class="pa-6">
          <v-form @submit.prevent="createCompany">
            <v-text-field
              v-model="companyForm.name"
              label="Nome da Empresa"
              prepend-inner-icon="mdi-domain"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-text-field
              v-model="companyForm.cnpj"
              label="CNPJ"
              prepend-inner-icon="mdi-card-account-details"
              variant="outlined"
              required
            />
          </v-form>
          <v-alert v-if="successCompany" type="success" class="mt-4">
            Empresa cadastrada com sucesso!
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="showCompanyModal = false">Cancelar</v-btn>
          <v-btn color="secondary" :loading="loadingCompany" @click="createCompany">Cadastrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showUserModal" max-width="700">
      <v-card rounded="lg">
        <v-card-title class="bg-primary text-secondary pa-4">
          <v-icon start>mdi-account-plus</v-icon>
          Cadastrar Usuário
        </v-card-title>
        <v-card-text class="pa-6">
          <v-form @submit.prevent="createUser">
            <v-text-field
              v-model="userForm.name"
              label="Nome"
              prepend-inner-icon="mdi-account"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-text-field
              v-model="userForm.email"
              label="Email"
              type="email"
              prepend-inner-icon="mdi-email"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-text-field
              v-model="userForm.password"
              label="Senha"
              type="password"
              prepend-inner-icon="mdi-lock"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-select
              v-model="userForm.companyId"
              :items="mockCompanies"
              label="Empresa"
              prepend-inner-icon="mdi-office-building"
              variant="outlined"
              required
              class="mb-4"
            />
            <v-select
              v-model="userForm.role"
              :items="roles"
              label="Função"
              prepend-inner-icon="mdi-shield-account"
              variant="outlined"
              required
            />
          </v-form>
          <v-alert v-if="successUser" type="success" class="mt-4">
            Usuário cadastrado com sucesso!
          </v-alert>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="showUserModal = false">Cancelar</v-btn>
          <v-btn color="secondary" :loading="loadingUser" @click="createUser">Cadastrar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
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
