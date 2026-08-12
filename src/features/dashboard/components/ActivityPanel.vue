<script setup lang="ts">
/**
 * Módulo ATIVIDADE do bento: a coluna alta da direita, feed do backlog em
 * tempo quase real. (O gráfico de distribuição que dividia painel com ele
 * virou módulo próprio no DashboardView.)
 */
import { computed, type ComputedRef } from 'vue'
import { CircleDot } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { avatarTone, initials } from '@/utils/avatar'
import { useBacklog } from '@/composables/useBacklog'
import {
  statusMeta,
  statusPillClass,
  type BacklogChange,
} from '@/composables/useDashboardOrchestration'

const props = defineProps<{
  companyId: ComputedRef<string> | string
}>()

const companyIdRef = computed(() =>
  typeof props.companyId === 'string' ? props.companyId : props.companyId.value,
)

const { data: backlogData, isLoading: loadingBacklog } = useBacklog(companyIdRef)
const backlog = computed<BacklogChange[]>(() => backlogData.value ?? [])

const recentActivities = computed(() => {
  return backlog.value.slice(0, 12).map((item) => ({
    title: item.activityTitle,
    author: item.changedBy?.name || 'Sistema',
    // Identidade tokenizada por pessoa (mesma função do board e do ranking).
    tone: avatarTone(item.changedBy?.name || 'Sistema'),
    initials: initials(item.changedBy?.name || 'Sistema'),
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
  <section class="bento-cell act" aria-label="Atividade recente">
    <header class="act-head">
      <span class="eyebrow">Atividade recente</span>
      <span class="act-chip">{{ recentActivities.length }}</span>
    </header>
    <div class="act-body">
      <div v-if="loadingBacklog" class="act-skel">
        <Skeleton v-for="i in 6" :key="i" type="row" />
      </div>
      <div v-else-if="!recentActivities.length" class="act-empty">
        <CircleDot :size="24" />
        <span>Nenhuma atividade recente</span>
      </div>
      <ul v-else class="act-list">
        <li
          v-for="(a, idx) in recentActivities"
          :key="idx"
          v-reveal="idx"
          class="act-item"
        >
          <span class="act-rail" :style="{ background: statusMeta[a.status]?.color }" />
          <div class="act-avatar" :style="{ '--tone': a.tone }">{{ a.initials }}</div>
          <div class="act-info">
            <span class="act-title">{{ a.title }}</span>
            <span class="act-meta">
              {{ a.author }}
              <span class="act-dot" aria-hidden="true">·</span>
              {{ a.time }}
            </span>
          </div>
          <span class="act-pill" :class="statusPillClass(a.status)">
            {{ statusMeta[a.status]?.label || 'Atualizado' }}
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.act {
  grid-area: act;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* A torre da direita: altura vem do grid; a lista rola por dentro. */
  max-height: 100%;
}

.act-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 10px;
  border-bottom: 1px solid var(--border);
}

.act-head .eyebrow {
  margin-bottom: 0;
}

.act-chip {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 1px 7px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.act-body {
  flex: 1;
  padding: 6px;
  overflow: auto;
  min-height: 0;
}

.act-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  gap: 8px;
  color: var(--text-4);
  font-size: 12.5px;
}

.act-skel {
  padding: 0 8px;
}

.act-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.act-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 8px;
  border-radius: 8px;
  transition: background var(--motion-fast) var(--motion-ease);
}

.act-item:hover {
  background: var(--surface-2);
}

.act-rail {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  flex-shrink: 0;
}

/* Tinta e texto derivados do tom da pessoa (--avatar-1..6), padrão do board. */
.act-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tone) 22%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--tone) 38%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: color-mix(in srgb, var(--tone) 72%, var(--text));
  flex-shrink: 0;
}

.act-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.act-title {
  font-size: 12.5px;
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.act-meta {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.act-dot {
  opacity: 0.6;
}

.act-pill {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  flex-shrink: 0;
}

/* color-mix() pré-computado por status */
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
</style>
