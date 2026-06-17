<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Flag,
  Milestone,
  Rocket,
  Target,
  UsersRound,
  type LucideIcon,
} from 'lucide-vue-next'

type RoadmapStatus = 'done' | 'active' | 'planned' | 'risk'

type RoadmapLane = {
  id: string
  title: string
  description: string
  owner: string
  status: RoadmapStatus
  color: string
  icon: LucideIcon
}

type RoadmapItem = {
  id: string
  laneId: string
  title: string
  start: string
  end: string
  progress: number
  status: RoadmapStatus
  kind: 'activity' | 'event'
}

type RoadmapMilestone = {
  id: string
  laneId: string
  title: string
  date: string
  status: RoadmapStatus
}

type RoadmapSelection =
  | { type: 'item'; value: RoadmapItem }
  | { type: 'milestone'; value: RoadmapMilestone }

type QuarterFilter = 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'
type StatusFilter = 'all' | RoadmapStatus

const roadmapStart = new Date('2026-01-01T00:00:00')
const roadmapEnd = new Date('2026-12-31T23:59:59')

const quarters = [
  { label: 'Q1', period: 'Jan - Mar', start: '2026-01-01', end: '2026-03-31' },
  { label: 'Q2', period: 'Abr - Jun', start: '2026-04-01', end: '2026-06-30' },
  { label: 'Q3', period: 'Jul - Set', start: '2026-07-01', end: '2026-09-30' },
  { label: 'Q4', period: 'Out - Dez', start: '2026-10-01', end: '2026-12-31' },
] as const

const reviewMarkers = [
  { label: 'Review Q1', date: '2026-03-27' },
  { label: 'Review Q2', date: '2026-06-26' },
  { label: 'Review Q3', date: '2026-09-25' },
  { label: 'Review Q4', date: '2026-12-18' },
]

const lanes: RoadmapLane[] = [
  {
    id: 'planning',
    title: 'Planejamento',
    description: 'Visão, objetivos e orçamento do ciclo.',
    owner: 'Produto',
    status: 'active',
    color: 'var(--accent)',
    icon: Target,
  },
  {
    id: 'strategy',
    title: 'Estratégia',
    description: 'Pesquisa, hipóteses e validação de mercado.',
    owner: 'Growth',
    status: 'planned',
    color: 'var(--err)',
    icon: Flag,
  },
  {
    id: 'development',
    title: 'Desenvolvimento',
    description: 'Entrega de roadmap, betas e release.',
    owner: 'Engenharia',
    status: 'active',
    color: 'var(--success)',
    icon: Rocket,
  },
  {
    id: 'intelligence',
    title: 'Business Intelligence',
    description: 'Métricas, dashboards e relatórios operacionais.',
    owner: 'Dados',
    status: 'risk',
    color: 'var(--info)',
    icon: BarChart3,
  },
]

