<script setup lang="ts">
/**
 * Seção de arquivos da tarefa. Dono ÚNICO do markup de anexo.
 *
 * Antes desta rodada o mesmo bloco existia em quatro lugares (painel, detalhe
 * em edição, detalhe em leitura e capa do card), cada um com o seu regex de
 * imagem e o seu jeito de mostrar o nome. Qualquer melhoria tinha que ser feita
 * quatro vezes, e não era.
 *
 * Upload de vários arquivos = várias requisições em paralelo, de propósito: o
 * endpoint é single-file, cada arquivo tem progresso próprio e um recusado
 * (12MB, `.exe`, `.md`) não derruba os outros.
 */
import { computed, ref } from 'vue'
import { FolderOpen, Grid2x2, List, Loader2, Trash2, Upload } from 'lucide-vue-next'
import AttachmentViewer from './AttachmentViewer.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import activityService from '@/service/activities/activity-service'
import { getApiErrorMessage } from '@/service/api'
import { useToast } from '@/composables/useToast'
import {
  formatBytes,
  iconOf,
  isImage,
  labelOf,
  sortAttachments,
} from '@/features/tasks/attachment-kind'
import type { ActivityAttachment } from '@/features/tasks/activity-types'

const props = withDefaults(
  defineProps<{
    activityId: string
    attachments: ActivityAttachment[]
    companyId?: string | null
    canEdit?: boolean
    /** Versão enxuta para o painel lateral: sem alternador de modo. */
    compact?: boolean
  }>(),
  { canEdit: true, compact: false, companyId: null },
)

/** `changed` avisa o pai para recarregar a atividade (o anexo vive nela). */
const emit = defineEmits<{ changed: [] }>()

const { error: showError } = useToast()

const VIEW_STORAGE_KEY = 'tasks.attachments.view'
const view = ref<'grid' | 'list'>(
  (localStorage.getItem(VIEW_STORAGE_KEY) as 'grid' | 'list' | null) ?? 'grid',
)

function setView(next: 'grid' | 'list'): void {
  view.value = next
  // Preferência de visualização é do usuário, não da sessão: quem gosta de
  // lista não quer reescolher a cada tarefa aberta.
  localStorage.setItem(VIEW_STORAGE_KEY, next)
}

const items = computed(() => sortAttachments(props.attachments))

// ─── Upload ──────────────────────────────────────────────────────────────────

interface Uploading {
  id: string
  name: string
  percent: number
}

const uploading = ref<Uploading[]>([])
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
let uploadSeq = 0

async function uploadOne(file: File): Promise<void> {
  const entry: Uploading = {
    id: `up-${uploadSeq++}`,
    name: file.name,
    percent: 0,
  }
  uploading.value = [...uploading.value, entry]

  try {
    const data = new FormData()
    data.append('file', file)
    await activityService.postActivityAttachment(props.activityId, data, {
      companyId: props.companyId ?? undefined,
      onProgress: (percent) => {
        const found = uploading.value.find((u) => u.id === entry.id)
        if (found) found.percent = percent
      },
    })
  } catch (err) {
    // O servidor recusa por tamanho, extensão bloqueada ou `.md`. A mensagem
    // dele já é em pt-BR e diz o que fazer, então repassamos em vez de inventar.
    showError(getApiErrorMessage(err, `Não foi possível enviar "${file.name}"`))
  } finally {
    // Sai da lista de qualquer jeito: item de upload que fracassou e fica
    // pendurado na tela é pior que não aparecer.
    uploading.value = uploading.value.filter((u) => u.id !== entry.id)
  }
}

async function handleFiles(files: FileList | null): Promise<void> {
  if (!files?.length || !props.canEdit) return
  // Paralelo: cada arquivo tem a sua barra e o seu erro.
  await Promise.all(Array.from(files).map((file) => uploadOne(file)))
  emit('changed')
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  void handleFiles(event.dataTransfer?.files ?? null)
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement
  void handleFiles(input.files).finally(() => {
    // Zera o input: escolher o MESMO arquivo de novo não dispara `change` se o
    // valor continuar lá.
    input.value = ''
  })
}

