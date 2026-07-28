<script setup lang="ts">
/**
 * Aba Equipe — o placar de tempo da empresa.
 *
 * Deixou de ser painel de ADMIN (jul/2026): virou ranking aberto a qualquer
 * membro, com pódio do período, lista ordenada por tempo registrado e o estado
 * ao vivo de quem está com timer rodando agora.
 */
import { computed, ref } from 'vue'
import { AlertTriangle, DollarSign, Lock, Trophy } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TeamInsightsRail from '@/features/time/components/TeamInsightsRail.vue'
import { useTeamTime } from '@/features/time/composables/useTeamTime'
import { avatarTone, initials } from '@/utils/avatar'
import { formatDurationLong, formatTimer } from '@/utils/duration'

type Preset = 'today' | '7d' | '30d'
const preset = ref<Preset>('7d')
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

const {
  rows,
  podium,
  activeCount,
  contributorCount,
  teamTotalSec,
  avgPerPersonSec,
  billableSec,
  billablePct,
  byActivity,
  pulse,
  pulseMax,
  isLoading,
  isError,
  isForbidden,
  refetch,
} = useTeamTime(range)

const hasScore = computed(() => rows.value.some((r) => r.totalSec > 0))
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

    <!-- Servidor ainda restringe a visão a ADMIN (deploy da API pendente) -->
    <EmptyState
      v-else-if="isForbidden"
      :icon="Lock"
      title="Ranking indisponível nesta empresa"
      description="O servidor ainda está com a visão de equipe restrita a administradores. Assim que a API for atualizada, o placar aparece aqui para todo mundo."
    >
      <template #action>
        <button class="team-retry" type="button" @click="refetch">Tentar de novo</button>
      </template>
    </EmptyState>

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

    <div v-else class="team-below">
      <div class="team-main">
        <!-- Pódio do período -->
        <section v-if="podium.length" class="podium" aria-label="Pódio do período">
          <article
            v-for="(p, i) in podium"
            :key="p.userId"
            class="pod"
            :class="{ 'pod--first': p.rank === 1, 'pod--me': p.isMe }"
            :style="{ '--pc': avatarTone(p.userName), '--i': i }"
          >
            <header class="pod__head">
              <span class="pod__rank">{{ p.rank }}º</span>
              <Trophy v-if="p.rank === 1" :size="14" class="pod__trophy" />
            </header>
            <span class="pod__avatar">{{ initials(p.userName) }}</span>
            <span class="pod__name" :title="p.userName">
              {{ p.userName }}
              <span v-if="p.isMe" class="pod__you">Você</span>
            </span>
            <span class="pod__total">{{ formatDurationLong(p.totalSec) }}</span>
            <div class="pod__track">
              <div class="pod__fill" :style="{ width: p.pct + '%' }" />
            </div>
            <span class="pod__pct">{{ p.pct }}% do total</span>
          </article>
        </section>

        <!-- Ranking completo -->
        <ul class="team-list">
          <li
            v-for="(row, i) in rows"
            :key="row.userId"
            class="team-row"
            :class="{ 'team-row--live': row.running, 'team-row--me': row.isMe }"
            :style="{ '--pc': avatarTone(row.userName), '--i': i }"
          >
            <span class="team-rank" :class="{ 'team-rank--top': row.rank <= 3 && row.totalSec > 0 }">
              {{ row.totalSec > 0 ? `${row.rank}º` : '–' }}
            </span>

            <span class="team-avatar" :class="{ 'team-avatar--live': row.running }">
              {{ initials(row.userName) }}
            </span>

            <div class="team-main-cell">
              <span class="team-name">
                {{ row.userName }}
                <span v-if="row.isMe" class="team-you">Você</span>
              </span>

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

              <div v-if="hasScore" class="team-track" :aria-label="`${row.pct}% do tempo da equipe`">
                <div class="team-track-fill" :style="{ width: row.pct + '%' }" />
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

      <TeamInsightsRail
        class="team-rail"
        :team-total-sec="teamTotalSec"
        :active-count="activeCount"
        :contributor-count="contributorCount"
        :avg-per-person-sec="avgPerPersonSec"
        :billable-sec="billableSec"
        :billable-pct="billablePct"
        :pulse="pulse"
        :pulse-max="pulseMax"
        :by-activity="byActivity"
      />
    </div>
  </div>