const roadmapItems: RoadmapItem[] = [
  {
    id: 'vision',
    laneId: 'planning',
    title: 'Visão',
    start: '2026-01-01',
    end: '2026-02-14',
    progress: 100,
    status: 'done',
    kind: 'activity',
  },
  {
    id: 'objectives',
    laneId: 'planning',
    title: 'Objetivos',
    start: '2026-01-24',
    end: '2026-03-06',
    progress: 100,
    status: 'done',
    kind: 'activity',
  },
  {
    id: 'goals',
    laneId: 'planning',
    title: 'Metas',
    start: '2026-03-02',
    end: '2026-04-10',
    progress: 100,
    status: 'done',
    kind: 'activity',
  },
  {
    id: 'intent',
    laneId: 'planning',
    title: 'Strategic Intent',
    start: '2026-04-01',
    end: '2026-05-14',
    progress: 64,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'budget',
    laneId: 'planning',
    title: 'Sales Budget',
    start: '2026-05-16',
    end: '2026-06-14',
    progress: 35,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'release-plan',
    laneId: 'planning',
    title: 'Beta + Release Plans',
    start: '2026-06-16',
    end: '2026-08-30',
    progress: 18,
    status: 'planned',
    kind: 'activity',
  },
  {
    id: 'market',
    laneId: 'strategy',
    title: 'Market Analysis',
    start: '2026-02-05',
    end: '2026-03-22',
    progress: 80,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'swot',
    laneId: 'strategy',
    title: 'SWOT',
    start: '2026-03-14',
    end: '2026-04-02',
    progress: 45,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'business-model',
    laneId: 'strategy',
    title: 'Business Model',
    start: '2026-04-01',
    end: '2026-06-02',
    progress: 20,
    status: 'planned',
    kind: 'activity',
  },
  {
    id: 'price-research',
    laneId: 'strategy',
    title: 'Price Research',
    start: '2026-05-24',
    end: '2026-07-12',
    progress: 0,
    status: 'planned',
    kind: 'activity',
  },
  {
    id: 'sales-trends',
    laneId: 'strategy',
    title: 'Sales Trends Analysis',
    start: '2026-07-15',
    end: '2026-09-10',
    progress: 0,
    status: 'planned',
    kind: 'activity',
  },
  {
    id: 'vks',
    laneId: 'development',
    title: 'VKS',
    start: '2026-02-24',
    end: '2026-03-20',
    progress: 75,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'product-roadmap',
    laneId: 'development',
    title: 'Product Roadmap',
    start: '2026-02-28',
    end: '2026-04-20',
    progress: 64,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'development',
    laneId: 'development',
    title: 'Development',
    start: '2026-04-01',
    end: '2026-08-22',
    progress: 42,
    status: 'active',
    kind: 'activity',
  },
  {
    id: 'qa',
    laneId: 'development',
    title: 'QA + RC',
    start: '2026-08-23',
    end: '2026-09-18',
    progress: 0,
    status: 'planned',
    kind: 'event',
  },
  {
    id: 'release-web',
    laneId: 'development',
    title: 'Release to Web',
    start: '2026-09-20',
    end: '2026-11-10',
    progress: 0,
    status: 'planned',
    kind: 'activity',
  },
  {
    id: 'service-metrics',
    laneId: 'intelligence',
    title: 'Service Metrics',
    start: '2026-03-01',
    end: '2026-03-08',
    progress: 100,
    status: 'done',
    kind: 'event',
  },
  {
    id: 'quality-metrics',
    laneId: 'intelligence',
    title: 'Quality Metrics',
    start: '2026-04-05',
    end: '2026-04-12',
    progress: 100,
    status: 'done',
    kind: 'event',
  },
  {
    id: 'service-dashboard',
    laneId: 'intelligence',
    title: 'Service Dashboard',
    start: '2026-06-28',
    end: '2026-07-05',
    progress: 30,
    status: 'active',
    kind: 'event',
  },
  {
    id: 'real-time-analytics',
    laneId: 'intelligence',
    title: 'Real-time Analytics',
    start: '2026-09-12',
    end: '2026-09-20',
    progress: 0,
    status: 'planned',
    kind: 'event',
  },
  {
    id: 'sales-dashboard',
    laneId: 'intelligence',
    title: 'Sales Dashboard',
    start: '2026-11-25',
    end: '2026-12-02',
    progress: 0,
    status: 'planned',
    kind: 'event',
  },
  {
    id: 'reporting',
    laneId: 'intelligence',
    title: 'Real-time Reporting',
    start: '2026-12-10',
    end: '2026-12-18',
    progress: 0,
    status: 'planned',
    kind: 'event',
  },
]

const milestones: RoadmapMilestone[] = [
  { id: 'competitive-review', laneId: 'strategy', title: 'Competitive Review', date: '2026-03-14', status: 'active' },
  { id: 'alpha', laneId: 'development', title: 'Alpha', date: '2026-05-20', status: 'active' },
  { id: 'private-beta', laneId: 'development', title: 'Private Beta', date: '2026-06-30', status: 'planned' },
  { id: 'public-beta', laneId: 'development', title: 'Public Beta', date: '2026-08-10', status: 'planned' },
  { id: 'staging', laneId: 'development', title: 'Staging', date: '2026-11-15', status: 'planned' },
  { id: 'go-live', laneId: 'development', title: 'Go Live!', date: '2026-12-20', status: 'planned' },
  { id: 'price-list', laneId: 'strategy', title: 'Final Price List', date: '2026-07-05', status: 'planned' },
]

