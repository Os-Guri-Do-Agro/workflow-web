<script setup lang="ts">
/**
 * Subir nova versão: os arquivos entram na fila global da ala (bandeja
 * "Envios"), sobem direto para o storage e ficam "soltos" no card até a versão
 * fechar. Aqui a pessoa põe na ordem do carrossel, escreve a nota e fecha a
 * V(n+1).
 *
 * Fechar o diálogo no meio do envio NÃO cancela: a fila segue e os arquivos
 * voltam aqui ao reabrir (a ordem e a nota moram em `version-drafts.ts`). E
 * "Fechar a V(n) ao terminar" fecha a versão sozinho quando o último arquivo
 * ficar pronto, mesmo com o diálogo fechado ou a pessoa em outra tela.
 *
 * Entradas: escolher arquivos, soltar na janela inteira, Ctrl+V de imagem (com
 * o foco fora da nota) e, no celular, "Tirar foto" e "Galeria".
 */
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { ArrowDown, ArrowUp, FileText, Film, LibraryBig, Loader2, RotateCw, Trash2, Upload, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  createVersion,
  deleteCardAsset,
  type MarketingCardDetail,
} from '@/service/marketing/marketing-cards'
import { getUploadLimits } from '@/service/marketing/marketing-core'
import { createVersionFromLibrary } from '@/service/marketing/marketing-library'
import LibraryPickerDialog from '../../library/LibraryPickerDialog.vue'
import { formatBytes } from '../../marketing-labels'
import { cardKeys, displayUrl, isVideoMime, isViewableImage } from '../approvals-meta'
import { useFileDrop, usePasteFiles, filesFromInput } from '../../uploads/file-sources'
import UploadSourceButtons from '../../uploads/UploadSourceButtons.vue'
import { useUploadQueue, type UploadEntry, type UploadItem } from '../../uploads/upload-queue'
import { cardVersionTarget } from '../../uploads/upload-targets'
import { itemPercent, itemStatusText } from '../../uploads/upload-format'
import {
  clearDraft,
  getDraft,
  onVersionCreated,
  scheduleVersion,
  syncDraft,
  unscheduleVersion,
} from '../../uploads/version-drafts'

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
  detail: string
  thumb: string | null
  item: UploadItem | null
  assetId: string | null
}

const queue = useUploadQueue()
const qc = useQueryClient()
const toast = useToast()
const saving = ref(false)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)
const maxMb = ref<number | null>(null)

// O rascunho vive no módulo (sobrevive a esta janela); aqui só a referência.
const draft = shallowRef(getDraft(props.groupId, props.card.id, props.card.title))
const refreshDraft = () => (draft.value = getDraft(props.groupId, props.card.id, props.card.title))
watch(() => [props.groupId, props.card.id] as const, refreshDraft)
const nextNumber = computed(() => Math.max(0, ...props.card.versions.map((v) => v.number)) + 1)
const hasCaption = computed(() => Object.values(props.card.captions ?? {}).some((t) => !!t?.trim()))

void getUploadLimits(props.groupId)
  .then((l) => (maxMb.value = l?.maxMb ?? null))
  .catch(() => {})

// Concilia a ordem do rascunho com o card (arquivos soltos) e a fila, ao abrir
// e sempre que o card muda com a janela aberta (tempo real, outra aba).
watch(
  () => [props.modelValue, props.card] as const,
  ([open]) => {
    if (!open) return
    refreshDraft()
    syncDraft(draft.value, props.card)
  },
  { immediate: true },
)
watch(
  () => props.modelValue,
  (open) => {
    if (open) error.value = ''
  },
)

