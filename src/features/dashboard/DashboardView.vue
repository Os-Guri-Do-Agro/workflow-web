<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDashboardOrchestration } from '@/composables/useDashboardOrchestration'
import { useLazyLoad } from '@/composables/useLazyLoad'
import { useStreakTeam } from '@/composables/useStreak'
import { safeStorage } from '@/utils/safe-storage'
import DashboardHeader from './components/DashboardHeader.vue'
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

// Progressive disclosure: Agenda / Feed / Projects só montam (e buscam)
// quando o sentinela entra no viewport. O bento é o caminho crítico.
// `target` precisa ser uma variável top-level para o template ref bindar.
const { target: agendaTarget, isVisible: agendaVisible } = useLazyLoad()
const { target: copilotTarget, isVisible: copilotVisible } = useLazyLoad()
const { target: feedTarget, isVisible: feedVisible } = useLazyLoad()
const { target: projectsTarget, isVisible: projectsVisible } = useLazyLoad()

// ─── Linha vitrine + time (spec sequencia-diaria-nevo) ───────────────────────
// A grade dessa linha depende de duas coisas que os módulos decidem sozinhos:
// o painel do time some sem rota na API ou sem empresa (mesma regra do
// TeamStreakPanel; a consulta é a mesma, o Vue Query deduplica), e a vitrine
// pode ser ocultada pela pessoa. Sem um dos dois, a linha vira uma coluna só,
// em vez de deixar metade da largura vazia.
const streakTeam = useStreakTeam()
const teamShown = computed(() => streakTeam.available.value && !!streakTeam.companyId.value)

/** Preferência da pessoa, lembrada entre visitas (storage seguro do repo). */
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
      v-reveal="0"
      :greeting="dash.greeting.value"
      :first-name="dash.firstName.value"
      :today-label="dash.todayLabel.value"
      :mode="dash.mode.value"
      :can-create-task="!!dash.firstMonth.value"
      @set-mode="dash.setMode"
      @new-task="dash.handleNewTask"
    />

    <!--
      Sequência do Nevo (spec sequencia-diaria-nevo): o primeiro módulo da home,
      em largura cheia. É o motivo para voltar todo dia, por isso vem antes dos
      números do projeto. Sem a rota na API ele (e o painel do time) não
      renderiza; a vitrine continua, porque não depende da sequência, e ocupa a
      linha inteira. O v-reveal mora dentro dele (e dos dois abaixo): um
      componente que pode não renderizar nada não pode receber a diretiva de fora.
    -->
    <StreakHero />

    <!--
      Vitrine animada (7fr) ao lado do time (5fr), a mesma proporção do
      `.dash-below`. Vira uma coluna só abaixo de 1100px, quando a pessoa oculta
      a vitrine ou quando não há painel do time (ver `duoSingle`).
    -->
    <div class="dash-duo" :class="{ 'dash-duo--single': duoSingle }">
      <ShowcaseSection v-model:hidden="showcaseHidden" />
      <TeamStreakPanel />
    </div>

    <!--
      Bento assimétrico (spec overhaul-visual-premium, iteração 2): módulos de
      tamanhos distintos em grid por áreas. Cada módulo declara a própria
      `grid-area` no CSS dele; aqui só o mapa. A coluna da direita (atividade)
      é alta de propósito, é o que quebra a cara de "4 cards gêmeos".
    -->
    <div class="bento">
      <HeroSection
        v-reveal="1"
        :hero="dash.hero.value"
        :weekly-completed="dash.weeklySeries.value.completed"
        :loading="dash.loading.value"
      />

      <MovementModule
        v-reveal="2"
        :created="dash.weeklySeries.value.created"
        :completed="dash.weeklySeries.value.completed"
        :loading="dash.loading.value"
      />

      <StatsRow :stats="dash.stats.value" :loading="dash.loading.value" />

      <section v-reveal="3" class="bento-cell dist" aria-label="Distribuição de tarefas">
        <span class="eyebrow">Distribuição</span>
        <OverviewChart :metrics="dash.metrics.value?.metrics ?? undefined" />
      </section>

      <ActivityPanel :company-id="dash.companyId" />
    </div>

    <!--
      Abaixo do bento, DUAS colunas. Antes eram quatro seções em largura cheia,
      empilhadas: em monitor largo isso desperdiçava a lateral inteira e obrigava
      a rolar muito para chegar em qualquer coisa — a timeline, que é uma lista
      longa por natureza, empurrava todo o resto para fora da tela.

      A timeline vai para a coluna da direita com rolagem PRÓPRIA: ela cresce
      sozinha e não pode mais definir a altura da página.
    -->
    <div class="dash-below">
      <div class="dash-col">
        <!-- Lazy: Agenda -->
        <div ref="agendaTarget" class="lazy-slot">
          <AgendaSection v-if="agendaVisible" v-reveal @open-calendar="dash.openCalendar" />
        </div>

        <!-- Lazy: Copilot -->
        <div ref="copilotTarget" class="lazy-slot">
          <CopilotSection
            v-if="copilotVisible"
            v-reveal
            :search-status="dash.searchStatus.value"
            :workspace-answer="dash.workspaceAnswer.value"
            :digest-summary="dash.digestSummary.value"
            :format-feed-date="dash.formatFeedDate"
            @open-ai="dash.openAiTool"
            @open-search="dash.openWorkspaceSearch"
          />
        </div>

        <!-- Lazy: Projects -->
        <div ref="projectsTarget" class="lazy-slot">
          <ProjectsSection
            v-if="projectsVisible"
            v-reveal
            :projects="dash.projects.value"
            :loading="dash.loadingCompanies.value"
            @load="dash.findCompanies"
            @select="dash.handleProjectClick"
          />
        </div>
      </div>

      <!-- Lazy: Feed (coluna própria, com scroll interno) -->
      <div ref="feedTarget" class="lazy-slot dash-feed-slot">
        <FeedSection
          v-if="feedVisible"
          v-reveal
          :digest-summary="dash.digestSummary.value"
          :digest-loading="dash.digestLoading.value"
          :format-feed-date="dash.formatFeedDate"
          @open-ai="dash.openAiTool"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@import './components/dashboard-shared.css';

