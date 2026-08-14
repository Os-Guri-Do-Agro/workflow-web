<script setup lang="ts">
/**
 * Fila de upload do Drive (padrão do `TaskAttachments`): um request por
 * arquivo, em paralelo — progresso individual e falha isolada. Falha fica na
 * fila com "Tentar de novo"; sucesso some sozinho depois de um instante.
 *
 * O componente envolve a área de conteúdo (slot) e vira alvo de drag&drop
 * inteiro; também expõe `open()` para o botão "Enviar" da toolbar abrir o
 * seletor nativo.
 */
import { computed, ref } from 'vue'
import { CloudUpload, RotateCcw, X } from 'lucide-vue-next'
import { getApiErrorMessage } from '@/service/api'
import { usePasteFiles } from '@/composables/usePasteFiles'
import { formatBytes } from '@/utils/file-kind'
import type { UploadQueueItem } from '@/features/drive/types'

const props = withDefaults(
  defineProps<{
    /** Executa o upload de UM arquivo, reportando progresso 0..100. */
    uploader: (file: File, onProgress: (percent: number) => void) => Promise<unknown>
    disabled?: boolean
    /** Limite exibido/checado no cliente (o servidor é a regra). */
    maxBytes?: number
  }>(),
  { disabled: false, maxBytes: 25 * 1024 * 1024 },
)

const emit = defineEmits<{ uploaded: [] }>()

const inputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(0)
const queue = ref<UploadQueueItem[]>([])
let nextKey = 0

function open() {
  if (!props.disabled) inputRef.value?.click()
}

defineExpose({ open })

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void addFiles(input.files)
  // Reset: escolher o MESMO arquivo de novo precisa disparar change de novo.
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = 0
  if (props.disabled) return
  if (event.dataTransfer?.files?.length) void addFiles(event.dataTransfer.files)
}

/**
 * Quantos sobem ao mesmo tempo. Soltar 30 arquivos disparando 30 requisições
 * juntas divide a banda entre todas, faz cada barra andar em soluços e ainda
 * enfileira no navegador (que limita conexões por host de qualquer jeito).
 * Com uma janela pequena, os primeiros TERMINAM cedo e o usuário vê progresso
 * real em vez de trinta barras paradas em 40%.
 */
const UPLOAD_CONCURRENCY = 3

async function addFiles(list: FileList | File[]) {
  const files = Array.from(list)
  if (files.length === 0) return

  // Todos entram na fila JÁ, para a tela mostrar o lote inteiro na hora; a
  // janela de concorrência controla só quem está subindo.
  const pending = files.map((file) => enqueue(file))

  let cursor = 0
  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, pending.length) },
    async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++]!
        await uploadOne(item.file, item)
      }
    },
  )
  await Promise.all(workers)

  // Um emit por LOTE, não por arquivo: soltar 20 arquivos gera uma onda de
  // invalidação/refetch no pai, não vinte.
  emit('uploaded')
}

/** Cria o item da fila (visível imediatamente, ainda sem subir). */
function enqueue(file: File): UploadQueueItem {
  const item: UploadQueueItem = {
    key: `u${nextKey++}`,
    name: file.name,
    size: file.size,
    percent: 0,
    error: null,
    file,
    waiting: true,
  }
  queue.value = [...queue.value, item]
  return item
}

async function uploadOne(file: File, existing?: UploadQueueItem) {
  const item: UploadQueueItem = existing ?? enqueue(file)
  item.error = null
  item.percent = 0
  item.waiting = false
  queue.value = [...queue.value]

  // Recusa local do óbvio, economizando o request. Conveniência: a regra de
  // verdade (e a env que a configura) mora no servidor.
  if (file.size > props.maxBytes) {
    item.error = `O arquivo deve ter menos de ${formatBytes(props.maxBytes)}`
    queue.value = [...queue.value]
    return
  }

  try {
    await props.uploader(file, (percent) => {
      item.percent = percent
      queue.value = [...queue.value]
    })
    item.percent = 100
    queue.value = [...queue.value]
    // Sucesso sai da fila sozinho; erro fica até o usuário decidir.
    window.setTimeout(() => {
      queue.value = queue.value.filter((q) => q.key !== item.key)
    }, 1600)
  } catch (error) {
    item.error = getApiErrorMessage(error, 'Falha no envio. Tente novamente.')
    queue.value = [...queue.value]
  }
}

