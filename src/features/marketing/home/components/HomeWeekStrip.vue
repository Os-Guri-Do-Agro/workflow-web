<script setup lang="ts">
/**
 * "Esta semana" do Painel: segunda a domingo, as publicações de cada dia. No
 * computador é uma faixa de 7 colunas; no celular, uma lista de dias.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { CalendarCard } from '@/service/marketing/marketing-calendar-api'
import { CARD_STATUS_TONE, cardStatusLabel, toneStyle } from '../../marketing-labels'
import { WEEKDAYS_MON, dayHeading, spTime, spYmd, weekDays } from '../../calendar/calendar-time'

const props = defineProps<{
  weekStart: string
  today: string
  cards: CalendarCard[]
  brandToneOf: (companyId: string | null) => string
  calendarTo: Record<string, unknown>
}>()

const days = computed(() =>
  weekDays(props.weekStart).map((day, i) => ({
    day,
    label: WEEKDAYS_MON[i]!,
    num: Number(day.slice(8, 10)),
    cards: props.cards.filter((c) => c.publishAt && spYmd(c.publishAt) === day),
  })),
)
</script>

<template>
  <section class="mk-panel hws" data-section="semana">
    <header class="mk-panel__head">
      Esta semana
      <span class="hws__count">{{ cards.length }} {{ cards.length === 1 ? 'publicação' : 'publicações' }}</span>
      <RouterLink :to="calendarTo" class="hws__more">Abrir calendário</RouterLink>
    </header>
    <ol class="hws__days">
      <li
        v-for="d in days"
        :key="d.day"
        class="hws__day"
        :class="{ 'is-today': d.day === today, 'is-past': d.day < today }"
        :data-day="d.day"
      >
        <div class="hws__dh">
          <span class="hws__wd">{{ d.label }}</span>
          <span class="hws__num">{{ d.num }}</span>
          <span class="hws__phone-label">{{ dayHeading(d.day, today) }}</span>
        </div>
        <ul v-if="d.cards.length" class="hws__items">
          <li v-for="c in d.cards" :key="c.id">
            <RouterLink
              :to="{ name: 'marketing-card', params: { cardId: c.id } }"
              class="hws__item"
              :style="toneStyle(CARD_STATUS_TONE[c.status])"
              :title="`${c.title} (${cardStatusLabel(c.status, c.kind)})`"
              :data-card="c.id"
            >
              <span class="mk-dot" :style="toneStyle(brandToneOf(c.companyId))" aria-hidden="true" />
              <span class="hws__time">{{ spTime(c.publishAt!) }}</span>
              <span class="hws__title">{{ c.title }}</span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="hws__none">Nada</p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.hws {
  overflow: hidden;
}

.hws__count {
  color: var(--text-3);
  font-weight: 600;
}

.hws__more {
  margin-left: auto;
  color: var(--accent-ink);
  font-size: 12.5px;
  font-weight: 650;
  text-decoration: none;
}

.hws__more:hover {
  text-decoration: underline;
}

.hws__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.hws__day {
  min-width: 0;
  min-height: 96px;
  padding: 6px 6px 8px;
  border-right: 1px solid var(--border);
}

.hws__day:last-child {
  border-right: 0;
}

.hws__day.is-today {
  background: color-mix(in srgb, var(--accent-soft) 60%, transparent);
}

.hws__dh {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
}

.hws__num {
  color: var(--text);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.hws__day.is-past .hws__num {
  color: var(--text-3);
}

.hws__day.is-today .hws__num {
  color: var(--accent-ink);
}

.hws__phone-label {
  display: none;
}

.hws__items {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hws__items > li {
  min-width: 0;
}

.hws__item {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  min-height: 22px;
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--mk-tone) 13%, transparent);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.hws__item:hover {
  background: color-mix(in srgb, var(--mk-tone) 24%, transparent);
}

.hws__item .mk-dot {
  width: 7px;
  height: 7px;
}

.hws__time {
  flex: none;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.hws__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hws__none {
  margin: 0;
  color: var(--text-4);
  font-size: 12px;
}

@media (max-width: 900px) {
  .hws__days {
    grid-template-columns: minmax(0, 1fr);
  }

  .hws__day {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    min-height: 0;
    padding: 6px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .hws__day:last-child {
    border-bottom: 0;
  }

  .hws__wd,
  .hws__num {
    display: none;
  }

  .hws__phone-label {
    display: inline;
    padding-top: 4px;
    color: var(--text-2);
  }

  .hws__day.is-today .hws__phone-label {
    color: var(--accent-ink);
  }

  .hws__item {
    min-height: 36px;
  }

  .hws__none {
    padding-top: 4px;
  }
}
</style>