const entries = computed<Entry[]>(() => {
  const staged = new Map(props.card.stagedAssets.map((a) => [a.id, a]))
  const out: Entry[] = []
  for (const key of draft.value.order) {
    if (key.startsWith('a:')) {
      const id = key.slice(2)
      const a = staged.get(id)
      const local = draft.value.assets[id]
      if (!a && !local) continue
      out.push({
        key,
        name: a?.name ?? local!.name,
        size: a?.size ?? local!.size,
        mimeType: a?.mimeType ?? local!.mimeType,
        status: 'ready',
        progress: 100,
        detail: formatBytes(a?.size ?? local!.size),
        thumb: a ? (isViewableImage(a) ? displayUrl(a) : null) : (local?.thumb ?? null),
        item: null,
        assetId: id,
      })
      continue
    }
    const item = queue.find(key.slice(2))
    if (!item || item.status === 'canceled') continue
    out.push({
      key,
      name: item.name,
      size: item.size,
      mimeType: item.mimeType,
      status: item.status === 'error' ? 'error' : item.status === 'done' ? 'ready' : 'uploading',
      progress: itemPercent(item),
      detail: item.status === 'done' ? formatBytes(item.size) : itemStatusText(item),
      thumb: item.thumbUrl,
      item,
      assetId: item.asset?.status === 'READY' ? item.asset.id : null,
    })
  }
  return out
})

const uploading = computed(() => entries.value.some((e) => e.status === 'uploading'))
const errored = computed(() => entries.value.filter((e) => e.status === 'error').length)
const canSubmit = computed(
  () =>
    !saving.value &&
    // a versão já está sendo fechada sozinha (o último arquivo acabou de subir)
    draft.value.state !== 'creating' &&
    !errored.value &&
    (entries.value.length > 0 || hasCaption.value),
)

function add(list: UploadEntry[]) {
  if (!list.length) return
  error.value = ''
  const batch = queue.enqueue(
    props.groupId,
    list.map((e) => ({ file: e.file })),
    cardVersionTarget(props.groupId, props.card.id, props.card.title),
  )
  for (const item of batch.items) draft.value.order.push(`q:${item.id}`)
  if (batch.rejected.length) toast.error(batch.rejected[0]!.reason)
}

function pickFiles() {
  input.value?.click()
}

function onInput(e: Event) {
  add(filesFromInput(e))
}

const drop = useFileDrop({ enabled: () => props.modelValue && !saving.value, onFiles: add })
usePasteFiles({ enabled: () => props.modelValue && !saving.value, onFiles: add, priority: 10 })

function move(index: number, delta: number) {
  const list = entries.value
  const to = index + delta
  if (to < 0 || to >= list.length) return
  const order = draft.value.order
  const a = order.indexOf(list[index]!.key)
  const b = order.indexOf(list[to]!.key)
  if (a < 0 || b < 0) return
  ;[order[a], order[b]] = [order[b]!, order[a]!]
}

async function remove(entry: Entry) {
  if (entry.item && entry.status !== 'ready') {
    // na fila, subindo ou com erro: cancela (o envio pendente some da API também)
    queue.cancel(entry.item.id)
    return
  }
  if (!entry.assetId) return
  try {
    await deleteCardAsset(props.groupId, props.card.id, entry.assetId)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para tirar o arquivo.')
    return
  }
  const order = draft.value.order
  const at = order.indexOf(entry.key)
  if (at >= 0) order.splice(at, 1)
  delete draft.value.assets[entry.assetId]
  void qc.invalidateQueries({ queryKey: cardKeys.detail(props.groupId, props.card.id) })
}

function close() {
  if (saving.value) return
  emit('update:modelValue', false)
}

