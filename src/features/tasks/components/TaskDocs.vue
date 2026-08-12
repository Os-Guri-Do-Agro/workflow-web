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
 * Subir um `.md` AQUI cria documento: o arquivo é lido no cliente e vai como
 * texto. O mesmo `.md` também pode ficar como anexo — a escolha é oferecida na
 * seção Arquivos (`TaskAttachments`), que pergunta o destino. Nesta seção não
 * há pergunta: quem sobe por aqui já escolheu documento.
 */
import { computed, ref } from 'vue'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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

/** Posição da aba aberta: as ações da barra agem sobre ela. */
const selectedIndex = computed(() =>
  props.docs.findIndex((doc) => doc.id === selectedId.value),
)

// ─── Minimizar ───────────────────────────────────────────────────────────────
//
// Um documento de spec ocupa a tela inteira, e quem quer chegar nas subtarefas
// paga o preço em rolagem. Recolher é preferência de quem trabalha, não estado
// da tarefa: fica no `localStorage`, igual ao modo do editor.

const COLLAPSE_KEY = 'tasks.docs.collapsed'
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1')

function toggleCollapse(): void {
  // Recolher desmonta o editor: descarrega o autosave pendente antes, senão o
  // que foi digitado nos últimos segundos morre com o componente.
  if (!collapsed.value) flush()
  collapsed.value = !collapsed.value
  localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0')
}

/** Resumo de uma linha no lugar do editor: qual documento ficaria aberto. */
const collapsedSummary = computed(() => {
  const principal = props.docs.find((doc) => doc.isPrimary) ?? props.docs[0]
  if (!principal) return ''
  const resto = props.docs.length - 1
  if (!resto) return principal.title
  return `${principal.title} e mais ${resto}`
})

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
      <button
        type="button"
        class="docs__title"
        :aria-expanded="!collapsed"
        :title="collapsed ? 'Expandir documentos' : 'Minimizar documentos'"
        @click="toggleCollapse"
      >
        <ChevronDown :size="13" class="docs__chev" :class="{ 'docs__chev--up': collapsed }" />
        <FileText :size="12" />
        Documentos
        <span v-if="docs.length" class="docs__count">{{ docs.length }}</span>
        <span v-if="collapsed && collapsedSummary" class="docs__summary">
          {{ collapsedSummary }}
        </span>
      </button>

      <div v-if="canEdit && !collapsed" class="docs__head-actions">
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

    <div v-if="!docs.length && !collapsed" class="docs__empty">
      <FileText :size="18" />
      <p class="docs__empty-title">Nenhum documento ainda</p>
      <p class="docs__empty-hint">
        Guarde aqui a spec em markdown. O conteúdo pode ser copiado cru para
        levar ao agente.
      </p>
    </div>

    <template v-else-if="!collapsed">
      <!-- Abas, como num editor de código: o documento aberto é uma aba ligada
           ao conteúdo abaixo. A lista lateral que existia aqui desperdiçava uma
           coluna inteira para dois ou três nomes e roubava largura justamente
           de quem precisa dela (markdown + preview lado a lado). -->
      <div class="docs__tabbar">
        <div class="docs__tabs" role="tablist" aria-label="Documentos da tarefa">
          <button
            v-for="doc in docs"
            :key="doc.id"
            type="button"
            role="tab"
            class="docs__tab"
            :class="{ 'docs__tab--on': doc.id === selectedId }"
            :aria-selected="doc.id === selectedId"
            :title="`${doc.filename}${doc.isPrimary ? ' · principal' : ''}`"
            @click="selectedId = doc.id"
            @dblclick="canEdit && startRename(doc)"
          >
            <Star v-if="doc.isPrimary" :size="11" class="docs__tab-star" />
            <FileText v-else :size="11" class="docs__tab-icon" />
            <input
              v-if="renamingId === doc.id"
              v-model="renameValue"
              class="docs__rename"
              @click.stop
              @keydown.enter.prevent="commitRename(doc)"
              @keydown.esc.prevent="renamingId = null"
              @blur="commitRename(doc)"
            />
            <span v-else class="docs__tab-name">{{ doc.title }}</span>
          </button>
        </div>

        <!-- Ações do documento ABERTO. Antes viviam escondidas no hover de cada
             linha da lista, o que não se descobre sem passar o mouse por cima. -->
        <div class="docs__tab-actions">
          <button
            v-if="canEdit"
            type="button"
            class="docs__mini"
            :disabled="selectedIndex <= 0"
            aria-label="Mover documento para a esquerda"
            title="Mover para a esquerda"
            @click="move(selectedIndex, -1)"
          >
            <ChevronLeft :size="14" />
          </button>
          <button
            v-if="canEdit"
            type="button"
            class="docs__mini"
            :disabled="selectedIndex < 0 || selectedIndex === docs.length - 1"
            aria-label="Mover documento para a direita"
            title="Mover para a direita"
            @click="move(selectedIndex, 1)"
          >
            <ChevronRight :size="14" />
          </button>
          <button
            v-if="canEdit && selected"
            type="button"
            class="docs__mini"
            :class="{ 'docs__mini--on': selected.isPrimary }"
            :disabled="selected.isPrimary"
            :aria-label="selected.isPrimary ? 'Já é o principal' : 'Marcar como principal'"
            :title="
              selected.isPrimary
                ? 'Principal: é o que as subtarefas herdam'
                : 'Marcar como principal'
            "
            @click="makePrimary(selected)"
          >
            <Star :size="14" />
          </button>

          <span class="docs__sep" aria-hidden="true" />

          <button type="button" class="docs__ghost press" @click="copyRaw">
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
            <span class="docs__ghost-label">{{ copied ? 'Copiado' : 'Copiar markdown' }}</span>
          </button>
          <button type="button" class="docs__ghost press" title="Baixar .md" @click="download">
            <Download :size="13" />
            <span class="docs__ghost-label">Baixar</span>
          </button>
          <button
            v-if="canEdit && selected"
            type="button"
            class="docs__mini docs__mini--kill"
            aria-label="Remover documento"
            title="Remover documento"
            @click="pendingDelete = selected"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </div>

      <div class="docs__pane">
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
    </template>

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
/* A seção é dona do próprio respiro: o `.panel` que a hospeda não tem padding
   (é ele quem dá a borda e o raio), então cabeçalho e estados vazios pagam o
   seu, e só a faixa de abas + editor vai de ponta a ponta, de propósito. */
