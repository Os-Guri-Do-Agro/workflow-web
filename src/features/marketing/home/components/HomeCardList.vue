<script setup lang="ts">
/**
 * Lista densa de cards do Painel (Para aprovar, Ajustes pedidos, Atrasados,
 * Prazo nos próximos dias). Cada linha leva à página do card. Vazio é uma
 * frase curta, sem ilustração.
 */
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { AlertCircle } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import type { CalendarCard } from '@/service/marketing/marketing-calendar-api'
import { CARD_KIND_LABEL, CARD_STATUS_TONE, cardStatusLabel, toneStyle } from '../../marketing-labels'
import { formatDayMonth, formatDayTime, spYmd } from '../../calendar/calendar-time'
import { cardIsLate } from '../../calendar/card-source'

const props = withDefaults(
  defineProps<{
    title: string
    cards: CalendarCard[]
    emptyText: string
    /** Qual data a linha mostra */
    dateMode?: 'due' | 'publish'
    /**
     * "Ver na lista" (lista de Aprovações com o filtro). Mais de um quando a
     * seção mistura as trilhas: a lista é sempre de uma (Digital ou Gráfica).
     */
    more?: Array<{ label: string; to: RouteLocationRaw }>
    tone?: 'late' | 'warn' | null
    brandNameOf: (companyId: string | null) => string
    brandToneOf: (companyId: string | null) => string
    section: string
  }>(),
  { dateMode: 'due', more: () => [], tone: null },
)

function dateLabel(card: CalendarCard): string {
  if (props.dateMode === 'publish') return card.publishAt ? `sai ${formatDayTime(card.publishAt)}` : 'sem data'
  if (card.dueAt) return `prazo ${formatDayMonth(spYmd(card.dueAt))}`
  return card.publishAt ? `sai ${formatDayMonth(spYmd(card.publishAt))}` : 'sem prazo'
}
</script>

<template>
  <section class="mk-panel hcl" :data-section="section">
    <header class="mk-panel__head hcl__head">
      <span class="hcl__title" :class="tone ? `is-${tone}` : ''">{{ title }}</span>
      <span class="hcl__count" :data-count="cards.length">{{ cards.length }}</span>
      <span v-if="more.length && cards.length" class="hcl__mores">
        <RouterLink v-for="m in more" :key="m.label" :to="m.to" class="hcl__more">{{ m.label }}</RouterLink>
      </span>
    </header>
    <p v-if="!cards.length" class="hcl__empty">{{ emptyText }}</p>
    <ul v-else class="hcl__list">
      <li v-for="card in cards" :key="card.id">
        <RouterLink
          :to="{ name: 'marketing-card', params: { cardId: card.id } }"
          class="hcl__row"
          :class="{ 'is-late': cardIsLate(card) }"
          :data-card="card.id"
        >
          <span class="mk-dot" :style="toneStyle(brandToneOf(card.companyId))" :title="brandNameOf(card.companyId) || undefined" aria-hidden="true" />
          <span class="hcl__main">
            <span class="hcl__name">{{ card.title }}</span>
            <span class="hcl__meta">
              <span v-if="brandNameOf(card.companyId)">{{ brandNameOf(card.companyId) }}</span>
              <span>{{ CARD_KIND_LABEL[card.kind] ?? card.kind }}</span>
              <span class="hcl__date" :class="{ 'mk-late': cardIsLate(card) }">
                <AlertCircle v-if="cardIsLate(card)" :size="12" aria-hidden="true" />
                {{ dateLabel(card) }}
              </span>
            </span>
          </span>
          <span class="mk-chip hcl__status" data-tone :style="toneStyle(CARD_STATUS_TONE[card.status])">
            {{ cardStatusLabel(card.status, card.kind) }}
          </span>
          <PersonAvatar
            v-if="card.assignee"
            :id="card.assignee.id"
            :name="card.assignee.name"
            :size="22"
            :title="`Responsável: ${card.assignee.name}`"
          />
          <span v-else class="hcl__noone" title="Sem responsável" aria-label="Sem responsável" />
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.hcl {
  overflow: hidden;
  min-width: 0;
}

.hcl__head {
  min-height: 40px;
  padding: 8px 12px;
}

.hcl__title.is-late {
  color: var(--due-late);
}

.hcl__count {
  color: var(--text-3);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.hcl__mores {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px 12px;
  margin-left: auto;
}

.hcl__more {
  color: var(--accent-ink);
  font-size: 12.5px;
  font-weight: 650;
  text-decoration: none;
}

.hcl__more:hover {
  text-decoration: underline;
}

.hcl__empty {
  margin: 0;
  padding: 10px 12px;
  color: var(--text-3);
  font-size: 13px;
}

.hcl__list {
  max-height: 340px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.hcl__list li + li {
  border-top: 1px solid var(--border);
}

.hcl__row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto 22px;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 12px;
  color: var(--text);
  text-decoration: none;
}

.hcl__row:hover {
  background: var(--surface-2);
}

.hcl__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.hcl__main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.hcl__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hcl__row.is-late .hcl__name {
  color: var(--due-late);
}

.hcl__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1px 10px;
  color: var(--text-3);
  font-size: 12px;
}

.hcl__date {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-variant-numeric: tabular-nums;
}

.hcl__noone {
  width: 22px;
  height: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
}

@media (max-width: 640px) {
  .hcl__row {
    grid-template-columns: 8px minmax(0, 1fr) 22px;
  }

  .hcl__status {
    grid-column: 2;
    grid-row: 2;
    justify-self: start;
  }
}
</style>