const statusMeta: Record<RoadmapStatus, { label: string; icon: LucideIcon }> = {
  done: { label: 'Concluído', icon: CheckCircle2 },
  active: { label: 'Em andamento', icon: Activity },
  planned: { label: 'Planejado', icon: CalendarClock },
  risk: { label: 'Atenção', icon: Flag },
}

const activeLaneId = ref<string>('all')
const activeStatus = ref<StatusFilter>('all')
const activeQuarter = ref<QuarterFilter>('all')
const selected = ref<RoadmapSelection | null>(null)

const viewport = computed(() => {
  if (activeQuarter.value === 'all') {
    return { start: roadmapStart, end: roadmapEnd }
  }
  const quarter = quarters.find((item) => item.label === activeQuarter.value)
  return {
    start: new Date(`${quarter?.start ?? '2026-01-01'}T00:00:00`),
    end: new Date(`${quarter?.end ?? '2026-12-31'}T23:59:59`),
  }
})

const visibleLanes = computed(() => {
  if (activeLaneId.value === 'all') return lanes
  return lanes.filter((lane) => lane.id === activeLaneId.value)
})

const visibleQuarters = computed(() => {
  if (activeQuarter.value === 'all') return quarters
  return quarters.filter((quarter) => quarter.label === activeQuarter.value)
})

const visibleReviewMarkers = computed(() =>
  reviewMarkers.filter((review) => overlapsDate(review.date, review.date)),
)

const selectedLane = computed(() => {
  const laneId = selected.value?.value.laneId
  return lanes.find((lane) => lane.id === laneId) ?? null
})

const selectedStatus = computed(() => selected.value ? statusMeta[selected.value.value.status] : null)

const summary = computed(() => {
  const completed = roadmapItems.filter((item) => item.status === 'done').length
  const active = roadmapItems.filter((item) => item.status === 'active').length
  const planned = roadmapItems.filter((item) => item.status === 'planned').length
  const totalProgress = roadmapItems.reduce((sum, item) => sum + item.progress, 0)
  return {
    completed,
    active,
    planned,
    progress: Math.round(totalProgress / roadmapItems.length),
  }
})

