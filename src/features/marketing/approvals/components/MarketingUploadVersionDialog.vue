<script setup lang="ts">
/**
 * Subir nova versão: soltar os arquivos (sobem direto para o storage, um por
 * vez, com progresso por arquivo), pôr na ordem do carrossel, escrever a nota e
 * fechar a V(n+1). Os arquivos que sobem ficam "soltos" no card até a versão
 * fechar, então fechar o diálogo no meio não perde nada: eles voltam aqui.
 */
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, FileText, Film, Loader2, Trash2, Upload, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { getApiErrorMessage } from '@/service/api'
import {
  createVersion,
  deleteCardAsset,
  uploadCardFile,
  type MarketingCardAsset,
  type MarketingCardDetail,
} from '@/service/marketing/marketing-cards'
import type { MarketingAsset } from '@/service/marketing/marketing-core'
import { formatBytes } from '../../marketing-labels'
import { displayUrl, isVideoMime, isViewableImage } from '../approvals-meta'

const props = defineProps<{
  modelValue: boolean
  groupId: string
  card: MarketingCardDetail
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  done: [card: MarketingCardDetail]
}>()

interface Entry {
  key: string
  name: string
  size: number
  mimeType: string
  status: 'uploading' | 'ready' | 'error'
  progress: number
  error?: string
  asset?: MarketingAsset | MarketingCardAsset
  /** Miniatura local (arquivo novo) ou URL assinada (arquivo solto que já estava) */
  thumb?: string | null
}

const entries = ref<Entry[]>([])
const note = ref('')
const saving = ref(false)
const error = ref('')
const dragOver = ref(false)
const input = ref<HTMLInputElement | null>(null)
let seq = 0

const nextNumber = computed(() => Math.max(0, ...props.card.versions.map((v) => v.number)) + 1)
const hasCaption = computed(() => Object.values(props.card.captions ?? {}).some((t) => !!t?.trim()))
const uploading = computed(() => entries.value.some((e) => e.status === 'uploading'))
const ready = computed(() => entries.value.filter((e) => e.status === 'ready' && e.asset))
const canSubmit = computed(() => !saving.value && !uploading.value && (ready.value.length > 0 || hasCaption.value))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    error.value = ''
    note.value = ''
    // Arquivos soltos que já estavam no card (subidos antes e não fechados).
    const known = new Set(entries.value.map((e) => e.asset?.id).filter(Boolean))
    for (const a of props.card.stagedAssets) {
      if (known.has(a.id)) continue
      entries.value.push({
        key: `s${++seq}`,
        name: a.name,
        size: a.size,
        mimeType: a.mimeType,
        status: 'ready',
        progress: 100,
        asset: a,
        thumb: isViewableImage(a) ? displayUrl(a) : null,
      })
    }
    // O que já entrou numa versão (por outra aba ou outra pessoa) sai da lista.
    const inVersion = new Set(props.card.versions.flatMap((v) => v.assets.map((a) => a.id)))
    entries.value = entries.value.filter((e) => !e.asset || !inVersion.has(e.asset.id))
  },
  { immediate: true },
)

function pickFiles() {
  input.value?.click()
}

function onInput(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  void addFiles(files)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const files = [...(e.dataTransfer?.files ?? [])]
  void addFiles(files)
}

/** Sobe em série: vídeo grande não disputa banda com a arte ao lado. */
async function addFiles(files: File[]) {
  const added: Array<{ entry: Entry; file: File }> = []
  for (const file of files) {
    const entry: Entry = {
      key: `n${++seq}`,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      status: 'uploading',
      progress: 0,
      thumb: file.type.startsWith('image/') && !/tiff|heic|heif/i.test(file.type) ? URL.createObjectURL(file) : null,
    }
    entries.value.push(entry)
    added.push({ entry: entries.value[entries.value.length - 1]!, file })
  }
  for (const { entry, file } of added) {
    try {
      const asset = await uploadCardFile(props.groupId, props.card.id, file, (p) => {
        entry.progress = p
      })
      entry.asset = asset
      entry.status = 'ready'
      entry.progress = 100
    } catch (err) {
      entry.status = 'error'
      entry.error = getApiErrorMessage(err, 'Não deu para subir este arquivo.')
    }
  }
}

function move(index: number, delta: number) {
  const list = [...entries.value]
  const to = index + delta
  if (to < 0 || to >= list.length) return
  ;[list[index], list[to]] = [list[to]!, list[index]!]
  entries.value = list
}

async function remove(entry: Entry) {
  if (entry.status === 'uploading') return
  if (entry.asset) {
    try {
      await deleteCardAsset(props.groupId, props.card.id, entry.asset.id)
    } catch (err) {
      error.value = getApiErrorMessage(err, 'Não deu para tirar o arquivo.')
      return
    }
  }
  if (entry.thumb?.startsWith('blob:')) URL.revokeObjectURL(entry.thumb)
  entries.value = entries.value.filter((e) => e !== entry)
}