// "Escolher do acervo" (R1): a versão nasce de itens do Acervo, por cópia no
// storage (mesmo sha256), pelo mesmo caminho do upload (volta para Aguardando,
// avisa e move a tarefa ligada). Não mistura com arquivos enviados aqui: a API
// cria a versão só com os itens escolhidos.
const pickerOpen = ref(false)
const picking = ref(false)
const pickError = ref('')
async function onPicked(itemIds: string[]) {
  if (!itemIds.length || picking.value) return
  picking.value = true
  pickError.value = ''
  try {
    const card = await createVersionFromLibrary(props.groupId, props.card.id, {
      itemIds,
      note: draft.value.note.trim() || undefined,
    })
    draft.value.note = ''
    pickerOpen.value = false
    emit('done', card)
    emit('update:modelValue', false)
  } catch (err) {
    pickError.value = getApiErrorMessage(err, 'Não deu para criar a versão com os itens do acervo.')
  } finally {
    picking.value = false
  }
}

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  if (uploading.value) {
    // Fecha a versão sozinho quando o último arquivo subir; a janela pode fechar já.
    // Sem toast: a bandeja já mostra a linha "A versão fecha quando..." (o toast
    // caía em cima dela, no mesmo canto).
    scheduleVersion(draft.value, { hasCaption: hasCaption.value, status: props.card.status })
    emit('update:modelValue', false)
    return
  }
  saving.value = true
  try {
    const card = await createVersion(
      props.groupId,
      props.card.id,
      entries.value.map((e) => e.assetId!).filter(Boolean),
      draft.value.note.trim() || null,
    )
    clearDraft(draft.value)
    refreshDraft()
    emit('done', card)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para fechar a versão.')
  } finally {
    saving.value = false
  }
}

// Versão fechada sozinha com o card aberto: a tela recebe como se fosse o botão
// (seleciona a versão nova e mostra o aviso dela, sem toast duplicado).
const stopCreated = onVersionCreated((detail, d) => {
  if (d.cardId !== props.card.id || d.groupId !== props.groupId) return
  refreshDraft()
  emit('done', detail)
  return true
})
onBeforeUnmount(stopCreated)
</script>

