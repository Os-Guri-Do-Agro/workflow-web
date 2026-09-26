<script setup lang="ts">
/**
 * StreakMissions: "Sua jornada", as 3 missões do dia (foco, tarefa,
 * colaboração) com progresso e estado concluído.
 *
 * Props:
 * - `missions`: `StreakMe.missions` (sempre foco, tarefa, colaboração).
 * - `variant`: `cards` (padrão; cartões lado a lado em tela larga e
 *   empilhados no estreito, com dica de como cumprir) ou `compact` (linhas
 *   densas para o popover do chip).
 *
 * Não desenha título: quem usa põe o seu ("Sua jornada", "Missões de hoje").
 *
 * Usado em: StreakHero (home) e popover do StreakChip.
 */
import { computed } from 'vue'
import { Check, Timer } from 'lucide-vue-next'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import type { StreakMission } from '@/service/streak/streak-service'
import { missionProgressLabel, missionRatio, nevoSrc } from './nevo-assets'

const props = withDefaults(
  defineProps<{
    missions: readonly StreakMission[]
    variant?: 'cards' | 'compact'
  }>(),
  { variant: 'cards' },
)

const compact = computed(() => props.variant === 'compact')

const items = computed(() =>
  props.missions.map((m) => {
    const pct = Math.round(missionRatio(m) * 100)
    return {
      ...m,
      pct,
      progress: missionProgressLabel(m),
    }
  }),
)

const doneCount = computed(() => props.missions.filter((m) => m.done).length)
</script>

<template>
  <p v-if="items.length === 0" class="smis-empty">Sem missões por enquanto. Volte daqui a pouco.</p>
  <ul
    v-else
    class="smis"
    :class="`smis--${variant}`"
    :aria-label="`Missões de hoje: ${doneCount} de ${items.length} concluídas`"
  >
    <li v-for="m in items" :key="m.key" class="smis__item" :class="{ 'is-done': m.done }">
      <span class="smis__icon" :class="`smis__icon--${m.key}`" aria-hidden="true">
        <Timer v-if="m.key === 'focus'" :size="compact ? 16 : 20" :stroke-width="2.2" />
        <img
          v-else
          :src="nevoSrc(m.key === 'task' ? 'ui-alvo' : 'extra-coracao')"
          alt=""
          draggable="false"
          decoding="async"
        />
      </span>

      <div class="smis__text">
        <p class="smis__title">{{ m.label }}</p>
        <p v-if="m.done" class="smis__done">Concluído!</p>
        <p v-else class="smis__progress">{{ m.progress }}</p>
        <p v-if="!compact && !m.done && m.hint" class="smis__hint">{{ m.hint }}</p>
      </div>

      <span v-if="m.done" class="smis__check" aria-hidden="true">
        <Check :size="compact ? 14 : 16" :stroke-width="3" />
      </span>
      <!-- O texto ao lado já diz o progresso; o anel é reforço visual. -->
      <ProgressRing
        v-else
        class="smis__ring"
        :value="m.pct"
        :size="compact ? 30 : 44"
        :stroke="compact ? 3.5 : 4.5"
        aria-hidden="true"
      >
        <span v-if="!compact" class="smis__pct">{{ m.pct }}%</span>
      </ProgressRing>
    </li>
  </ul>
</template>

<style scoped>
.smis {
  margin: 0;
  padding: 0;
  list-style: none;
}

.smis-empty {
  margin: 0;
  padding: 12px 0;
  font-size: 0.8125rem;
  color: var(--text-3);
}

/* ─── Cartões: lado a lado no largo, empilhados no estreito ──────────────── */
.smis--cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 10px;
}

.smis__item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.smis--cards .smis__item {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  transition:
    border-color var(--motion) var(--motion-ease),
    background-color var(--motion) var(--motion-ease);
}

/* Concluída: tinta verde leve no cartão inteiro (sem faixa lateral). */
.smis--cards .smis__item.is-done {
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
  background: color-mix(in srgb, var(--success) 7%, var(--surface-2));
}

/* ─── Compacto: linhas densas para o popover ─────────────────────────────── */
.smis--compact {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.smis--compact .smis__item {
  min-height: 44px;
  padding: 6px 4px;
  gap: 10px;
}

/* ─── Ícone ──────────────────────────────────────────────────────────────── */
.smis__icon {
  flex: none;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--surface-3);
}

.smis--compact .smis__icon {
  width: 32px;
  height: 32px;
}

.smis__icon img {
  width: 76%;
  height: 76%;
  max-width: none;
  object-fit: contain;
}

/* Foco: o cronômetro num círculo de tinta azul (o sinal de "informação" do DS). */
.smis__icon--focus {
  background: color-mix(in srgb, var(--info) 16%, transparent);
  color: var(--info);
}

.smis__icon--task {
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

.smis__icon--collab {
  background: color-mix(in srgb, var(--status-block) 8%, var(--surface-3));
}

/* ─── Texto ──────────────────────────────────────────────────────────────── */
.smis__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.smis__title {
  margin: 0;
  font-size: var(--text-body-large);
  font-weight: 650;
  line-height: 1.3;
  color: var(--text);
}

.smis--compact .smis__title {
  font-size: 0.875rem;
}

.smis__progress,
.smis__hint,
.smis__done {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.35;
}

.smis__progress {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.smis__hint {
  color: var(--text-3);
}

.smis__done {
  color: var(--streak-done);
  font-weight: 700;
}

/* ─── Estado à direita ───────────────────────────────────────────────────── */
.smis__check {
  flex: none;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--success);
  color: var(--surface);
  animation: smis-pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.smis--compact .smis__check {
  width: 24px;
  height: 24px;
}

.smis__pct {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

@keyframes smis-pop {
  0% {
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .smis__check {
    animation: none;
  }
}
</style>
