<script setup lang="ts">
/**
 * Comentários do card: lista (todos, desta versão, abertos) e o campo de
 * comentar com menção e com o ponto marcado na arte ou o minuto do vídeo.
 * Clicar num comentário com ponto emite `focus`: a página troca para a versão
 * e o arquivo dele, acende o pino ou pula o vídeo.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { AtSign, Check, Clock, MapPin, MessageSquare, Pencil, RotateCcw, Trash2, X } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import type { MarketingMember } from '@/service/marketing/marketing-core'
import type { CreateCommentInput, MarketingCardComment } from '@/service/marketing/marketing-cards'
import { formatAgo, formatFull, formatSeconds } from '../approvals-meta'
import type { DraftAnchor } from './MarketingVersionViewer.vue'

const props = defineProps<{
  comments: MarketingCardComment[]
  /** Versão à vista (filtro "Desta versão" e versão do comentário solto). */
  versionId: string | null
  versionNumber: number | null
  canComment: boolean
  isAdmin: boolean
  meId: string | null
  /** Quem pode ser mencionado (vê a marca), menos eu. */
  mentionable: MarketingMember[]
  draft: DraftAnchor | null
  highlightId: string | null
  busy?: boolean
}>()

const emit = defineEmits<{
  create: [input: CreateCommentInput]
  edit: [id: string, body: string]
  remove: [id: string]
  resolve: [id: string, resolved: boolean]
  focus: [comment: MarketingCardComment]
  'cancel-draft': []
}>()

type Filter = 'all' | 'version' | 'open'
const filter = ref<Filter>('all')

const pinNumber = computed(() => {
  const out = new Map<string, number>()
  const perAsset = new Map<string, number>()
  for (const c of props.comments) {
    if (!c.assetId || (c.anchorX === null && c.anchorTime === null)) continue
    const n = (perAsset.get(c.assetId) ?? 0) + 1
    perAsset.set(c.assetId, n)
    out.set(c.id, n)
  }
  return out
})

const shown = computed(() =>
  props.comments.filter((c) => {
    if (filter.value === 'version') return c.versionId === props.versionId
    if (filter.value === 'open') return c.kind === 'COMMENT' && !c.resolvedAt
    return true
  }),
)

const openCount = computed(() => props.comments.filter((c) => c.kind === 'COMMENT' && !c.resolvedAt).length)

// ── Novo comentário ─────────────────────────────────────────────────────
const body = ref('')
const mentionIds = ref<string[]>([])
const textarea = ref<HTMLTextAreaElement | null>(null)
const mentionPick = ref('')

watch(
  () => props.draft,
  (d) => {
    if (d) void nextTick(() => textarea.value?.focus({ preventScroll: true }))
  },
)

function addMention(userId: string) {
  mentionPick.value = ''
  const m = props.mentionable.find((x) => x.userId === userId)
  if (!m || mentionIds.value.includes(userId)) return
  mentionIds.value = [...mentionIds.value, userId]
  const sep = body.value && !body.value.endsWith(' ') ? ' ' : ''
  body.value = `${body.value}${sep}@${m.name.split(' ')[0]} `
  void nextTick(() => textarea.value?.focus())
}

function removeMention(userId: string) {
  mentionIds.value = mentionIds.value.filter((id) => id !== userId)
}

const nameOf = (id: string) => props.mentionable.find((m) => m.userId === id)?.name ?? 'Pessoa'

const draftLabel = computed(() => {
  const d = props.draft
  if (!d) return ''
  if (d.anchorTime !== undefined) return `No minuto ${formatSeconds(d.anchorTime)}`
  return 'No ponto marcado na arte'
})

function submit() {
  const text = body.value.trim()
  if (!text || props.busy) return
  const d = props.draft
  emit('create', {
    body: text,
    mentions: mentionIds.value,
    versionId: d?.versionId ?? props.versionId,
    assetId: d?.assetId ?? null,
    anchorX: d?.anchorX ?? null,
    anchorY: d?.anchorY ?? null,
    anchorTime: d?.anchorTime ?? null,
  })
}

/** Quem chamou confirma que gravou: limpa o campo. */
function reset() {
  body.value = ''
  mentionIds.value = []
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    submit()
  }
}

// ── Editar ──────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null)
const editBody = ref('')

function startEdit(c: MarketingCardComment) {
  editingId.value = c.id
  editBody.value = c.body
}

function saveEdit() {
  if (!editingId.value || !editBody.value.trim()) return
  emit('edit', editingId.value, editBody.value.trim())
  editingId.value = null
}

