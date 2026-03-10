<script setup lang="ts">
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import { getUserToken } from '@/utils/authContent'

const stats = [
  {
    title: 'Projetos',
    value: '12',
    icon: 'mdi-folder-outline',
    color: '#3B82F6',
    trend: '+12%',
    progress: 75,
  },
  {
    title: 'Concluídas',
    value: '48',
    icon: 'mdi-check-circle-outline',
    color: '#10B981',
    trend: '+8%',
    progress: 85,
  },
  {
    title: 'Em Progresso',
    value: '23',
    icon: 'mdi-progress-clock',
    color: '#F59E0B',
    trend: '+5%',
    progress: 60,
  },
  {
    title: 'Equipe',
    value: '8',
    icon: 'mdi-account-group-outline',
    color: '#8B5CF6',
    trend: '+2',
    progress: 90,
  },
]

const recentActivities = [
  { title: 'Reunião com cliente', company: 'Tech Corp', time: 'Há 2 horas', status: 'done' },
  { title: 'Revisão de código', company: 'StartupXYZ', time: 'Há 4 horas', status: 'in-progress' },
  { title: 'Deploy em produção', company: 'Enterprise Ltd', time: 'Há 6 horas', status: 'testing' },
  { title: 'Planejamento Sprint', company: 'Tech Corp', time: 'Há 1 dia', status: 'todo' },
]

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
        <h1 style="font-size: 16px" class="font-weight-bold text-secondary mb-1">Dashboard</h1>
        <div class="d-flex align-center" style="font-size: 11px; color: var(--v-primary-lighten)">
          <v-icon size="11" class="mr-1">mdi-view-dashboard-outline</v-icon>
          Visão geral do sistema
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
            <v-card-text class="pa-2">
              <v-card
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
              <OverviewChart />
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