function toTime(date: string | Date): number {
  return date instanceof Date ? date.getTime() : new Date(`${date}T00:00:00`).getTime()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positionPercent(date: string | Date): number {
  const total = toTime(viewport.value.end) - toTime(viewport.value.start)
  const current = toTime(date) - toTime(viewport.value.start)
  return clamp((current / total) * 100, 0, 100)
}

function itemStyle(item: RoadmapItem) {
  const left = positionPercent(new Date(Math.max(toTime(item.start), toTime(viewport.value.start))))
  const right = positionPercent(new Date(Math.min(toTime(item.end), toTime(viewport.value.end))))
  return {
    left: `${left}%`,
    width: `${Math.max(right - left, 1.4)}%`,
  }
}

function markerStyle(date: string) {
  return {
    left: `${positionPercent(date)}%`,
  }
}

function laneItems(laneId: string): RoadmapItem[] {
  return roadmapItems.filter(
    (item) =>
      item.laneId === laneId &&
      (activeStatus.value === 'all' || item.status === activeStatus.value) &&
      overlapsDate(item.start, item.end),
  )
}

function laneMilestones(laneId: string): RoadmapMilestone[] {
  return milestones.filter(
    (milestone) =>
      milestone.laneId === laneId &&
      (activeStatus.value === 'all' || milestone.status === activeStatus.value) &&
      overlapsDate(milestone.date, milestone.date),
  )
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function overlapsDate(start: string, end: string): boolean {
  return toTime(end) >= toTime(viewport.value.start) && toTime(start) <= toTime(viewport.value.end)
}

function selectItem(item: RoadmapItem) {
  selected.value = { type: 'item', value: item }
}

function selectMilestone(milestone: RoadmapMilestone) {
  selected.value = { type: 'milestone', value: milestone }
}

function isSelected(type: RoadmapSelection['type'], id: string): boolean {
  return selected.value?.type === type && selected.value.value.id === id
}

function resetFilters() {
  activeLaneId.value = 'all'
  activeStatus.value = 'all'
  activeQuarter.value = 'all'
}
</script>

<template>
  <section class="roadmap-page">
    <header class="roadmap-hero">
      <div class="hero-copy">
        <div class="text-eyebrow hero-eyebrow">
          <Milestone :size="13" />
          Roadmap anual
        </div>
        <h1 class="text-display hero-title">Roadmap de eventos e atividades</h1>
        <p class="text-body hero-description">
          Visão mockada do ciclo 2026 com iniciativas por área, reviews trimestrais e marcos de entrega.
        </p>
      </div>

      <div class="hero-card">
        <span class="hero-card-label">Progresso médio</span>
        <strong>{{ summary.progress }}%</strong>
        <div class="hero-progress">
          <span :style="{ width: `${summary.progress}%` }" />
        </div>
        <small>Dados locais até as rotas do backend existirem</small>
      </div>
    </header>

    <div class="summary-grid" aria-label="Resumo do roadmap">
      <article class="summary-card">
        <CheckCircle2 :size="18" />
        <span>Concluídas</span>
        <strong>{{ summary.completed }}</strong>
      </article>
      <article class="summary-card">
        <Activity :size="18" />
        <span>Em andamento</span>
        <strong>{{ summary.active }}</strong>
      </article>
      <article class="summary-card">
        <CalendarClock :size="18" />
        <span>Planejadas</span>
        <strong>{{ summary.planned }}</strong>
      </article>
      <article class="summary-card">
        <UsersRound :size="18" />
        <span>Áreas</span>
        <strong>{{ lanes.length }}</strong>
      </article>
    </div>

    <section class="interaction-grid" aria-label="Controles do roadmap">
      <div class="controls-card">
        <div class="controls-intro">
          <div>
            <span class="text-eyebrow">Como usar</span>
            <h2>Explore o roadmap por trimestre, área ou status</h2>
          </div>
          <p>
            Use os filtros para focar em uma parte do ano. Clique em uma barra ou marco da timeline para ver período,
            progresso e contexto no painel ao lado.
          </p>
        </div>

        <div class="controls-row">
          <div class="control-group">
            <span class="control-label">Trimestre</span>
            <div class="segmented">
              <button
                class="segmented-btn"
                :class="{ 'segmented-btn--active': activeQuarter === 'all' }"
                @click="activeQuarter = 'all'"
              >
                Ano
              </button>
              <button
                v-for="quarter in quarters"
                :key="quarter.label"
                class="segmented-btn"
                :class="{ 'segmented-btn--active': activeQuarter === quarter.label }"
                @click="activeQuarter = quarter.label"
              >
                {{ quarter.label }}
              </button>
            </div>
          </div>

          <div class="control-group">
            <span class="control-label">Área</span>
            <select v-model="activeLaneId" class="select-control" aria-label="Filtrar por área">
              <option value="all">Todas as áreas</option>
              <option v-for="lane in lanes" :key="lane.id" :value="lane.id">
                {{ lane.title }}
              </option>
            </select>
          </div>

          <div class="control-group">
            <span class="control-label">Status</span>
            <select v-model="activeStatus" class="select-control" aria-label="Filtrar por status">
              <option value="all">Todos</option>
              <option v-for="(meta, status) in statusMeta" :key="status" :value="status">
                {{ meta.label }}
              </option>
            </select>
          </div>

          <button class="ghost-btn" @click="resetFilters">Limpar filtros</button>
        </div>
      </div>

      <aside class="detail-card" aria-live="polite">
        <template v-if="selected">
          <div class="detail-head">
            <span class="detail-type">
              {{ selected.type === 'item' ? 'Atividade' : 'Marco' }}
            </span>
            <span v-if="selectedStatus" class="detail-status">
              <component :is="selectedStatus.icon" :size="12" />
              {{ selectedStatus.label }}
            </span>
          </div>
          <h2>{{ selected.value.title }}</h2>
          <p v-if="selectedLane">{{ selectedLane.title }} · {{ selectedLane.owner }}</p>
          <dl class="detail-list">
            <div>
              <dt>Período</dt>
              <dd v-if="selected.type === 'item'">
                {{ formatDate(selected.value.start) }} - {{ formatDate(selected.value.end) }}
              </dd>
              <dd v-else>{{ formatDate(selected.value.date) }}</dd>
            </div>
            <div v-if="selected.type === 'item'">
              <dt>Progresso</dt>
              <dd>{{ selected.value.progress }}%</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>Mock local</dd>
            </div>
          </dl>
        </template>
        <template v-else>
          <div class="detail-empty">
            <Milestone :size="22" />
            <h2>Selecione uma atividade</h2>
            <p>Clique em uma barra ou marco do roadmap para ver mais informações aqui.</p>
          </div>
        </template>
      </aside>
    </section>

    <div class="roadmap-shell">
      <div class="roadmap-scroll" role="region" aria-label="Linha do tempo do roadmap" tabindex="0">
        <div class="roadmap-board">
          <div class="review-layer" aria-hidden="true">
            <div
              v-for="review in visibleReviewMarkers"
              :key="review.label"
              class="review-marker"
              :style="markerStyle(review.date)"
            >
              <span>{{ review.label }}</span>
              <i />
            </div>
          </div>

          <div class="board-header">
            <div class="side-header">Área</div>
            <div class="meta-header">Responsável</div>
            <div class="meta-header">Status</div>
            <div class="timeline-header">
              <div
                v-for="quarter in visibleQuarters"
                :key="quarter.label"
                class="quarter-cell"
              >
                <span>{{ quarter.label }}</span>
                <small>{{ quarter.period }}</small>
              </div>
            </div>
          </div>

          <div
            v-for="lane in visibleLanes"
            :key="lane.id"
            class="lane-row"
            :style="{ '--lane-color': lane.color }"
          >
            <div class="lane-title">
              <div class="lane-icon">
                <component :is="lane.icon" :size="18" />
              </div>
              <div>
                <strong>{{ lane.title }}</strong>
                <span>{{ lane.description }}</span>
              </div>
            </div>

            <div class="lane-owner">{{ lane.owner }}</div>

            <div class="lane-status" :class="`lane-status--${lane.status}`">
              <component :is="statusMeta[lane.status].icon" :size="13" />
              {{ statusMeta[lane.status].label }}
            </div>

            <div class="timeline-cell">
              <div class="timeline-grid" aria-hidden="true" />

              <article
                v-for="item in laneItems(lane.id)"
                :key="item.id"
                class="roadmap-bar"
                :class="[
                  `roadmap-bar--${item.status}`,
                  { 'roadmap-bar--event': item.kind === 'event' },
                  { 'roadmap-bar--selected': isSelected('item', item.id) },
                ]"
                :style="itemStyle(item)"
                :aria-label="`${item.title}: ${formatDate(item.start)} até ${formatDate(item.end)}`"
                role="button"
                tabindex="0"
                @click="selectItem(item)"
                @keydown.enter.prevent="selectItem(item)"
                @keydown.space.prevent="selectItem(item)"
              >
                <span class="bar-progress" :style="{ width: `${item.progress}%` }" />
                <span class="bar-label">{{ item.title }}</span>
                <small v-if="item.progress > 0">{{ item.progress }}%</small>
              </article>

              <div
                v-for="milestone in laneMilestones(lane.id)"
                :key="milestone.id"
                class="milestone-pin"
                :class="[
                  `milestone-pin--${milestone.status}`,
                  { 'milestone-pin--selected': isSelected('milestone', milestone.id) },
                ]"
                :style="markerStyle(milestone.date)"
                role="button"
                tabindex="0"
                @click="selectMilestone(milestone)"
                @keydown.enter.prevent="selectMilestone(milestone)"
                @keydown.space.prevent="selectMilestone(milestone)"
              >
                <span class="milestone-label">{{ milestone.title }}</span>
                <span class="milestone-date">{{ formatDate(milestone.date) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="roadmap-note">
      <CircleDot :size="14" />
      <span>
        Esta tela ainda não consome backend. Quando as rotas existirem, os arrays mockados podem virar service + Vue Query.
      </span>
    </footer>
  </section>
</template>

<style scoped>
.roadmap-page {
  min-height: 100%;
  padding: 28px;
  color: var(--text);
}

.roadmap-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 20px;
  align-items: stretch;
  margin-bottom: 18px;
}

.hero-copy,
.hero-card,
.roadmap-shell,
.roadmap-note,
.summary-card {
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}

.hero-copy {
  border-radius: var(--radius-xl);
  padding: 24px;
  position: relative;
  overflow: hidden;
}

.hero-copy::after {
  content: '';
  position: absolute;
  inset: auto 24px -70px auto;
  width: 210px;
  height: 210px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  filter: blur(40px);
  pointer-events: none;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--accent);
}

