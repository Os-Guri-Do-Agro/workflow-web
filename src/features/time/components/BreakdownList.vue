<script setup lang="ts">
/**
 * Lista "onde o tempo foi": nome, duração e barra de proporção. Serve tanto
 * para a quebra por empresa/projeto quanto por tarefa, no rail individual e no
 * da equipe.
 */
import { formatDurationLong } from '@/utils/duration'

withDefaults(
  defineProps<{
    items: { name: string; sec: number; pct: number }[]
    /** Tinta das barras. `series` varia por linha; `flat` usa um tom neutro. */
    tone?: 'series' | 'flat'
  }>(),
  { tone: 'series' },
)

// A mesma família de tons dos avatares: cor como identificação, não como alarme.
const SERIES = [
  'var(--avatar-1)',
  'var(--avatar-2)',
  'var(--avatar-3)',
  'var(--avatar-4)',
  'var(--avatar-5)',
  'var(--avatar-6)',
]
const toneOf = (i: number, tone: 'series' | 'flat') =>
  tone === 'flat' ? 'var(--text-4)' : SERIES[i % SERIES.length]
</script>

<template>
  <ul class="bd">
    <li v-for="(item, i) in items" :key="item.name" class="bd__row">
      <div class="bd__head">
        <span class="bd__dot" :style="{ background: toneOf(i, tone) }" />
        <span class="bd__name" :title="item.name">{{ item.name }}</span>
        <span class="bd__dur">{{ formatDurationLong(item.sec) }}</span>
      </div>
      <div class="bd__track">
        <div
          class="bd__fill"
          :style="{ width: item.pct + '%', background: toneOf(i, tone) }"
        />
      </div>
    </li>
  </ul>
</template>

<style scoped>
.bd {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.bd__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}

.bd__dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  flex-shrink: 0;
}

.bd__name {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bd__dur {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.bd__track {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.bd__fill {
  height: 100%;
  border-radius: 999px;
  min-width: 3px;
  transition: width var(--motion-slow) var(--motion-ease);
}

@media (prefers-reduced-motion: reduce) {
  .bd__fill {
    transition: none;
  }
}
</style>
