<script setup lang="ts">
import { computed, type ComputedRef } from 'vue'
import { CircleDot } from 'lucide-vue-next'
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useBacklog } from '@/composables/useBacklog'
import {
  statusMeta,
  statusPillClass,
  type BacklogChange,
} from '@/composables/useDashboardOrchestration'

const props = defineProps<{
  companyId: ComputedRef<string> | string
  metrics: { metrics?: Record<string, unknown> } | null
  loading: boolean
}>()

const companyIdRef = computed(() =>
  typeof props.companyId === 'string' ? props.companyId : props.companyId.value,
)

const { data: backlogData, isLoading: loadingBacklog } = useBacklog(companyIdRef)
const backlog = computed<BacklogChange[]>(() => backlogData.value ?? [])

const recentActivities = computed(() => {
  return backlog.value.slice(0, 10).map((item) => ({
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
</script>

<template>
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
              <span class="activity-pill" :class="statusPillClass(a.status)">
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
</template>

<style scoped>
.grid-main {
  display: grid;
  grid-template-columns: 1fr 520px;
  gap: 12px;
}

.panel {
  background-color: var(--surface);
  background-image: var(--elev-1);
  box-shadow:
    var(--shadow-sm),
    inset 0 1px 0 var(--elev-hi);
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
  font-size: 12px;
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
  font-size: 12px;
  color: var(--text-3);
}

.activity-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* color-mix() pré-computado por status (antes resolvido em JS inline a cada render) */
.activity-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
}

.pill--todo {
  color: var(--status-todo);
  background: color-mix(in srgb, var(--status-todo) 14%, transparent);
}
.pill--in-progress {
  color: var(--status-prog);
  background: color-mix(in srgb, var(--status-prog) 14%, transparent);
}
.pill--testing,
.pill--review {
  color: var(--status-test);
  background: color-mix(in srgb, var(--status-test) 14%, transparent);
}
.pill--done,
.pill--completed {
  color: var(--status-done);
  background: color-mix(in srgb, var(--status-done) 14%, transparent);
}
.pill--planning {
  color: var(--status-todo);
  background: color-mix(in srgb, var(--status-todo) 14%, transparent);
}
.pill--blocked {
  color: var(--status-block);
  background: color-mix(in srgb, var(--status-block) 14%, transparent);
}

.activity-time {
  font-size: 12px;
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

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@media (max-width: 1024px) {
  .grid-main {
    grid-template-columns: 1fr 400px;
  }
}

@media (max-width: 960px) {
  .grid-main {
    grid-template-columns: 1fr;
  }
}
</style>