function close() {
  if (saving.value) return
  emit('update:modelValue', false)
}

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = ''
  try {
    const card = await createVersion(
      props.groupId,
      props.card.id,
      ready.value.map((e) => e.asset!.id),
      note.value.trim() || null,
    )
    for (const e of entries.value) if (e.thumb?.startsWith('blob:')) URL.revokeObjectURL(e.thumb)
    entries.value = []
    emit('done', card)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para fechar a versão.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog :model-value="modelValue" :label="`Subir a V${nextNumber}`" size="lg" :loading="saving" persistent @update:model-value="close">
    <div class="mkup">
      <header class="mkup__head">
        <span class="mkup__icon" aria-hidden="true"><Upload :size="16" /></span>
        <h2 class="mkup__title">Subir a V{{ nextNumber }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close"><X :size="16" /></button>
      </header>

      <div class="mkup__body">
        <div
          class="mkup__drop"
          :class="{ 'is-over': dragOver }"
          role="button"
          tabindex="0"
          aria-label="Escolher arquivos ou soltar aqui"
          @click="pickFiles"
          @keydown.enter.prevent="pickFiles"
          @keydown.space.prevent="pickFiles"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <Upload :size="18" aria-hidden="true" />
          <span><strong>Escolha os arquivos</strong> ou solte aqui</span>
          <span class="mkup__hint">Imagem, vídeo ou PDF. O original sobe sem compressão.</span>
          <input ref="input" type="file" name="files" multiple class="mkup__input" @change="onInput" />
        </div>

        <ol v-if="entries.length" class="mkup__list" aria-label="Arquivos da versão, na ordem">
          <li v-for="(e, i) in entries" :key="e.key" class="mkup__item" :data-entry="e.status">
            <span class="mkup__n">{{ i + 1 }}</span>
            <span class="mkup__thumb" aria-hidden="true">
              <img v-if="e.thumb" :src="e.thumb" alt="" />
              <Film v-else-if="isVideoMime(e.mimeType)" :size="16" />
              <FileText v-else :size="16" />
            </span>
            <span class="mkup__info">
              <span class="mkup__name" :title="e.name">{{ e.name }}</span>
              <span v-if="e.status === 'error'" class="mk-error">{{ e.error }}</span>
              <span v-else-if="e.status === 'uploading'" class="mkup__progress" role="progressbar" :aria-valuenow="e.progress" aria-valuemin="0" aria-valuemax="100" :aria-label="`Enviando ${e.name}`">
                <span :style="{ width: `${e.progress}%` }" />
              </span>
              <span v-else class="mkup__size">{{ formatBytes(e.size) }}</span>
            </span>
            <span class="mkup__acts">
              <button type="button" class="mk-icon-btn" :disabled="i === 0" :aria-label="`Subir ${e.name} na ordem`" @click="move(i, -1)">
                <ArrowUp :size="14" />
              </button>
              <button type="button" class="mk-icon-btn" :disabled="i === entries.length - 1" :aria-label="`Descer ${e.name} na ordem`" @click="move(i, 1)">
                <ArrowDown :size="14" />
              </button>
              <button type="button" class="mk-icon-btn" :disabled="e.status === 'uploading'" :aria-label="`Tirar ${e.name}`" @click="remove(e)">
                <Trash2 :size="14" />
              </button>
            </span>
          </li>
        </ol>
        <p v-else-if="hasCaption" class="mk-hint">Sem arquivo, a V{{ nextNumber }} vale como post só de texto (a legenda do card).</p>

        <label class="mk-field">
          <span class="mk-label">Nota da versão</span>
          <textarea v-model="note" class="mk-textarea" rows="2" maxlength="2000" name="note" placeholder="O que mudou desde a anterior" />
        </label>

        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>

      <footer class="mkup__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
        <button type="button" class="mk-btn mk-btn--primary" :disabled="!canSubmit" data-action="close-version" @click="submit">
          <Loader2 v-if="saving || uploading" :size="14" class="mkup__spin" aria-hidden="true" />
          {{ uploading ? 'Enviando...' : `Fechar a V${nextNumber}` }}
        </button>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.mkup {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mkup__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
}

.mkup__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkup__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.mkup__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
  overflow-y: auto;
}

.mkup__drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}

.mkup__drop.is-over,
.mkup__drop:focus-visible {
  border-color: var(--accent);
  background: var(--accent-soft);
  outline: none;
}

.mkup__hint {
  font-size: 12px;
  color: var(--text-3);
}

.mkup__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.mkup__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.mkup__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 6px 10px;
}

.mkup__item + .mkup__item {
  border-top: 1px solid var(--border);
}

.mkup__n {
  width: 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.mkup__thumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  overflow: hidden;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--text-3);
}

.mkup__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mkup__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mkup__name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkup__size {
  font-size: 12px;
  color: var(--text-3);
}

.mkup__progress {
  display: block;
  height: 4px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.mkup__progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-fast) linear;
}

.mkup__acts {
  display: flex;
  gap: 2px;
}

.mkup__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.mkup__spin {
  animation: mkup-spin 0.8s linear infinite;
}

@keyframes mkup-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
