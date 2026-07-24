<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, DollarSign } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useTeamTime } from '@/features/time/composables/useTeamTime'
import { formatDurationLong, formatTimer } from '@/utils/duration'

type Preset = 'today' | '7d' | '30d'
const preset = ref<Preset>('today')
const presets: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
]

const range = computed(() => {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  const from = new Date(now)
  if (preset.value === 'today') from.setHours(0, 0, 0, 0)
  else if (preset.value === '7d') {
    from.setDate(from.getDate() - 6)
    from.setHours(0, 0, 0, 0)
  } else {
    from.setDate(from.getDate() - 29)
    from.setHours(0, 0, 0, 0)
  }
  return { from: from.toISOString(), to: to.toISOString() }
})

const { rows, activeCount, teamTotalSec, isLoading, isError, refetch } = useTeamTime(range)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
</script>

<template>
  <div class="team">
    <!-- Resumo + período -->
    <header class="team-bar">
      <div class="team-summary">
        <span class="team-active">
          <span class="team-active-dot" :class="{ 'team-active-dot--on': activeCount > 0 }" />
          {{ activeCount }} trabalhando agora
        </span>
        <span class="team-total">
          Total da equipe: <strong>{{ formatDurationLong(teamTotalSec) }}</strong>
        </span>
      </div>
      <div class="team-presets">
        <button
          v-for="p in presets"
          :key="p.id"
          class="team-chip"
          :class="{ 'team-chip--on': preset === p.id }"
          type="button"
          @click="preset = p.id"
        >
          {{ p.label }}
        </button>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="isLoading" class="team-skeletons">
      <Skeleton v-for="i in 5" :key="i" type="row" height="22px" />
    </div>

    <!-- Erro -->
    <EmptyState
      v-else-if="isError"
      :icon="AlertTriangle"
      title="Não foi possível carregar a equipe"
      description="Ocorreu um erro ao buscar os dados de tempo da equipe."
    >
      <template #action>
        <button class="team-retry" type="button" @click="refetch">Tentar de novo</button>
      </template>
    </EmptyState>

    <EmptyState
      v-else-if="rows.length === 0"
      title="Nenhum membro na empresa"
      description="Convide pessoas para a empresa para acompanhar o tempo da equipe."
    />

    <!-- Lista de membros -->
    <ul v-else class="team-list">
      <li
        v-for="row in rows"
        :key="row.userId"
        class="team-row"
        :class="{ 'team-row--live': row.running }"
      >
        <span class="team-avatar" :class="{ 'team-avatar--live': row.running }">
          {{ initials(row.userName) }}
        </span>

        <div class="team-main">
          <span class="team-name">{{ row.userName }}</span>
          <div class="team-status">
            <template v-if="row.running">
              <span class="team-rec-dot" />
              <span class="team-desc">{{ row.running.description || 'Sem descrição' }}</span>
              <span v-if="row.running.activityTitle" class="team-tag team-tag--task">
                {{ row.running.activityTitle }}
              </span>
              <span v-if="!row.running.companyId" class="team-tag team-tag--muted">Geral</span>
              <span v-if="row.running.billable" class="team-tag team-tag--bill">
                <DollarSign :size="10" /> Faturável
              </span>
            </template>
            <span v-else class="team-idle">Ocioso</span>
          </div>
        </div>

        <div class="team-metrics">
          <span v-if="row.running" class="team-live-clock">{{ formatTimer(row.elapsedSec) }}</span>
          <div class="team-period">
            <span class="team-period-label">Período</span>
            <span class="team-period-value">{{ formatDurationLong(row.totalSec) }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.team {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Barra de resumo ── */
.team-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.team-summary {
  display: inline-flex;
  align-items: center;
  gap: 18px;
}

.team-active {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 700;
}

.team-active-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--text-4);
}

.team-active-dot--on {
  background: var(--err);
  animation: team-pulse 1.6s ease-in-out infinite;
}

.team-total {
  color: var(--text-2);
  font-size: 12.5px;
}

.team-total strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.team-presets {
  display: inline-flex;
  gap: 6px;
}

.team-chip {
  height: 32px;
  padding: 0 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.team-chip--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

/* ── Lista ── */
.team-skeletons {
  padding: 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.team-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.team-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--border);
  transition: background var(--motion-fast) var(--motion-ease);
}

.team-row:last-child {
  border-bottom: 0;
}

.team-row--live {
  background: color-mix(in srgb, var(--err) 5%, transparent);
}

.team-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 750;
  border: 1px solid var(--border);
}

.team-avatar--live {
  border-color: color-mix(in srgb, var(--err) 55%, transparent);
  color: var(--text);
}

.team-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.team-name {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
}

.team-status {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}

.team-rec-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--err);
  animation: team-pulse 1.6s ease-in-out infinite;
}

.team-desc {
  color: var(--text-2);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.team-idle {
  color: var(--text-4);
  font-size: 12.5px;
}

.team-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 650;
  flex: 0 0 auto;
}

.team-tag--task {
  background: var(--surface-3);
  color: var(--text-2);
}

.team-tag--muted {
  background: var(--surface-2);
  color: var(--text-3);
}

.team-tag--bill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
}

.team-metrics {
  display: inline-flex;
  align-items: center;
  gap: 20px;
  flex: 0 0 auto;
}

.team-live-clock {
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 750;
  color: var(--err);
  font-variant-numeric: tabular-nums;
  min-width: 74px;
  text-align: right;
}

.team-period {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 62px;
}

.team-period-label {
  color: var(--text-4);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.team-period-value {
  color: var(--text);
  font-size: 13px;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
}

.team-retry {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.team-retry:hover {
  background: var(--surface-3);
  color: var(--text);
}

@keyframes team-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .team-active-dot--on,
  .team-rec-dot {
    animation: none;
  }
}

@media (max-width: 640px) {
  .team-desc {
    max-width: 160px;
  }
  .team-metrics {
    gap: 12px;
  }
}
</style>
