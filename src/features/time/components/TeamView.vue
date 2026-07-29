<script setup lang="ts">
/**
 * Aba Equipe — o placar de tempo do grupo.
 *
 * Duas decisões de produto que moldam esta tela (jul/2026):
 * - deixou de ser painel de ADMIN e virou ranking aberto a qualquer membro;
 * - o escopo padrão é o GRUPO (todas as empresas somadas), porque as empresas
 *   cadastradas são filiais do mesmo grupo e a mesma pessoa trabalha em mais de
 *   uma; ranquear empresa por empresa partia a mesma equipe em placares
 *   separados. Dá para focar numa empresa pelo seletor de escopo.
 */
import { computed, ref } from 'vue'
import { AlertTriangle, DollarSign, Lock } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TeamInsightsRail from '@/features/time/components/TeamInsightsRail.vue'
import RankMedal from '@/features/time/components/RankMedal.vue'
import { useTeamTime, type TeamScope } from '@/features/time/composables/useTeamTime'
import { avatarTone, initials } from '@/utils/avatar'
import { formatClock, formatDurationLong, formatTimer } from '@/utils/duration'

type Preset = 'today' | '7d' | '30d'
const preset = ref<Preset>('7d')
const presets: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
]

const scope = ref<TeamScope>('group')

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
  companies,
  rows,
  podium,
  activeCount,
  contributorCount,
  teamTotalSec,
  avgPerPersonSec,
  billableSec,
  billablePct,
  byActivity,
  byCompany,
  pulse,
  pulseMax,
  isLoading,
  isError,
  isForbidden,
  refetch,
} = useTeamTime(range, scope)

const hasScore = computed(() => rows.value.some((r) => r.totalSec > 0))
const isGroup = computed(() => scope.value === 'group')
/** O seletor só faz sentido com mais de uma empresa no grupo. */
const showScope = computed(() => companies.value.length > 1)

const scopeLabel = computed(() =>
  isGroup.value
    ? 'Grupo'
    : (companies.value.find((c) => c.id === scope.value)?.name ?? 'Empresa'),
)
</script>

