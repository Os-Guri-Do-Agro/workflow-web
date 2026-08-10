<script setup lang="ts">
/**
 * Seção Documentos da tarefa.
 *
 * O caso real que desenhou isto: a atividade pai é um módulo e carrega um
 * `Leia-primeiro.md` marcado como principal; cada filha (`(cms)`, `(app)`)
 * carrega os documentos da própria frente. Por isso a lista é lateral e
 * ordenável, e existe a noção de documento PRINCIPAL, que é o que a filha
 * herda do pai.
 *
 * Subir um `.md` cria documento, não anexo: o arquivo é lido aqui no cliente
 * (FileReader) e vai como texto. O endpoint de anexo recusa `.md` de propósito,
 * para markdown não ter duas casas.
 */
import { computed, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import MarkdownDocEditor from './MarkdownDocEditor.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useActivityDocs } from '../composables/useActivityDocs'
import { useToast } from '@/composables/useToast'
import type { ActivityDocMeta } from '../activity-types'

const props = withDefaults(
  defineProps<{
    activityId: string
    docs: ActivityDocMeta[]
    companyId?: string | null
    canEdit?: boolean
  }>(),
  { canEdit: true, companyId: null },
)

/** A lista de documentos vive na atividade: mudou, o pai recarrega. */
const emit = defineEmits<{ changed: [] }>()

const { success: showSuccess, error: showError } = useToast()

const activityIdRef = computed(() => props.activityId)
const companyIdRef = computed(() => props.companyId)
const docsRef = computed(() => props.docs)

const {
  selectedId,
  selected,
  draft,
  saveState,
  savedAt,
  saveError,
  focused,
  isLoadingContent,
  onInput,
  flush,
  retry,
  createDoc,
  patchMeta,
  removeDoc,
  reorder,
} = useActivityDocs(activityIdRef, companyIdRef, docsRef, () => emit('changed'))

defineExpose({ flush })

// ─── Criar ───────────────────────────────────────────────────────────────────

const creating = ref(false)

async function addBlank(): Promise<void> {
  creating.value = true
  try {
    await createDoc({ title: 'Novo documento', content: '' })
  } finally {
    creating.value = false
  }
}

const uploadInput = ref<HTMLInputElement | null>(null)

async function onUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return

  creating.value = true
  try {
    for (const file of files) {
      // Sequencial: cada criação renumera `position` no servidor, e em paralelo
      // dois documentos disputariam a mesma posição.
      const content = await file.text()
      await createDoc({
        title: titleFromFilename(file.name),
        filename: file.name,
        content,
      })
    }
  } catch {
    showError('Não foi possível ler o arquivo')
  } finally {
    creating.value = false
  }
}

/** `leia-primeiro.md` vira "Leia primeiro": o título é para ler, não para o disco. */
function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' ').trim()
  if (!base) return 'Documento'
  return base.charAt(0).toUpperCase() + base.slice(1)
}

// ─── Renomear ────────────────────────────────────────────────────────────────

const renamingId = ref<string | null>(null)
const renameValue = ref('')

function startRename(doc: ActivityDocMeta): void {
  renamingId.value = doc.id
  renameValue.value = doc.title
}

async function commitRename(doc: ActivityDocMeta): Promise<void> {
  const title = renameValue.value.trim()
  renamingId.value = null
  if (!title || title === doc.title) return
  await patchMeta(doc.id, { title })
}

// ─── Ordem e principal ───────────────────────────────────────────────────────

function move(index: number, delta: number): void {
  const ids = props.docs.map((d) => d.id)
  const target = index + delta
  if (target < 0 || target >= ids.length) return
  const moved = ids[index]
  const other = ids[target]
  if (!moved || !other) return
  ids[index] = other
  ids[target] = moved
  void reorder(ids)
}

async function makePrimary(doc: ActivityDocMeta): Promise<void> {
  if (doc.isPrimary) return
  await patchMeta(doc.id, { isPrimary: true })
}

// ─── Copiar e baixar ─────────────────────────────────────────────────────────

const copied = ref(false)

