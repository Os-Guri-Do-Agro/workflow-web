<script setup lang="ts">
/**
 * Card "Sequências do time" do rail da Equipe (spec sequencia-diaria-nevo, T9).
 *
 * Três leituras, da mais imediata para a mais longa:
 * 1. hoje: quantas pessoas já garantiram o dia (anel, como todo progresso do
 *    produto: overhaul-visual-premium pede anel, não barra);
 * 2. o time: dias seguidos em que todo mundo ativo garantiu ou descansou (D13);
 * 3. a semana: top 3 por pontos, com a chama de cada um.
 *
 * Puramente derivado: recebe o resumo pronto do `useTeamTime` (já sem repetir
 * quem está em mais de uma empresa do grupo).
 */
import { computed } from 'vue'
import CountUp from '@/components/ui/CountUp.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import NevoFlame from '@/components/nevo/NevoFlame.vue'
import { daysLabel, litTone, tierForDays } from '@/components/nevo/nevo-assets'
import RailCard from '@/features/time/components/RailCard.vue'
import RankMedal from '@/features/time/components/RankMedal.vue'
import type { TeamStreakSummary } from '@/features/time/composables/useTeamTime'
import type { StreakTierKey } from '@/service/streak/streak-service'
import { avatarTone, initials } from '@/utils/avatar'

const props = defineProps<{ summary: TeamStreakSummary }>()

const securedPct = computed(() =>
  props.summary.total > 0 ? (props.summary.securedToday / props.summary.total) * 100 : 0,
)

const pending = computed(() =>
  Math.max(0, props.summary.total - props.summary.securedToday - props.summary.restToday),
)

const todayAria = computed(
  () =>
    `${props.summary.securedToday} de ${props.summary.total} ${props.summary.total === 1 ? 'pessoa garantiu' : 'pessoas garantiram'} o dia hoje`,
)

/**
 * A linha de baixo diz o que ainda falta, sem cobrar ninguém: quem está de
 * descanso aparece separado de quem ainda pode garantir.
 */
const todayNote = computed(() => {
  const { total, securedToday, restToday } = props.summary
  if (total === 0) return 'Ninguém com sequência por aqui ainda.'
  if (securedToday === total) return 'Todo mundo garantiu hoje. Que time!'
  const parts: string[] = []
  if (pending.value > 0) {
    parts.push(pending.value === 1 ? '1 ainda pode garantir' : `${pending.value} ainda podem garantir`)
  }
  if (restToday > 0) parts.push(`${restToday} de descanso`)
  return parts.join(' · ')
})

const teamLit = computed(() => props.summary.teamStreak > 0)

const teamNote = computed(() => {
  const base = teamLit.value
    ? 'Dias seguidos em que todo mundo ativo garantiu o dia ou estava de descanso.'
    : 'A chama do time acende quando todo mundo ativo garante o mesmo dia.'
  return props.summary.byCompany.length ? `${base} No grupo, vale a empresa com a menor sequência.` : base
})

/**
 * O nível sai dos dias seguidos pela mesma régua da API (D8, `tierForDays`):
 * o resumo do top não carrega o nível, e a chama acesa de cada um segue o dele.
 */
const leaders = computed(() =>
  props.summary.top.map((p, i) => {
    const tier: StreakTierKey = tierForDays(p.current)?.key ?? 'none'
    return { ...p, place: (i + 1) as 1 | 2 | 3, tier, tone: litTone(tier) }
  }),
)

function pointsWord(n: number): string {
  return n === 1 ? 'ponto' : 'pontos'
}

function leaderAria(p: (typeof leaders.value)[number]): string {
  // Descanso não é pendência (D4): mesma frase da linha da Equipe (`streakAria`).
  const hoje = p.securedToday
    ? 'hoje já garantiu'
    : p.todayIsRest
      ? 'hoje é dia de descanso'
      : 'hoje ainda não garantiu'
  const quem = p.isMe ? `${p.userName} (você)` : p.userName
  return `${p.place}º lugar: ${quem}, ${p.pointsWeek} ${pointsWord(p.pointsWeek)} na semana, sequência de ${daysLabel(p.current)}, ${hoje}`
}
</script>

