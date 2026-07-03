<script setup lang="ts">
import { computed } from 'vue'
import { Calendar, AlertCircle } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useUpcomingEvents } from '@/composables/useUpcomingEvents'
import type { UpcomingEvent } from '@/composables/useDashboardOrchestration'

const emit = defineEmits<{ (e: 'open-calendar'): void }>()

const {
  data: upcomingData,
  isLoading: loadingUpcoming,
  isError: errorUpcoming,
} = useUpcomingEvents(5)

const upcoming = computed<UpcomingEvent[]>(() => {
  const v = upcomingData.value as UpcomingEvent[] | { data: UpcomingEvent[] } | undefined
  if (Array.isArray(v)) return v
  if (v && 'data' in v && Array.isArray(v.data)) return v.data
  return []
})

// Eventos são instantes reais → usa só ev.startDate (backend padronizado). Protege contra Invalid Date.
const eventDate = (ev: UpcomingEvent): Date | null => {
  if (!ev.startDate) return null
  const d = new Date(ev.startDate)
  return Number.isNaN(d.getTime()) ? null : d
}

const dayLabel = (ev: UpcomingEvent) =>
  eventDate(ev)?.toLocaleDateString('pt-BR', { day: '2-digit' }) ?? '--'

const monthLabel = (ev: UpcomingEvent) =>
  eventDate(ev)
    ?.toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .toUpperCase() ?? ''

const timeLabel = (ev: UpcomingEvent) =>
  eventDate(ev)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
</script>

<template>
  <section class="agenda-section">
    <header class="section-head">
      <h2 class="section-title">
        <Calendar :size="15" class="section-icon" />
        Próximos eventos
      </h2>
      <span class="section-chip">{{ upcoming.length }}</span>
    </header>

    <div v-if="loadingUpcoming" class="agenda-skel">
      <Skeleton v-for="i in 3" :key="i" type="row" />
    </div>

    <div v-else-if="errorUpcoming" class="agenda-empty agenda-empty--error">
      <AlertCircle :size="22" />
      <span>Não foi possível carregar os eventos</span>
    </div>

    <div v-else-if="!upcoming.length" class="agenda-empty">
      <Calendar :size="22" />
      <span>Nenhum evento próximo</span>
    </div>

    <div v-else class="agenda-list">
      <article
        v-for="ev in upcoming"
        :key="ev.id"
        class="agenda-item press"
        @click="emit('open-calendar')"
      >
        <div class="agenda-when">
          <span class="agenda-day">{{ dayLabel(ev) }}</span>
          <span class="agenda-month">{{ monthLabel(ev) }}</span>
        </div>
        <div class="agenda-info">
          <span class="agenda-title">{{ ev.title || ev.summary || 'Evento' }}</span>
          <span class="agenda-meta">
            {{ timeLabel(ev) }}
          </span>
        </div>
        <div v-if="ev.type" class="agenda-type">{{ ev.type }}</div>
      </article>
    </div>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.agenda-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agenda-skel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agenda-empty--error {
  color: var(--err);
}

.agenda-empty--error svg {
  color: var(--err);
}

.agenda-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
}

.agenda-item {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.agenda-item:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.agenda-when {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 2px;
}

.agenda-day {
  font-size: 18px;
  font-weight: 800;
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.agenda-month {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-3);
  margin-top: 2px;
}

.agenda-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.agenda-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agenda-meta {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agenda-type {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media (max-width: 768px) {
  .agenda-list {
    grid-template-columns: 1fr;
  }
}
</style>