function retry(item: UploadQueueItem) {
  void uploadOne(item.file, item).then(() => {
    if (!item.error) emit('uploaded')
  })
}

function dismiss(item: UploadQueueItem) {
  queue.value = queue.value.filter((q) => q.key !== item.key)
}

// Ctrl+V com um print na área de transferência sobe direto para a pasta atual,
// sem passar pelo Paint para virar arquivo antes.
usePasteFiles(
  (files) => void addFiles(files),
  { enabled: computed(() => !props.disabled) },
)

/** "3 de 12 enviados" só aparece quando o lote é grande o bastante para importar. */
const queueSummary = computed(() => {
  const total = queue.value.length
  if (total < 2) return ''
  const done = queue.value.filter((q) => !q.error && q.percent === 100).length
  const failed = queue.value.filter((q) => q.error).length
  const base = `${done} de ${total} enviados`
  return failed > 0 ? `${base} · ${failed} com erro` : base
})
</script>

<template>
  <div
    class="dz"
    @dragenter.prevent="dragging++"
    @dragleave.prevent="dragging = Math.max(0, dragging - 1)"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <input
      ref="inputRef"
      type="file"
      multiple
      class="dz-input"
      aria-label="Enviar arquivos para o Drive"
      :disabled="disabled"
      @change="onPick"
    />

    <slot />

    <!-- Véu de drop: só enquanto arrasta por cima -->
    <div v-if="dragging > 0 && !disabled" class="dz-veil" aria-hidden="true">
      <div class="dz-veil-card">
        <CloudUpload :size="28" />
        <p>Solte para enviar</p>
      </div>
    </div>

    <!-- Fila flutuante -->
    <div v-if="queue.length" class="dz-queue" role="status" aria-live="polite">
      <p v-if="queueSummary" class="dz-queue-head">{{ queueSummary }}</p>

      <div v-for="item in queue" :key="item.key" class="dz-item">
        <div class="dz-item-top">
          <span class="dz-item-name" :title="item.name">{{ item.name }}</span>
          <template v-if="item.error">
            <button
              type="button"
              class="dz-item-btn press"
              :aria-label="`Tentar enviar ${item.name} de novo`"
              title="Tentar de novo"
              @click="retry(item)"
            >
              <RotateCcw :size="12" />
            </button>
            <button
              type="button"
              class="dz-item-btn press"
              :aria-label="`Remover ${item.name} da fila`"
              title="Remover"
              @click="dismiss(item)"
            >
              <X :size="12" />
            </button>
          </template>
          <span v-else-if="item.waiting" class="dz-item-wait">na fila</span>
          <span v-else class="dz-item-pct">{{ item.percent }}%</span>
        </div>
        <p v-if="item.error" class="dz-item-err">{{ item.error }}</p>
        <div v-else class="dz-bar" :class="{ 'dz-bar--waiting': item.waiting }">
          <div class="dz-bar-fill" :style="{ width: `${item.percent}%` }" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dz {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.dz-input {
  display: none;
}

.dz-veil {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  border: 2px dashed var(--accent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  pointer-events: none;
}

.dz-veil-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}

.dz-veil-card p {
  margin: 0;
}

.dz-queue {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2500;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 280px;
}

.dz-item {
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.dz-item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dz-item-name {
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dz-queue-head {
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
}

.dz-item-wait {
  flex: none;
  color: var(--text-4);
  font-size: 10.5px;
}

/* Item que ainda não teve vez: trilho sem barra, para não parecer travado. */
.dz-bar--waiting {
  opacity: 0.45;
}

.dz-item-pct {
  flex: none;
  color: var(--text-3);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dz-item-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.dz-item-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dz-item-err {
  margin: 6px 0 0;
  color: var(--err);
  font-size: 11px;
}

.dz-bar {
  margin-top: 8px;
  height: 4px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.dz-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width var(--motion-fast) var(--motion-ease);
}
</style>