<template>
  <RailCard title="Sequências do time">
    <!-- Hoje -->
    <div class="tsc-today">
      <ProgressRing :value="securedPct" :size="64" :stroke="6" :aria-label="todayAria">
        <span class="tsc-ring-num">
          <CountUp :value="summary.securedToday" />
        </span>
      </ProgressRing>
      <div class="tsc-today-text">
        <span class="tsc-today-main">
          <strong>{{ summary.securedToday }} de {{ summary.total }}</strong>
          {{ summary.securedToday === 1 ? 'garantiu hoje' : 'garantiram hoje' }}
        </span>
        <span class="tsc-today-sub">{{ todayNote }}</span>
      </div>
    </div>

    <!-- Sequência do time -->
    <div class="tsc-team" :class="{ 'tsc-team--lit': teamLit }">
      <NevoFlame :lit="teamLit" :live="teamLit" :size="36" />
      <div class="tsc-team-text">
        <!-- "Time em chamas" só com a chama acesa; apagada, o nome neutro (mesma
             copy do painel da home). -->
        <span class="tsc-team-lbl">{{ teamLit ? 'Time em chamas' : 'Sequência do time' }}</span>
        <span class="tsc-team-val">
          <CountUp :value="summary.teamStreak" />
          {{ summary.teamStreak === 1 ? 'dia' : 'dias' }}
        </span>
      </div>
    </div>
    <p class="tsc-note">{{ teamNote }}</p>
    <ul v-if="summary.byCompany.length" class="tsc-companies" aria-label="Sequência do time por empresa">
      <li v-for="c in summary.byCompany" :key="c.name" class="tsc-company">
        <span class="tsc-company-name" :title="c.name">{{ c.name }}</span>
        <span class="tsc-company-val">{{ daysLabel(c.teamStreak) }}</span>
      </li>
    </ul>

    <!-- Top da semana -->
    <h4 class="tsc-sub">Top da semana</h4>
    <ol v-if="leaders.length" class="tsc-top">
      <li
        v-for="p in leaders"
        :key="p.userId"
        class="tsc-top-row"
        :class="{ 'tsc-top-row--me': p.isMe }"
        :style="{ '--pc': avatarTone(p.userName) }"
      >
        <!-- Leitor de tela ouve a frase inteira; o desenho da linha fica mudo. -->
        <span class="tsc-sr">{{ leaderAria(p) }}</span>
        <span class="tsc-medal" aria-hidden="true">
          <RankMedal :place="p.place" :size="22" />
        </span>
        <span class="tsc-avatar" aria-hidden="true">{{ initials(p.userName) }}</span>
        <!-- Duas linhas: numa só o rail de 340px cortava o nome em "Ni..."
             (pior ainda com o aumento de fonte). -->
        <span class="tsc-who" aria-hidden="true">
          <span class="tsc-name-text" :title="p.userName">{{ p.userName }}</span>
          <span
            class="tsc-streak"
            :class="{ 'tsc-streak--lit': p.securedToday }"
            :style="{ '--streak-lit': p.tone }"
          >
            <NevoFlame :lit="p.securedToday" :live="p.securedToday" :tier="p.tier" :size="15" />
            {{ daysLabel(p.current) }}
            <span v-if="p.isMe" class="tsc-you">Você</span>
          </span>
        </span>
        <span class="tsc-points" aria-hidden="true">
          <span class="tsc-points-val"><CountUp :value="p.pointsWeek" /></span>
          <span class="tsc-points-unit">{{ pointsWord(p.pointsWeek) }}</span>
        </span>
      </li>
    </ol>
    <p v-else class="tsc-empty">
      Ninguém somou pontos nesta semana ainda. Uma tarefa concluída já vale 10.
    </p>
  </RailCard>
</template>

<style scoped>
/* ── Hoje ── */
.tsc-today {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.tsc-ring-num {
  font-size: 1.125rem;
  font-weight: 750;
  color: var(--text);
  letter-spacing: -0.02em;
}

.tsc-today-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tsc-today-main {
  font-size: 0.875rem;
  color: var(--text-2);
}

.tsc-today-main strong {
  color: var(--text);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.tsc-today-sub {
  font-size: 0.75rem;
  color: var(--text-3);
}

/* ── Sequência do time ──
   A cor entra só no número (sinal chapado); a chama já é o desenho. */
.tsc-team {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.tsc-team--lit {
  background: var(--streak-flame-soft);
}

.tsc-team-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tsc-team-lbl {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--text-3);
}

.tsc-team-val {
  font-size: 1.375rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.tsc-team--lit .tsc-team-val {
  color: var(--streak-flame);
}

.tsc-note {
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-3);
}

.tsc-companies {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tsc-company {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.8125rem;
}

.tsc-company-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.tsc-company-val {
  flex: none;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* ── Top da semana ── */
.tsc-sub {
  margin: 18px 0 8px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}

.tsc-top {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tsc-top-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 4px 8px;
  margin: 0 -8px;
  border-radius: var(--radius);
  animation: tsc-in 360ms cubic-bezier(0.34, 1.42, 0.5, 1) backwards;
}

.tsc-top-row:nth-child(2) {
  animation-delay: 60ms;
}

.tsc-top-row:nth-child(3) {
  animation-delay: 120ms;
}

.tsc-top-row--me {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.tsc-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.tsc-medal {
  flex: none;
  display: inline-flex;
}

.tsc-avatar {
  width: 30px;
  height: 30px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pc) 16%, var(--surface));
  color: color-mix(in srgb, var(--pc) 64%, var(--text));
  border: 1px solid color-mix(in srgb, var(--pc) 32%, transparent);
  font-size: 0.75rem;
  font-weight: 750;
}

.tsc-who {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tsc-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 650;
  color: var(--text);
}

.tsc-streak {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tsc-streak--lit {
  color: var(--streak-lit, var(--streak-flame));
}

.tsc-you {
  margin-left: 4px;
  padding: 0 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 750;
}

/* Pontos à direita, número em cima e unidade embaixo (coluna estreita). */
.tsc-points {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.15;
}

.tsc-points-val {
  font-size: 0.9375rem;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.tsc-points-unit {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-3);
}

.tsc-empty {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-3);
}

/* 100% é o repouso: com movimento reduzido a chave global roda 1 iteração e
   para aqui, e o bloco abaixo desliga de vez. */
@keyframes tsc-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tsc-top-row {
    animation: none;
  }
}
</style>
