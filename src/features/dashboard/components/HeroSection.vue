<script setup lang="ts">
/**
 * Módulo PROGRESSO do bento (o antigo hero). É a célula-âncora do grid:
 * tint de acento, anel grande com count-up e o resumo do que importa
 * (concluídas, atrasadas, fechadas na semana). Saudação e ações moraram
 * aqui um dia — hoje vivem no `DashboardHeader`.
 */
import { computed } from 'vue'
import { CheckCircle2, TrendingUp } from 'lucide-vue-next'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import CountUp from '@/components/ui/CountUp.vue'

const props = defineProps<{
  hero: { total: number; done: number; progress: number; overdue: number }
  /** Série semanal de concluídas (para o ritmo "+N esta semana"). */
  weeklyCompleted: number[]
  loading: boolean
}>()

const completedThisWeek = computed(() =>
  props.weeklyCompleted.reduce((a, b) => a + b, 0),
)
</script>

<template>
  <section class="bento-cell prog" aria-label="Progresso geral">
    <div class="prog-head">
      <span class="eyebrow">Progresso geral</span>
      <span v-if="hero.overdue > 0" class="prog-overdue">
        {{ hero.overdue }} atrasada{{ hero.overdue > 1 ? 's' : '' }}
      </span>
    </div>

    <div class="prog-body">
      <ProgressRing
        :value="hero.progress"
        :size="148"
        :stroke="11"
        glow
        :aria-label="`Progresso geral: ${hero.progress}%`"
      >
        <span class="prog-ring-number">
          <CountUp class="prog-big" :value="hero.progress" />
          <span class="prog-unit">%</span>
        </span>
      </ProgressRing>

      <div class="prog-facts">
        <div class="prog-fact">
          <CheckCircle2 :size="14" class="prog-fact-icon prog-fact-icon--done" />
          <span>
            <strong><CountUp :value="hero.done" /></strong>
            de <strong>{{ hero.total }}</strong> tarefas concluídas
          </span>
        </div>
        <div v-if="completedThisWeek > 0" class="prog-fact">
          <TrendingUp :size="14" class="prog-fact-icon prog-fact-icon--pace" />
          <span>
            <strong>+{{ completedThisWeek }}</strong> fechadas esta semana
          </span>
        </div>
        <div v-else class="prog-fact prog-fact--muted">
          <TrendingUp :size="14" class="prog-fact-icon" />
          <span>Nenhuma fechada esta semana</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

/*
 * Célula-âncora: a única do bento com tint de acento. O radial no canto dá o
 * volume; o resto do grid fica neutro para ela mandar na hierarquia.
 */
.prog {
  grid-area: prog;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 22px;
  background:
    radial-gradient(
      120% 140% at 0% 0%,
      color-mix(in srgb, var(--accent) 16%, transparent) 0%,
      transparent 55%
    ),
    var(--surface);
  overflow: hidden;
  position: relative;
}

.prog::after {
  content: '';
  position: absolute;
  right: -70px;
  bottom: -90px;
  width: 230px;
  height: 230px;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--accent) 14%, transparent),
    transparent 70%
  );
  filter: blur(10px);
  pointer-events: none;
}

.prog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.prog-overdue {
  font-size: 12px;
  font-weight: 600;
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}

.prog-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 22px;
  min-height: 0;
}

.prog-ring-number {
  display: flex;
  align-items: baseline;
  gap: 1px;
}

.prog-big {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1;
  color: var(--text);
}

.prog-unit {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-3);
}

.prog-facts {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.prog-fact {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-2);
}

.prog-fact strong {
  color: var(--text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.prog-fact--muted {
  color: var(--text-4);
}

.prog-fact-icon {
  color: var(--text-3);
  flex: none;
}

.prog-fact-icon--done {
  color: var(--status-done);
}

.prog-fact-icon--pace {
  color: var(--accent);
}

@media (max-width: 520px) {
  .prog-body {
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  }
}
</style>