// ─── Exclusão ────────────────────────────────────────────────────────────────

const pendingDelete = ref<ActivityAttachment | null>(null)
const deleting = ref(false)

/** O ConfirmDialog fecha por `update:modelValue`; não existe evento `cancel`. */
function onDeleteDialog(open: boolean): void {
  if (!open) pendingDelete.value = null
}

async function confirmDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target) return
  deleting.value = true
  try {
    await activityService.deleteAttachment(target.id, props.companyId ?? undefined)
    pendingDelete.value = null
    emit('changed')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível remover o arquivo'))
  } finally {
    deleting.value = false
  }
}

// ─── Viewer ──────────────────────────────────────────────────────────────────

const viewerIndex = ref<number | null>(null)

function openViewer(index: number): void {
  viewerIndex.value = index
}
</script>

<template>
  <section class="files">
    <header class="files__head">
      <h3 class="files__title">
        <FolderOpen :size="12" />
        Arquivos
        <span v-if="items.length" class="files__count">{{ items.length }}</span>
      </h3>

      <div v-if="!compact" class="files__tools">
        <div class="files__toggle" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            class="files__toggle-btn"
            :class="{ 'files__toggle-btn--on': view === 'grid' }"
            :aria-pressed="view === 'grid'"
            aria-label="Ver em grade"
            @click="setView('grid')"
          >
            <Grid2x2 :size="13" />
          </button>
          <button
            type="button"
            class="files__toggle-btn"
            :class="{ 'files__toggle-btn--on': view === 'list' }"
            :aria-pressed="view === 'list'"
            aria-label="Ver em lista"
            @click="setView('list')"
          >
            <List :size="13" />
          </button>
        </div>
      </div>
    </header>

    <!-- Dropzone: o input file real fica por trás, então funciona por teclado. -->
    <div
      v-if="canEdit"
      class="files__drop"
      :class="{ 'files__drop--over': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        class="files__input"
        aria-label="Escolher arquivos para anexar"
        @change="onPick"
      />
      <Upload :size="15" />
      <span>
        Arraste arquivos aqui ou <strong>clique para escolher</strong>
      </span>
      <span class="files__hint">Até 10 MB por arquivo. Arquivos .md viram documentos.</span>
    </div>

    <ul v-if="uploading.length" class="files__uploading">
      <li v-for="item in uploading" :key="item.id" class="files__up">
        <Loader2 :size="13" class="spin" />
        <span class="files__up-name">{{ item.name }}</span>
        <span class="files__up-pct">{{ item.percent }}%</span>
        <div class="files__bar" role="presentation">
          <div class="files__bar-fill" :style="{ width: `${item.percent}%` }" />
        </div>
      </li>
    </ul>

    <p v-if="!items.length && !uploading.length" class="files__empty">
      Nenhum arquivo anexado.
    </p>

    <!-- Grade -->
    <div v-else-if="view === 'grid' || compact" class="files__grid">
      <div v-for="(att, index) in items" :key="att.id" class="files__cell">
        <button
          type="button"
          class="files__card hover-lift"
          :aria-label="`Abrir ${att.filename}`"
          @click="openViewer(index)"
        >
          <img
            v-if="isImage(att)"
            :src="att.url"
            :alt="att.filename"
            class="files__thumb"
            loading="lazy"
          />
          <span v-else class="files__glyph">
            <component :is="iconOf(att)" :size="22" />
          </span>
          <span class="files__card-name">{{ att.filename }}</span>
          <span class="files__card-meta">
            {{ labelOf(att) }}
            <template v-if="formatBytes(att.size)"> · {{ formatBytes(att.size) }}</template>
          </span>
        </button>
        <button
          v-if="canEdit"
          type="button"
          class="files__kill press"
          :aria-label="`Remover ${att.filename}`"
          @click.stop="pendingDelete = att"
        >
          <Trash2 :size="12" />
        </button>
      </div>
    </div>

    <!-- Lista -->
    <ul v-else class="files__list">
      <li v-for="(att, index) in items" :key="att.id" class="files__row">
        <button
          type="button"
          class="files__row-main"
          :aria-label="`Abrir ${att.filename}`"
          @click="openViewer(index)"
        >
          <img
            v-if="isImage(att)"
            :src="att.url"
            :alt="''"
            class="files__row-thumb"
            loading="lazy"
          />
          <span v-else class="files__row-glyph">
            <component :is="iconOf(att)" :size="16" />
          </span>
          <span class="files__row-text">
            <span class="files__row-name">{{ att.filename }}</span>
            <span class="files__row-meta">
              {{ labelOf(att) }}
              <template v-if="formatBytes(att.size)">
                · {{ formatBytes(att.size) }}
              </template>
              <template v-if="att.uploadedBy"> · {{ att.uploadedBy.name }}</template>
            </span>
          </span>
        </button>
        <button
          v-if="canEdit"
          type="button"
          class="files__row-kill press"
          :aria-label="`Remover ${att.filename}`"
          @click="pendingDelete = att"
        >
          <Trash2 :size="14" />
        </button>
      </li>
    </ul>

    <AttachmentViewer
      v-if="viewerIndex !== null"
      :items="items"
      :start-index="viewerIndex"
      @close="viewerIndex = null"
    />

    <ConfirmDialog
      v-if="pendingDelete"
      :model-value="true"
      danger
      title="Remover arquivo"
      :message="`O arquivo ${pendingDelete.filename} será apagado. Isso não pode ser desfeito.`"
      confirm-label="Remover"
      :loading="deleting"
      @confirm="confirmDelete"
      @update:model-value="onDeleteDialog"
    />
  </section>
