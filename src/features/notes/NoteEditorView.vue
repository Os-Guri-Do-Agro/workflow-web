<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { EditorContent } from '@tiptap/vue-3'
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import { GripVertical, Plus, X } from 'lucide-vue-next'
import notesService from '@/service/notes/notes-service'
import aiService from '@/service/ai/ai-service'
import axios from 'axios'
import { apiBaseUrl, getApiErrorMessage, getApiRequestId } from '@/service/api'
import { useToast } from '@/composables/useToast'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import TipTapToolbar from '@/components/ui/TipTapToolbar.vue'
import NoteHeader from './components/NoteHeader.vue'
import NoteMetaMenu from './components/NoteMetaMenu.vue'
import NoteBubbleMenu from './components/NoteBubbleMenu.vue'
import NoteSlashMenu from './components/NoteSlashMenu.vue'
import NoteShareDialog from './components/NoteShareDialog.vue'
import { useNote } from './composables/useNote'
import { noteKeys, useNoteFolders, useNoteMutations } from './composables/useNotes'
import { useNoteEditor } from './composables/useNoteEditor'
import { useNoteAutosave } from './composables/useNoteAutosave'
import { useNoteImmersive } from './composables/useNoteImmersive'
import type { Note } from './types'
import './styles/note-content.css'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { success, error: showError } = useToast()

const routeId = computed(() => String(route.params.id ?? ''))
/** Id real: muda de null para o id do servidor quando a nota nova é criada. */
const savedId = ref<string | null>(null)
const noteId = computed(() => savedId.value ?? (routeId.value === 'new' ? null : routeId.value))

const { data: note, isLoading, isError, error: loadError, refetch } = useNote(() => routeId.value)
const { data: folders } = useNoteFolders()
const { removeNote } = useNoteMutations()

const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const folderId = ref<string | null>(null)
const emoji = ref('')
const noteColor = ref('')
const coverImage = ref('')
const isPinned = ref(false)
const pinning = ref(false)
const improving = ref(false)
const newTag = ref('')
const hydratedId = ref<string | null>(null)
const confirmDelete = ref(false)
const confirmImprove = ref(false)
const shareOpen = ref(false)
const titleEl = ref<HTMLTextAreaElement | null>(null)

/** Nível do usuário sobre esta nota. Convidado VIEW não edita. */
const accessLevel = ref<'OWNER' | 'VIEW' | 'EDIT'>('OWNER')
const isOwner = computed(() => accessLevel.value === 'OWNER')
const readOnly = computed(() => accessLevel.value === 'VIEW')
const canEdit = computed(() => accessLevel.value !== 'VIEW')
/** `updatedAt` que o cliente viu, para o optimistic locking do PATCH. */
const baseUpdatedAt = ref<string | null>(null)

/** Snapshot do servidor: `""` limpa o campo, chave omitida mantém. */
const original = ref({ emoji: '', noteColor: '', coverImage: '' })

const { immersive, toggleImmersive } = useNoteImmersive()

const folderItems = computed(() => [
  { label: 'Sem pasta', value: null },
  ...(folders.value ?? []).map((folder) => ({ label: folder.name, value: folder.id })),
])

function buildPayload() {
  const payload: Record<string, unknown> = {
    title: title.value.trim() || 'Sem título',
    content: content.value,
    tags: tags.value,
    folderId: folderId.value,
  }
  if (emoji.value !== original.value.emoji) payload.emoji = emoji.value
  if (noteColor.value !== original.value.noteColor) payload.noteColor = noteColor.value
  if (coverImage.value !== original.value.coverImage) payload.coverImage = coverImage.value
  // Optimistic locking: manda o updatedAt que vimos. Convidado editando ao mesmo
  // tempo que outro dispara 409 em vez de sobrescrever em silêncio.
  if (baseUpdatedAt.value) payload.expectedUpdatedAt = baseUpdatedAt.value
  return payload
}

/** 409: outra pessoa salvou. Recarrega a versão do servidor sem perder foco. */
async function onConflict() {
  showError('A nota foi editada em outro lugar. Recarregando a versão mais recente.')
  const fresh = await refetch()
  const data = fresh.data
  if (data) {
    hydratedId.value = null // força re-hidratar
    hydrate(data)
  }
}

