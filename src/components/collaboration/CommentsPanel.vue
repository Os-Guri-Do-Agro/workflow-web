<script setup lang="ts">
import { computed, ref } from 'vue'
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-vue-next'
import { useComments } from '@/composables/useComments'
import type { CommentEntityType } from '@/service/collaboration/collaboration-service'
import type { CommentPayload } from '@/service/realtime/realtime-service'
import { useToast } from '@/composables/useToast'

const props = defineProps<{
  entityType: CommentEntityType
  entityId: string
  title?: string
  compact?: boolean
}>()

const { error: showError } = useToast()
const draft = ref('')
const mentionsDraft = ref('')
const reactions = ['👍', '✅', '👀', '🔥']
const { comments, loading, sending, error, create, remove, toggleReaction } = useComments(
  () => props.entityType,
  () => props.entityId,
)

const mentionIds = computed(() =>
  mentionsDraft.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
)

function authorName(comment: CommentPayload) {
  return comment.author?.name || comment.author?.email || 'Colaborador'
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C'
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function submit() {
  try {
    await create(draft.value, mentionIds.value)
    draft.value = ''
    mentionsDraft.value = ''
  } catch {
    showError('Não foi possível comentar')
  }
}

async function deleteComment(id: string) {
  try {
    await remove(id)
  } catch {
    showError('Não foi possível remover o comentário')
  }
}

async function react(comment: CommentPayload, emoji: string) {
  try {
    await toggleReaction(comment, emoji)
  } catch {
    showError('Não foi possível atualizar a reação')
  }
}
</script>

<template>
  <section class="comments-panel" :class="{ 'comments-panel--compact': compact }">
    <header class="comments-head">
      <div>
        <span class="comments-eyebrow">
          <MessageSquare :size="13" />
          Colaboração
        </span>
        <h2>{{ title || 'Comentários' }}</h2>
      </div>
      <span class="comments-count">{{ comments.length }}</span>
    </header>

    <form class="comment-form" @submit.prevent="submit">
      <textarea
        v-model="draft"
        class="comment-input"
        rows="3"
        placeholder="Escreva um comentário. Use o campo abaixo para @menções por ID."
        :disabled="sending"
      />
      <input
        v-model="mentionsDraft"
        class="mentions-input"
        type="text"
        placeholder="IDs mencionados separados por vírgula (opcional)"
        :disabled="sending"
      />
      <button class="comment-send press" type="submit" :disabled="!draft.trim() || sending">
        <Loader2 v-if="sending" :size="14" class="spin" />
        <Send v-else :size="14" />
        Comentar
      </button>
    </form>

    <div v-if="loading" class="comments-state">
      <Loader2 :size="18" class="spin" />
      <span>Carregando comentários...</span>
    </div>

    <div v-else-if="error" class="comments-state comments-state--error">
      {{ error }}
    </div>

    <div v-else-if="!comments.length" class="comments-state">
      <MessageSquare :size="20" />
      <span>Nenhum comentário ainda.</span>
    </div>

    <div v-else class="comments-list">
      <article v-for="comment in comments" :key="comment.id" class="comment-card">
        <div class="comment-avatar">{{ initials(authorName(comment)) }}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <strong>{{ authorName(comment) }}</strong>
            <span>{{ formatDate(comment.createdAt) }}</span>
            <button class="comment-delete" type="button" aria-label="Remover comentário" @click="deleteComment(comment.id)">
              <Trash2 :size="12" />
            </button>
          </div>
          <p>{{ comment.body }}</p>
          <div class="reaction-row">
            <button
              v-for="emoji in reactions"
              :key="`${comment.id}-${emoji}`"
              type="button"
              class="reaction-btn"
              @click="react(comment, emoji)"
            >
              <span>{{ emoji }}</span>
              <small>{{ comment.reactions.filter((reaction) => reaction.emoji === emoji).length }}</small>
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.comments-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  padding: 16px;
}

.comments-panel--compact {
  padding: 12px;
}

.comments-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.comments-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-4);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.comments-head h2 {
  margin: 4px 0 0;
  font-size: 16px;
}

.comments-count {
  min-width: 28px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-3);
  text-align: center;
  font-size: 12px;
}

.comment-form {
  display: grid;
  gap: 12px;
  margin-bottom: 22px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.comment-input,
.mentions-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  outline: none;
}

.comment-input {
  resize: vertical;
  min-height: 78px;
  padding: 10px 12px;
}

.mentions-input {
  height: 34px;
  padding: 0 10px;
  font-size: 12px;
}

.comment-input:focus,
.mentions-input:focus {
  border-color: var(--border-strong);
}

.comment-send {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  min-height: 38px;
  padding: 9px 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.comment-send:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.comments-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 80px;
  color: var(--text-3);
  text-align: center;
  font-size: 13px;
}

.comments-state--error {
  color: var(--err);
}

.comments-list {
  display: grid;
  gap: 16px;
  max-height: min(54vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.comments-list::-webkit-scrollbar {
  width: 8px;
}

.comments-list::-webkit-scrollbar-track {
  background: transparent;
}

.comments-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--border-strong);
}

.comment-card {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
}

.comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
}

.comment-body {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  padding: 12px;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-3);
  font-size: 11px;
}

.comment-meta strong {
  color: var(--text);
  font-size: 12px;
}

.comment-body p {
  margin: 10px 0 12px;
  color: var(--text-2);
  font-size: 13px;
  white-space: pre-wrap;
}

.comment-delete {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.comment-delete:hover {
  color: var(--err);
}

.reaction-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  min-height: 28px;
  padding: 5px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.reaction-btn small {
  color: var(--text-3);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
