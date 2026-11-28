<script setup lang="ts">
/**
 * Home (spec v2-mobile-e-home). Antes eram ~12 módulos empilhados numa tela só:
 * a sequência ocupava a primeira dobra inteira e "o que é meu hoje" não
 * aparecia em lugar nenhum. Agora são três abas, cada uma com um trabalho:
 *
 * - **Meu dia** (padrão): minhas tarefas de todas as empresas, o resumo da
 *   sequência e a agenda. É o que abre de manhã, inclusive no celular.
 * - **Jornada**: o palco completo do Nevo (sequência, níveis, marcos, vitrine
 *   3D, time). Nada saiu, só deixou de ser a primeira coisa da tela.
 * - **Painel**: os números da empresa (progresso, movimento, distribuição,
 *   timeline, projetos), para quem acompanha o andamento.
 *
 * Só a aba aberta monta: a vitrine 3D e as consultas do painel não saem para
 * quem só quer ver as tarefas. A aba fica lembrada entre visitas, e `#sequencia`
 * (link do chip do topo) abre direto na Jornada.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDashboardOrchestration } from '@/composables/useDashboardOrchestration'
import { useLazyLoad } from '@/composables/useLazyLoad'
import { useStreak, useStreakTeam } from '@/composables/useStreak'
import { safeStorage } from '@/utils/safe-storage'
import DashboardHeader from './components/DashboardHeader.vue'
import type { HomeTab } from './home-tabs'
import MyDaySection from './components/MyDaySection.vue'
import StreakSummaryCard from './components/StreakSummaryCard.vue'
import StreakHero from './components/StreakHero.vue'
import ShowcaseSection from './components/ShowcaseSection.vue'
import TeamStreakPanel from './components/TeamStreakPanel.vue'
import HeroSection from './components/HeroSection.vue'
import MovementModule from './components/MovementModule.vue'
import StatsRow from './components/StatsRow.vue'
import ActivityPanel from './components/ActivityPanel.vue'
import OverviewChart from '@/components/dashboard/OverviewChart.vue'
import AgendaSection from './components/AgendaSection.vue'
import CopilotSection from './components/CopilotSection.vue'
import FeedSection from './components/FeedSection.vue'
import ProjectsSection from './components/ProjectsSection.vue'

const dash = useDashboardOrchestration()
const route = useRoute()
const router = useRouter()

// ─── Abas ────────────────────────────────────────────────────────────────────
const TAB_KEY = 'dashboard.tab'
const VALID: HomeTab[] = ['today', 'journey', 'panel']
function initialTab(): HomeTab {
  if (route.hash === '#sequencia') return 'journey'
  const saved = safeStorage.getItem(TAB_KEY) as HomeTab | null
  return saved && VALID.includes(saved) ? saved : 'today'
}
const tab = ref<HomeTab>(initialTab())
function setTab(next: HomeTab) {
  tab.value = next
  safeStorage.setItem(TAB_KEY, next)
}
// O chip da sequência leva a `/#sequencia` também com a home já aberta.
watch(
  () => route.hash,
  (hash) => {
    if (hash === '#sequencia') setTab('journey')
  },
)
function openJourney() {
  setTab('journey')
  void router.replace({ hash: '#sequencia' })
}

// Sem a rota da sequência na API, a aba Jornada não existe (só a vitrine
// sobraria, e ela sozinha não justifica uma aba).
const { available: streakAvailable } = useStreak()
watch(streakAvailable, (ok) => {
  if (!ok && tab.value === 'journey') setTab('today')
})

// ─── Lazy do Painel ──────────────────────────────────────────────────────────
// `target` precisa ser uma variável top-level para o template ref bindar.
const { target: agendaTarget, isVisible: agendaVisible } = useLazyLoad()
const { target: copilotTarget, isVisible: copilotVisible } = useLazyLoad()
const { target: feedTarget, isVisible: feedVisible } = useLazyLoad()
const { target: projectsTarget, isVisible: projectsVisible } = useLazyLoad()

// ─── Jornada: vitrine + time ─────────────────────────────────────────────────
// A grade depende de duas coisas que os módulos decidem sozinhos: o painel do
// time some sem rota na API ou sem empresa, e a vitrine pode ser ocultada pela
// pessoa. Sem um dos dois, a linha vira uma coluna só.
const streakTeam = useStreakTeam()
const teamShown = computed(() => streakTeam.available.value && !!streakTeam.companyId.value)

const SHOWCASE_HIDDEN_KEY = 'dashboard.showcase.hidden'
const showcaseHidden = ref(safeStorage.getItem(SHOWCASE_HIDDEN_KEY) === '1')
watch(showcaseHidden, (hidden) => {
  if (hidden) safeStorage.setItem(SHOWCASE_HIDDEN_KEY, '1')
  else safeStorage.removeItem(SHOWCASE_HIDDEN_KEY)
})
const duoSingle = computed(() => showcaseHidden.value || !teamShown.value)
</script>

<template>
  <div class="dash-page">
    <DashboardHeader
      :greeting="dash.greeting.value"
      :first-name="dash.firstName.value"
      :today-label="dash.todayLabel.value"
      :mode="dash.mode.value"
      :tab="tab"
      :journey-available="streakAvailable"
      :can-create-task="!!dash.firstMonth.value"
      @set-mode="dash.setMode"
      @set-tab="setTab"
      @new-task="dash.handleNewTask"
    />

    <!-- Meu dia -->
    <div v-if="tab === 'today'" id="home-panel-today" class="today" role="tabpanel" aria-labelledby="home-tab-today">
      <MyDaySection class="today-main" />
      <div class="today-side">
        <StreakSummaryCard @open-journey="openJourney" />
        <div ref="agendaTarget" class="lazy-slot lazy-slot--short">
          <AgendaSection v-if="agendaVisible" @open-calendar="dash.openCalendar" />
        </div>
      </div>
    </div>

    <!-- Jornada (Nevo) -->
    <div
      v-else-if="tab === 'journey'"
      id="home-panel-journey"
      class="journey"
      role="tabpanel"
      aria-labelledby="home-tab-journey"
    >
      <StreakHero />
      <div class="dash-duo" :class="{ 'dash-duo--single': duoSingle }">
        <ShowcaseSection v-model:hidden="showcaseHidden" />
        <TeamStreakPanel />
      </div>
    </div>

    <!-- Painel da empresa -->
    <div v-else id="home-panel-panel" class="panel" role="tabpanel" aria-labelledby="home-tab-panel">
      <div class="bento">
        <HeroSection :hero="dash.hero.value" :weekly-completed="dash.weeklySeries.value.completed" :loading="dash.loading.value" />
        <MovementModule
          :created="dash.weeklySeries.value.created"
          :completed="dash.weeklySeries.value.completed"
          :loading="dash.loading.value"
        />
        <StatsRow :stats="dash.stats.value" :loading="dash.loading.value" />
        <section class="bento-cell dist" aria-labelledby="dist-title">
          <h2 id="dist-title" class="cell-title">Distribuição</h2>
          <OverviewChart :metrics="dash.metrics.value?.metrics ?? undefined" />
        </section>
        <ActivityPanel :company-id="dash.companyId" />
      </div>

      <div class="dash-below">
        <div class="dash-col">
          <div ref="copilotTarget" class="lazy-slot">
            <CopilotSection
              v-if="copilotVisible"
              :search-status="dash.searchStatus.value"
              :workspace-answer="dash.workspaceAnswer.value"
              :digest-summary="dash.digestSummary.value"
              :format-feed-date="dash.formatFeedDate"
              @open-ai="dash.openAiTool"
              @open-search="dash.openWorkspaceSearch"
            />
          </div>
          <div ref="projectsTarget" class="lazy-slot">
            <ProjectsSection
              v-if="projectsVisible"
              :projects="dash.projects.value"
              :loading="dash.loadingCompanies.value"
              @load="dash.findCompanies"
              @select="dash.handleProjectClick"
            />
          </div>
        </div>
        <div ref="feedTarget" class="lazy-slot dash-feed-slot">
          <FeedSection
            v-if="feedVisible"
            :digest-summary="dash.digestSummary.value"
            :digest-loading="dash.digestLoading.value"
            :format-feed-date="dash.formatFeedDate"
            @open-ai="dash.openAiTool"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './components/dashboard-shared.css';

.dash-page {
  /*
   * Ancorado à esquerda e com o MESMO gabarito das outras telas densas (o
   * `.time-view` do Meu tempo usa estes números): trocar de aba não move a
   * página.
   */
  padding: 22px 28px 40px;
  max-width: 1480px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Meu dia ── */
