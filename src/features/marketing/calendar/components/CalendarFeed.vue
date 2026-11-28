<script setup lang="ts">
/**
 * Prévia do feed do Instagram (spec R2, C5): a grade de 3 colunas da marca,
 * mais novo primeiro, com os posts Agendados e Publicados do Instagram e a
 * miniatura da versão aprovada. É o que o perfil vai mostrar (o Instagram
 * corta a grade em 4:5).
 *
 * Arrastar um Agendado sobre outro TROCA os horários dos dois numa chamada só
 * (`POST calendar/feed/swap`, uma transação no servidor, que também reagenda
 * a publicação nas redes). Cada lado leva o horário que a grade mostrava: se
 * outra pessoa trocou antes (grade velha), a API responde 409 com a frase,
 * nada muda e a grade recarrega. A grade troca na hora e volta se a API
 * recusar. No celular (sem arrastar), "Trocar horário" marca um e o toque no
 * outro troca.
 */
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { ArrowLeftRight, Clapperboard, Copy, Images, Instagram } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import { getInstagramFeed, swapFeedTimes, type FeedCard, type FeedResponse } from '@/service/marketing/marketing-calendar-api'
import { apiErrorMessage, apiErrorStatus } from '../api-error'
import { formatDayMonth, spTime, spYmd } from '../calendar-time'
import { brandTone, toneStyle } from '../../marketing-labels'

const props = defineProps<{
  groupId: string
  brands: MarketingBrand[]
  /** Marca do filtro do layout (`?marca=`), ou null */
  brandFilter: string | null
}>()

const qc = useQueryClient()
const toast = useToast()

const chosen = ref<string | null>(null)
const brandId = computed(() => props.brandFilter ?? chosen.value ?? props.brands[0]?.companyId ?? null)
watch(
  () => props.brandFilter,
  (b) => {
    if (b) chosen.value = b
  },
)

const key = computed(() => ['marketing', props.groupId, 'calendar', 'feed', brandId.value ?? '-'] as const)
const feed = useQuery({
  queryKey: key,
  enabled: computed(() => !!brandId.value),
  queryFn: () => getInstagramFeed(props.groupId, brandId.value!),
  staleTime: 15_000,
})
const cards = computed(() => feed.data.value?.cards ?? [])

function when(c: FeedCard) {
  const iso = c.publishAt ?? c.publishedAt
  if (!iso) return 'sem data'
  return `${formatDayMonth(spYmd(iso))} ${spTime(iso)}`
}
const isVideo = (c: FeedCard) => !!c.cover?.mimeType.startsWith('video/')
const thumb = (c: FeedCard) => c.cover?.previewUrl ?? c.cover?.url ?? null

// ── Troca de horário ──────────────────────────────────────────────────────
const dragId = ref<string | null>(null)
const overId = ref<string | null>(null)
const pickId = ref<string | null>(null)
const busy = ref(false)

/** Ordena como a API ("mais novo primeiro" pelo horário mostrado). */
function sortFeed(list: FeedCard[]) {
  const t = (c: FeedCard) => new Date(c.publishAt ?? c.publishedAt ?? c.updatedAt).getTime()
  return [...list].sort((a, b) => t(b) - t(a))
}

function setLocal(patch: Map<string, string | null>) {
  qc.setQueryData<FeedResponse>(key.value, (old) =>
    old
      ? { ...old, cards: sortFeed(old.cards.map((c) => (patch.has(c.id) ? { ...c, publishAt: patch.get(c.id)! } : c))) }
      : old,
  )
}

