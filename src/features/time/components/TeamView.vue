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
 *
 * Set/2026 (spec sequencia-diaria-nevo, T9): cada pessoa ganhou a chama da
 * sequência diária ao lado do nome, o pódio mostra o Nevo do nível dela e o
 * ranking pode ser lido por horas, sequência ou pontos da semana. Tudo isso
 * some sozinho se o servidor ainda não tiver a rota de sequência.
 */
import { computed, ref } from 'vue'
import { AlertTriangle, Clock, DollarSign, Lock, Star } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import NevoFlame from '@/components/nevo/NevoFlame.vue'
import NevoSprite from '@/components/nevo/NevoSprite.vue'
import StreakWeek from '@/components/nevo/StreakWeek.vue'
import { POINTS_RULES, daysLabel, litTone, tierOf, tierTone } from '@/components/nevo/nevo-assets'
import TeamInsightsRail from '@/features/time/components/TeamInsightsRail.vue'
import TimeHeatmap from '@/features/time/components/TimeHeatmap.vue'
import PeriodPicker from '@/features/time/components/PeriodPicker.vue'
import RankMedal from '@/features/time/components/RankMedal.vue'
import {
  teamScore,
  useTeamTime,
  type TeamRow,
  type TeamRowStreak,
  type TeamScope,
  type TeamSort,
} from '@/features/time/composables/useTeamTime'
import { useTimePeriod } from '@/features/time/composables/useTimePeriod'
import { avatarTone } from '@/utils/avatar'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { formatClock, formatDurationLong, formatTimer } from '@/utils/duration'

/**
 * Instância PRÓPRIA do período: navegar o mês no ranking não pode mexer no mês
 * da lista pessoal, e vice-versa. Cada aba lê o placar num contexto diferente.
 */
const period = useTimePeriod('team')

const scope = ref<TeamScope>('group')

/** Eixo do ranking escolhido pela pessoa (o efetivo é `sortMode`). */
const sortBy = ref<TeamSort>('hours')

const {
  companies,
  rows,
  constancyByDay,
  constancyByUser,
  podium,
  myRow,
  sortMode,
  streakAvailable,
  streakSummary,
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
  pulseDense,
  isLoading,
  isError,
  isForbidden,
  refetch,
} = useTeamTime(period, scope, sortBy)

const pulseTitle = computed(() => `Ritmo (${period.shortLabel.value})`)

const hasScore = computed(() => rows.value.some((r) => r.totalSec > 0))

/** Mapa dia→segundos daquela pessoa (vazio quando ela não registrou nada). */
const EMPTY_CONSTANCY = new Map<string, number>()
function constancyOf(userId: string): Map<string, number> {
  return constancyByUser.value.get(userId) ?? EMPTY_CONSTANCY
}

/**
 * Abaixo de três dias registrados a faixa não conta história nenhuma: vira um
 * retângulo cinza na linha de quem está começando. Melhor não desenhar.
 */
const MIN_DIAS_CONSTANCIA = 3
function hasConstancy(userId: string): boolean {
  return constancyOf(userId).size >= MIN_DIAS_CONSTANCIA
}
const isGroup = computed(() => scope.value === 'group')
/** O seletor só faz sentido com mais de uma empresa no grupo. */
const showScope = computed(() => companies.value.length > 1)

const scopeLabel = computed(() =>
  isGroup.value
    ? 'Grupo'
    : (companies.value.find((c) => c.id === scope.value)?.name ?? 'Empresa'),
)

// ─── Sequência diária (T9) ────────────────────────────────────────────────────

const SORT_OPTIONS: readonly { key: TeamSort; label: string }[] = [
  { key: 'hours', label: 'Horas' },
  { key: 'streak', label: 'Sequência' },
  { key: 'points', label: 'Pontos' },
]

/**
 * Uma frase explicando o eixo novo (50+: didático antes de denso). Horas não
 * precisa: é o placar que a tela sempre teve.
 */
