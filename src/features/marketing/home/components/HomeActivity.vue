<script setup lang="ts">
/** "Atividade recente" do Painel: o histórico da ala, mais novo primeiro. */
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { Bell } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import type { HomeActivity } from '@/service/marketing/marketing-home'
import { formatDayMonth, spTime, spYmd } from '../../calendar/calendar-time'

const props = defineProps<{
  items: HomeActivity[]
  today: string
  now: string
}>()

function when(iso: string): string {
  const diffMin = Math.round((new Date(props.now).getTime() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`
  const day = spYmd(iso)
  if (day === props.today) return `hoje ${spTime(iso)}`
  return `${formatDayMonth(day)} ${spTime(iso)}`
}

function linkOf(entry: HomeActivity): RouteLocationRaw | null {
  if (entry.verb === 'deleted') return null
  const id = entry.entityId
  switch (entry.entityType) {
    case 'card':
      return { name: 'marketing-card', params: { cardId: id } }
    case 'link':
      return { name: 'marketing-links' }
    case 'utm':
      return { name: 'marketing-utm', query: { utm: id } }
    case 'campaign':
      return { name: 'marketing-campaigns', query: { campanha: id } }
    case 'activation':
      return { name: 'marketing-activations', query: { ativacao: id } }
    case 'partner':
      return { name: 'marketing-partners', query: { parceiro: id } }
    case 'idea':
      return { name: 'marketing-ideas' }
    // O histórico já chega filtrado pelo financeiro (logWhere): quem vê a linha vê a tela.
    case 'expense':
    case 'recurring_expense':
    case 'budget':
      return { name: 'marketing-finance' }
    // Acervo (R1): item abre o painel dele; pasta e envio em lote abrem o Acervo.
    case 'library':
      return { name: 'marketing-library', query: { item: id } }
    case 'library_folder':
    case 'library_upload':
      return { name: 'marketing-library' }
    default:
      return null
  }
}
</script>

<template>
  <section class="mk-panel hac" data-section="atividade">
    <header class="mk-panel__head">Atividade recente</header>
    <p v-if="!items.length" class="hac__empty">Nada por aqui ainda. O que o time fizer na ala aparece nesta lista.</p>
    <ol v-else class="hac__list">
      <li v-for="e in items" :key="e.id" class="hac__item" :data-verb="e.verb">
        <span v-if="e.actor?.system" class="hac__sys" aria-hidden="true"><Bell :size="12" /></span>
        <PersonAvatar v-else-if="e.actor" :id="e.actor.id" :name="e.actor.name" :size="22" variant="soft" decorative />
        <span v-else class="hac__sys" aria-hidden="true" />
        <p class="hac__text">
          <strong>{{ e.actor?.name ?? 'Alguém' }}</strong>
          {{ ' ' }}
          <RouterLink v-if="linkOf(e)" :to="linkOf(e)!" class="hac__link">{{ e.summary }}</RouterLink>
          <span v-else>{{ e.summary }}</span>
        </p>
        <time class="hac__when" :datetime="e.createdAt">{{ when(e.createdAt) }}</time>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.hac {
  overflow: hidden;
  min-width: 0;
}

.hac__empty {
  margin: 0;
  padding: 10px 12px;
  color: var(--text-3);
  font-size: 13px;
}

.hac__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hac__item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
  padding: 7px 12px;
}

.hac__item + .hac__item {
  border-top: 1px solid var(--border);
}

.hac__sys {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.hac__text {
  margin: 1px 0 0;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.hac__text strong {
  color: var(--text);
  font-weight: 650;
}

.hac__link {
  color: inherit;
  text-decoration: none;
}

.hac__link:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}

.hac__when {
  padding-top: 2px;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
