<script setup lang="ts">
const stats = [
  { title: 'Projetos', value: '12', icon: 'mdi-folder-outline', color: '#3B82F6', trend: '+12%' },
  { title: 'Concluídas', value: '48', icon: 'mdi-check-circle-outline', color: '#10B981', trend: '+8%' },
  { title: 'Em Progresso', value: '23', icon: 'mdi-progress-clock', color: '#F59E0B', trend: '+5%' },
  { title: 'Equipe', value: '8', icon: 'mdi-account-group-outline', color: '#8B5CF6', trend: '+2' }
]

const recentActivities = [
  { title: 'Reunião com cliente', company: 'Tech Corp', time: 'Há 2 horas', status: 'done' },
  { title: 'Revisão de código', company: 'StartupXYZ', time: 'Há 4 horas', status: 'in-progress' },
  { title: 'Deploy em produção', company: 'Enterprise Ltd', time: 'Há 6 horas', status: 'testing' },
  { title: 'Planejamento Sprint', company: 'Tech Corp', time: 'Há 1 dia', status: 'todo' }
]

const statusConfig: Record<string, { color: string; label: string }> = {
  'todo': { color: '#3B82F6', label: 'A Fazer' },
  'in-progress': { color: '#F59E0B', label: 'Em Andamento' },
  'testing': { color: '#8B5CF6', label: 'Em Teste' },
  'done': { color: '#10B981', label: 'Concluído' }
}
</script>

<template>
  <v-container fluid class="pa-4 bg-background">
    <v-sheet color="transparent" class="mb-4">
      <h1 style="font-size: 16px" class="font-weight-bold text-secondary mb-1">Dashboard</h1>
      <div class="d-flex align-center" style="font-size: 11px; color: var(--v-primary-lighten)">
        <v-icon size="11" class="mr-1">mdi-view-dashboard-outline</v-icon>
        Visão geral do sistema
      </div>
    </v-sheet>

    <v-row class="mb-4">
      <v-col v-for="stat in stats" :key="stat.title" cols="12" sm="6" md="3">
        <v-card color="primary" elevation="1" rounded="lg" hover class="pa-3">
          <div class="d-flex align-center ga-2 mb-2">
            <v-sheet
              :color="stat.color + '20'"
              rounded="lg"
              class="pa-2"
              width="36"
              height="36"
            >
              <v-icon :color="stat.color" size="20">{{ stat.icon }}</v-icon>
            </v-sheet>
            <div>
              <div style="font-size: 18px" class="font-weight-bold text-secondary">{{ stat.value }}</div>
              <div style="font-size: 11px" class="text-primary-lighten font-weight-medium">{{ stat.title }}</div>
            </div>
          </div>
          <div class="d-flex align-center ga-1" style="font-size: 11px; font-weight: 600" :style="{ color: stat.color }">
            <v-icon size="11">mdi-trending-up</v-icon>
            {{ stat.trend }}
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12" md="8">
        <v-card color="primary" elevation="1" rounded="lg">
          <v-card-title class="pa-3 bg-surface d-flex align-center ga-2">
            <v-icon size="15">mdi-clock-outline</v-icon>
            <span style="font-size: 12px" class="font-weight-bold text-secondary">Atividades Recentes</span>
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
                  <div style="font-size: 12px" class="font-weight-semibold text-secondary mb-1">{{ activity.title }}</div>
                  <div class="d-flex align-center ga-2">
                    <v-chip size="x-small" variant="flat" color="surface" class="text-primary-lighten">
                      <v-icon size="9" start>mdi-domain</v-icon>
                      {{ activity.company }}
                    </v-chip>
                    <span style="font-size: 11px" class="text-primary-lighten font-weight-medium">{{ activity.time }}</span>
                  </div>
                </div>
                <v-chip
                  v-if="statusConfig[activity.status]"
                  size="x-small"
                  variant="flat"
                  :style="{ backgroundColor: (statusConfig[activity.status]?.color || '#000') + '20', color: statusConfig[activity.status]?.color || '#000' }"
                >
                  {{ statusConfig[activity.status]?.label }}
                </v-chip>
              </div>
            </v-card>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card color="primary" elevation="1" rounded="lg" height="100%">
          <v-card-title class="pa-3 bg-surface d-flex align-center ga-2">
            <v-icon size="15">mdi-chart-box-outline</v-icon>
            <span style="font-size: 12px" class="font-weight-bold text-secondary">Visão Geral</span>
          </v-card-title>
          <v-card-text class="pa-4 d-flex flex-column align-center justify-center" style="min-height: 250px">
            <v-icon size="38" color="primary-lighten">mdi-chart-line</v-icon>
            <div style="font-size: 11px" class="text-primary-lighten font-weight-medium mt-3">Gráficos e métricas em desenvolvimento</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.v-card:hover {
  transform: translateY(-2px);
  transition: transform 0.2s ease;
}
</style>
