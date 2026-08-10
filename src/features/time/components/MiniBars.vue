<script setup lang="ts">
/**
 * Mini gráfico de barras do ritmo. Usado pelo rail individual e pelo da equipe.
 *
 * Quantas barras entram depende do período: 7 no modo "Hoje", uma por dia no
 * modo mês (até 31) e uma por mês em "Tudo". Acima de ~12 colunas o gap e a
 * fonte do rótulo precisam encolher (`dense`), senão o gráfico vira borrão num
 * rail de 340px. Rótulo vazio some sem deixar espaço: quem monta as barras
 * decide quais legendas mostrar.
 *
 * A barra de hoje é destacada por COR CHEIA, não por brilho: sombra colorida
 * lê como neon e foi rejeitada no board pelo mesmo motivo. O melhor dia do
 * período ganha um traço no topo, que é informação e não decoração.
 */
import { computed } from 'vue'
import { formatDurationLong } from '@/utils/duration'

const props = withDefaults(
  defineProps<{
    days: { key: string; sec: number; wd: string; isToday: boolean; title?: string }[]
    max: number
    dense?: boolean
  }>(),
  { dense: false },
)

const bestKey = computed(() => {
  let best: { key: string; sec: number } | null = null
  for (const d of props.days) {
    if (d.sec > 0 && (!best || d.sec > best.sec)) best = { key: d.key, sec: d.sec }
  }
  return best?.key ?? null
})

const barHeight = (sec: number) =>
  Math.max(sec > 0 ? 6 : 0, Math.round((sec / Math.max(1, props.max)) * 100)) + '%'
</script>

<template>
  <div class="bars" :class="{ 'bars--dense': dense }">
    <div
      v-for="(d, i) in days"
      :key="d.key"
      class="bars__col"
      :class="{ 'bars__col--today': d.isToday, 'bars__col--best': d.key === bestKey }"
      :title="`${d.title || d.wd || d.key}: ${formatDurationLong(d.sec)}${d.key === bestKey ? ' (melhor)' : ''}`"
    >
      <div class="bars__track">
        <div class="bars__fill" :style="{ height: barHeight(d.sec), '--i': i }" />
      </div>
      <span class="bars__wd">{{ d.wd }}</span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  height: 96px;
}

.bars__col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  height: 100%;
}

.bars__track {
  position: relative;
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--text-4) 12%, transparent);
  overflow: hidden;
}

.bars__fill {
  width: 100%;
  min-height: 0;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 42%, var(--surface-3));
  transform-origin: bottom;
  animation: bar-grow 480ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
  animation-delay: calc(var(--i, 0) * 40ms);
  transition: height var(--motion-slow) var(--motion-ease);
}

.bars__col--today .bars__fill {
  background: var(--accent);
}

/* Melhor dia: traço no topo da coluna, sem brilho. */
.bars__col--best .bars__track::after {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: color-mix(in srgb, var(--text) 42%, transparent);
}

.bars__wd {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  min-height: 10px;
}

.bars__col--today .bars__wd {
  color: var(--accent);
}

/* Muitas colunas (mês dia a dia, ou anos em "Tudo"): aperta gap, raio e fonte. */
.bars--dense {
  gap: 2px;
}

.bars--dense .bars__col {
  gap: 5px;
}

.bars--dense .bars__track,
.bars--dense .bars__fill {
  border-radius: 2px;
}

.bars--dense .bars__wd {
  font-size: 8.5px;
}

/* Com 31 colunas o stagger fica longo demais: encurta o atraso por barra. */
.bars--dense .bars__fill {
  animation-delay: calc(var(--i, 0) * 12ms);
}

@keyframes bar-grow {
  from {
    transform: scaleY(0.02);
    opacity: 0.4;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bars__fill {
    animation: none;
    transition: none;
  }
}
</style>
