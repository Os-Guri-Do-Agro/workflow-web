<script setup lang="ts">
import { MessageSquare, RefreshCw, Sparkles } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useCompanyFeed } from '@/composables/useCompanyFeed'
import type { FeedEventPayload } from '@/service/realtime/realtime-service'

defineProps<{
  digestSummary: string
  digestLoading: boolean
  formatFeedDate: (value: string) => string
}>()

const emit = defineEmits<{ (e: 'open-ai', tool: 'ask' | 'digest'): void }>()

// O fetch só acontece quando o componente monta — e ele só monta quando
// entra no viewport (lazy-load no DashboardView). Cumpre o progressive disclosure.
const { feed, loading: loadingFeed, error: feedError, refresh: refreshFeed } = useCompanyFeed(12)

const feedActorName = (event: FeedEventPayload) =>
  event.actor?.name || event.actor?.email || 'Sistema'
</script>

<template>
  <section class="feed-section">
    <header class="section-head">
      <h2 class="section-title">
        <MessageSquare :size="15" class="section-icon" />
        Timeline da empresa
      </h2>
      <div class="feed-actions">
        <button class="ghost-btn press" type="button" :disabled="loadingFeed" @click="refreshFeed">
          <RefreshCw :size="13" />
          Atualizar
        </button>
        <button
          class="ghost-btn press"
          type="button"
          :disabled="digestLoading"
          @click="emit('open-ai', 'digest')"
        >
          <Sparkles :size="13" />
          Resumo IA
        </button>
      </div>
    </header>

    <article v-if="digestSummary" class="digest-card">
      <span class="eyebrow">Digest IA</span>
      <p>{{ digestSummary }}</p>
    </article>

    <div v-if="loadingFeed" class="feed-list">
      <Skeleton v-for="i in 4" :key="i" type="row" />
    </div>

    <div v-else-if="feedError" class="agenda-empty">
      <MessageSquare :size="22" />
      <span>{{ feedError }}</span>
    </div>

    <div v-else-if="!feed.length" class="agenda-empty">
      <MessageSquare :size="22" />
      <span>Nenhum evento no feed ainda</span>
    </div>

    <div v-else class="feed-list">
      <article v-for="event in feed" :key="event.id" class="feed-item">
        <div class="feed-dot" />
        <div class="feed-body">
          <div class="feed-meta">
            <strong>{{ feedActorName(event) }}</strong>
            <span>{{ formatFeedDate(event.createdAt) }}</span>
          </div>
          <p>{{ event.summary }}</p>
          <small>{{ event.entityType }} · {{ event.verb }}</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.feed-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 16px;
}

.feed-section .section-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 2px;
}

.feed-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.digest-card {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
}

.digest-card p {
  margin: 6px 0 0;
  color: var(--text-2);
  font-size: 13px;
  white-space: pre-wrap;
}

.feed-list {
  display: grid;
  gap: 10px;
}

.feed-item {
  display: grid;
  grid-template-columns: 12px 1fr;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.feed-dot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent);
}

.feed-body {
  min-width: 0;
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 12px;
}

.feed-meta strong {
  color: var(--text);
  font-size: 12px;
}

.feed-body p {
  margin: 6px 0 4px;
  color: var(--text-2);
  font-size: 13px;
}

.feed-body small {
  color: var(--text-4);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
