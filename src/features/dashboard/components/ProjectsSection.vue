<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowUpRight, CheckCircle2, Clock3 } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { statusMeta, type DashboardProject } from '@/composables/useDashboardOrchestration'

const props = defineProps<{
  projects: DashboardProject[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'load'): void
  (e: 'select', id: string): void
}>()

// Dispara o fetch só quando a seção monta (entrou no viewport via lazy-load).
onMounted(() => emit('load'))

const PAGE = 12
const showAll = ref(false)

const visibleProjects = computed(() =>
  showAll.value ? props.projects : props.projects.slice(0, PAGE),
)
const hiddenCount = computed(() => Math.max(0, props.projects.length - PAGE))
</script>

<template>
  <section class="projects-section">
    <header class="section-head">
      <h2 class="section-title">Projetos</h2>
      <span class="section-chip">{{ projects.length }}</span>
    </header>

    <div v-if="loading" class="projects-grid">
      <Skeleton v-for="i in 4" :key="i" type="card" />
    </div>

    <template v-else>
      <div class="projects-grid">
        <article
          v-for="project in visibleProjects"
          :key="project.id || project.name"
          class="project-card"
          :style="{ '--status-c': statusMeta[project.status]?.color || 'var(--accent)' }"
          @click="emit('select', project.id)"
        >
          <div class="project-top">
            <div class="project-dot" />
            <span class="project-name">{{ project.name }}</span>
            <ArrowUpRight :size="14" class="project-arrow" />
          </div>
          <p v-if="project.cnpj" class="project-cnpj">{{ project.cnpj }}</p>
          <div class="project-pct-row">
            <span class="project-pct">{{ project.progress }}%</span>
            <span class="project-status">{{ statusMeta[project.status]?.label || '—' }}</span>
          </div>
          <div class="project-bar">
            <div class="project-bar-fill" :style="{ width: project.progress + '%' }" />
          </div>
          <div class="project-stats">
            <div class="pstat">
              <CheckCircle2 :size="12" />
              <span>{{ project.completed }}/{{ project.total }}</span>
            </div>
            <div class="pstat">
              <Clock3 :size="12" />
              <span>{{ project.inProgress }} em exec.</span>
            </div>
          </div>
        </article>
      </div>

      <button
        v-if="!showAll && hiddenCount > 0"
        class="ghost-btn press see-all"
        type="button"
        @click="showAll = true"
      >
        Ver todos ({{ hiddenCount }} a mais)
      </button>
    </template>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.projects-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.see-all {
  align-self: center;
  margin-top: 4px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.project-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease);
}

.project-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--status-c), transparent);
  opacity: 0.6;
}

.project-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--status-c) 10%, rgba(0, 0, 0, 0.14));
}

.project-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-c);
  box-shadow: 0 0 10px var(--status-c);
  flex-shrink: 0;
}

.project-name {
  flex: 1;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-arrow {
  color: var(--text-4);
  transition:
    transform var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.project-card:hover .project-arrow {
  color: var(--text-2);
  transform: translate(2px, -2px);
}

.project-cnpj {
  font-size: 12px;
  color: var(--text-4);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.project-pct-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.project-pct {
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}

.project-status {
  font-size: 12px;
  font-weight: 600;
  color: var(--status-c);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.project-bar {
  height: 4px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
}

.project-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--status-c), color-mix(in srgb, var(--status-c) 50%, var(--text)));
  border-radius: 999px;
  box-shadow: 0 0 12px color-mix(in srgb, var(--status-c) 60%, transparent);
  transition: width 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.project-stats {
  display: flex;
  gap: 12px;
  color: var(--text-3);
  font-size: 12px;
}

.pstat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 768px) {
  .projects-grid {
    grid-template-columns: 1fr;
  }
}
</style>
