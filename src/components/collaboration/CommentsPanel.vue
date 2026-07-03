<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { isAxiosError } from 'axios'
import { Loader2, MessageSquare, Send, Trash2, X } from 'lucide-vue-next'
import { useComments } from '@/composables/useComments'
import type { CommentEntityType } from '@/service/collaboration/collaboration-service'
import type { CommentPayload, MentionedUser } from '@/service/realtime/realtime-service'
import { useToast } from '@/composables/useToast'
import userService from '@/service/user/user-service'
import { getUserToken } from '@/utils/authContent'

const props = defineProps<{
  entityType: CommentEntityType
  entityId: string
  title?: string
  compact?: boolean
}>()

const { error: showError } = useToast()
const draft = ref('')
const reactions = ['👍', '✅', '👀', '🔥']
const { comments, loading, sending, error, create, remove, toggleReaction } = useComments(
  () => props.entityType,
  () => props.entityId,
)

// Id do usuário logado (mesma fonte que reactions/autor) — destaca comentários
// em que ele foi mencionado.
const currentUserId = getUserToken()?.sub ?? null

const listRef = ref<HTMLElement | null>(null)

// Thread em ordem asc: comentário novo entra no fim → rola até ele.
watch(
  () => comments.value.length,
  async (next, prev) => {
    if (next <= (prev ?? 0)) return
    await nextTick()
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight })
  },
)

function isMentioned(comment: CommentPayload) {
  return Boolean(currentUserId && comment.mentions?.includes(currentUserId))
}

function mentionLabel(user: MentionedUser) {
  return user.name || user.email || 'Colaborador'
}

// ─── @menção por nome (autocomplete escopado na empresa) ─────────────────────
type MentionUser = { id: string; name: string; email: string }
const mentionQuery = ref('')
const mentionResults = ref<MentionUser[]>([])
const selectedMentions = ref<MentionUser[]>([])
const searchingMentions = ref(false)
const mentionSearchError = ref<string | null>(null)
const highlightIdx = ref(0)
let mentionTimer: number | null = null

function onMentionInput() {
  highlightIdx.value = 0
  mentionSearchError.value = null
  if (mentionTimer) window.clearTimeout(mentionTimer)
  const q = mentionQuery.value.trim()
  if (q.length < 2) {
    mentionResults.value = []
    searchingMentions.value = false
    return
  }
  searchingMentions.value = true
  mentionTimer = window.setTimeout(async () => {
    try {
      const res = await userService.searchUsers(q)
      const chosen = new Set(selectedMentions.value.map((m) => m.id))
      mentionResults.value = (Array.isArray(res) ? res : []).filter((u) => !chosen.has(u.id))
    } catch (err) {
      mentionResults.value = []
      // 403 = papel sem permissão de busca — mensagem específica ajuda mais que "ninguém encontrado".
      if (isAxiosError(err) && err.response?.status === 403) {
        mentionSearchError.value = 'Sem permissão para buscar usuários'
      }
    } finally {
      searchingMentions.value = false
    }
  }, 200)
}

function addMention(user: MentionUser) {
  if (!selectedMentions.value.some((m) => m.id === user.id)) {
    selectedMentions.value.push(user)
    // Injeta @Nome no texto para o comentário publicado mostrar quem foi marcado.
    const tag = `@${user.name || user.email}`
    if (!draft.value.includes(tag)) {
      draft.value = draft.value.trimEnd() ? `${draft.value.trimEnd()} ${tag} ` : `${tag} `
    }
  }
  mentionQuery.value = ''
  mentionResults.value = []
  highlightIdx.value = 0
}

function removeMention(id: string) {
  selectedMentions.value = selectedMentions.value.filter((m) => m.id !== id)
}

function onMentionKeydown(e: KeyboardEvent) {
  if (!mentionResults.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIdx.value = Math.min(highlightIdx.value + 1, mentionResults.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const u = mentionResults.value[highlightIdx.value]
    if (u) addMention(u)
  } else if (e.key === 'Escape') {
    mentionResults.value = []
  }
}

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
    await create(draft.value, selectedMentions.value.map((m) => m.id))
    draft.value = ''
    selectedMentions.value = []
    mentionQuery.value = ''
    mentionResults.value = []
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
        placeholder="Escreva um comentário…"
        :disabled="sending"
      />

      <!-- @menção por nome (autocomplete) -->
      <div class="mention-field">
        <div v-if="selectedMentions.length" class="mention-chips">
          <span v-for="m in selectedMentions" :key="m.id" class="mention-chip">
            @{{ m.name }}
            <button type="button" aria-label="Remover menção" @click="removeMention(m.id)">
              <X :size="11" />
            </button>
          </span>
        </div>
        <div class="mention-input-wrap">
          <input
            v-model="mentionQuery"
            class="mentions-input"
            type="text"
            placeholder="Mencionar alguém (digite o nome)…"
            :disabled="sending"
            @input="onMentionInput"
            @keydown="onMentionKeydown"
          />
          <ul v-if="mentionQuery.trim().length >= 2" class="mention-menu">
            <li v-if="searchingMentions" class="mention-empty">Buscando…</li>
            <li v-else-if="mentionSearchError" class="mention-empty">{{ mentionSearchError }}</li>
            <li v-else-if="!mentionResults.length" class="mention-empty">Ninguém encontrado</li>
            <li
              v-for="(u, i) in mentionResults"
              :key="u.id"
              class="mention-option"
              :class="{ active: i === highlightIdx }"
              @mouseenter="highlightIdx = i"
              @mousedown.prevent="addMention(u)"
            >
              <span class="mention-name">{{ u.name }}</span>
              <span class="mention-email">{{ u.email }}</span>
            </li>
          </ul>
        </div>
      </div>
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

    <div v-else ref="listRef" class="comments-list">
      <article
        v-for="comment in comments"
        :key="comment.id"
        class="comment-card"
        :class="{ 'comment-card--mentioned': isMentioned(comment) }"
      >
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
          <div v-if="comment.mentionedUsers?.length" class="mention-chips mention-chips--card">
            <span v-for="user in comment.mentionedUsers" :key="user.id" class="mention-chip">
              @{{ mentionLabel(user) }}
            </span>
          </div>
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

/* ─── @menção ─── */
.mention-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mention-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mention-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
}

.mention-chip button {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.mention-chip button:hover {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
}

.mention-input-wrap {
  position: relative;
}

.mention-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
}

.mention-empty {
  padding: 10px 12px;
  font-size: 12.5px;
  color: var(--text-3);
}

.mention-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.mention-option.active {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.mention-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.mention-email {
  font-size: 11.5px;
  color: var(--text-3);
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

/* Você foi mencionado neste comentário: destaque sutil na borda esquerda. */
.comment-card--mentioned .comment-body {
  border-left: 3px solid var(--accent);
}

.mention-chips--card {
  margin: 0 0 12px;
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