.dash-page {
  /*
   * Ancorado à esquerda e com o MESMO gabarito das outras telas densas (o
   * `.time-view` do Meu tempo usa estes números). Centralizado, o Dashboard
   * saía do lugar em monitor largo: a sidebar terminava e o conteúdo começava
   * depois de um vazio, enquanto Meu tempo, Tarefas e Drive começavam colados.
   * Trocar de aba parecia mover a página inteira.
   */
  padding: 24px 28px 40px;
  max-width: 1480px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
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
  padding: 18px 20px 12px;
  min-height: 0;
}

@media (max-width: 1100px) {
  .bento {
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-areas:
      'prog prog prog prog mov  mov  mov  mov'
      'prog prog prog prog mov  mov  mov  mov'
      't1   t1   t2   t2   t3   t3   t4   t4'
      'dist dist dist dist act  act  act  act'
      'dist dist dist dist act  act  act  act';
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

/*
 * Linha da vitrine + time. `align-items: start`: a vitrine tem altura de vídeo
 * (16:9) e o painel cresce com o número de pessoas; esticar o mais baixo só
 * criaria um vazio dentro do card.
 */
.dash-duo {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 12px;
  align-items: start;
}

.dash-duo--single {
  grid-template-columns: minmax(0, 1fr);
}

/*
 * Lado a lado, a vitrine acompanha a rolagem enquanto a lista do time passa
 * (mesma ideia da timeline do `.dash-below`): o vão embaixo dela vira o
 * caminho do vídeo, não um buraco. `.ss` é a raiz do ShowcaseSection.
 */
.dash-duo:not(.dash-duo--single) > .ss {
  position: sticky;
  top: 8px;
}

@media (max-width: 1100px) {
  .dash-duo {
    grid-template-columns: minmax(0, 1fr);
  }

  .dash-duo:not(.dash-duo--single) > .ss {
    position: static;
  }
}

/* Reserva altura mínima para o sentinela do lazy-load não colapsar a 0px
   (senão o IntersectionObserver dispararia tudo de uma vez). */
.lazy-slot {
  min-height: 120px;
}

/*
 * Duas colunas abaixo do bento. A da direita é menor porque a timeline é uma
 * lista estreita por natureza — dar largura cheia a ela produzia linhas de
 * texto curtas dentro de um bloco enorme, que foi o que ficou feio.
 */
.dash-below {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  gap: 12px;
  align-items: start;
}

.dash-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

/*
 * A timeline acompanha a rolagem e tem teto de altura: sem isso ela cresce
 * indefinidamente e volta a mandar na altura da página, que é exatamente o
 * problema que esta divisão resolve.
 */
.dash-feed-slot {
  position: sticky;
  top: 8px;
  min-width: 0;
  /*
   * Teto duplo: nunca passa da tela, e nunca passa de 620px. O segundo limite
   * existe porque a coluna da esquerda costuma ser mais curta — sem ele, a
   * timeline esticava sozinha e deixava um vazio enorme ao lado.
   */
  max-height: min(calc(100vh - 40px), 620px);
  display: flex;
}

.dash-feed-slot > * {
  flex: 1;
  min-height: 0;
}

@media (max-width: 1100px) {
  .dash-below {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Sem duas colunas, prender a timeline no topo só atrapalharia. */
  .dash-feed-slot {
    position: static;
    max-height: none;
  }
}

@media (max-width: 768px) {
  .dash-page {
    padding: 16px 14px 32px;
  }
}
</style>
