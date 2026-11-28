<script setup lang="ts">
/**
 * Agenda por dia: é a visão Lista, a semana no celular e o dia escolhido no
 * mês do celular. Item de vários dias aparece uma vez, no primeiro dia da
 * agenda em que ele está ("até 20/11").
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle, Plus } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { toneStyle } from '../../marketing-labels'
import { itemsTouching, type CalendarItemView, type PlacedItem } from '../calendar-layout'
import { dayHeading, formatDayMonth } from '../calendar-time'

const props = withDefaults(
  defineProps<{
    days: string[]
    placed: PlacedItem[]
    today: string
    /** Mostra os dias sem nada (semana no celular, dia escolhido) */
    showEmptyDays?: boolean
    /** Botão "Criar neste dia" em cada dia */
    canCreate?: boolean
    emptyText?: string
    brandToneOf: (companyId: string | null) => string
    brandNameOf: (companyId: string | null) => string
  }>(),
  { showEmptyDays: false, canCreate: false, emptyText: 'Nada com data neste período.' },
)

const emit = defineEmits<{
  open: [item: CalendarItemView]
  create: [day: string]
}>()

const router = useRouter()

const groups = computed(() => {
  const first = props.days[0]
  return props.days
    .map((day) => ({
      day,
      items: itemsTouching(props.placed, day).filter((p) => !p.multi || (first && p.day < first ? day === first : p.day === day)),
    }))
    .filter((g) => props.showEmptyDays || g.items.length)
})

function when(p: PlacedItem): string {
  if (p.multi) return `${formatDayMonth(p.day)} a ${formatDayMonth(p.endDay)}`
  return p.time ?? 'Dia todo'
}

function onOpen(event: MouseEvent, item: CalendarItemView) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return
  event.preventDefault()
  emit('open', item)
}
</script>

<template>
  <div class="mkc-ag">
    <p v-if="!groups.length" class="mkc-ag__empty">{{ emptyText }}</p>
    <section
      v-for="g in groups"
      :key="g.day"
      class="mkc-ag__day"
      :class="{ 'is-today': g.day === today, 'is-past': g.day < today, 'is-empty': !g.items.length }"
      :data-day="g.day"
    >
      <header class="mkc-ag__head">
        <h3>{{ dayHeading(g.day, today) }}</h3>
        <span v-if="g.items.length" class="mkc-ag__count">{{ g.items.length }}</span>
        <span v-else class="mkc-ag__none">Nada marcado</span>
        <button
          v-if="canCreate"
          type="button"
          class="mk-btn mk-btn--ghost mkc-ag__add"
          :aria-label="`Criar card em ${dayHeading(g.day, today)}`"
          @click="emit('create', g.day)"
        >
          <Plus :size="14" aria-hidden="true" />
          <span>Criar</span>
        </button>
      </header>
      <ul v-if="g.items.length" class="mkc-ag__list">
        <li v-for="p in g.items" :key="p.item.id">
          <a
            :href="router.resolve(p.item.to).href"
            class="mkc-row"
            :class="{ 'is-late': p.item.flag === 'late', 'is-band': p.multi }"
            :data-item="p.item.id"
            @click="onOpen($event, p.item)"
          >
            <span class="mkc-row__when">{{ when(p) }}</span>
            <span class="mkc-row__main">
              <span class="mkc-row__title">
                <AlertCircle v-if="p.item.flag === 'late'" :size="13" class="mkc-row__late" aria-label="Prazo vencido" />
                {{ p.item.title }}
              </span>
              <span class="mkc-row__meta">
                <span v-if="brandNameOf(p.item.companyId)" class="mkc-row__brand">
                  <span class="mk-dot" :style="toneStyle(brandToneOf(p.item.companyId))" aria-hidden="true" />
                  {{ brandNameOf(p.item.companyId) }}
                </span>
                <span v-if="p.item.kindLabel">{{ p.item.kindLabel }}</span>
                <span v-if="p.item.statusLabel" class="mk-chip mkc-row__status-inline" data-tone :style="toneStyle(p.item.tone)">
                  {{ p.item.statusLabel }}
                </span>
              </span>
            </span>
            <span v-if="p.item.statusLabel" class="mk-chip mkc-row__status" data-tone :style="toneStyle(p.item.tone)">
              {{ p.item.statusLabel }}
            </span>
            <PersonAvatar
              v-if="p.item.assigneeName"
              class="mkc-row__who"
              :name="p.item.assigneeName"
              :size="22"
              :title="`Responsável: ${p.item.assigneeName}`"
            />
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.mkc-ag {
  display: grid;
  gap: 10px;
}

.mkc-ag__empty {
  margin: 0;
  padding: 18px 14px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
}

.mkc-ag__day {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.mkc-ag__day.is-today {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.mkc-ag__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 6px 4px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.mkc-ag__head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mkc-ag__day.is-today .mkc-ag__head h3 {
  color: var(--accent-ink);
}

.mkc-ag__day.is-past .mkc-ag__head h3 {
  color: var(--text-2);
}

.mkc-ag__count {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.mkc-ag__add {
  margin-left: auto;
  min-height: 28px;
  padding: 2px 8px;
}

.mkc-ag__none {
  color: var(--text-3);
  font-size: 12.5px;
}

.mkc-ag__day.is-empty .mkc-ag__head {
  border-bottom: 0;
  background: transparent;
}

.mkc-ag__day.is-empty .mkc-ag__head h3 {
  font-weight: 650;
}

.mkc-ag__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mkc-ag__list li + li {
  border-top: 1px solid var(--border);
}

.mkc-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 12px;
  color: var(--text);
  text-decoration: none;
}

.mkc-row:hover {
  background: var(--surface-2);
}

.mkc-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mkc-row__when {
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.mkc-row__main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.mkc-row__title {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkc-row.is-late .mkc-row__title {
  color: var(--due-late);
}

.mkc-row__late {
  flex: none;
}

.mkc-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  color: var(--text-3);
  font-size: 12px;
}

.mkc-row__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mkc-row__who {
  flex: none;
}

.mkc-row__status-inline {
  display: none;
  padding: 0 7px;
  font-size: 11.5px;
  line-height: 17px;
}

@media (max-width: 640px) {
  .mkc-row {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 10px;
  }

  .mkc-row__status {
    display: none;
  }

  .mkc-row__status-inline {
    display: inline-flex;
  }

  .mkc-ag__add {
    min-height: 44px;
  }
}
</style>