.docs {
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* Quem decide se os rótulos das ações cabem é a largura DESTA seção (ela vive
     na página cheia e no painel lateral do board), não a da janela. */
  container-type: inline-size;
}

.docs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

/* O título é o botão de minimizar: alvo grande, sem inventar um ícone extra
   competindo com as ações de criação à direita. */
.docs__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 0 -6px;
  padding: 4px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.docs__title:hover {
  color: var(--text-2);
  background: var(--surface-2);
}

.docs__title:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.docs__chev {
  color: var(--text-4);
  flex: none;
  transition: transform var(--motion-fast) var(--motion-ease);
}

.docs__chev--up {
  transform: rotate(-90deg);
}

/* Qual documento está lá dentro, sem precisar expandir para descobrir. */
.docs__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-4);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
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

.docs__head-actions {
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
  margin: 0 14px 14px;
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

/* ─── Faixa de abas ──────────────────────────────────────────────────────── */

.docs__tabbar {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding-left: 8px;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  min-width: 0;
}

.docs__tabs {
  display: flex;
  align-items: stretch;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.docs__tabs::-webkit-scrollbar {
  display: none;
}

.docs__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  padding: 9px 12px;
  border: none;
  /* A aba ativa engole a linha de baixo da faixa e encosta no conteúdo: é isso
     que faz o par aba/documento ler como uma coisa só. */
  border-bottom: 1px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.docs__tab + .docs__tab {
  box-shadow: inset 1px 0 0 var(--border);
}

.docs__tab:hover {
  color: var(--text-2);
  background: color-mix(in srgb, var(--surface) 55%, transparent);
}

/* Dois nomes de classe de propósito: precisa ganhar do separador
   (`.docs__tab + .docs__tab`), que também é `box-shadow` e tem a mesma força. */
.docs__tab.docs__tab--on {
  background: var(--surface);
  border-bottom-color: var(--surface);
  color: var(--text);
  font-weight: 600;
  /* Fio de acento no topo: a marca de "este é o aberto" que sobrevive sem cor
     de fundo forte, do mesmo jeito que um editor de código faz. */
  box-shadow: inset 0 2px 0 var(--accent);
}

.docs__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.docs__tab-star {
  color: var(--accent);
  flex: none;
}

.docs__tab-icon {
  color: var(--text-4);
  flex: none;
}

.docs__tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.docs__rename {
  width: 14ch;
  min-width: 8ch;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.docs__tab-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 0 8px 0 4px;
  flex: none;
}

.docs__sep {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--border);
}

.docs__mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.docs__mini:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-3);
}

.docs__mini:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.docs__mini--on {
  color: var(--accent);
  opacity: 1;
}

.docs__mini--kill:hover:not(:disabled) {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

.docs__mini:disabled {
  opacity: 0.3;
  cursor: default;
}

.docs__pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* O editor preenche o cartão de ponta a ponta: dentro de um painel com raio e
   `overflow: hidden`, borda e raio próprios virariam moldura dupla. */
.docs__pane :deep(.mde) {
  border: none;
  border-radius: 0;
}

.docs__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 26px;
  color: var(--text-3);
  font-size: 12px;
}

.spin {
  animation: docs-spin 0.9s linear infinite;
}

@keyframes docs-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Painel estreito (o lateral do board, por exemplo): os rótulos saem e ficam
   só os ícones, para as abas não perderem espaço para a barra de ações. */
@container (max-width: 560px) {
  .docs__ghost-label {
    display: none;
  }
  .docs__ghost {
    padding: 4px 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin,
  .docs__tab,
  .docs__mini,
  .docs__chev {
    animation: none;
    transition: none;
  }
}
</style>