.hero-title {
  margin: 10px 0 8px;
  letter-spacing: -0.04em;
}

.hero-description {
  max-width: 680px;
  color: var(--text-2);
  margin: 0;
}

.hero-card {
  border-radius: var(--radius-xl);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}

.hero-card-label,
.summary-card span,
.roadmap-note {
  color: var(--text-3);
}

.hero-card strong {
  font-size: 38px;
  line-height: 1;
  letter-spacing: -0.06em;
}

.hero-progress {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.hero-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 30%, var(--text)));
}

.hero-card small {
  color: var(--text-4);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-card {
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
}

.summary-card svg {
  color: var(--accent);
}

.summary-card strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.interaction-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
  margin-bottom: 18px;
}

.controls-card,
.detail-card {
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.controls-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 16px;
}

.controls-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.controls-intro h2 {
  margin: 6px 0 0;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.03em;
}

.controls-intro p {
  max-width: 520px;
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.55;
}

.controls-row {
  display: flex;
  align-items: end;
  gap: 14px;
  flex-wrap: wrap;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.control-label {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.segmented-btn,
.ghost-btn,
.select-control {
  font-family: inherit;
  font-size: 12.5px;
}

.segmented-btn,
.ghost-btn {
  border: none;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.segmented-btn {
  min-width: 46px;
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  color: var(--text-3);
  background: transparent;
  font-weight: 700;
}

.segmented-btn:hover,
.segmented-btn--active {
  background: var(--surface);
  color: var(--text);
}

.select-control {
  min-width: 178px;
  height: 36px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  padding: 0 10px;
  outline: none;
}

.select-control:focus {
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
}

.ghost-btn {
  height: 36px;
  padding: 0 12px;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--border);
  font-weight: 700;
}

.ghost-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.detail-card {
  padding: 16px;
  min-height: 138px;
}

.detail-empty {
  min-height: 106px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.detail-empty svg {
  color: var(--accent);
  margin-bottom: 10px;
}

.detail-head,
.detail-status {
  display: flex;
  align-items: center;
  gap: 7px;
}

.detail-head {
  justify-content: space-between;
  margin-bottom: 8px;
}

.detail-type {
  color: var(--accent);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-status {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
}

.detail-card h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.03em;
}

.detail-card p {
  margin: 5px 0 12px;
  color: var(--text-3);
  font-size: 12.5px;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.detail-list div {
  padding: 9px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.detail-list dt {
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.detail-list dd {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.roadmap-shell {
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.roadmap-scroll {
  overflow-x: auto;
  scrollbar-width: thin;
}

.roadmap-board {
  min-width: 1240px;
  position: relative;
}

.review-layer {
  position: absolute;
  left: 360px;
  right: 0;
  top: 0;
  height: 72px;
  pointer-events: none;
  z-index: 4;
}

.review-marker {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.review-marker i {
  width: 12px;
  height: 18px;
  background: var(--err);
  clip-path: polygon(0 0, 100% 0, 72% 100%, 50% 80%, 28% 100%);
}

.board-header,
.lane-row {
  display: grid;
  grid-template-columns: 180px 90px 90px minmax(880px, 1fr);
}

.board-header {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.side-header,
.meta-header {
  min-height: 78px;
  display: flex;
  align-items: flex-end;
  padding: 0 12px 12px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.timeline-header {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: end;
  padding-top: 34px;
}

.quarter-cell {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  background: color-mix(in srgb, var(--accent) 34%, var(--surface-3));
  border-right: 1px solid color-mix(in srgb, var(--surface) 55%, transparent);
}

.quarter-cell:first-child {
  border-top-left-radius: var(--radius-sm);
}

.quarter-cell:last-child {
  border-right: none;
  border-top-right-radius: var(--radius-sm);
}

.quarter-cell span {
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
}

.quarter-cell small {
  color: var(--text-3);
  font-weight: 700;
}

.lane-row {
  min-height: 132px;
  border-bottom: 1px solid var(--border);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--lane-color) 16%, transparent),
      color-mix(in srgb, var(--lane-color) 7%, transparent)
    );
}

.lane-row:last-child {
  border-bottom: none;
}

.lane-title {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 18px 14px;
  background: color-mix(in srgb, var(--lane-color) 22%, var(--surface));
  border-right: 1px solid var(--border);
}

.lane-icon {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  background: color-mix(in srgb, var(--lane-color) 28%, transparent);
  flex-shrink: 0;
}

.lane-title strong {
  display: block;
  font-size: 13px;
  line-height: 1.2;
}

.lane-title span {
  display: block;
  margin-top: 4px;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.35;
}

.lane-owner,
.lane-status {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-right: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}

.lane-status {
  gap: 6px;
  font-weight: 700;
}

.lane-status--done {
  color: var(--success);
}

.lane-status--active {
  color: var(--accent);
}

.lane-status--planned {
  color: var(--text-3);
}

.lane-status--risk {
  color: var(--warn);
}

.timeline-cell {
  position: relative;
  min-height: 132px;
  overflow: hidden;
}

.timeline-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to right, var(--border) 1px, transparent 1px) 0 0 / 25% 100%,
    linear-gradient(to right, color-mix(in srgb, var(--border) 55%, transparent) 1px, transparent 1px) 0 0 / calc(100% / 12) 100%;
  opacity: 0.9;
}

.roadmap-bar {
  position: absolute;
  top: 44px;
  min-width: 34px;
  height: 26px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lane-color) 76%, var(--surface));
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--lane-color) 18%, transparent);
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    transform var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.roadmap-bar:hover,
.roadmap-bar:focus-visible {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--text) 28%, transparent);
  outline: none;
}

.roadmap-bar:nth-of-type(2n) {
  top: 76px;
}

.roadmap-bar--event {
  height: 18px;
  top: 90px;
  border-radius: var(--radius-sm);
  padding-inline: 8px;
}

.roadmap-bar--planned {
  background: color-mix(in srgb, var(--lane-color) 38%, var(--surface-3));
  color: var(--text-2);
}

.roadmap-bar--done {
  background: color-mix(in srgb, var(--success) 76%, var(--surface));
}

.roadmap-bar--risk {
  background: color-mix(in srgb, var(--warn) 76%, var(--surface));
}

.roadmap-bar--selected {
  border-color: var(--text);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--text) 10%, transparent),
    0 12px 28px color-mix(in srgb, var(--lane-color) 26%, transparent);
}

