<script setup lang="ts">
/** Histórico do card (`GET /log?entityType=card&entityId=`), mais novo primeiro. */
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { History } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { getMarketingLog } from '@/service/marketing/marketing-core'
import { cardKeys, formatAgo, formatFull } from '../approvals-meta'

const props = defineProps<{ groupId: string; cardId: string }>()

const query = useQuery({
  queryKey: computed(() => cardKeys.history(props.groupId, props.cardId)),
  queryFn: () => getMarketingLog(props.groupId, { entityType: 'card', entityId: props.cardId, take: 60 }),
  staleTime: 15_000,
})

const all = ref(false)
const rows = computed(() => (all.value ? query.data.value ?? [] : (query.data.value ?? []).slice(0, 8)))
</script>

<template>
  <section class="mk-panel mkh" aria-labelledby="mkh-title">
    <header class="mk-panel__head">
      <History :size="15" aria-hidden="true" />
      <h2 id="mkh-title" class="mkh__title">Histórico</h2>
    </header>
    <ol v-if="rows.length" class="mkh__list">
      <li v-for="r in rows" :key="r.id" class="mkh__item">
        <PersonAvatar :id="r.actor?.id" :name="r.actor?.name ?? 'Sistema'" :size="20" decorative />
        <p class="mkh__text">
          <strong>{{ r.actor?.name ?? 'Sistema' }}</strong> {{ r.summary }}
          <time :datetime="r.createdAt" :title="formatFull(r.createdAt)">{{ formatAgo(r.createdAt) }}</time>
        </p>
      </li>
    </ol>
    <p v-else-if="!query.isLoading.value" class="mkh__empty">Nada registrado ainda.</p>
    <button
      v-if="(query.data.value?.length ?? 0) > 8 && !all"
      type="button"
      class="mk-btn mk-btn--ghost mkh__more"
      @click="all = true"
    >
      Ver tudo ({{ query.data.value?.length }})
    </button>
  </section>
</template>

<style scoped>
.mkh__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mkh__list {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.mkh__item {
  display: flex;
  gap: 8px;
  padding: 5px 14px;
}

.mkh__text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.mkh__text strong {
  color: var(--text);
  font-weight: 600;
}

.mkh__text time {
  margin-left: 4px;
  color: var(--text-3);
  white-space: nowrap;
}

.mkh__empty {
  margin: 0;
  padding: 12px 14px;
  font-size: 12.5px;
  color: var(--text-3);
}

.mkh__more {
  margin: 0 8px 8px;
}
</style>