async function swap(aId: string, bId: string) {
  if (aId === bId || busy.value) return
  const a = cards.value.find((c) => c.id === aId)
  const b = cards.value.find((c) => c.id === bId)
  if (!a || !b || !a.canSwap || !b.canSwap || !a.publishAt || !b.publishAt) return
  const aAt = a.publishAt
  const bAt = b.publishAt
  busy.value = true
  // A grade troca na hora.
  setLocal(new Map([[a.id, bAt], [b.id, aAt]]))
  try {
    // Uma chamada, uma transação: cada lado com o horário que a grade mostrava.
    await swapFeedTimes(props.groupId, { id: a.id, publishAt: aAt }, { id: b.id, publishAt: bAt })
    toast.success(`Horários trocados: "${a.title}" e "${b.title}".`)
  } catch (err) {
    // Recusou: nada mudou no servidor; a grade volta ao que estava.
    setLocal(new Map([[a.id, aAt], [b.id, bAt]]))
    if (apiErrorStatus(err) === 409) {
      // A grade estava velha (outra pessoa trocou antes): recarrega na hora.
      toast.error(apiErrorMessage(err, 'Os horários mudaram enquanto a grade estava aberta. Nada foi trocado.'))
      await qc.refetchQueries({ queryKey: key.value })
    } else {
      toast.error(apiErrorMessage(err, 'Não deu para trocar os horários. Nada mudou.'))
    }
  } finally {
    busy.value = false
    pickId.value = null
    await qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
  }
}

function onDragStart(e: DragEvent, c: FeedCard) {
  if (!c.canSwap || busy.value) {
    e.preventDefault()
    return
  }
  dragId.value = c.id
  e.dataTransfer?.setData('text/plain', c.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e: DragEvent, c: FeedCard) {
  if (!dragId.value || !c.canSwap || c.id === dragId.value) return
  e.preventDefault()
  overId.value = c.id
}
function onDrop(e: DragEvent, c: FeedCard) {
  e.preventDefault()
  const from = dragId.value ?? e.dataTransfer?.getData('text/plain') ?? null
  dragId.value = null
  overId.value = null
  if (from) void swap(from, c.id)
}
function onDragEnd() {
  dragId.value = null
  overId.value = null
}
function onPick(c: FeedCard) {
  if (!c.canSwap) return
  if (!pickId.value) pickId.value = c.id
  else if (pickId.value === c.id) pickId.value = null
  else void swap(pickId.value, c.id)
}

const brandName = computed(() => props.brands.find((b) => b.companyId === brandId.value)?.name ?? '')
const swappable = computed(() => cards.value.filter((c) => c.canSwap).length)

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link do post copiado.')
  } catch {
    toast.error('Não deu para copiar.')
  }
}
</script>

