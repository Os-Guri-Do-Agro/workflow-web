<script setup lang="ts">
/**
 * Lista de agenda agrupada por dia (painel do mês, dia escolhido e celular).
 * Cada linha diz de onde vem: item da agenda abre o editor, tarefa abre o
 * painel do board, marco abre o marco.
 */
import { computed } from 'vue'
import { CalendarCheck, Flag } from 'lucide-vue-next'
import { statusSpec } from '@/features/tasks/task-meta'
import { dayHeading, formatRange } from '../roadmap-meta'
import { groupByDate, testBands, type RoadmapItem } from '../roadmap-items'

const props = withDefaults(
  defineProps<{
    items: RoadmapItem[]
    today: string
    /** Sem o título do dia (a lista já é de um dia só). */
    hideHeadings?: boolean
    emptyText?: string
  }>(),
  { hideHeadings: false, emptyText: 'Nada marcado.' },
)

const emit = defineEmits<{ open: [item: RoadmapItem] }>()

const groups = computed(() => groupByDate(props.items))

function metaOf(item: RoadmapItem): string {
  if (item.kind === 'entry') {
    return item.entry.description ? `${item.cat.label} · ${item.entry.description}` : item.cat.label
  }
  if (item.kind === 'milestone') {
    const kind = item.milestone.type === 'REVIEW' ? 'Review' : 'Marco'
    const band = item.milestone.testStart ? testBands([item.milestone])[0] : null
    return band ? `${kind} · teste de ${formatRange(band.start, band.end)}` : kind
  }
  const d = item.delivery
  const parts = ['Tarefa', statusSpec(d.status).label]
  if (d.overdue) parts.push('atrasada')
  if (d.responsibles.length) parts.push(d.responsibles.map((r) => r.name.split(' ')[0]).join(', '))
  return parts.join(' · ')
}

function ariaOf(item: RoadmapItem): string {
  const verb = item.kind === 'delivery' ? 'Abrir a tarefa' : item.kind === 'milestone' ? 'Abrir o marco' : 'Abrir o item'
  return `${verb} ${item.title}, ${metaOf(item)}`
}
</script>

<template>
  <div class="ral">
    <p v-if="!items.length" class="ral-empty">{{ emptyText }}</p>
    <section v-for="group in groups" :key="group.date" class="ral-day">
      <h4 v-if="!hideHeadings" class="ral-head" :class="{ 'ral-head--today': group.date === today }">
        {{ dayHeading(group.date, today) }}
      </h4>
      <button
        v-for="item in group.items"
        :key="item.key"
        type="button"
        class="ral-row"
        :class="{
          'ral-row--late': item.kind === 'delivery' && item.delivery.overdue,
          'ral-row--done': item.kind === 'delivery' && item.delivery.status === 'DONE',
        }"
        :aria-label="ariaOf(item)"
        @click="emit('open', item)"
      >
        <span class="ral-mark" aria-hidden="true">
          <component
            :is="item.cat.icon"
            v-if="item.kind === 'entry'"
            :size="14"
            :style="{ color: item.cat.tone }"
          />
          <component :is="statusSpec(item.delivery.status).icon" v-else-if="item.kind === 'delivery'" :size="14" />
          <CalendarCheck v-else-if="item.milestone.type === 'REVIEW'" :size="14" class="ral-review" />
          <Flag v-else :size="14" class="ral-flag" />
        </span>
        <span class="ral-text">
          <strong>{{ item.title }}</strong>
          <small>{{ metaOf(item) }}</small>
        </span>
      </button>
    </section>
  </div>
</template>

<style scoped>
.ral {
  display: grid;
  gap: 10px;
}
.ral-empty {
  margin: 0;
  padding: 6px 2px;
  color: var(--text-3);
  font-size: 13px;
}
.ral-day {
  display: grid;
  gap: 2px;
}
.ral-head {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-3);
}
.ral-head--today {
  color: var(--accent-ink);
}
.ral-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  margin: 0 -8px;
  width: calc(100% + 16px);
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ral-row:hover {
  background: var(--surface-2);
}
.ral-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.ral-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 16px;
  height: 18px;
}
.ral-flag {
  color: var(--accent);
}
.ral-review {
  color: var(--info);
}
.ral-text {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.ral-text strong {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.ral-text small {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ral-row--late small {
  color: var(--due-late);
}
.ral-row--done strong {
  color: var(--text-3);
  text-decoration: line-through;
  text-decoration-color: var(--text-4);
}
</style>