const SORT_HINT: Partial<Record<TeamSort, string>> = {
  streak:
    'Dias seguidos com a meta cumprida: 30 min de foco ou 1 tarefa concluída. Fim de semana e feriado não quebram a sequência.',
  points: `Pontos desta semana: ${POINTS_RULES}.`,
}
const sortHint = computed(() => SORT_HINT[sortMode.value] ?? null)

const EMPTY_PODIUM: Record<TeamSort, string> = {
  hours: '',
  streak:
    'Ninguém está com sequência agora. Foque 30 min ou conclua 1 tarefa hoje e acenda a primeira chama do time.',
  points: 'Ninguém somou pontos nesta semana ainda. Uma tarefa concluída já vale 10.',
}

const PODIUM_LABEL: Record<TeamSort, string> = {
  hours: 'Pódio do período',
  streak: 'Pódio da sequência',
  points: 'Pódio de pontos da semana',
}

/** Rótulo da coluna da direita: o que complementa o eixo do ranking. */
const METRIC_LABEL: Record<TeamSort, string> = {
  hours: 'Período',
  // O número da sequência já está na chama ao lado do nome; aqui vai o recorde.
  streak: 'Recorde',
  points: 'Pontos',
}

function metricValue(row: TeamRow): string {
  if (sortMode.value === 'streak') return row.streak ? daysLabel(row.streak.best) : '–'
  if (sortMode.value === 'points') return row.streak ? String(row.streak.pointsWeek) : '–'
  return formatDurationLong(row.totalSec)
}

/** A pessoa pontua no eixo atual (medalha e posição só para quem pontua). */
function scores(row: TeamRow): boolean {
  return teamScore(row, sortMode.value) > 0
}

/** Barra de pontos relativa ao líder da semana (ele enche a barra). */
const maxPoints = computed(() =>
  Math.max(1, ...rows.value.map((r) => r.streak?.pointsWeek ?? 0)),
)
function pointsPct(row: TeamRow): number {
  return Math.round(((row.streak?.pointsWeek ?? 0) / maxPoints.value) * 100)
}

function pointsLabel(n: number): string {
  return `${n} ${n === 1 ? 'ponto' : 'pontos'}`
}

/** Frase da chama para leitor de tela e dica ao passar o mouse. */
function streakAria(s: TeamRowStreak): string {
  const hoje = s.securedToday
    ? 'hoje já garantiu'
    : s.todayIsRest
      ? 'hoje é dia de descanso'
      : 'hoje ainda não garantiu'
  return `Sequência de ${daysLabel(s.current)}, ${hoje}`
}

/** Pódio com o nível do Nevo de cada um (sem sequência não há nível nem mascote). */
const podiumView = computed(() =>
  podium.value.map((p) => ({ ...p, tier: p.streak ? tierOf(p.streak.tierKey) : null })),
)

/** "Você está em 4º": só quando você pontua no eixo atual. */
const myPlace = computed(() => (myRow.value && scores(myRow.value) ? myRow.value.rank : null))
</script>