.today {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(300px, 4fr);
  gap: 16px;
  align-items: start;
}

.today-side {
  display: grid;
  gap: 16px;
  min-width: 0;
}

/* ── Jornada ── */
.journey {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dash-duo {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 12px;
  align-items: start;
}

.dash-duo--single {
  grid-template-columns: minmax(0, 1fr);
}

/* A vitrine acompanha a rolagem enquanto a lista do time passa. `.ss` é a raiz do ShowcaseSection. */
.dash-duo:not(.dash-duo--single) > .ss {
  position: sticky;
  top: 8px;
}

/* ── Painel ── */
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/*
 * O mapa do bento. Linhas de ~126px; módulos ocupam múltiplos:
 * progresso 5x2, movimento 4x2, atividade 3x4 (a torre), distribuição 5x2,
 * tiles 2x1. Total 12 colunas.
 */
.bento {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-auto-rows: minmax(126px, auto);
  grid-template-areas:
    'prog prog prog prog prog mov  mov  mov  act  act  act  act'
    'prog prog prog prog prog mov  mov  mov  act  act  act  act'
    'dist dist dist dist t1   t1   t2   t2   act  act  act  act'
    'dist dist dist dist t3   t3   t4   t4   act  act  act  act';
  gap: 12px;
}

.dist {
  grid-area: dist;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 12px;
  min-height: 0;
}

.cell-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

/* Reserva altura mínima para o sentinela do lazy-load não colapsar a 0px. */
.lazy-slot {
  min-height: 120px;
}

.lazy-slot--short {
  min-height: 1px;
}

.dash-below {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 12px;
  align-items: start;
}

.dash-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* A timeline acompanha a rolagem e tem teto de altura: nunca passa da tela nem de 620px. */
.dash-feed-slot {
  position: sticky;
  top: 8px;
  min-width: 0;
  max-height: min(calc(100vh - 40px), 620px);
  display: flex;
}

.dash-feed-slot > * {
  flex: 1;
  min-height: 0;
}

@media (max-width: 1100px) {
  .today {
    grid-template-columns: minmax(0, 1fr);
  }

  .bento {
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-areas:
      'prog prog prog prog mov  mov  mov  mov'
      'prog prog prog prog mov  mov  mov  mov'
      't1   t1   t2   t2   t3   t3   t4   t4'
      'dist dist dist dist act  act  act  act'
      'dist dist dist dist act  act  act  act';
  }

  .dash-duo,
  .dash-below {
    grid-template-columns: minmax(0, 1fr);
  }

  .dash-duo:not(.dash-duo--single) > .ss {
    position: static;
  }

  .dash-feed-slot {
    position: static;
    max-height: none;
  }
}

@media (max-width: 720px) {
  .bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: auto;
    grid-template-areas:
      'prog prog'
      'mov  mov'
      't1   t2'
      't3   t4'
      'dist dist'
      'act  act';
  }
}

/* Celular: os blocos encostam nas bordas, como lista de app, sem moldura dupla. */
@media (max-width: 640px) {
  .dash-page {
    padding: 14px 0 28px;
    gap: 12px;
  }

  .dash-page > :deep(.dh) {
    padding: 0 16px;
  }

  .today,
  .today-side {
    gap: 12px;
  }

  /* A agenda não tem moldura própria: no celular ela ganha a margem da página. */
  .today-side > .lazy-slot {
    padding: 0 16px;
  }

  .journey,
  .panel {
    padding: 0 12px;
  }
}
</style>
