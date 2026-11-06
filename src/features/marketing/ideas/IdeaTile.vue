<script setup lang="ts">
import { computed } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { Archive, ArchiveRestore, ExternalLink, Heart, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-vue-next'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { MarketingIdea } from '@/service/marketing/marketing-ideas'
import { brandTone, CARD_NETWORK_LABEL, toneStyle, type CardNetwork } from '../marketing-labels'
import { IDEA_KIND_ICON, IDEA_KIND_LABEL, IDEA_KIND_TONE, referenceDomain, relativeDay, safeHttpUrl } from './idea-labels'

/**
 * Uma ideia no mural. Célula densa (não cartão grande): título, tipo, rede,
 * marca, tags, link com o domínio, curtidas e as ações do dia a dia.
 */
const props = defineProps<{
  idea: MarketingIdea
  brand?: MarketingBrand
  /** EDITOR+ (cria card, arquiva) */
  canWrite: boolean
}>()

const emit = defineEmits<{
  open: []
  like: [liked: boolean]
  convert: []
  archive: [archived: boolean]
  remove: []
}>()

const link = computed(() => safeHttpUrl(props.idea.referenceUrl))
const domain = computed(() => referenceDomain(props.idea.referenceUrl))
const archived = computed(() => props.idea.status === 'ARCHIVED')
const converted = computed(() => props.idea.status === 'CONVERTED')
const KindIcon = computed(() => IDEA_KIND_ICON[props.idea.kind])
const hasMenu = computed(() => props.canWrite || props.idea.canDelete)
</script>

<template>
  <article class="it" :class="{ 'is-archived': archived }" :data-idea-id="idea.id">
    <header class="it__head">
      <span class="it__kind" :style="toneStyle(IDEA_KIND_TONE[idea.kind])" :title="IDEA_KIND_LABEL[idea.kind]">
        <component :is="KindIcon" :size="14" aria-hidden="true" />
      </span>
      <button type="button" class="it__title" @click="emit('open')">{{ idea.title }}</button>
      <button
        type="button"
        class="it__like"
        :class="{ 'is-on': idea.likedByMe }"
        :aria-pressed="idea.likedByMe"
        :aria-label="idea.likedByMe ? `Tirar a curtida (${idea.likesCount})` : `Curtir (${idea.likesCount})`"
        @click="emit('like', !idea.likedByMe)"
      >
        <Heart :size="15" :fill="idea.likedByMe ? 'currentColor' : 'none'" aria-hidden="true" />
        <span>{{ idea.likesCount }}</span>
      </button>

      <DropdownMenuRoot v-if="hasMenu">
        <DropdownMenuTrigger as-child>
          <button type="button" class="mk-icon-btn it__more" aria-label="Mais ações da ideia">
            <MoreHorizontal :size="16" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="dd-menu" :side-offset="4" align="end">
            <DropdownMenuItem v-if="idea.canEdit" class="dd-item" @select="emit('open')">
              <Pencil :size="15" />
              <span>Editar</span>
            </DropdownMenuItem>
            <DropdownMenuItem v-if="canWrite" class="dd-item" @select="emit('archive', !archived)">
              <component :is="archived ? ArchiveRestore : Archive" :size="15" />
              <span>{{ archived ? 'Tirar do arquivo' : 'Arquivar' }}</span>
            </DropdownMenuItem>
            <template v-if="idea.canDelete">
              <DropdownMenuSeparator class="dd-sep" />
              <DropdownMenuItem class="dd-item dd-item--danger" @select="emit('remove')">
                <Trash2 :size="15" />
                <span>Apagar</span>
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </header>

    <p v-if="idea.description" class="it__desc">{{ idea.description }}</p>

    <div class="it__chips">
      <span class="mk-chip" data-tone :style="toneStyle(IDEA_KIND_TONE[idea.kind])">{{ IDEA_KIND_LABEL[idea.kind] }}</span>
      <span v-if="idea.network" class="mk-chip">{{ CARD_NETWORK_LABEL[idea.network as CardNetwork] ?? idea.network }}</span>
      <span v-if="brand" class="mk-chip">
        <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
        {{ brand.name }}
      </span>
      <span v-if="converted" class="mk-chip" data-tone :style="toneStyle('green')">Virou post</span>
      <span v-if="archived" class="mk-chip">Arquivada</span>
    </div>

    <p v-if="idea.tags.length" class="it__tags">
      <span v-for="t in idea.tags" :key="t">#{{ t }}</span>
    </p>

    <footer class="it__foot">
      <a v-if="link" class="it__link" :href="link" target="_blank" rel="noopener noreferrer" :title="link">
        <ExternalLink :size="12" aria-hidden="true" />
        <span>{{ domain }}</span>
      </a>
      <span class="it__meta">
        {{ idea.createdBy?.name?.split(' ')[0] ?? 'Alguém' }}, {{ relativeDay(idea.createdAt) }}
      </span>
      <span class="it__spacer" />

      <RouterLink
        v-if="converted && idea.convertedCardId"
        class="mk-btn it__cta"
        :to="`/marketing/cards/${idea.convertedCardId}`"
      >
        Ver post
      </RouterLink>
      <button v-else-if="canWrite && !archived" type="button" class="mk-btn it__cta" @click="emit('convert')">
        <Send :size="13" aria-hidden="true" />
        Transformar em post
      </button>

    </footer>
  </article>
</template>

<style scoped>
.it {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.it:hover {
  border-color: var(--border-strong);
}

.it.is-archived {
  background: var(--surface-2);
}

.it.is-archived .it__title {
  color: var(--text-2);
}

.it__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.it__kind {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--mk-tone) 16%, transparent);
  color: var(--mk-tone);
}

.it__title {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.it__title:hover {
  text-decoration: underline;
}

.it__title:focus-visible,
.it__like:focus-visible,
.it__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.it__like {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-height: 26px;
  padding: 2px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.it__like:hover {
  background: var(--surface-2);
}

.it__like.is-on {
  border-color: color-mix(in srgb, var(--err) 40%, var(--border));
  color: var(--err);
}

.it__desc {
  margin: 0;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.it__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.it__chips .mk-chip {
  padding: 0 7px;
  font-size: 11.5px;
  line-height: 18px;
}

.it__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.it__foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.it__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 150px;
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.it__link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.it__link:hover {
  text-decoration: underline;
}

.it__meta {
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
}

.it__spacer {
  flex: 1;
}

.it__cta {
  min-height: 28px;
  padding: 3px 9px;
  font-size: 12.5px;
  text-decoration: none;
}

.it__more {
  width: 28px;
  height: 28px;
}

@media (max-width: 640px) {
  .it__like {
    min-height: 44px;
    min-width: 44px;
    justify-content: center;
  }

  .it__cta {
    min-height: 44px;
  }

  .it__more {
    width: 44px;
    height: 44px;
  }

  .it__title {
    min-height: 44px;
  }

  .it__link {
    min-height: 44px;
    max-width: 140px;
  }
}
</style>