<template>
  <div class="team">
    <!-- Escopo: grupo inteiro ou uma empresa -->
    <!-- Grupo de botões de filtro, não navegação: `nav` virava landmark e
         aparecia no leitor de tela ao lado do menu. -->
    <div v-if="showScope" class="scope" role="group" aria-label="Escopo do ranking">
      <button
        class="scope__btn"
        :class="{ 'scope__btn--on': isGroup }"
        type="button"
        :aria-pressed="isGroup"
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
        :aria-pressed="scope === c.id"
        @click="scope = c.id"
      >
        {{ c.name }}
      </button>
    </div>

    <!-- Resumo + período -->
    <header class="team-bar">
      <div class="team-summary">
        <span class="team-active">
          <span class="team-active-dot" :class="{ 'team-active-dot--on': activeCount > 0 }" />
          {{ activeCount }} trabalhando agora
        </span>
        <span class="team-total">
          {{ scopeLabel }} · {{ period.label.value }}:
          <strong>{{ formatDurationLong(teamTotalSec) }}</strong>
          <template v-if="contributorCount">
            · {{ contributorCount }} {{ contributorCount === 1 ? 'pessoa' : 'pessoas' }}
          </template>
        </span>
      </div>
      <PeriodPicker
        :kind="period.kind.value"
        :month-label="period.anchorLabel.value"
        :can-go-prev="period.canGoPrev.value"
        :can-go-next="period.canGoNext.value"
        @update:kind="period.setKind"
        @prev="period.prev"
        @next="period.next"
      />
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
        <!-- Eixo do ranking. Só aparece com a sequência disponível no servidor. -->
        <div v-if="streakAvailable" class="rank-tools">
          <div class="rank-tools__row">
            <div class="scope" role="group" aria-label="Ordenar o ranking por">
              <button
                v-for="o in SORT_OPTIONS"
                :key="o.key"
                class="scope__btn"
                :class="{ 'scope__btn--on': sortMode === o.key }"
                type="button"
                :aria-pressed="sortMode === o.key"
                @click="sortBy = o.key"
              >
                <Clock v-if="o.key === 'hours'" :size="15" aria-hidden="true" />
                <NevoFlame v-else-if="o.key === 'streak'" :size="17" :lit="sortMode === 'streak'" />
                <Star v-else :size="15" aria-hidden="true" />
                {{ o.label }}
              </button>
            </div>
            <span v-if="myPlace" class="rank-me">
              Você está em <strong>{{ myPlace }}º</strong>
            </span>
          </div>
          <p v-if="sortHint" class="rank-hint">{{ sortHint }}</p>
        </div>

        <!-- Pódio do eixo atual -->
        <section v-if="podiumView.length" class="podium" :aria-label="PODIUM_LABEL[sortMode]">
          <article
            v-for="(p, i) in podiumView"
            :key="p.userId"
            class="pod"
            :class="{ 'pod--first': p.rank === 1, 'pod--me': p.isMe }"
            :style="{ '--pc': avatarTone(p.userName), '--i': i }"
          >
            <header class="pod__head">
              <RankMedal :place="(p.rank as 1 | 2 | 3)" :size="p.rank === 1 ? 34 : 28" />
              <span class="pod__rank">{{ p.rank }}º</span>
              <!-- O Nevo do nível da pessoa: parado, é selo, não animação. -->
              <span v-if="p.tier" class="pod__nevo">
                <NevoSprite
                  :pose="p.tier.pose"
                  motion="still"
                  :size="44"
                  :alt="`Nevo no nível ${p.tier.label}`"
                />
              </span>
            </header>

            <div class="pod__who">
              <PersonAvatar :id="p.userId" class="pod__avatar" :name="p.userName" :size="32" variant="soft" decorative />
              <span class="pod__id">
                <!-- O nome trunca num filho próprio: texto solto dentro de um
                     flex não respeita ellipsis e vazava o card. -->
                <span class="pod__name">
                  <span class="pod__name-text" :title="p.userName">{{ p.userName }}</span>
                  <!-- Com sequência, o "Você" desce para a linha do nível e
                       deixa o nome inteiro no card estreito. -->
                  <span v-if="p.isMe && !p.streak" class="pod__you">Você</span>
                </span>
                <span v-if="p.streak" class="pod__meta">
                  <!-- No eixo Sequência o número grande já é a chama. -->
                  <span
                    v-if="sortMode !== 'streak'"
                    class="team-streak"
                    :class="{ 'team-streak--lit': p.streak.securedToday }"
                    :style="{ '--streak-lit': litTone(p.streak.tierKey) }"
                    role="img"
                    :aria-label="streakAria(p.streak)"
                    :title="streakAria(p.streak)"
                  >
                    <NevoFlame
                      :live="p.streak.securedToday"
                      :lit="p.streak.securedToday"
                      :tier="p.streak.tierKey"
                      :size="18"
                    />
                    <span class="team-streak__num">{{ daysLabel(p.streak.current) }}</span>
                  </span>
                  <span
                    v-if="p.tier"
                    class="pod__tier"
                    :style="{ '--tier': tierTone(p.streak.tierKey) }"
                  >
                    {{ p.tier.label }}
                  </span>
                  <span v-if="p.isMe" class="pod__you">Você</span>
                </span>
              </span>
            </div>

            <!-- Sequência: dias seguidos, a semana e o recorde -->
            <template v-if="sortMode === 'streak' && p.streak">
              <span
                class="pod__total pod__total--streak"
                :class="{ 'pod__total--lit': p.streak.securedToday }"
                :style="{ '--streak-lit': litTone(p.streak.tierKey) }"
                role="img"
                :aria-label="streakAria(p.streak)"
              >
                <NevoFlame
                  :live="p.streak.securedToday"
                  :lit="p.streak.securedToday"
                  :tier="p.streak.tierKey"
                  :size="p.rank === 1 ? 28 : 24"
                />
                {{ daysLabel(p.streak.current) }}
              </span>
              <StreakWeek
                class="pod__week"
                :days="p.streak.week"
                size="sm"
                :aria-label="`Semana de ${p.userName}`"
              />
              <span class="pod__pct">Recorde: {{ daysLabel(p.streak.best) }}</span>
            </template>

            <!-- Pontos: total da semana, barra relativa ao líder -->
            <template v-else-if="sortMode === 'points' && p.streak">
              <span class="pod__total">{{ pointsLabel(p.streak.pointsWeek) }}</span>
              <div class="pod__track">
                <div class="pod__fill" :style="{ width: pointsPct(p) + '%' }" />
              </div>
              <span class="pod__pct">Pontos desta semana</span>
            </template>

            <!-- Horas: o placar de sempre -->
            <template v-else>
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
            </template>
          </article>
        </section>

        <!-- Ninguém pontua no eixo novo (time começando, segunda cedo): em vez
             de sumir o pódio sem explicação, o Nevo diz como entrar nele. -->
        <div v-else-if="sortMode !== 'hours'" class="rank-empty">
          <NevoSprite pose="dando-dica" motion="idle" :size="64" />
          <p class="rank-empty__text">{{ EMPTY_PODIUM[sortMode] }}</p>
        </div>

        <!-- Ranking completo. TransitionGroup: ao trocar o eixo, cada linha
             desliza até a nova posição em vez de a lista "piscar" reordenada. -->
        <TransitionGroup tag="ul" name="team-move" class="team-list" aria-label="Ranking da equipe">
          <li
            v-for="(row, i) in rows"
            :key="row.userId"
            class="team-row"
            :class="{ 'team-row--live': row.running, 'team-row--me': row.isMe }"
            :style="{ '--pc': avatarTone(row.userName), '--i': i }"
          >
            <span class="team-rank">
              <RankMedal v-if="row.rank <= 3 && scores(row)" :place="(row.rank as 1 | 2 | 3)" :size="22" />
              <span v-else class="team-rank__num">{{ scores(row) ? `${row.rank}º` : '–' }}</span>
            </span>

            <PersonAvatar
              :id="row.userId"
              class="team-avatar"
              :class="{ 'team-avatar--live': row.running }"
              :name="row.userName"
              :size="38"
              variant="soft"
              :ring="!!row.running"
              decorative
            />

            <div class="team-main-cell">
              <span class="team-name">
                <span class="team-name-text">{{ row.userName }}</span>
                <span v-if="row.isMe" class="team-you">Você</span>
                <!-- Chama acesa (e viva) só com o dia de hoje garantido. -->
                <span
                  v-if="row.streak"
                  class="team-streak"
                  :class="{ 'team-streak--lit': row.streak.securedToday }"
                  :style="{ '--streak-lit': litTone(row.streak.tierKey) }"
                  role="img"
                  :aria-label="streakAria(row.streak)"
                  :title="streakAria(row.streak)"
                >
                  <NevoFlame
                    :live="row.streak.securedToday"
                    :lit="row.streak.securedToday"
                    :tier="row.streak.tierKey"
                    :size="18"
                  />
                  <span class="team-streak__num">{{ daysLabel(row.streak.current) }}</span>
                </span>
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
                    <DollarSign :size="12" /> Faturável
                  </span>
                </template>
                <!-- "Ocioso" soava como bronca; estar fora do cronômetro não é
                     estar parado (reunião, telefone, trabalho fora da tela). -->
                <span v-else class="team-idle">Fora do cronômetro</span>
              </div>

              <!-- Barra do eixo: fatia do tempo (horas), semana (sequência) ou
                   pontos em relação ao líder. -->
              <StreakWeek
                v-if="sortMode === 'streak' && row.streak"
                class="team-week"
                :days="row.streak.week"
                size="sm"
                :aria-label="`Semana de ${row.userName}`"
              />
              <div
                v-else-if="sortMode === 'points' && row.streak"
                class="team-track"
                role="img"
                :aria-label="`${pointsLabel(row.streak.pointsWeek)} nesta semana`"
              >
                <div class="team-track-fill" :style="{ width: pointsPct(row) + '%' }" />
              </div>
              <div
                v-else-if="sortMode === 'hours' && hasScore"
                class="team-track"
                role="img"
                :aria-label="`${row.pct}% do tempo do escopo`"
              >
                <div class="team-track-fill" :style="{ width: row.pct + '%' }" />
              </div>

              <!-- Constância dos últimos 3 meses: quem aparece todo dia fica
                   visível mesmo sem estar no topo do placar por total. -->
              <TimeHeatmap
                v-if="hasConstancy(row.userId)"
                class="team-heat"
                :days="constancyOf(row.userId)"
                :weeks="13"
                :cell="7"
                bare
              />
            </div>

            <div class="team-metrics">
              <span v-if="row.running" class="team-live-clock">{{ formatTimer(row.elapsedSec) }}</span>
              <div class="team-period">
                <span class="team-period-label">{{ METRIC_LABEL[sortMode] }}</span>
                <span class="team-period-value">{{ metricValue(row) }}</span>
              </div>
            </div>
          </li>
        </TransitionGroup>
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
        :pulse-title="pulseTitle"
        :pulse-dense="pulseDense"
        :by-activity="byActivity"
        :by-company="isGroup ? byCompany : []"
        :constancy-by-day="constancyByDay"
        :streak="streakSummary"
      />
    </div>
  </div>