</template>

<style scoped>
.files {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.files__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.files__title {
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

.files__count {
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

.files__toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.files__toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.files__toggle-btn--on {
  background: var(--surface);
  color: var(--text);
}

.files__toggle-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.files__drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 14px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.files__drop--over {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.files__drop strong {
  color: var(--text-2);
  font-weight: 600;
}

.files__hint {
  font-size: 11px;
  color: var(--text-4);
}

/* O input cobre a área toda: clique e foco por teclado caem nele, sem
   precisar de handler de clique nem de tabindex artificial. */
.files__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.files__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  opacity: 0.01;
}

.files__uploading {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.files__up {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  color: var(--text-2);
}

.files__up-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files__up-pct {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.files__bar {
  grid-column: 1 / -1;
  height: 3px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.files__bar-fill {
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-fast) linear;
}

.files__empty {
  margin: 0;
  color: var(--text-4);
  font-size: 12px;
}

.files__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
}

.files__cell {
  position: relative;
}

.files__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 10px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-2);
  cursor: pointer;
  overflow: hidden;
}

.files__card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.files__thumb {
  width: 100%;
  height: 66px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
}

.files__glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 66px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-3);
}

.files__card-name {
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.files__card-meta {
  font-size: 10px;
  color: var(--text-4);
}

.files__kill {
  position: absolute;
  top: 5px;
  right: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.files__cell:hover .files__kill,
.files__kill:focus-visible {
  opacity: 1;
}

.files__kill:hover {
  color: var(--err);
  border-color: var(--err);
}

.files__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.files__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.files__row-main {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 7px 9px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.files__row-main:hover {
  background: var(--surface-2);
  border-color: var(--border);
}

.files__row-main:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.files__row-thumb {
  width: 30px;
  height: 30px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex: none;
}

.files__row-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-3);
  flex: none;
}

.files__row-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.files__row-name {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files__row-meta {
  color: var(--text-4);
  font-size: 11px;
}

.files__row-kill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
  flex: none;
}

.files__row-kill:hover {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

.spin {
  animation: files-spin 0.9s linear infinite;
}

@keyframes files-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
  .files__drop,
  .files__kill,
  .files__bar-fill {
    transition: none;
  }
}
</style>