function syncOriginal() {
  original.value = {
    emoji: emoji.value,
    noteColor: noteColor.value,
    coverImage: coverImage.value,
  }
}

const {
  state: saveState,
  savedAt,
  message: saveMessage,
  markDirty,
  flush,
  retry: retrySave,
} = useNoteAutosave({
  save: async () => {
    const payload = buildPayload()
    try {
      if (!noteId.value) {
        const created = await notesService.createNote(payload)
        savedId.value = created.id
        hydratedId.value = created.id
        queryClient.setQueryData(noteKeys.detail(created.id), created)
        await router.replace(`/notes/${created.id}`)
      } else {
        const updated = await notesService.updateNote(noteId.value, payload)
        baseUpdatedAt.value = updated.updatedAt
        queryClient.setQueryData(noteKeys.detail(updated.id), updated)
      }
      syncOriginal()
      void queryClient.invalidateQueries({ queryKey: noteKeys.lists })
    } catch (err) {
      if (isAxiosConflict(err)) {
        void onConflict()
        return // não marca erro: o conflito tem tratamento próprio
      }
      const requestId = getApiRequestId(err)
      console.error('[notas] falha ao salvar', requestId ? `requestId=${requestId}` : '', err)
      throw new Error(getApiErrorMessage(err, 'Não foi possível salvar a nota'))
    }
  },
  enabled: () => canEdit.value,
  /**
   * Aba fechando: `fetch` com `keepalive` é o único caminho que sobrevive ao
   * unload. Só vale para nota já existente - criar uma nota na saída daria uma
   * nota fantasma sem o usuário saber.
   */
  beacon: () => {
    if (!noteId.value) return
    // `apiBaseUrl()` em vez de reimplementar a normalização da env: foi um
    // `VITE_API_URL` sem esquema que derrubou produção uma vez (ver api.ts).
    const url = apiBaseUrl()
    const token = localStorage.getItem('token')
    if (!url || !token) return
    void fetch(`${url}/notes/${noteId.value}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(localStorage.getItem('activeCompany')
          ? { 'x-company-id': localStorage.getItem('activeCompany') as string }
          : {}),
      },
      body: JSON.stringify(buildPayload()),
    }).catch(() => {})
  },
})

// O editor é criado depois do autosave porque cada alteração dele marca a nota
// como suja. A configuração das extensões vive em `useNoteEditor`.
const { editor, slash } = useNoteEditor({
  onUpdate: (html) => {
    content.value = html
    markDirty()
  },
})

const wordCount = computed(() => editor.value?.storage.characterCount?.words() ?? 0)
const charCount = computed(() => editor.value?.storage.characterCount?.characters() ?? 0)

function isAxiosConflict(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 409
}

function hydrate(data: Note) {
  hydratedId.value = data.id
  title.value = data.title ?? ''
  content.value = data.content ?? ''
  tags.value = [...(data.tags ?? [])]
  folderId.value = data.folderId
  isPinned.value = !!data.isPinned
  emoji.value = data.emoji ?? ''
  noteColor.value = data.noteColor ?? ''
  coverImage.value = data.coverImage ?? ''
  accessLevel.value = data.accessLevel ?? 'OWNER'
  baseUpdatedAt.value = data.updatedAt ?? null
  syncOriginal()
  editor.value?.commands.setContent(data.content ?? '', { emitUpdate: false })
  editor.value?.setEditable(canEdit.value)
  void nextTick(resizeTitle)
}

// Só hidrata quando chega uma nota diferente da que já está na tela: sem isso,
// um refetch em background sobrescreveria o que está sendo digitado.
watch([note, editor], ([data]) => {
  if (!data || !editor.value || hydratedId.value === data.id) return
  hydrate(data)
})

function resizeTitle() {
  const el = titleEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onTitleInput() {
  resizeTitle()
  markDirty()
}

function addTag() {
  const value = newTag.value.trim()
  if (!value || tags.value.includes(value)) return
  tags.value.push(value)
  newTag.value = ''
  markDirty()
}

function removeTag(tag: string) {
  tags.value = tags.value.filter((item) => item !== tag)
  markDirty()
}

function setMeta(field: 'emoji' | 'noteColor' | 'coverImage', value: string) {
  if (field === 'emoji') emoji.value = value
  if (field === 'noteColor') noteColor.value = value
  if (field === 'coverImage') coverImage.value = value
  markDirty()
}

async function handleTogglePin() {
  if (!noteId.value || pinning.value) return
  pinning.value = true
  const previous = isPinned.value
  isPinned.value = !previous
  try {
    await notesService.togglePin(noteId.value)
    void queryClient.invalidateQueries({ queryKey: noteKeys.lists })
    success(isPinned.value ? 'Nota fixada' : 'Nota desafixada')
  } catch (err) {
    isPinned.value = previous
    showError(getApiErrorMessage(err, 'Não foi possível fixar a nota'))
  } finally {
    pinning.value = false
  }
}

async function runImprove() {
  confirmImprove.value = false
  const text = editor.value?.getText().trim()
  if (!text) {
    showError('Escreva algo antes de melhorar com IA')
    return
  }
  improving.value = true
  try {
    const response = await aiService.improve(
      text,
      'Melhore clareza, estrutura e tom mantendo o sentido original.',
    )
    // Um único passo de histórico: Ctrl+Z devolve o texto original inteiro.
    editor.value?.chain().focus().setContent(response.text).run()
    content.value = editor.value?.getHTML() ?? response.text
    markDirty()
    success('Texto melhorado. Ctrl+Z desfaz.')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível melhorar o texto'))
  } finally {
    improving.value = false
  }
}

async function handleDelete() {
  if (!noteId.value) return
  try {
    await removeNote.mutateAsync(noteId.value)
    confirmDelete.value = false
    success('Nota excluída')
    await router.push('/notes')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível excluir a nota'))
  }
}

// ── Ações da toolbar fixa do header ──────────────────────────────────────────
// A toolbar dá as opções fáceis sem exigir "/". Link e imagem por URL (mesmo
// padrão do slash menu); a seleção continua tendo o bubble menu com input inline.
function toolbarLink() {
  if (!editor.value) return
  const previous = editor.value.getAttributes('link').href ?? ''
  const url = window.prompt('Endereço do link:', previous)
  if (url === null) return
  const chain = editor.value.chain().focus().extendMarkRange('link')
  if (url.trim()) chain.setLink({ href: url.trim() }).run()
  else chain.unsetLink().run()
}

function toolbarImage() {
  const url = window.prompt('URL da imagem:')
  if (url?.trim()) editor.value?.chain().focus().setImage({ src: url.trim() }).run()
}

function toolbarTable() {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

/** Ctrl+S grava na hora; a página inteira responde, não só o corpo do editor. */
function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void flush()
  }
}

/**
 * Link de edição (`/notes/:id?invite=<token>`): o usuário já está logado (o
 * guard garantiu). Resgata o acesso e limpa a query para não re-resgatar.
 */
async function claimInviteIfAny() {
  const token = route.query.invite
  if (typeof token !== 'string' || !token) return
  try {
    await notesService.claimLink(token)
    await router.replace({ path: route.path, query: {} })
    await refetch()
    void queryClient.invalidateQueries({ queryKey: noteKeys.lists })
    success('Acesso concedido. Agora você pode editar esta nota.')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível usar o convite'))
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (routeId.value === 'new') void nextTick(() => titleEl.value?.focus())
  void claimInviteIfAny()
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!--
    No modo imersivo a página é teleportada para o body: o conteúdo da rota vive
    dentro do main do shell, que cria contexto de empilhamento próprio, e nenhum
    z-index daqui de dentro passa por cima da topbar.
  -->
  <Teleport to="body" :disabled="!immersive">
  <div class="note-page" :class="{ 'note-page--immersive': immersive }">
    <!-- Região fixa: header + toolbar não rolam com o conteúdo. -->
    <div class="note-topbar glass">
      <NoteHeader
        :save-state="saveState"
        :saved-at="savedAt"
        :save-message="saveMessage"
        :is-pinned="isPinned"
        :pinning="pinning"
        :immersive="immersive"
        :is-new="!noteId"
        :word-count="wordCount"
        :char-count="charCount"
        :can-share="isOwner && !!noteId"
        :read-only="readOnly"
        @back="router.push('/notes')"
        @retry="retrySave()"
        @toggle-pin="handleTogglePin"
        @toggle-immersive="toggleImmersive"
        @share="shareOpen = true"
      >
        <template #actions>
          <NoteMetaMenu
            v-if="canEdit"
            :emoji="emoji"
            :note-color="noteColor"
            :cover-image="coverImage"
            :can-delete="isOwner && !!noteId"
            :improving="improving"
            @update:emoji="setMeta('emoji', $event)"
            @update:note-color="setMeta('noteColor', $event)"
            @update:cover-image="setMeta('coverImage', $event)"
            @improve="confirmImprove = true"
            @remove="confirmDelete = true"
          />
        </template>
      </NoteHeader>

      <!-- Toolbar só quando pode editar; o slash menu continua funcionando. -->
      <div v-if="editor && !isLoading && !isError && canEdit" class="note-toolbar-row">
        <TipTapToolbar
          :editor="editor"
          :groups="['format', 'heading', 'list', 'block', 'align', 'insert']"
          size="sm"
          bare
          @link="toolbarLink"
          @image="toolbarImage"
          @table="toolbarTable"
        />
      </div>
    </div>

    <div class="note-scroll">
      <div v-if="isLoading" class="note-paper">
        <Skeleton type="text" :lines="2" />
        <Skeleton type="block" height="360px" />
      </div>

      <EmptyState
        v-else-if="isError"
        class="note-paper"
        title="Não foi possível abrir a nota"
        :description="getApiErrorMessage(loadError, 'Verifique sua conexão e tente de novo.')"
      >
        <template #action>
          <button type="button" class="note-retry" @click="refetch()">Tentar de novo</button>
        </template>
      </EmptyState>

      <article v-else class="note-paper">
        <img v-if="coverImage" :src="coverImage" alt="" class="note-cover" />

        <div class="note-title-row">
          <span v-if="emoji" class="note-title-emoji" aria-hidden="true">{{ emoji }}</span>
          <textarea
            ref="titleEl"
            v-model="title"
            class="note-title"
            rows="1"
            placeholder="Sem título"
            aria-label="Título da nota"
            :readonly="!canEdit"
            @input="onTitleInput"
            @keydown.enter.prevent="editor?.commands.focus('start')"
          />
        </div>

        <div class="note-props">
          <div class="note-props__folder">
            <AppSelect
              v-model="folderId"
              :items="folderItems"
              placeholder="Sem pasta"
              label="Pasta"
              density="compact"
              :disabled="!canEdit"
              @update:model-value="markDirty()"
            />
          </div>

          <div class="note-tags">
            <span v-for="tag in tags" :key="tag" class="note-tag">
              {{ tag }}
              <button
                v-if="canEdit"
                type="button"
                :aria-label="`Remover tag ${tag}`"
                @click="removeTag(tag)"
              >
                <X :size="11" />
              </button>
            </span>
            <div v-if="canEdit" class="note-tag-add">
              <input
                v-model="newTag"
                type="text"
                placeholder="Nova tag"
                aria-label="Adicionar tag"
                @keydown.enter.prevent="addTag"
              />
              <button type="button" aria-label="Adicionar tag" @click="addTag">
                <Plus :size="12" />
              </button>
            </div>
          </div>
        </div>

        <div
          class="note-prose"
          :style="noteColor ? { '--note-accent': noteColor } : undefined"
          :class="{ 'note-prose--accent': !!noteColor }"
        >
          <EditorContent :editor="editor" />
        </div>
      </article>
    </div>

    <template v-if="canEdit">
      <NoteBubbleMenu :editor="editor" />
      <NoteSlashMenu :state="slash" @hover="slash.index = $event" />
      <DragHandle v-if="editor" :editor="editor" class="note-drag">
        <GripVertical :size="15" />
      </DragHandle>
    </template>

    <ConfirmDialog
      v-model="confirmDelete"
      title="Excluir nota"
      message="A nota e todo o conteúdo dela serão apagados. Não dá para desfazer."
      confirm-label="Excluir"
      danger
      :loading="removeNote.isPending.value"
      @confirm="handleDelete"
    />

    <ConfirmDialog
      v-model="confirmImprove"
      title="Melhorar com IA"
      message="A IA vai reescrever o conteúdo inteiro da nota. Você pode desfazer com Ctrl+Z depois."
      confirm-label="Melhorar"
      @confirm="runImprove"
    />

    <NoteShareDialog v-model="shareOpen" :note-id="noteId" />
  </div>
  </Teleport>
</template>

<style scoped>
/*
 * A nota é o container de scroll: `.note-topbar` fica fora do fluxo de rolagem
 * e `.note-scroll` rola por baixo. Assim o header + toolbar ficam SEMPRE fixos,
 * sem depender do scroll do shell (que varia entre command/focus/canvas).
 */
.note-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.note-topbar {
  flex-shrink: 0;
  z-index: 20;
  border-bottom: 1px solid var(--border);
}

.note-toolbar-row {
  display: flex;
  align-items: center;
  padding: 4px 16px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.note-toolbar-row::-webkit-scrollbar {
  display: none;
}

.note-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 40px 24px 25vh;
}

/* Coluna de leitura: largura fixa em ch para a linha não passar do confortável. */
.note-paper {
  width: 100%;
  max-width: 72ch;
  margin: 0 auto;
}

/*
 * Imersivo cobre a janela inteira em vez de tentar esconder o shell por fora:
 * a nota não sabe (nem deveria saber) qual das três variantes de shell está
 * ativa, e um overlay próprio funciona igual nas três.
 */
.note-page--immersive {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: var(--bg);
}

/* No imersivo a barra do topo desbota e reaparece ao aproximar o ponteiro. */
.note-page--immersive .note-topbar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  border-bottom-color: transparent;
  opacity: 0.16;
  transition: opacity var(--motion) var(--motion-ease);
}

.note-page--immersive .note-topbar:hover,
.note-page--immersive .note-topbar:focus-within {
  opacity: 1;
  border-bottom-color: var(--border);
}

.note-page--immersive .note-scroll {
  padding-top: 88px;
}

@media (prefers-reduced-motion: reduce) {
  .note-page--immersive .note-topbar {
    transition-duration: 1ms;
  }
}

.note-cover {
  width: 100%;
  height: 180px;
  margin-bottom: 28px;
  object-fit: cover;
  border-radius: var(--radius-lg);
}

.note-title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.note-title-emoji {
  font-size: 38px;
  line-height: 1.15;
}

.note-title {
  flex: 1;
  padding: 0;
  overflow: hidden;
  background: transparent;
  border: none;
  color: var(--text);
  font-family: inherit;
  font-size: var(--text-title-large, 34px);
  font-weight: 680;
  letter-spacing: -0.028em;
  line-height: 1.15;
  resize: none;
}

.note-title:focus {
  outline: none;
}

.note-title::placeholder {
  color: var(--text-4);
}

.note-props {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0 26px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.note-props__folder {
  flex: 0 0 200px;
  width: 200px;
  max-width: 200px;
}

.note-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.note-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  font-size: 11.5px;
}

.note-tag button {
  display: inline-flex;
  padding: 2px;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--text-3);
  cursor: pointer;
}

.note-tag button:hover {
  background: var(--surface-3);
  color: var(--text);
}

.note-tag-add {
  display: inline-flex;
  align-items: center;
}

.note-tag-add input {
  width: 92px;
  padding: 4px 8px;
  background: transparent;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  color: var(--text);
  font-family: inherit;
  font-size: 11.5px;
}

.note-tag-add input:focus {
  outline: none;
  border-style: solid;
  border-color: var(--accent);
}

.note-tag-add button {
  display: inline-flex;
  margin-left: -24px;
  padding: 3px;
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
}

/* Faixa da cor escolhida para a nota, à esquerda do corpo. */
.note-prose--accent {
  padding-left: 16px;
  border-left: 3px solid var(--note-accent);
}

.note-retry {
  padding: 8px 14px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.note-drag {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--text-4);
  cursor: grab;
}

.note-drag:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

@media (max-width: 720px) {
  .note-scroll {
    padding: 24px 16px 25vh;
  }
  .note-title {
    font-size: 26px;
  }
}
</style>