.bar-progress {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--text) 12%, transparent);
  pointer-events: none;
}

.bar-label,
.roadmap-bar small {
  position: relative;
  z-index: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.roadmap-bar small {
  margin-left: auto;
  color: var(--text-2);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.milestone-pin {
  position: absolute;
  top: 12px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  font-size: 10.5px;
  font-weight: 800;
  white-space: nowrap;
  z-index: 2;
  cursor: pointer;
}

.milestone-pin:focus-visible {
  outline: none;
}

.milestone-pin::after {
  content: '';
  width: 15px;
  height: 15px;
  transform: rotate(45deg);
  border-radius: 3px;
  background: var(--surface);
  border: 3px solid var(--lane-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lane-color) 14%, transparent);
  transition:
    transform var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.milestone-pin:hover::after,
.milestone-pin:focus-visible::after,
.milestone-pin--selected::after {
  transform: rotate(45deg) scale(1.18);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--lane-color) 20%, transparent);
}

.milestone-pin--done::after {
  border-color: var(--success);
}

.milestone-pin--risk::after {
  border-color: var(--warn);
}

.milestone-date {
  color: var(--text-4);
  font-weight: 700;
}

.roadmap-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  font-size: 12.5px;
}

@media (max-width: 960px) {
  .roadmap-page {
    padding: 18px;
  }

  .roadmap-hero {
    grid-template-columns: 1fr;
  }

  .interaction-grid {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
