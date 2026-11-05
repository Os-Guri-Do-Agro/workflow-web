<script setup lang="ts">
/**
 * Resumo da sequência na aba "Meu dia" (spec v2-mobile-e-home, H2). A
 * sequência continua sendo o motivo para voltar todo dia, mas na home ela
 * ocupava a primeira tela inteira e empurrava o trabalho para baixo da dobra.
 * Aqui ela cabe num cartão: chama, dias, a frase do Nevo, a semana e as
 * missões. O palco completo (níveis, marcos, vitrine 3D, time) mora na aba
 * "Jornada", a um toque.
 *
 * Sem a rota na API (404/403), o cartão não renderiza, igual ao chip do topo.
 */
import { computed } from 'vue'
import { ArrowRight } from 'lucide-vue-next'
import NevoFlame from '@/components/nevo/NevoFlame.vue'
import StreakWeek from '@/components/nevo/StreakWeek.vue'
import { useStreak } from '@/composables/useStreak'
import { daysLabel } from '@/components/nevo/nevo-assets'

const emit = defineEmits<{ (e: 'open-journey'): void }>()

const { streak, available, mood } = useStreak()

const lit = computed(() => streak.value?.securedToday ?? false)
const tierKey = computed(() => streak.value?.tier.key ?? null)
const missionsDone = computed(() => streak.value?.missions.filter((m) => m.done).length ?? 0)
const missionsTotal = computed(() => streak.value?.missions.length ?? 3)
</script>

<template>
  <section v-if="available && streak" class="ssum" aria-labelledby="ssum-title">
    <div class="ssum-top">
      <NevoFlame :live="lit" :lit="lit" :tier="tierKey" :size="36" />
      <div class="ssum-count">
        <span class="ssum-num">{{ streak.current }}</span>
        <span class="ssum-unit">{{ streak.current === 1 ? 'dia seguido' : 'dias seguidos' }}</span>
      </div>
      <span class="ssum-tier">{{ streak.tier.label }}</span>
    </div>

    <h2 id="ssum-title" class="ssum-title">{{ mood.title }}</h2>
    <p class="ssum-msg">{{ mood.message }}</p>

    <StreakWeek :days="streak.week" size="sm" aria-label="Sua semana, de segunda a domingo" />

    <div class="ssum-foot">
      <span class="ssum-missions">
        <strong>{{ missionsDone }} de {{ missionsTotal }}</strong> missões hoje
        <template v-if="streak.best > streak.current"> · recorde {{ daysLabel(streak.best) }}</template>
      </span>
      <button type="button" class="ssum-more" @click="emit('open-journey')">
        <span>Ver jornada</span>
        <ArrowRight :size="14" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.ssum {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px 18px 14px;
  display: grid;
  gap: 8px;
  min-width: 0;
}

.ssum-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ssum-count {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.ssum-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.ssum-unit {
  font-size: 13px;
  color: var(--text-2);
}

.ssum-tier {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  white-space: nowrap;
}

.ssum-title {
  margin: 4px 0 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  text-wrap: balance;
}

.ssum-msg {
  margin: 0 0 2px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-3);
  text-wrap: pretty;
}

.ssum-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.ssum-missions {
  font-size: 12.5px;
  color: var(--text-3);
}

.ssum-missions strong {
  color: var(--text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ssum-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.ssum-more:hover {
  background: var(--accent-soft);
}

.ssum-more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .ssum {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 14px 16px 12px;
  }
}
</style>
