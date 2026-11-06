<script setup lang="ts">
/**
 * Card compacto do board da Aprovação: capa pequena, marca, tipo, título,
 * prazo (vermelho quando vencido, `.mk-late`), versão, contadores de
 * comentário e de ajustes abertos e o responsável.
 *
 * É um `article` com `data-id` (e não botão nem link): o segurar do celular
 * (`useCardLongPress`) ignora toque que começa em controle dentro do card.
 */
import { computed } from 'vue'
import { CalendarClock, Film, FileText, ListChecks, MessageSquare } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { CARD_KIND_LABEL, brandTone, toneStyle } from '../../marketing-labels'
import { displayUrl, formatDay, isImageMime, isVideoMime } from '../approvals-meta'

const props = defineProps<{
  card: MarketingCardSummary
  brand?: MarketingBrand
  draggable?: boolean
  pending?: boolean
}>()

const emit = defineEmits<{ open: [id: string] }>()

const coverUrl = computed(() => (props.card.cover && isImageMime(props.card.cover.mimeType) ? displayUrl(props.card.cover) : null))
const coverIcon = computed(() => (props.card.cover && isVideoMime(props.card.cover.mimeType) ? Film : FileText))
const label = computed(() => {
  const parts = [props.card.title, CARD_KIND_LABEL[props.card.kind]]
  if (props.card.overdue) parts.push('prazo vencido')
  return parts.join(', ')
})
</script>

<template>
  <article
    class="mkc"
    :class="{ 'mkc--pending': pending }"
    :data-id="card.id"
    tabindex="0"
    role="link"
    :aria-label="label"
    :draggable="draggable ? 'true' : undefined"
    @click="emit('open', card.id)"
    @keydown.enter.prevent="emit('open', card.id)"
  >
    <div v-if="card.cover" class="mkc__thumb" aria-hidden="true">
      <img v-if="coverUrl" :src="coverUrl" alt="" loading="lazy" decoding="async" draggable="false" />
      <component :is="coverIcon" v-else :size="18" />
    </div>
    <div class="mkc__body">
      <div class="mkc__meta">
        <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
        <span class="mkc__brand">{{ brand?.name ?? 'Marca' }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ CARD_KIND_LABEL[card.kind] ?? card.kind }}</span>
      </div>
      <p class="mkc__title">{{ card.title }}</p>
      <div class="mkc__foot">
        <span v-if="card.dueAt" class="mkc__due" :class="{ 'mk-late': card.overdue }" :title="card.overdue ? 'Prazo vencido' : 'Prazo'">
          <CalendarClock :size="13" aria-hidden="true" />
          {{ formatDay(card.dueAt) }}
        </span>
        <span v-if="card.currentVersion" class="mkc__ver" :title="`Versão atual: V${card.currentVersion.number}`">
          V{{ card.currentVersion.number }}
        </span>
        <span v-if="card.commentsCount" class="mkc__count" :title="`${card.commentsCount} comentário(s)`">
          <MessageSquare :size="13" aria-hidden="true" />
          {{ card.commentsCount }}
        </span>
        <span
          v-if="card.openAdjustments"
          class="mkc__count mkc__count--adj"
          :title="`${card.openAdjustments} ajuste(s) em aberto`"
        >
          <ListChecks :size="13" aria-hidden="true" />
          {{ card.openAdjustments }}
        </span>
        <span class="mkc__spacer" />
        <PersonAvatar
          v-if="card.assignee"
          :id="card.assignee.id"
          :name="card.assignee.name"
          :size="22"
          :title="`Responsável: ${card.assignee.name}`"
        />
      </div>
    </div>
  </article>
</template>

<style scoped>
.mkc {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
  color: var(--text);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--motion-fast) var(--motion-ease);
}

.mkc:hover {
  background: var(--surface-2);
}

.mkc:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mkc--pending {
  opacity: 0.6;
}

/* Segurado no celular (classe do useCardLongPress). */
.mkc.card--held {
  box-shadow: var(--shadow-overlay);
  background: var(--surface-2);
}

.mkc__thumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--text-3);
}

.mkc__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mkc__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mkc__meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.mkc__brand {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mkc__title {
  margin: 0;
  font-size: 14px;
  line-height: 19px;
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.mkc__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
  font-size: 12px;
  color: var(--text-2);
}

.mkc__due,
.mkc__count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mkc__count--adj {
  color: var(--due-soon);
  font-weight: 600;
}

.mkc__ver {
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 16px;
  color: var(--text-2);
}

.mkc__spacer {
  flex: 1;
}
</style>
