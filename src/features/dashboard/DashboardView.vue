<script setup lang="ts">
import { useDashboardOrchestration } from '@/composables/useDashboardOrchestration'
import { useLazyLoad } from '@/composables/useLazyLoad'
import HeroSection from './components/HeroSection.vue'
import StatsRow from './components/StatsRow.vue'
import ActivityPanel from './components/ActivityPanel.vue'
import AgendaSection from './components/AgendaSection.vue'
import CopilotSection from './components/CopilotSection.vue'
import FeedSection from './components/FeedSection.vue'
import ProjectsSection from './components/ProjectsSection.vue'

const dash = useDashboardOrchestration()

// Progressive disclosure: Agenda / Feed / Projects só montam (e buscam)
// quando o sentinela entra no viewport. Hero + Stats são caminho crítico.
// `target` precisa ser uma variável top-level para o template ref bindar.
const { target: agendaTarget, isVisible: agendaVisible } = useLazyLoad()
const { target: copilotTarget, isVisible: copilotVisible } = useLazyLoad()
const { target: feedTarget, isVisible: feedVisible } = useLazyLoad()
const { target: projectsTarget, isVisible: projectsVisible } = useLazyLoad()
</script>

<template>
  <div class="dash-page">
    <!-- Caminho crítico: renderiza primeiro -->
    <HeroSection
      :greeting="dash.greeting.value"
      :today-label="dash.todayLabel.value"
      :mode="dash.mode.value"
      :hero="dash.hero.value"
      :weekly-created="dash.weeklySeries.value.created"
      :loading="dash.loading.value"
      :can-create-task="!!dash.firstMonth.value"
      @set-mode="dash.setMode"
      @new-task="dash.handleNewTask"
    />

    <StatsRow :stats="dash.stats.value" :loading="dash.loading.value" />

    <ActivityPanel
      :company-id="dash.companyId"
      :metrics="dash.metrics.value"
      :loading="dash.loading.value"
    />

    <!-- Lazy: Agenda -->
    <div ref="agendaTarget" class="lazy-slot">
      <AgendaSection v-if="agendaVisible" @open-calendar="dash.openCalendar" />
    </div>

    <!-- Lazy: Copilot -->
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

    <!-- Lazy: Feed -->
    <div ref="feedTarget" class="lazy-slot">
      <FeedSection
        v-if="feedVisible"
        :digest-summary="dash.digestSummary.value"
        :digest-loading="dash.digestLoading.value"
        :format-feed-date="dash.formatFeedDate"
        @open-ai="dash.openAiTool"
      />
    </div>

    <!-- Lazy: Projects -->
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
</template>

<style scoped>
.dash-page {
  padding: 24px 28px 40px;
  max-width: 1440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Reserva altura mínima para o sentinela do lazy-load não colapsar a 0px
   (senão o IntersectionObserver dispararia tudo de uma vez). */
.lazy-slot {
  min-height: 120px;
}

@media (max-width: 768px) {
  .dash-page {
    padding: 16px 14px 32px;
  }
}
</style>