<template>
  <AppDialog :model-value="modelValue" :label="`Subir a V${nextNumber}`" size="lg" :loading="saving" persistent @update:model-value="close">
    <div class="mkup" :class="{ 'is-over': drop.isOver.value }" v-on="drop.on">
      <header class="mkup__head">
        <span class="mkup__icon" aria-hidden="true"><Upload :size="16" /></span>
        <h2 class="mkup__title">Subir a V{{ nextNumber }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close"><X :size="16" /></button>
      </header>

      <div class="mkup__body">
        <div
          class="mkup__drop"
          :class="{ 'is-over': drop.isOver.value }"
          role="button"
          tabindex="0"
          aria-label="Escolher arquivos ou soltar aqui"
          @click="pickFiles"
          @keydown.enter.prevent="pickFiles"
          @keydown.space.prevent="pickFiles"
        >
          <Upload :size="18" aria-hidden="true" />
          <span><strong>Escolha os arquivos</strong>, solte aqui ou cole com Ctrl+V</span>
          <span class="mkup__hint">
            Imagem, vídeo ou PDF{{ maxMb ? `, até ${maxMb} MB por arquivo` : '' }}. O original sobe sem compressão.
          </span>
          <input ref="input" type="file" name="files" multiple class="mkup__input" @change="onInput" />
        </div>
        <div class="mkup__sources">
          <UploadSourceButtons accept="image/*,video/*,application/pdf" @files="add" />
          <button
            type="button"
            class="mk-btn"
            data-action="pick-from-library"
            :disabled="saving || entries.length > 0"
            :title="entries.length ? 'A versão do acervo nasce só com os itens escolhidos. Tire os arquivos enviados aqui para usar o acervo.' : undefined"
            @click="pickerOpen = true"
          >
            <LibraryBig :size="14" aria-hidden="true" /> Escolher do acervo
          </button>
        </div>

        <p v-if="draft.scheduled" class="mkup__banner" role="status">
          A V{{ nextNumber }} fecha sozinha quando o envio terminar.
          <button type="button" class="mkup__link" @click="unscheduleVersion(draft)">Não fechar sozinha</button>
        </p>

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
              <span v-if="e.status === 'error'" class="mk-error">{{ e.detail }}</span>
              <template v-else-if="e.status === 'uploading'">
                <span class="mkup__progress" role="progressbar" :aria-valuenow="e.progress" aria-valuemin="0" aria-valuemax="100" :aria-label="`Enviando ${e.name}`">
                  <span :style="{ width: `${e.progress}%` }" />
                </span>
                <span class="mkup__size">{{ e.detail }}</span>
              </template>
              <span v-else class="mkup__size">{{ e.detail }}</span>
            </span>
            <span class="mkup__acts">
              <button
                v-if="e.status === 'error' && e.item"
                type="button"
                class="mk-icon-btn"
                :aria-label="`Tentar de novo ${e.name}`"
                @click="queue.retry(e.item.id)"
              >
                <RotateCw :size="14" />
              </button>
              <button type="button" class="mk-icon-btn" :disabled="i === 0" :aria-label="`Subir ${e.name} na ordem`" @click="move(i, -1)">
                <ArrowUp :size="14" />
              </button>
              <button type="button" class="mk-icon-btn" :disabled="i === entries.length - 1" :aria-label="`Descer ${e.name} na ordem`" @click="move(i, 1)">
                <ArrowDown :size="14" />
              </button>
              <button
                type="button"
                class="mk-icon-btn"
                :aria-label="e.status === 'ready' ? `Tirar ${e.name}` : `Cancelar o envio de ${e.name}`"
                @click="remove(e)"
              >
                <Trash2 v-if="e.status === 'ready'" :size="14" />
                <X v-else :size="14" />
              </button>
            </span>
          </li>
        </ol>
        <p v-else-if="hasCaption" class="mk-hint">Sem arquivo, a V{{ nextNumber }} vale como post só de texto (a legenda do card).</p>

        <label class="mk-field">
          <span class="mk-label">Nota da versão</span>
          <textarea v-model="draft.note" class="mk-textarea" rows="2" maxlength="2000" name="note" placeholder="O que mudou desde a anterior" />
        </label>

        <p v-if="errored" class="mk-error" role="alert">
          {{ errored === 1 ? 'Um arquivo não subiu' : `${errored} arquivos não subiram` }}: tente de novo ou tire da lista para fechar a versão.
        </p>
        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>

      <footer class="mkup__foot">
        <span v-if="uploading" class="mkup__foot-hint">Pode fechar a janela: o envio continua em Envios.</span>
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">{{ uploading ? 'Fechar janela' : 'Cancelar' }}</button>
        <button type="button" class="mk-btn mk-btn--primary" :disabled="!canSubmit" data-action="close-version" @click="submit">
          <Loader2 v-if="saving" :size="14" class="mkup__spin" aria-hidden="true" />
          {{ saving ? 'Fechando...' : uploading ? `Fechar a V${nextNumber} ao terminar` : `Fechar a V${nextNumber}` }}
        </button>
      </footer>

      <div v-if="drop.isOver.value" class="mkup__overlay" aria-hidden="true">
        <Upload :size="22" />
        Solte para subir na V{{ nextNumber }}
      </div>
    </div>
  </AppDialog>
  <LibraryPickerDialog
    v-if="card.companyId"
    v-model="pickerOpen"
    :group-id="groupId"
    :company-id="card.companyId"
    :loading="picking"
    :error="pickError"
    :confirm-label="`Criar a V${nextNumber}`"
    @picked="onPicked"
  />
</template>

<style scoped>
.mkup {
  position: relative;
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

.mkup__sources {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
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

.mkup__banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--text);
  font-size: 12.5px;
}

.mkup__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-ink, var(--accent));
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
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
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.mkup__foot-hint {
  flex: 1;
  min-width: 160px;
  font-size: 12px;
  color: var(--text-3);
}

.mkup__overlay {
  position: absolute;
  inset: 6px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-soft) 88%, transparent);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
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
