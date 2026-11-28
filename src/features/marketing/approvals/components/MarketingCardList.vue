<script setup lang="ts">
/**
 * Lista da Aprovação: tabela densa (`.mk-table`) com as mesmas linhas do
 * board, ordenável por prazo e por publicação (a ordem fica na URL, quem guarda
 * é a view). Prazo vencido em vermelho (`.mk-late`). No celular as colunas de
 * apoio saem e a tabela cabe nos 375px.
 */
import { computed } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown, ListChecks, MessageSquare } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { CARD_KIND_LABEL, CARD_STATUS_TONE, brandTone, cardStatusLabel, toneStyle } from '../../marketing-labels'
import { displayUrl, formatDay, formatDayTime, isImageMime } from '../approvals-meta'

export type ListSort = 'prazo' | 'publicacao'

const props = defineProps<{
  cards: MarketingCardSummary[]
  brands: MarketingBrand[]
  sort: ListSort | null
  dir: 'asc' | 'desc'
}>()

const emit = defineEmits<{ open: [id: string]; sort: [key: ListSort] }>()

const brandOf = (id: string) => props.brands.find((b) => b.companyId === id)

const rows = computed(() => {
  const list = [...props.cards]
  if (!props.sort) return list
  const field = props.sort === 'prazo' ? 'dueAt' : 'publishAt'
  const sign = props.dir === 'desc' ? -1 : 1
  // Sem data vai para o fim nos dois sentidos: o que importa é o que tem data.
  return list.sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    return sign * av.localeCompare(bv)
  })
})

function sortIcon(key: ListSort) {
  if (props.sort !== key) return ArrowUpDown
  return props.dir === 'asc' ? ArrowUp : ArrowDown
}

function ariaSort(key: ListSort) {
  if (props.sort !== key) return 'none'
  return props.dir === 'asc' ? 'ascending' : 'descending'
}
</script>

<template>
  <div class="mkl">
    <table class="mk-table">
      <thead>
        <tr>
          <th scope="col">Título</th>
          <th scope="col" class="mkl__opt">Marca</th>
          <th scope="col" class="mkl__opt">Tipo</th>
          <th scope="col">Status</th>
          <th scope="col" class="mkl__opt">Responsável</th>
          <th scope="col" :aria-sort="ariaSort('prazo')">
            <button type="button" class="mkl__sort" data-sort="prazo" @click="emit('sort', 'prazo')">
              Prazo <component :is="sortIcon('prazo')" :size="13" aria-hidden="true" />
            </button>
          </th>
          <th scope="col" class="mkl__opt" :aria-sort="ariaSort('publicacao')">
            <button type="button" class="mkl__sort" data-sort="publicacao" @click="emit('sort', 'publicacao')">
              Publicação <component :is="sortIcon('publicacao')" :size="13" aria-hidden="true" />
            </button>
          </th>
          <th scope="col" class="mkl__opt mk-num">Versão</th>
          <th scope="col" class="mkl__opt"><span class="sr-only">Comentários e ajustes</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="c in rows"
          :key="c.id"
          class="mkl__row"
          :data-id="c.id"
          tabindex="0"
          @click="emit('open', c.id)"
          @keydown.enter.prevent="emit('open', c.id)"
        >
          <td>
            <div class="mkl__title-cell">
            <span class="mkl__thumb" :class="{ 'is-empty': !(c.cover && isImageMime(c.cover.mimeType)) }" aria-hidden="true">
              <img
                v-if="c.cover && isImageMime(c.cover.mimeType) && displayUrl(c.cover)"
                :src="displayUrl(c.cover)!"
                alt=""
                loading="lazy"
              />
            </span>
            <span class="mkl__title">{{ c.title }}</span>
            </div>
          </td>
          <td class="mkl__opt">
            <span class="mkl__brand">
              <span class="mk-dot" :style="toneStyle(brandTone(brandOf(c.companyId)))" aria-hidden="true" />
              {{ brandOf(c.companyId)?.name ?? '' }}
            </span>
          </td>
          <td class="mkl__opt">{{ CARD_KIND_LABEL[c.kind] ?? c.kind }}</td>
          <td>
            <span class="mk-chip" data-tone :style="toneStyle(CARD_STATUS_TONE[c.status])">
              {{ cardStatusLabel(c.status, c.kind) }}
            </span>
          </td>
          <td class="mkl__opt">
            <span v-if="c.assignee" class="mkl__who">
              <PersonAvatar :id="c.assignee.id" :name="c.assignee.name" :size="20" decorative />
              {{ c.assignee.name }}
            </span>
            <span v-else class="mkl__none">Sem responsável</span>
          </td>
          <td class="mkl__date" :class="{ 'mk-late': c.overdue }" :data-due="c.dueAt ?? ''">
            {{ c.dueAt ? formatDay(c.dueAt) : '' }}
            <span v-if="c.overdue" class="sr-only">(vencido)</span>
          </td>
          <td class="mkl__opt mkl__date">{{ c.publishAt ? formatDayTime(c.publishAt) : '' }}</td>
          <td class="mkl__opt mk-num">{{ c.currentVersion ? `V${c.currentVersion.number}` : '' }}</td>
          <td class="mkl__opt">
            <span class="mkl__counts">
              <span v-if="c.commentsCount" :title="`${c.commentsCount} comentário(s)`">
                <MessageSquare :size="13" aria-hidden="true" /> {{ c.commentsCount }}
              </span>
              <span v-if="c.openAdjustments" class="mkl__adj" :title="`${c.openAdjustments} ajuste(s) em aberto`">
                <ListChecks :size="13" aria-hidden="true" /> {{ c.openAdjustments }}
              </span>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.mkl {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.mkl__row {
  cursor: pointer;
}

.mkl__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mkl__title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mkl__thumb {
  flex: none;
  width: 28px;
  height: 28px;
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
}

.mkl__thumb.is-empty {
  background: transparent;
}

.mkl__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mkl__title {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}

.mkl__brand,
.mkl__who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.mkl__none {
  color: var(--text-3);
}

.mkl__date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mkl__counts {
  display: inline-flex;
  gap: 10px;
  color: var(--text-2);
  white-space: nowrap;
}

.mkl__counts > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.mkl__adj {
  color: var(--due-soon);
  font-weight: 600;
}

.mkl__sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.mkl__sort:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .mkl__opt,
  .mkl__thumb {
    display: none;
  }

  .mkl__row td {
    height: 48px;
  }

  .mkl__sort {
    min-height: 44px;
  }
}
</style>