<template>
  <div class="team">
    <!-- Escopo: grupo inteiro ou uma empresa -->
    <nav v-if="showScope" class="scope" aria-label="Escopo do ranking">
      <button
        class="scope__btn"
        :class="{ 'scope__btn--on': isGroup }"
        type="button"
        @click="scope = 'group'"
      >
        Grupo
      </button>
      <button
        v-for="c in companies"
        :key="c.id"
        class="scope__btn"
        :class="{ 'scope__btn--on': scope === c.id }"
        type="button"
        @click="scope = c.id"
      >
        {{ c.name }}
      </button>
    </nav>

    <!-- Resumo + período -->
    <header class="team-bar">
      <div class="team-summary">
        <span class="team-active">
          <span class="team-active-dot" :class="{ 'team-active-dot--on': activeCount > 0 }" />
          {{ activeCount }} trabalhando agora
        </span>
        <span class="team-total">
          {{ scopeLabel }}: <strong>{{ formatDurationLong(teamTotalSec) }}</strong>
          <template v-if="contributorCount"> em {{ contributorCount }} pessoas</template>
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
      title="Nenhum membro por aqui"
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
              <RankMedal :place="(p.rank as 1 | 2 | 3)" :size="p.rank === 1 ? 34 : 28" />
              <span class="pod__rank">{{ p.rank }}º</span>
            </header>

            <div class="pod__who">
              <span class="pod__avatar">{{ initials(p.userName) }}</span>
              <!-- O nome trunca num filho próprio: texto solto dentro de um
                   flex não respeita ellipsis e vazava o card. -->
              <span class="pod__name">
                <span class="pod__name-text" :title="p.userName">{{ p.userName }}</span>
                <span v-if="p.isMe" class="pod__you">Você</span>
              </span>
            </div>

            <span class="pod__total">{{ formatDurationLong(p.totalSec) }}</span>
            <div class="pod__track">
              <div class="pod__fill" :style="{ width: p.pct + '%' }" />
            </div>
            <span class="pod__pct">
              {{ p.pct }}% do total
              <template v-if="isGroup && p.companies.length > 1">
                · {{ p.companies.length }} empresas
              </template>
            </span>
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
            <span class="team-rank">
              <RankMedal v-if="row.rank <= 3 && row.totalSec > 0" :place="(row.rank as 1 | 2 | 3)" :size="22" />
              <span v-else class="team-rank__num">{{ row.totalSec > 0 ? `${row.rank}º` : '–' }}</span>
            </span>

            <span class="team-avatar" :class="{ 'team-avatar--live': row.running }">
              {{ initials(row.userName) }}
            </span>

            <div class="team-main-cell">
              <span class="team-name">
                <span class="team-name-text">{{ row.userName }}</span>
                <span v-if="row.isMe" class="team-you">Você</span>
                <span
                  v-if="isGroup && row.companies.length"
                  class="team-where"
                  :title="row.companies.join(', ')"
                >
                  {{ row.companies.join(' · ') }}
                </span>
              </span>

              <div class="team-status">
                <template v-if="row.running">
                  <span class="team-rec-dot" />
                  <span class="team-since">desde {{ formatClock(row.running.startedAt) }}</span>
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

              <div v-if="hasScore" class="team-track" :aria-label="`${row.pct}% do tempo do escopo`">
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
        :scope-label="scopeLabel"
        :team-total-sec="teamTotalSec"
        :active-count="activeCount"
        :contributor-count="contributorCount"
        :avg-per-person-sec="avgPerPersonSec"
        :billable-sec="billableSec"
        :billable-pct="billablePct"
        :pulse="pulse"
        :pulse-max="pulseMax"
        :by-activity="byActivity"
        :by-company="isGroup ? byCompany : []"
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

/* ── Seletor de escopo (grupo x empresa) ── */
.scope {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  align-self: flex-start;
  max-width: 100%;
}

.scope__btn {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.scope__btn:hover {
  color: var(--text);
}

.scope__btn--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
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
  flex-wrap: wrap;
  min-width: 0;
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
   A hierarquia vem da medalha e do tamanho do número, não de ouro/prata
   pintados no card. O 1º ganha superfície levemente destacada. */
.podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.pod {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  min-width: 0;
  animation: pod-in 420ms var(--spring) backwards;
  animation-delay: calc(var(--i, 0) * 60ms);
}

.pod--first {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
}

.pod--me {
  outline: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  outline-offset: -1px;
}

.pod__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pod__rank {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.pod--first .pod__rank {
  color: var(--text);
}

.pod__who {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.pod__avatar {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pc) 16%, var(--surface));
  color: color-mix(in srgb, var(--pc) 64%, var(--text));
  border: 1px solid color-mix(in srgb, var(--pc) 32%, transparent);
  font-size: 11px;
  font-weight: 750;
}

.pod__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 650;
}

.pod__name-text {
  min-width: 0;
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
  font-size: 19px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.pod--first .pod__total {
  font-size: 22px;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  width: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.team-rank__num {
  color: var(--text-4);
  font-size: 12.5px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
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
  min-width: 0;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
}

.team-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Em quais empresas do grupo a pessoa registrou tempo. */
.team-where {
  min-width: 0;
  color: var(--text-4);
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.team-since {
  flex: 0 0 auto;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.team-desc {
  color: var(--text-2);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
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
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Barra de placar: proporção do tempo da pessoa no total do escopo. */
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

@media (max-width: 980px) {
  .podium {
    grid-template-columns: 1fr;
  }
  .team-metrics {
    gap: 12px;
  }
  .team-desc {
    max-width: 180px;
  }
}

@media (max-width: 640px) {
  .team-row {
    flex-wrap: wrap;
  }
  .team-desc {
    max-width: 140px;
  }
}
</style>