</template>

<style scoped>
/*
 * Texto em rem (16px = 1rem), nunca abaixo de 0.75rem (12px, regra 50+): o
 * "Aumento de fonte" escala o font-size raiz, e em px o texto antigo ficava
 * parado enquanto a chama e os rótulos novos cresciam ao lado dele.
 */
.team {
  --spring: cubic-bezier(0.34, 1.42, 0.5, 1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Seletores em pílula (escopo e eixo do ranking) ── */
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
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

/* Alvo de 44px (regra 50+) sem engordar a pílula: a área clicável desce e
   sobe 4px, até a borda do trilho. */
.scope__btn::after {
  content: '';
  position: absolute;
  inset: -4px 0;
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

/* ── Eixo do ranking ── */
.rank-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-tools__row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.rank-me {
  color: var(--text-2);
  font-size: 0.8125rem;
}

.rank-me strong {
  color: var(--text);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.rank-empty {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.rank-empty__text {
  margin: 0;
  max-width: 520px;
  color: var(--text-2);
  font-size: 0.875rem;
  line-height: 1.5;
}

.rank-hint {
  margin: 0;
  max-width: 640px;
  color: var(--text-3);
  font-size: 0.8125rem;
  line-height: 1.45;
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
  font-size: 0.84375rem;
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
  font-size: 0.78125rem;
}

.team-total strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
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
  min-height: 34px;
}

.pod__rank {
  font-size: 0.78125rem;
  font-weight: 800;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.pod--first .pod__rank {
  color: var(--text);
}

/* A semana não estica na largura do card: círculos juntos leem como uma fila. */
.pod__week {
  align-self: flex-start;
}

/* Mascote do nível no canto do card, pelo pé (a caixa do sprite já é justa). */
.pod__nevo {
  margin-left: auto;
  display: inline-flex;
  align-items: flex-end;
  height: 44px;
}

.pod__who {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

/* PersonAvatar de 32px: foto, ou iniciais no tom estável da pessoa. */
.pod__avatar {
  flex-shrink: 0;
}

.pod__id {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pod__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text);
  font-size: 0.8125rem;
  font-weight: 650;
}

.pod__name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pod__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
}

/* Nível em texto na cor dele: sinal chapado (os tons passam AA como texto). */
.pod__tier {
  color: var(--tier);
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.pod__you,
.team-you {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  /* 12px no mínimo (regra 50+); em rem para seguir o aumento de fonte. */
  font-size: 0.75rem;
  font-weight: 750;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  flex-shrink: 0;
}

.pod__total {
  color: var(--text);
  font-size: 1.1875rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.pod--first .pod__total {
  font-size: 1.375rem;
}

.pod__total--streak {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Aceso, o número pega o tom da chama do nível (`--streak-lit`, AA). */
.pod__total--lit {
  color: var(--streak-lit, var(--streak-flame));
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
  font-size: 0.75rem;
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

/*
 * Reordenação ao trocar o eixo (FLIP do TransitionGroup), com a mesma mola.
 * `animation-duration: 0s`: o Vue só faz o move quando a transição é mais
 * longa que a animação do elemento, e o `row-in` com o atraso escalonado
 * chega a 620ms; sem zerar, da 5ª linha para baixo ninguém deslizava. Zerar a
 * duração (e não trocar o nome) não reinicia a entrada, que já terminou.
 */
.team-move-move {
  transition: transform 460ms var(--spring);
  animation-duration: 0s;
}

/* Entrada usa a própria animação da linha. Saída é imediata: sem isto o Vue
   esperava o `row-in` (que nunca termina de novo) e a linha que saiu ficava
   duplicada na tela ao trocar de escopo. */
.team-move-leave-active {
  display: none;
  animation: none;
  transition: none;
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
  font-size: 0.78125rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

/* PersonAvatar de 38px (foto, ou iniciais no tom estável da pessoa). */
.team-avatar {
  flex: 0 0 auto;
}

/* Timer rodando: o anel do avatar fica na cor de "ao vivo". Traço chapado,
   sem brilho em volta. */
.team-avatar--live {
  --pa-ring-color: color-mix(in srgb, var(--err) 55%, transparent);
  --pa-ring-width: 1.5px;
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
  font-size: 0.84375rem;
  font-weight: 650;
}

.team-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * Chama da sequência ao lado do nome. A cor fica no número (sinal chapado) e
 * só quando o dia de hoje está garantido; apagada, o número fica neutro.
 */
.team-streak {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-3);
  font-size: 0.8125rem;
  font-weight: 750;
  white-space: nowrap;
}

.team-streak__num {
  font-variant-numeric: tabular-nums;
}

.team-streak--lit {
  color: var(--streak-lit, var(--streak-flame));
}

/* Em quais empresas do grupo a pessoa registrou tempo. Base 0: ocupa só a
   sobra da linha, então o nome nunca encolhe por causa dela (perder "Stack
   Roads · Nev..." custa menos que "Nicolas Ca..."). Um `flex-shrink` alto não
   resolvia: qualquer fração de pixel a menos já põe reticência no nome. */
.team-where {
  flex: 1 1 0;
  min-width: 0;
  color: var(--text-4);
  font-size: 0.75rem;
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
  font-size: 0.75rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.team-desc {
  color: var(--text-2);
  font-size: 0.78125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}

.team-idle {
  color: var(--text-4);
  font-size: 0.78125rem;
}

.team-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
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

/* Semana da sequência (seg..dom) no lugar da barra, no eixo Sequência. */
.team-week {
  margin-top: 2px;
  align-self: flex-start;
}

/*
 * Faixa de constância da pessoa (3 meses). Herda a cor do avatar dela (`--pc`),
 * então a linha do ranking inteira fala a mesma cor e dá para comparar de
 * relance quem mantém o hábito, não só quem somou mais horas.
 */
.team-heat {
  margin-top: 7px;
  max-width: 420px;
  --accent: var(--pc);
}

@media (max-width: 900px) {
  .team-heat {
    display: none;
  }
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
  font-size: 0.9375rem;
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
  min-width: 72px;
}

.team-period-label {
  color: var(--text-4);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.team-period-value {
  color: var(--text);
  font-size: 0.8125rem;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.team-retry {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 0.8125rem;
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
  .pod__fill,
  .team-move-move {
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