</template>

<style scoped>
.team {
  --spring: cubic-bezier(0.34, 1.42, 0.5, 1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Mesma divisão da aba individual: placar à esquerda, insights à direita. */
.team-below {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px 28px;
  align-items: start;
}

.team-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.team-rail {
  position: sticky;
  top: 8px;
  align-self: start;
}

@media (max-width: 1100px) {
  .team-below {
    grid-template-columns: minmax(0, 1fr);
  }
  .team-rail {
    position: static;
  }
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

/* ── Pódio ──────────────────────────────────────────────────────
   Sem ouro/prata/bronze: a posição é dita pelo número e pelo tamanho da
   barra. O 1º lugar ganha um realce de superfície e o troféu, nada de
   sombra colorida. */
.podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.pod {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  animation: pod-in 420ms var(--spring) backwards;
  animation-delay: calc(var(--i, 0) * 60ms);
}

.pod--first {
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
}

.pod--me {
  outline: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  outline-offset: -1px;
}

.pod__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pod__rank {
  font-size: 13px;
  font-weight: 800;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.pod--first .pod__rank {
  color: var(--accent);
}

.pod__trophy {
  color: var(--accent);
}

.pod__avatar {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pc) 16%, var(--surface));
  color: color-mix(in srgb, var(--pc) 64%, var(--text));
  border: 1px solid color-mix(in srgb, var(--pc) 32%, transparent);
  font-size: 11.5px;
  font-weight: 750;
}

.pod__name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod__you,
.team-you {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 9.5px;
  font-weight: 750;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.pod__total {
  color: var(--text);
  font-size: 18px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.pod__track {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.pod__fill {
  height: 100%;
  border-radius: 999px;
  min-width: 3px;
  background: color-mix(in srgb, var(--pc) 70%, var(--text-4));
  transition: width var(--motion-slow) var(--motion-ease);
}

.pod--first .pod__fill {
  background: var(--accent);
}

.pod__pct {
  color: var(--text-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@keyframes pod-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
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
  animation: row-in 360ms var(--spring) backwards;
  animation-delay: calc(min(var(--i, 0), 10) * 26ms);
}

.team-row:last-child {
  border-bottom: 0;
}

.team-row--live {
  background: color-mix(in srgb, var(--err) 5%, transparent);
}

.team-row--me {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.team-row--me.team-row--live {
  background: color-mix(in srgb, var(--err) 5%, color-mix(in srgb, var(--accent) 5%, transparent));
}

.team-rank {
  flex: 0 0 auto;
  min-width: 26px;
  color: var(--text-4);
  font-size: 12.5px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.team-rank--top {
  color: var(--text);
}

.team-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--pc) 16%, var(--surface));
  color: color-mix(in srgb, var(--pc) 64%, var(--text));
  font-size: 12.5px;
  font-weight: 750;
  border: 1px solid color-mix(in srgb, var(--pc) 32%, transparent);
}

.team-avatar--live {
  border-color: color-mix(in srgb, var(--err) 55%, transparent);
}

.team-main-cell {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.team-name {
  display: flex;
  align-items: center;
  gap: 7px;
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

/* Barra de placar: proporção do tempo da pessoa no total da equipe. */
.team-track {
  height: 4px;
  max-width: 420px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.team-track-fill {
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pc) 60%, var(--text-4));
  transition: width var(--motion-slow) var(--motion-ease);
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

@keyframes row-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .team-active-dot--on,
  .team-rec-dot {
    animation: none;
  }
  .pod,
  .team-row {
    animation: none;
  }
  .team-track-fill,
  .pod__fill {
    transition: none;
  }
}

@media (max-width: 860px) {
  .podium {
    grid-template-columns: 1fr;
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