<template>
  <div class="cf" data-testid="calendar-feed">
    <div class="cf__head">
      <span class="cf__title"><Instagram :size="15" aria-hidden="true" /> Feed do Instagram</span>
      <div v-if="!brandFilter && brands.length > 1" class="cf__brands" role="group" aria-label="Marca do feed">
        <button
          v-for="b in brands"
          :key="b.companyId"
          type="button"
          class="cf__brand"
          :class="{ 'is-on': brandId === b.companyId }"
          :aria-pressed="brandId === b.companyId"
          @click="chosen = b.companyId"
        >
          <span class="mk-dot" :style="toneStyle(brandTone(b))" aria-hidden="true" />
          {{ b.name }}
        </button>
      </div>
      <span v-else class="cf__brand-name">{{ brandName }}</span>
      <span class="mk-toolbar__spacer" />
      <!-- Celular não arrasta: lá a dica é a do botão de trocar. -->
      <span v-if="swappable > 1" class="mk-hint cf__hint cf__hint--drag">
        Arraste um agendado sobre outro para trocar os horários.
      </span>
      <span v-if="swappable > 1" class="mk-hint cf__hint cf__hint--tap">
        Toque em trocar horário num agendado e depois no outro.
      </span>
    </div>

    <div v-if="feed.isLoading.value" class="cf__grid" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" type="block" />
    </div>
    <div v-else-if="feed.isError.value" class="mk-load-error" role="alert">
      {{ apiErrorMessage(feed.error.value, 'Não deu para abrir o feed.') }}
      <button type="button" class="mk-btn mk-btn--ghost" @click="feed.refetch()">Tentar de novo</button>
    </div>
    <EmptyState
      v-else-if="!cards.length"
      :icon="Instagram"
      title="Nada agendado ou publicado no Instagram"
      description="Quando um card com Instagram for agendado ou publicado, ele aparece aqui na ordem do perfil."
    />
    <ul v-else class="cf__grid" data-testid="feed-grid">
      <li
        v-for="c in cards"
        :key="c.id"
        class="cf__tile"
        :class="{
          'is-scheduled': c.status === 'SCHEDULED',
          'is-dragging': dragId === c.id,
          'is-over': overId === c.id,
          'is-picked': pickId === c.id,
          'can-swap': c.canSwap,
        }"
        :data-card="c.id"
        :data-status="c.status"
        :draggable="c.canSwap && !busy"
        @dragstart="onDragStart($event, c)"
        @dragover="onDragOver($event, c)"
        @dragleave="overId === c.id && (overId = null)"
        @drop="onDrop($event, c)"
        @dragend="onDragEnd"
      >
        <RouterLink :to="{ name: 'marketing-card', params: { cardId: c.id } }" class="cf__media" :title="c.title" draggable="false">
          <video
            v-if="thumb(c) && isVideo(c)"
            :src="thumb(c)!"
            muted
            playsinline
            preload="metadata"
            class="cf__img"
            aria-hidden="true"
          />
          <img v-else-if="thumb(c)" :src="thumb(c)!" :alt="c.title" class="cf__img" loading="lazy" draggable="false" />
          <span v-else class="cf__empty">{{ c.title }}</span>
          <span v-if="c.fileCount > 1" class="cf__badge" :title="`Carrossel com ${c.fileCount} arquivos`">
            <Images :size="14" aria-hidden="true" />
          </span>
          <span v-else-if="isVideo(c)" class="cf__badge" title="Vídeo">
            <Clapperboard :size="14" aria-hidden="true" />
          </span>
        </RouterLink>
        <div class="cf__foot">
          <span class="cf__when" :data-when="c.publishAt ?? ''">{{ when(c) }}</span>
          <span class="cf__status">{{ c.status === 'SCHEDULED' ? 'Agendado' : 'Publicado' }}</span>
          <button
            v-if="c.canSwap"
            type="button"
            class="mk-icon-btn cf__swap"
            :aria-pressed="pickId === c.id"
            :aria-label="pickId && pickId !== c.id ? `Trocar o horário com &quot;${c.title}&quot;` : `Trocar o horário de &quot;${c.title}&quot;`"
            :title="pickId && pickId !== c.id ? 'Trocar com este' : 'Trocar horário'"
            :disabled="busy"
            data-action="swap"
            @click="onPick(c)"
          >
            <ArrowLeftRight :size="14" aria-hidden="true" />
          </button>
          <button
            v-else-if="c.publishedUrl"
            type="button"
            class="mk-icon-btn cf__swap"
            aria-label="Copiar o link do post"
            title="Copiar o link do post"
            @click="copyLink(c.publishedUrl)"
          >
            <Copy :size="14" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
    <p v-if="feed.data.value && cards.length >= feed.data.value.limit" class="mk-hint">
      Mostrando os {{ feed.data.value.limit }} posts mais recentes.
    </p>
  </div>
</template>

<style scoped>
.cf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
}
.cf__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.cf__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 13.5px;
}
.cf__brands {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.cf__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.cf__brand.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.cf__brand-name {
  color: var(--text-3);
  font-size: 12.5px;
  font-weight: 600;
}
.cf__hint {
  font-size: 12px;
}
.cf__hint--tap {
  display: none;
}
/* Tela de toque ou estreita: sem arrastar, a dica é a do botão. */
@media (hover: none), (pointer: coarse), (max-width: 640px) {
  .cf__hint--drag {
    display: none;
  }
  .cf__hint--tap {
    display: inline;
  }
}
.cf__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cf__tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
}
.cf__tile.can-swap {
  cursor: grab;
}
.cf__tile.is-dragging {
  opacity: 0.45;
}
.cf__tile.is-over,
.cf__tile.is-picked {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.cf__media {
  position: relative;
  display: block;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  background: var(--surface-2);
  color: var(--text-3);
  text-decoration: none;
}
.cf__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.cf__tile.is-scheduled .cf__img {
  filter: saturate(0.85);
}
.cf__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 8px;
  font-size: 12px;
  text-align: center;
}
.cf__badge {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-flex;
  padding: 3px;
  border-radius: 4px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
}
.cf__foot {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 2px 4px 2px 6px;
  font-size: 11.5px;
}
.cf__when {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}
.cf__status {
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cf__swap {
  margin-left: auto;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .cf {
    max-width: none;
  }
  .cf__status {
    display: none;
  }
  .cf__swap {
    width: 36px;
    height: 36px;
  }
  .cf__brand {
    min-height: 36px;
  }
}
</style>
