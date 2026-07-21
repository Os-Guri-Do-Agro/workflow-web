<script setup lang="ts">
/**
 * Card de nota da listagem. Arrastável para dentro de uma pasta e com o toggle
 * de fixar direto aqui - antes o pin era só um ícone decorativo, sem ação.
 */
import { computed } from 'vue'
import { Pin } from 'lucide-vue-next'
import { stripHtmlPreview } from '@/utils/html-preview'
import type { NoteListItem, NoteViewMode } from '../types'

const props = defineProps<{
  note: NoteListItem
  mode: NoteViewMode
}>()

const emit = defineEmits<{
  open: [string]
  togglePin: [NoteListItem]
  tag: [string]
}>()

const preview = computed(
  () => props.note.preview || stripHtmlPreview(props.note.content ?? '') || 'Nota vazia',
)

const updatedLabel = computed(() =>
  new Date(props.note.updatedAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  }),
)

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/note-id', props.note.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
</script>

<template>
  <article
    class="card"
    :class="[`card--${mode}`, { 'card--accent': !!note.noteColor }]"
    :style="note.noteColor ? { '--card-accent': note.noteColor } : undefined"
    draggable="true"
    tabindex="0"
    role="button"
    :aria-label="`Abrir nota ${note.title}`"
    @click="emit('open', note.id)"
    @keydown.enter="emit('open', note.id)"
    @dragstart="onDragStart"
  >
    <img v-if="note.coverImage && mode === 'grid'" :src="note.coverImage" alt="" class="card__cover" />

    <div class="card__head">
      <span v-if="note.emoji" class="card__emoji" aria-hidden="true">{{ note.emoji }}</span>
      <h3 class="card__title">{{ note.title || 'Sem título' }}</h3>
      <button
        type="button"
        class="card__pin"
        :class="{ 'card__pin--on': note.isPinned }"
        :aria-pressed="note.isPinned"
        :aria-label="note.isPinned ? 'Desafixar nota' : 'Fixar nota'"
        @click.stop="emit('togglePin', note)"
      >
        <Pin :size="13" />
      </button>
    </div>

    <p class="card__preview">{{ preview }}</p>

    <footer class="card__foot">
      <span class="card__date">{{ updatedLabel }}</span>
      <span v-if="note.tags?.length" class="card__tags">
        <button
          v-for="tag in note.tags.slice(0, 3)"
          :key="tag"
          type="button"
          class="card__tag"
          @click.stop="emit('tag', tag)"
        >
          {{ tag }}
        </button>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.card:hover {
  border-color: var(--border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.card--accent {
  border-left: 3px solid var(--card-accent);
}

.card--list {
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: var(--radius);
}

.card--list .card__head {
  width: 240px;
  flex-shrink: 0;
}

.card--list .card__preview {
  flex: 1;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  margin: 0;
}

.card--list .card__foot {
  margin-top: 0;
}

.card__cover {
  width: calc(100% + 28px);
  height: 96px;
  margin: -14px -14px 2px;
  object-fit: cover;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.card__head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.card__emoji {
  font-size: 15px;
  line-height: 1;
}

.card__title {
  flex: 1;
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__pin {
  display: inline-flex;
  flex-shrink: 0;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-4);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.card:hover .card__pin,
.card:focus-within .card__pin,
.card__pin--on {
  opacity: 1;
}

.card__pin--on {
  color: var(--accent);
}

.card__pin:hover {
  background: var(--surface-2);
  color: var(--text);
}

.card__preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  margin: 0;
  overflow: hidden;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.55;
}

.card__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}

.card__date {
  color: var(--text-4);
  font-size: 11px;
  white-space: nowrap;
}

.card__tags {
  display: flex;
  gap: 4px;
  overflow: hidden;
}

.card__tag {
  padding: 2px 7px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-3);
  font-family: inherit;
  font-size: 10.5px;
  white-space: nowrap;
  cursor: pointer;
}

.card__tag:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition-duration: 1ms;
  }
  .card:hover {
    transform: none;
  }
}
</style>