async function copyRaw(): Promise<void> {
  try {
    // Markdown CRU, não o HTML renderizado: é este texto que vai para o agente.
    await navigator.clipboard.writeText(draft.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    showError('O navegador bloqueou o acesso à área de transferência')
  }
}

function download(): void {
  const doc = selected.value
  if (!doc) return
  // Gera o arquivo no cliente a partir do texto: o documento vive no banco,
  // não no Storage, então não existe URL para baixar.
  const blob = new Blob([draft.value], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = doc.filename
  link.click()
  URL.revokeObjectURL(url)
  showSuccess(`${doc.filename} baixado`)
}

// ─── Excluir ─────────────────────────────────────────────────────────────────

const pendingDelete = ref<ActivityDocMeta | null>(null)
const deleting = ref(false)

async function confirmDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  deleting.value = true
  try {
    await removeDoc(target.id)
    pendingDelete.value = null
  } finally {
    deleting.value = false
  }
}

function onDeleteDialog(open: boolean): void {
  if (!open) pendingDelete.value = null
}
</script>

<template>
  <section class="docs">
    <header class="docs__head">
      <h3 class="docs__title">
        <FileText :size="12" />
        Documentos
        <span v-if="docs.length" class="docs__count">{{ docs.length }}</span>
      </h3>

      <div v-if="canEdit" class="docs__head-actions">
        <button
          type="button"
          class="docs__ghost press"
          :disabled="creating"
          @click="uploadInput?.click()"
        >
          <Loader2 v-if="creating" :size="13" class="spin" />
          <Upload v-else :size="13" />
          Subir .md
        </button>
        <input
          ref="uploadInput"
          type="file"
          accept=".md,.markdown,text/markdown"
          multiple
          class="docs__file"
          @change="onUpload"
        />
        <button
          type="button"
          class="docs__ghost press"
          :disabled="creating"
          @click="addBlank"
        >
          <Plus :size="13" />
          Novo
        </button>
      </div>
    </header>

    <div v-if="!docs.length" class="docs__empty">
      <FileText :size="18" />
      <p class="docs__empty-title">Nenhum documento ainda</p>
      <p class="docs__empty-hint">
        Guarde aqui a spec em markdown. O conteúdo pode ser copiado cru para
        levar ao agente.
      </p>
    </div>

    <div v-else class="docs__body">
      <ul class="docs__list">
        <li v-for="(doc, index) in docs" :key="doc.id" class="docs__item">
          <button
            type="button"
            class="docs__pick"
            :class="{ 'docs__pick--on': doc.id === selectedId }"
            :aria-current="doc.id === selectedId"
            @click="selectedId = doc.id"
          >
            <Star
              v-if="doc.isPrimary"
              :size="11"
              class="docs__star"
              aria-label="Documento principal"
            />
            <input
              v-if="renamingId === doc.id"
              v-model="renameValue"
              class="docs__rename"
              @click.stop
              @keydown.enter.prevent="commitRename(doc)"
              @keydown.esc.prevent="renamingId = null"
              @blur="commitRename(doc)"
            />
            <span v-else class="docs__name" @dblclick.stop="startRename(doc)">
              {{ doc.title }}
            </span>
          </button>

          <div v-if="canEdit" class="docs__item-actions">
            <button
              type="button"
              class="docs__mini"
              :disabled="index === 0"
              aria-label="Mover para cima"
              @click="move(index, -1)"
            >
              <ArrowUp :size="12" />
            </button>
            <button
              type="button"
              class="docs__mini"
              :disabled="index === docs.length - 1"
              aria-label="Mover para baixo"
              @click="move(index, 1)"
            >
              <ArrowDown :size="12" />
            </button>
            <button
              type="button"
              class="docs__mini"
              :class="{ 'docs__mini--on': doc.isPrimary }"
              :disabled="doc.isPrimary"
              :aria-label="
                doc.isPrimary ? 'Já é o principal' : 'Marcar como principal'
              "
              :title="
                doc.isPrimary
                  ? 'Principal: é o que as subtarefas herdam'
                  : 'Marcar como principal'
              "
              @click="makePrimary(doc)"
            >
              <Star :size="12" />
            </button>
            <button
              type="button"
              class="docs__mini docs__mini--kill"
              aria-label="Remover documento"
              @click="pendingDelete = doc"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </li>
      </ul>

      <div class="docs__pane">
        <div class="docs__pane-bar">
          <span class="docs__filename">{{ selected?.filename }}</span>
          <div class="docs__pane-actions">
            <button type="button" class="docs__ghost press" @click="copyRaw">
              <Check v-if="copied" :size="13" />
              <Copy v-else :size="13" />
              {{ copied ? 'Copiado' : 'Copiar markdown' }}
            </button>
            <button type="button" class="docs__ghost press" @click="download">
              <Download :size="13" />
              Baixar
            </button>
          </div>
        </div>

        <div v-if="isLoadingContent" class="docs__loading">
          <Loader2 :size="15" class="spin" />
          <span>Carregando documento...</span>
        </div>

        <MarkdownDocEditor
          v-else
          :model-value="draft"
          :state="saveState"
          :saved-at="savedAt"
          :error-message="saveError"
          :readonly="!canEdit"
          @update:model-value="onInput"
          @focus="focused = true"
          @blur="
            () => {
              focused = false
              flush()
            }
          "
          @retry="retry"
        />
      </div>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      :model-value="true"
      danger
      title="Remover documento"
      :message="`O documento ${pendingDelete.title} será apagado. Isso não pode ser desfeito.`"
      confirm-label="Remover"
      :loading="deleting"
      @confirm="confirmDelete"
      @update:model-value="onDeleteDialog"
    />
  </section>
</template>

<style scoped>
.docs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.docs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.docs__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.docs__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0;
}

.docs__head-actions,
.docs__pane-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.docs__ghost {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.docs__ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.docs__ghost:disabled {
  opacity: 0.55;
  cursor: progress;
}

.docs__ghost:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.docs__file {
  display: none;
}

.docs__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-3);
  text-align: center;
}

.docs__empty-title {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.docs__empty-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-4);
  max-width: 42ch;
}

.docs__body {
  display: grid;
  grid-template-columns: 190px 1fr;
  gap: 10px;
  align-items: start;
}

.docs__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs__item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.docs__pick {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.docs__pick:hover {
  background: var(--surface-2);
}

.docs__pick--on {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text);
  font-weight: 600;
}

.docs__pick:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.docs__star {
  color: var(--accent);
  flex: none;
}

.docs__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs__rename {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
}

.docs__item-actions {
  display: flex;
  gap: 1px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.docs__item:hover .docs__item-actions,
.docs__item:focus-within .docs__item-actions {
  opacity: 1;
}

.docs__mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.docs__mini:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-3);
}

.docs__mini--on {
  color: var(--accent);
  opacity: 1;
}

.docs__mini--kill:hover:not(:disabled) {
  color: var(--err);
}

.docs__mini:disabled {
  opacity: 0.3;
  cursor: default;
}

.docs__pane {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.docs__pane-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.docs__filename {
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 26px;
  color: var(--text-3);
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.spin {
  animation: docs-spin 0.9s linear infinite;
}

@keyframes docs-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .docs__body {
    grid-template-columns: 1fr;
  }
  .docs__list {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
  .docs__item-actions {
    transition: none;
  }
}
</style>