function scrollTo(id: string) {
  void nextTick(() => {
    document.querySelector(`[data-comment="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

defineExpose({ reset, scrollTo })

function kindLabel(c: MarketingCardComment) {
  if (c.kind === 'APPROVED') return 'Aprovou'
  if (c.kind === 'CHANGES_REQUESTED') return 'Pediu ajuste'
  return null
}
</script>

<template>
  <section class="mk-panel mkcm" aria-labelledby="mkcm-title">
    <header class="mk-panel__head">
      <MessageSquare :size="15" aria-hidden="true" />
      <h2 id="mkcm-title" class="mkcm__title">Comentários</h2>
      <span class="mkcm__count">{{ comments.length }}</span>
      <span class="mk-toolbar__spacer" />
      <div class="mkcm__filters" role="group" aria-label="Filtrar comentários">
        <button type="button" :class="{ 'is-on': filter === 'all' }" :aria-pressed="filter === 'all'" @click="filter = 'all'">Todos</button>
        <button
          type="button"
          :class="{ 'is-on': filter === 'version' }"
          :aria-pressed="filter === 'version'"
          :disabled="!versionId"
          @click="filter = 'version'"
        >
          {{ versionNumber ? `V${versionNumber}` : 'Versão' }}
        </button>
        <button type="button" :class="{ 'is-on': filter === 'open' }" :aria-pressed="filter === 'open'" @click="filter = 'open'">
          Abertos {{ openCount }}
        </button>
      </div>
    </header>

    <ol v-if="shown.length" class="mkcm__list">
      <li
        v-for="c in shown"
        :key="c.id"
        class="mkcm__item"
        :class="{
          'is-on': highlightId === c.id,
          'is-resolved': !!c.resolvedAt,
          [`mkcm__item--${c.kind.toLowerCase()}`]: c.kind !== 'COMMENT',
        }"
        :data-comment="c.id"
      >
        <PersonAvatar :id="c.author?.id" :name="c.author?.name ?? 'Ex-membro'" :size="24" />
        <div class="mkcm__main">
          <div class="mkcm__line">
            <span class="mkcm__who">{{ c.author?.name ?? 'Ex-membro' }}</span>
            <span v-if="kindLabel(c)" class="mkcm__kind">{{ kindLabel(c) }}</span>
            <time class="mkcm__when" :datetime="c.createdAt" :title="formatFull(c.createdAt)">{{ formatAgo(c.createdAt) }}</time>
            <span v-if="c.versionNumber" class="mkcm__ver">V{{ c.versionNumber }}</span>
          </div>
          <button
            v-if="c.assetId && (c.anchorX !== null || c.anchorTime !== null)"
            type="button"
            class="mkcm__anchor"
            :data-anchor="c.id"
            @click="emit('focus', c)"
          >
            <template v-if="c.anchorTime !== null">
              <Clock :size="12" aria-hidden="true" /> {{ formatSeconds(c.anchorTime) }}
            </template>
            <template v-else>
              <MapPin :size="12" aria-hidden="true" /> Ponto {{ pinNumber.get(c.id) }}
            </template>
          </button>

          <template v-if="editingId === c.id">
            <textarea v-model="editBody" class="mk-textarea mkcm__edit" rows="3" aria-label="Editar comentário" />
            <div class="mkcm__edit-actions">
              <button type="button" class="mk-btn mk-btn--ghost" @click="editingId = null">Cancelar</button>
              <button type="button" class="mk-btn mk-btn--primary" @click="saveEdit">Salvar</button>
            </div>
          </template>
          <p v-else class="mkcm__body" @click="c.assetId ? emit('focus', c) : undefined">{{ c.body }}</p>

          <p v-if="c.resolvedAt" class="mkcm__resolved">
            Resolvido{{ c.resolvedBy ? ` por ${c.resolvedBy.name}` : '' }}
          </p>

          <div v-if="canComment && editingId !== c.id" class="mkcm__actions">
            <button
              v-if="c.kind === 'COMMENT'"
              type="button"
              class="mkcm__act"
              :data-resolve="c.id"
              @click="emit('resolve', c.id, !c.resolvedAt)"
            >
              <component :is="c.resolvedAt ? RotateCcw : Check" :size="13" aria-hidden="true" />
              {{ c.resolvedAt ? 'Reabrir' : 'Resolver' }}
            </button>
            <button v-if="c.kind === 'COMMENT' && c.author?.id === meId" type="button" class="mkcm__act" @click="startEdit(c)">
              <Pencil :size="13" aria-hidden="true" /> Editar
            </button>
            <button
              v-if="c.author?.id === meId || isAdmin"
              type="button"
              class="mkcm__act mkcm__act--danger"
              @click="emit('remove', c.id)"
            >
              <Trash2 :size="13" aria-hidden="true" /> Apagar
            </button>
          </div>
        </div>
      </li>
    </ol>
    <p v-else class="mkcm__empty">
      {{ filter === 'open' ? 'Nenhum comentário em aberto.' : 'Nenhum comentário ainda.' }}
      <template v-if="canComment && filter === 'all'"> Clique na arte para comentar num ponto.</template>
    </p>

    <form v-if="canComment" class="mkcm__composer" @submit.prevent="submit">
      <div v-if="draft" class="mkcm__draft" data-testid="comment-draft">
        <MapPin :size="13" aria-hidden="true" />
        <span>{{ draftLabel }}</span>
        <button type="button" class="mk-icon-btn" aria-label="Tirar o ponto" @click="emit('cancel-draft')">
          <X :size="14" />
        </button>
      </div>
      <div v-if="mentionIds.length" class="mkcm__mentions">
        <span v-for="id in mentionIds" :key="id" class="mk-chip">
          @{{ nameOf(id) }}
          <button type="button" class="mkcm__chip-x" :aria-label="`Tirar a menção de ${nameOf(id)}`" @click="removeMention(id)">
            <X :size="11" />
          </button>
        </span>
      </div>
      <textarea
        ref="textarea"
        v-model="body"
        class="mk-textarea"
        rows="3"
        name="comment"
        :placeholder="draft ? 'O que mudar neste ponto?' : 'Escreva um comentário'"
        aria-label="Novo comentário"
        @keydown="onKey"
      />
      <div class="mkcm__bar">
        <label class="mkcm__mention">
          <AtSign :size="14" aria-hidden="true" />
          <select
            v-model="mentionPick"
            class="mkcm__mention-sel"
            aria-label="Mencionar alguém"
            @change="addMention(mentionPick)"
          >
            <option value="">Mencionar</option>
            <option v-for="m in mentionable" :key="m.userId" :value="m.userId" :disabled="mentionIds.includes(m.userId)">
              {{ m.name }}
            </option>
          </select>
        </label>
        <span class="mk-toolbar__spacer" />
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="!body.trim() || busy" data-action="send-comment">Comentar</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.mkcm {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mkcm__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mkcm__count {
  color: var(--text-3);
  font-weight: 500;
}

.mkcm__filters {
  display: inline-flex;
  gap: 2px;
}

.mkcm__filters button {
  min-height: 26px;
  padding: 2px 8px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mkcm__filters button.is-on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkcm__filters button:disabled {
  opacity: 0.5;
  cursor: default;
}

.mkcm__list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 560px;
  overflow-y: auto;
}

.mkcm__item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  transition: background-color var(--motion) var(--motion-ease);
}

.mkcm__item + .mkcm__item {
  border-top: 1px solid var(--border);
}

.mkcm__item.is-on {
  background: color-mix(in srgb, var(--accent-soft) 70%, transparent);
}

.mkcm__item.is-resolved .mkcm__body {
  color: var(--text-3);
}

.mkcm__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mkcm__line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}

.mkcm__who {
  font-weight: 700;
  color: var(--text);
  font-size: 13px;
}

.mkcm__kind {
  font-weight: 700;
  color: var(--text-2);
}

.mkcm__item--approved .mkcm__kind {
  color: var(--success);
}

.mkcm__item--changes_requested .mkcm__kind {
  color: var(--due-late);
}

.mkcm__when {
  color: var(--text-3);
}

.mkcm__ver {
  padding: 0 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.mkcm__anchor {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--accent-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mkcm__anchor:hover {
  background: var(--accent-soft);
}

.mkcm__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mkcm__resolved {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.mkcm__actions {
  display: flex;
  gap: 4px;
  margin-left: -6px;
}

.mkcm__act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mkcm__act:hover {
  background: var(--surface-2);
  color: var(--text);
}

.mkcm__act--danger:hover {
  color: var(--err);
}

.mkcm__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.mkcm__empty {
  margin: 0;
  padding: 14px;
  font-size: 13px;
  color: var(--text-3);
}

.mkcm__composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--border);
}

.mkcm__draft {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 2px 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 12.5px;
  font-weight: 600;
}

.mkcm__draft span {
  flex: 1;
}

.mkcm__mentions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mkcm__chip-x {
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.mkcm__bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mkcm__mention {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-3);
}

.mkcm__mention-sel {
  min-height: 30px;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
}

@media (max-width: 640px) {
  .mkcm__filters button,
  .mkcm__act,
  .mkcm__anchor {
    min-height: 44px;
  }

  .mkcm__mention-sel {
    min-height: 44px;
  }

  .mkcm__list {
    max-height: none;
  }
}
</style>
