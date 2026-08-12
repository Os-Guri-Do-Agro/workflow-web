<script setup lang="ts">
/**
 * Distribuição de tarefas por status (spec overhaul-visual-premium, F1).
 *
 * Era um donut com TODAS as defaults do ECharts (paleta default, legenda
 * default) — o elemento mais "genérico" do dashboard. Agora: cores dos tokens
 * de status (mesma semântica dos chips e do board), total no centro com
 * count-up, legenda própria em HTML (contagem + percentual por status) e
 * tooltip com a cara do design system.
 *
 * O `option` é computed com dependência EXPLÍCITA de tema/acento do uiStore:
 * é isso que repinta o canvas na troca de tema (o cache do `readToken` é
 * invalidado por `applyThemeTokens`, mas alguém precisa recomputar).
 */
import { computed, ref } from 'vue'
// Import local, e não componente global registrado no `main.ts`: o registro
// global fazia o echarts (536 KB) entrar no chunk de entrada e ser baixado por
// quem abre a tela de login.
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { PieChart as PieIcon } from 'lucide-vue-next'
import CountUp from '@/components/ui/CountUp.vue'
import {
  chartThemeDep,
  chartTooltip,
  resolveCssColor,
  withAlpha,
} from '@/plugins/echarts-theme'

use([CanvasRenderer, PieChart, TooltipComponent])

/** Só o que o gráfico realmente lê da resposta de métricas. */
interface OverviewMetrics {
  status?: {
    todo?: number
    inProgress?: number
    inTesting?: number
    completed?: number
  }
}

const props = defineProps<{
  metrics?: OverviewMetrics
}>()

const slices = computed(() => {
  const s = props.metrics?.status
  return [
    { key: 'todo', name: 'A fazer', value: s?.todo || 0, token: 'var(--status-todo)' },
    { key: 'prog', name: 'Em andamento', value: s?.inProgress || 0, token: 'var(--status-prog)' },
    { key: 'test', name: 'Em teste', value: s?.inTesting || 0, token: 'var(--status-test)' },
    { key: 'done', name: 'Concluídas', value: s?.completed || 0, token: 'var(--status-done)' },
  ]
})

const total = computed(() => slices.value.reduce((acc, s) => acc + s.value, 0))

/**
 * Toggle de fatia pela legenda (paridade com a legenda nativa do ECharts que
 * este redesign substituiu): clicar esconde/mostra o status; os percentuais
 * e o total do centro passam a refletir só o que está visível.
 */
const hiddenKeys = ref(new Set<string>())

function toggleSlice(key: string) {
  const next = new Set(hiddenKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  // Esconder tudo deixaria um donut vazio sem como voltar a enxergar o botão
  // como "desligado": a última fatia visível não pode ser ocultada.
  if (next.size === slices.value.length) return
  hiddenKeys.value = next
}

const visibleSlices = computed(() =>
  slices.value.filter((s) => !hiddenKeys.value.has(s.key)),
)
const visibleTotal = computed(() =>
  visibleSlices.value.reduce((acc, s) => acc + s.value, 0),
)

function pct(value: number): number {
  return visibleTotal.value ? Math.round((value / visibleTotal.value) * 100) : 0
}

const option = computed(() => {
  // Registra a dependência de tema/acento: troca repinta o canvas.
  chartThemeDep()
  const surface = resolveCssColor('var(--surface)')
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      ...chartTooltip(),
    },
    series: [
      {
        name: 'Status',
        type: 'pie',
        radius: ['64%', '86%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        padAngle: 2,
        // Cor derivada da MESMA lista que alimenta a legenda: reordenar ou
        // filtrar fatias nunca dessincroniza dot da legenda e fatia do donut.
        color: visibleSlices.value.map((s) => resolveCssColor(s.token)),
        itemStyle: {
          // O "respiro" entre fatias vem da borda na cor da superfície.
          borderRadius: 8,
          borderColor: surface,
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: {
            shadowBlur: 16,
            shadowColor: withAlpha('var(--accent)', 0.22),
          },
        },
        animationDuration: 700,
        animationEasing: 'cubicOut' as const,
        data: visibleSlices.value.map((s) => ({ value: s.value, name: s.name })),
      },
    ],
  }
})
</script>

<template>
  <div class="ov">
    <div class="ov-chart">
      <template v-if="total > 0">
        <VChart :option="option" :autoresize="true" class="ov-canvas" />
        <div class="ov-center" aria-hidden="true">
          <CountUp class="ov-total" :value="visibleTotal" />
          <span class="ov-total-label">tarefas</span>
        </div>
      </template>
      <div v-else class="ov-empty">
        <PieIcon :size="20" />
        <span>Sem tarefas neste espaço</span>
      </div>
    </div>

    <ul v-if="total > 0" class="ov-legend" aria-label="Tarefas por status">
      <li v-for="s in slices" :key="s.key">
        <button
          type="button"
          class="ov-row"
          :class="{ 'ov-row--off': hiddenKeys.has(s.key) }"
          :aria-pressed="!hiddenKeys.has(s.key)"
          :title="hiddenKeys.has(s.key) ? `Mostrar ${s.name}` : `Ocultar ${s.name}`"
          @click="toggleSlice(s.key)"
        >
          <span class="ov-dot" :style="{ background: s.token }" aria-hidden="true" />
          <span class="ov-name">{{ s.name }}</span>
          <CountUp class="ov-count" :value="s.value" />
          <span class="ov-pct">{{ hiddenKeys.has(s.key) ? '' : `${pct(s.value)}%` }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ov {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  min-height: 210px;
}

.ov-chart {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 210px;
}

.ov-canvas {
  width: 100%;
  height: 100%;
}

.ov-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ov-total {
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--text);
}

.ov-total-label {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
}

.ov-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-4);
  font-size: 12.5px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}

.ov-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 172px;
  flex: none;
}

/* Botão (toggle da fatia), com alvo de toque ≥44px (a11y 50+). */
.ov-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 4px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.ov-row:hover {
  background: var(--surface-2);
}

.ov-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.ov-row--off {
  opacity: 0.45;
}

.ov-row--off .ov-name {
  text-decoration: line-through;
}

.ov-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex: none;
}

.ov-name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ov-count {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
}

.ov-pct {
  width: 38px;
  text-align: right;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .ov {
    flex-direction: column;
    align-items: stretch;
  }

  .ov-legend {
    width: 100%;
  }
}
</style>
