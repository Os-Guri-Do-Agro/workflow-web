<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { Sparkles, Plus, ArrowUpRight, Building2, Globe2, CheckCircle2, Activity } from 'lucide-vue-next'
import { sparkOption } from './spark'
import { chartThemeDep } from '@/plugins/echarts-theme'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import CountUp from '@/components/ui/CountUp.vue'
import type { DashboardMode } from '@/composables/useDashboardOrchestration'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{
  greeting: string
  todayLabel: string
  mode: DashboardMode
  hero: { total: number; done: number; progress: number; overdue: number }
  /** Série real de criação semanal (substitui o sparkline fake com Math.sin). */
  weeklyCreated: number[]
  loading: boolean
  canCreateTask: boolean
}>()

const emit = defineEmits<{
  (e: 'set-mode', mode: DashboardMode): void
  (e: 'new-task'): void
}>()

/**
 * Memoizado: `sparkOption` devolve objeto novo a cada chamada, e o `vue-echarts`
 * compara `option` por identidade. Chamado no template, redesenhava o canvas a
 * cada render e forçava três `getComputedStyle(documentElement)` junto.
 */
const heroSparkOption = computed(() => {
  chartThemeDep() // repinta o canvas na troca de tema/acento
  return sparkOption(props.weeklyCreated, 'var(--accent)')
})

const hasTrend = computed(() => props.weeklyCreated.some((v) => v > 0))
const trendDelta = computed(() => props.weeklyCreated.reduce((a, b) => a + b, 0))
</script>

<template>
  <section class="hero gradient-border">
    <div class="hero-body">
      <div class="hero-top">
        <div>
          <span class="eyebrow">
            <Sparkles :size="12" />
            {{ todayLabel }}
          </span>
          <h1 class="hero-title">{{ greeting }}</h1>
          <p class="hero-sub">
            {{
              mode === 'workspace'
                ? 'Panorama de todas as suas empresas, agregado em tempo real.'
                : 'Panorama da empresa ativa. Dados atualizados agora.'
            }}
          </p>
        </div>
        <div class="hero-actions">
          <div class="mode-toggle">
            <button
              class="mode-btn press"
              :class="{ 'mode-btn--active': mode === 'company' }"
              @click="emit('set-mode', 'company')"
            >
              <Building2 :size="12" />
              <span>Empresa</span>
            </button>
            <button
              class="mode-btn press"
              :class="{ 'mode-btn--active': mode === 'workspace' }"
              @click="emit('set-mode', 'workspace')"
            >
              <Globe2 :size="12" />
              <span>Workspace</span>
            </button>
          </div>
          <button
            class="ghost-btn press"
            :disabled="!canCreateTask"
            :title="canCreateTask ? 'Criar nova tarefa' : 'Nenhum mês disponível'"
            @click="emit('new-task')"
          >
            <Plus :size="14" />
            <span>Nova tarefa</span>
          </button>
        </div>
      </div>

      <div class="hero-grid">
        <!--
          Anel em vez de barra: é a linguagem de progresso que o board já usa
          (SubtaskProgress) — mesma informação (`hero.progress`), forma
          consistente entre telas. Número com count-up dentro do anel.
        -->
        <div class="hero-stat hero-stat--primary">
          <ProgressRing
            :value="hero.progress"
            :size="118"
            :stroke="9"
            glow
            :aria-label="`Progresso geral: ${hero.progress}%`"
          >
            <span class="hero-ring-number">
              <CountUp class="bignumber bignumber--ring" :value="hero.progress" />
              <span class="bigunit bigunit--ring">%</span>
            </span>
          </ProgressRing>
          <div class="hero-stat-copy">
            <div class="hero-stat-label">Progresso geral</div>
            <div class="hero-stat-foot">
              <CheckCircle2 :size="12" />
              <span>{{ hero.done }} de {{ hero.total }} tarefas concluídas</span>
            </div>
            <div v-if="hero.overdue > 0" class="hero-stat-overdue">
              {{ hero.overdue }} atrasada{{ hero.overdue > 1 ? 's' : '' }}
            </div>
          </div>
        </div>

        <div class="hero-spark">
          <div class="hero-spark-head">
            <span class="eyebrow">Movimento semanal</span>
            <span v-if="hasTrend" class="hero-spark-trend">
              <ArrowUpRight :size="12" />
              +{{ trendDelta }}
            </span>
          </div>
          <div class="hero-spark-chart">
            <div v-if="loading" class="spark-skel" />
            <VChart
              v-else-if="hasTrend"
              :option="heroSparkOption"
              :autoresize="true"
            />
            <div v-else class="spark-empty">
              <Activity :size="16" />
              <span>Sem atividade esta semana</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.hero {
  border-radius: var(--radius-xl);
  overflow: hidden;
  position: relative;
  isolation: isolate;
}

.hero-body {
  padding: 24px 26px 22px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 8%, var(--surface)) 0%,
    var(--surface) 55%
  );
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.hero-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.024em;
  line-height: 1.1;
  color: var(--text);
  margin: 0;
}

.hero-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 6px 0 0;
}

.hero-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.mode-toggle {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  gap: 2px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  min-height: 36px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.mode-btn:hover {
  color: var(--text-2);
}

.mode-btn--active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.hero-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 14px;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero-stat--primary {
  flex-direction: row;
  align-items: center;
  gap: 18px;
}

.hero-stat-copy {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.hero-ring-number {
  display: flex;
  align-items: baseline;
  gap: 1px;
}

.hero-stat-overdue {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 600;
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}

.hero-stat-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.hero-stat-bignumber {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.bignumber {
  font-size: 56px;
  font-weight: 800;
  letter-spacing: -0.045em;
  color: var(--text);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(180deg, var(--text) 0%, color-mix(in srgb, var(--text) 65%, transparent) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.bigunit {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-3);
}

/* Dentro do anel o número precisa caber no miolo de 118px. */
.bignumber--ring {
  font-size: 34px;
}

.bigunit--ring {
  font-size: 15px;
}

.hero-stat-foot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
}

.hero-spark {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.hero-spark-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hero-spark-trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
  padding: 2px 7px;
  border-radius: 999px;
}

.hero-spark-chart {
  height: 72px;
}

.spark-skel {
  height: 72px;
  background: var(--surface-3);
  border-radius: 6px;
  animation: shimmer 1.4s ease infinite;
  background-size: 200% 100%;
}

.spark-empty {
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-4);
  font-size: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@media (max-width: 960px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .hero-body {
    padding: 18px 16px 16px;
  }
  .hero-top {
    flex-direction: column;
  }
  .hero-actions {
    width: 100%;
  }
  .bignumber--ring {
    font-size: 30px;
  }
}
</style>
