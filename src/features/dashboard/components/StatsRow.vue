<script setup lang="ts">
/**
 * Tiles de estatística do bento.
 *
 * O root usa `display: contents`: cada tile é filho DIRETO do grid bento do
 * DashboardView e ocupa a própria área (t1..t4) — um wrapper aqui quebraria o
 * layout por áreas. Os quatro deixaram de ser cards gêmeos: são células
 * compactas, e a de Atrasadas muda de temperamento quando o número é > 0.
 */
import Skeleton from '@/components/ui/Skeleton.vue'
import CountUp from '@/components/ui/CountUp.vue'
import type { StatCard } from '@/composables/useDashboardOrchestration'

defineProps<{
  stats: StatCard[]
  loading: boolean
}>()
</script>

<template>
  <div class="tiles">
    <div
      v-for="(s, i) in stats"
      :key="s.title"
      v-reveal="i + 2"
      class="bento-cell tile"
      :class="[`tile--t${i + 1}`, { 'tile--alert': s.title === 'Atrasadas' && s.value > 0 }]"
      :style="{ '--stat-c': s.color }"
    >
      <div v-if="loading" class="tile-skel"><Skeleton type="row" /></div>
      <template v-else>
        <div class="tile-chip">
          <component :is="s.icon" :size="14" />
        </div>
        <CountUp class="tile-value" :value="s.value" />
        <div class="tile-label">{{ s.title }}</div>
        <div class="tile-trend">{{ s.trend }}</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
@import './dashboard-shared.css';

/* Cada tile vira item do grid bento pai. */
.tiles {
  display: contents;
}

.tile--t1 { grid-area: t1; }
.tile--t2 { grid-area: t2; }
.tile--t3 { grid-area: t3; }
.tile--t4 { grid-area: t4; }

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px 16px;
  overflow: hidden;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.tile::before {
  content: '';
  position: absolute;
  top: -30px;
  right: -30px;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--stat-c), transparent 70%);
  opacity: 0.1;
  filter: blur(16px);
  pointer-events: none;
}

.tile:hover {
  border-color: var(--border-strong);
}

.tile--alert {
  border-color: color-mix(in srgb, var(--err) 35%, var(--border));
  background:
    radial-gradient(
      120% 120% at 100% 0%,
      color-mix(in srgb, var(--err) 10%, transparent) 0%,
      transparent 60%
    ),
    var(--surface);
}

.tile-chip {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--stat-c) 14%, transparent);
  color: var(--stat-c);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 3px;
}

.tile-value {
  font-size: 27px;
  font-weight: 800;
  letter-spacing: -0.035em;
  color: var(--text);
  line-height: 1;
}

.tile-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.tile-trend {
  font-size: 11.5px;
  color: var(--text-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-skel {
  flex: 1;
}
</style>
