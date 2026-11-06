<script setup lang="ts">
/**
 * Visualizador de UMA versão do card (M1-A).
 *
 * - Imagem: os comentários com ponto viram pinos numerados no lugar (x e y de
 *   0 a 1 sobre a imagem desenhada). Clicar na imagem marca um ponto novo; no
 *   celular o toque pede confirmação antes (dedo erra, e o pino errado vira
 *   comentário no lugar errado).
 * - Vídeo: marcas na linha do tempo nos segundos comentados e "Comentar neste
 *   minuto". `seek(t)` (exposto) pula o vídeo: é o que o clique no comentário
 *   chama.
 * - Carrossel: miniaturas embaixo. PDF e o resto: cartão com "Abrir" no
 *   `FileViewer` e "Baixar original".
 * - Arquivo com prévia RGB (CMYK, TIFF, HEIC): mostra a prévia e o aviso de que
 *   o original segue intacto.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Download, Expand, FileText, Film, FolderInput, MapPin, MessageSquarePlus } from 'lucide-vue-next'
import FileViewer, { type ViewerFile } from '@/components/ui/FileViewer.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { getAssetDownload } from '@/service/marketing/marketing-core'
import type { MarketingCardAsset, MarketingCardComment, MarketingCardVersion } from '@/service/marketing/marketing-cards'
import { formatBytes } from '../../marketing-labels'
import { displayUrl, formatSeconds, isVideoMime, isViewableImage } from '../approvals-meta'
import SendToLibraryDialog from '../../library/SendToLibraryDialog.vue'

export interface DraftAnchor {
  versionId: string
  assetId: string
  anchorX?: number
  anchorY?: number
  anchorTime?: number
}

const props = defineProps<{
  groupId: string
  version: MarketingCardVersion
  comments: MarketingCardComment[]
  canComment: boolean
  phone: boolean
  draft: DraftAnchor | null
  highlightId: string | null
  /** Só a imagem e as miniaturas (Comparar): sem pinos, sem comentar. */
  compact?: boolean
  /** Marca do card: destino sugerido do "Mandar para o acervo" (R1). */
  companyId?: string | null
  /** Editor ou acima: mostra "Mandar para o acervo" (a API confere de novo). */
  canSendToLibrary?: boolean
}>()

const emit = defineEmits<{
  draft: [anchor: DraftAnchor]
  'cancel-draft': []
  'select-comment': [id: string]
}>()

const { error: toastError } = useToast()

const index = ref(0)
watch(
  () => props.version.id,
  () => {
    index.value = 0
    confirmPoint.value = null
  },
)
const current = computed<MarketingCardAsset | null>(() => props.version.assets[index.value] ?? props.version.assets[0] ?? null)
const kind = computed(() => {
  const a = current.value
  if (!a) return 'none'
  if (isViewableImage(a)) return 'image'
  if (isVideoMime(a.mimeType)) return 'video'
  return 'file'
})

/** Comentários com ponto/minuto do arquivo à vista, numerados pela ordem. */
const anchored = computed(() =>
  props.comments
    .filter((c) => c.assetId && c.assetId === current.value?.id && (c.anchorX !== null || c.anchorTime !== null))
    .map((c, i) => ({ ...c, n: i + 1 })),
)
const pins = computed(() => anchored.value.filter((c) => c.anchorX !== null && c.anchorY !== null))
const marks = computed(() => anchored.value.filter((c) => c.anchorTime !== null))

/** Arquivos da versão que têm algum comentário (bolinha na miniatura). */
const commentedAssets = computed(() => new Set(props.comments.map((c) => c.assetId).filter(Boolean)))

// ── Imagem: marcar ponto ────────────────────────────────────────────────
const confirmPoint = ref<{ x: number; y: number } | null>(null)

function onImageClick(e: MouseEvent) {
  if (props.compact || !props.canComment || !current.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  const point = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }
  if (props.phone) {
    confirmPoint.value = point
    return
  }
  emit('draft', { versionId: props.version.id, assetId: current.value.id, anchorX: point.x, anchorY: point.y })
}

function confirmDraft() {
  const p = confirmPoint.value
  if (!p || !current.value) return
  confirmPoint.value = null
  emit('draft', { versionId: props.version.id, assetId: current.value.id, anchorX: p.x, anchorY: p.y })
}

const draftPin = computed(() => {
  if (confirmPoint.value) return confirmPoint.value
  const d = props.draft
  if (!d || d.assetId !== current.value?.id || d.anchorX === undefined || d.anchorY === undefined) return null
  return { x: d.anchorX, y: d.anchorY }
})

// ── Vídeo ───────────────────────────────────────────────────────────────
const video = ref<HTMLVideoElement | null>(null)
const duration = ref(0)
const now = ref(0)

watch(current, () => {
  duration.value = current.value?.durationSec ?? 0
  now.value = 0
}, { immediate: true })

function onMeta() {
  if (video.value && Number.isFinite(video.value.duration)) duration.value = video.value.duration
}

function onTime() {
  if (video.value) now.value = video.value.currentTime
}

function commentHere() {
  if (!current.value || !video.value) return
  video.value.pause()
  emit('draft', { versionId: props.version.id, assetId: current.value.id, anchorTime: Math.round(video.value.currentTime * 10) / 10 })
}

async function seek(seconds: number) {
  await nextTick()
  const el = video.value
  if (!el) return
  el.pause()
  el.currentTime = seconds
  now.value = seconds
}

function markLeft(t: number | null) {
  if (!duration.value || t === null) return '0%'
  return `${Math.min(100, (t / duration.value) * 100)}%`
}

/** Mostra o arquivo do comentário clicado (carrossel). */
function showAsset(assetId: string) {
  const i = props.version.assets.findIndex((a) => a.id === assetId)
  if (i >= 0) index.value = i
}

defineExpose({ seek, showAsset })

// ── Abrir e baixar ──────────────────────────────────────────────────────
const viewerOpen = ref(false)
const viewerItems = computed<ViewerFile[]>(() =>
  current.value
    ? [{ filename: current.value.name, mimeType: current.value.hasPreview ? 'image/webp' : current.value.mimeType, size: current.value.size, url: displayUrl(current.value) }]
    : [],
)

const sendOpen = ref(false)
const downloading = ref(false)
async function downloadOriginal() {
  if (!current.value || downloading.value) return
  downloading.value = true
  try {
    const { url, name } = await getAssetDownload(props.groupId, current.value.id)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para baixar o arquivo.'))
  } finally {
    downloading.value = false
  }
}

const previewNotice = computed(() => {
  const a = current.value
  if (!a?.hasPreview) return null
  return a.colorSpace === 'cmyk'
    ? 'Prévia aproximada em RGB; o original em CMYK segue intacto.'
    : 'Prévia gerada para o navegador; o original segue intacto.'
})

const dims = computed(() => {
  const a = current.value
  if (!a) return ''
  const parts = [formatBytes(a.size)]
  if (a.width && a.height) parts.push(`${a.width} x ${a.height}`)
  if (a.durationSec) parts.push(formatSeconds(a.durationSec))
  if (a.colorSpace === 'cmyk') parts.push('CMYK')
  return parts.join(' · ')
})
</script>

<template>
  <div class="mkv" :class="{ 'mkv--compact': compact }">
    <div v-if="!current" class="mkv__empty">
      <p v-if="version.assets.length === 0">V{{ version.number }} sem arquivo: post só de texto. A legenda está nos detalhes.</p>
    </div>

    <template v-else>
      <p v-if="previewNotice" class="mkv__notice" data-testid="preview-notice">{{ previewNotice }}</p>
      <div class="mkv__stage" :data-kind="kind">
        <!-- Imagem com pinos -->
        <div v-if="kind === 'image'" class="mkv__imgwrap">
          <img
            :src="displayUrl(current) ?? undefined"
            :alt="current.name"
            class="mkv__img"
            :class="{ 'mkv__img--pick': canComment && !compact }"
            draggable="false"
            data-testid="version-image"
            @click="onImageClick"
          />
          <template v-if="!compact">
            <button
              v-for="p in pins"
              :key="p.id"
              type="button"
              class="mkv__pin"
              :class="{ 'is-resolved': !!p.resolvedAt, 'is-on': highlightId === p.id }"
              :style="{ left: `${(p.anchorX ?? 0) * 100}%`, top: `${(p.anchorY ?? 0) * 100}%` }"
              :data-pin="p.id"
              :aria-label="`Comentário ${p.n}: ${p.body}`"
              @click.stop="emit('select-comment', p.id)"
            >
              {{ p.n }}
            </button>
            <span
              v-if="draftPin"
              class="mkv__pin mkv__pin--draft"
              :style="{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }"
              aria-hidden="true"
            >
              <MapPin :size="12" />
            </span>
          </template>
        </div>

        <!-- Vídeo com marcas -->
        <div v-else-if="kind === 'video'" class="mkv__videowrap">
          <video
            ref="video"
            class="mkv__video"
            :src="current.url ?? undefined"
            controls
            playsinline
            preload="metadata"
            data-testid="version-video"
            @loadedmetadata="onMeta"
            @timeupdate="onTime"
          />
        </div>

        <!-- PDF e outros -->
        <div v-else class="mkv__file">
          <FileText v-if="!isVideoMime(current.mimeType)" :size="34" aria-hidden="true" />
          <Film v-else :size="34" aria-hidden="true" />
          <p class="mkv__file-name">{{ current.name }}</p>
          <button type="button" class="mk-btn" @click="viewerOpen = true">
            <Expand :size="14" aria-hidden="true" /> Abrir
          </button>
        </div>
      </div>

      <div v-if="kind === 'video' && !compact" class="mkv__timeline">
        <div class="mkv__track" aria-label="Comentários na linha do tempo">
          <span class="mkv__now" :style="{ left: markLeft(now) }" aria-hidden="true" />
          <button
            v-for="m in marks"
            :key="m.id"
            type="button"
            class="mkv__mark"
            :class="{ 'is-on': highlightId === m.id, 'is-resolved': !!m.resolvedAt }"
            :style="{ left: markLeft(m.anchorTime) }"
            :data-mark="m.id"
            :aria-label="`Comentário em ${formatSeconds(m.anchorTime)}: ${m.body}`"
            @click="seek(m.anchorTime ?? 0); emit('select-comment', m.id)"
          />
        </div>
        <button v-if="canComment" type="button" class="mk-btn" data-action="comment-at-time" @click="commentHere">
          <MessageSquarePlus :size="14" aria-hidden="true" /> Comentar neste minuto ({{ formatSeconds(now) }})
        </button>
      </div>

      <!-- No celular a imagem pode passar da dobra: a pergunta fica presa embaixo, sempre à vista. -->
      <Teleport to="body">
        <div v-if="confirmPoint" class="mkv__confirm" role="group" aria-label="Confirmar ponto do comentário">
          <span>Comentar neste ponto?</span>
          <button type="button" class="mk-btn mk-btn--ghost" data-action="cancel-point" @click="confirmPoint = null">Cancelar</button>
          <button type="button" class="mk-btn mk-btn--primary" data-action="confirm-point" @click="confirmDraft">Comentar aqui</button>
        </div>
      </Teleport>

      <div v-if="!compact" class="mkv__meta">
        <span class="mkv__meta-name" :title="current.name">{{ current.name }}</span>
        <span class="mkv__meta-dims">{{ dims }}</span>
        <span class="mk-toolbar__spacer" />
        <button
          v-if="canSendToLibrary"
          type="button"
          class="mk-btn mk-btn--ghost"
          data-action="send-to-library"
          @click="sendOpen = true"
        >
          <FolderInput :size="14" aria-hidden="true" /> Mandar para o acervo
        </button>
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="downloading" data-action="download-original" @click="downloadOriginal">
          <Download :size="14" aria-hidden="true" /> Baixar original
        </button>
      </div>
      <SendToLibraryDialog
        v-if="canSendToLibrary && !compact"
        v-model="sendOpen"
        :group-id="groupId"
        :asset-id="current.id"
        :company-id="companyId ?? null"
        :default-title="current.name"
      />

      <div v-if="version.assets.length > 1" class="mkv__thumbs" role="tablist" aria-label="Arquivos da versão">
        <button
          v-for="(a, i) in version.assets"
          :key="a.id"
          type="button"
          role="tab"
          class="mkv__thumb"
          :class="{ 'is-on': i === index }"
          :aria-selected="i === index"
          :aria-label="`Arquivo ${i + 1} de ${version.assets.length}: ${a.name}`"
          @click="index = i"
        >
          <img v-if="isViewableImage(a) && displayUrl(a)" :src="displayUrl(a)!" alt="" loading="lazy" draggable="false" />
          <Film v-else-if="isVideoMime(a.mimeType)" :size="16" aria-hidden="true" />
          <FileText v-else :size="16" aria-hidden="true" />
          <span v-if="commentedAssets.has(a.id) && !compact" class="mkv__thumb-dot" aria-hidden="true" />
        </button>
      </div>
    </template>

    <FileViewer v-if="viewerOpen" :items="viewerItems" :start-index="0" @close="viewerOpen = false" />
  </div>
</template>

<style scoped>
.mkv {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.mkv__empty {
  display: grid;
  place-items: center;
  min-height: 160px;
  padding: 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
}

.mkv__empty p {
  margin: 0;
  max-width: 320px;
}

.mkv__stage {
  display: grid;
  place-items: center;
  min-height: 220px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  overflow: hidden;
}

.mkv__imgwrap {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
}

.mkv__img {
  display: block;
  max-width: 100%;
  max-height: max(280px, calc(100dvh - 440px));
  object-fit: contain;
  border-radius: var(--radius-xs);
  user-select: none;
}

.mkv--compact .mkv__img {
  max-height: max(240px, calc(100dvh - 480px));
}

.mkv__img--pick {
  cursor: crosshair;
}

.mkv__pin {
  position: absolute;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  padding: 0;
  border: 2px solid var(--surface);
  border-radius: 50% 50% 50% 4px;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.mkv__pin.is-resolved {
  background: var(--surface-3);
  color: var(--text-2);
}

.mkv__pin.is-on {
  outline: 3px solid var(--accent-soft);
  outline-offset: 1px;
  transform: scale(1.12);
}

.mkv__pin--draft {
  background: var(--surface);
  color: var(--accent-ink);
  border: 2px dashed var(--accent);
  pointer-events: none;
}

.mkv__videowrap {
  width: 100%;
  display: grid;
  place-items: center;
}

.mkv__video {
  display: block;
  width: 100%;
  max-height: max(260px, calc(100dvh - 480px));
  border-radius: var(--radius-xs);
  background: var(--surface-3);
}

.mkv__file {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-3);
}

.mkv__file-name {
  margin: 0;
  max-width: 320px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  overflow-wrap: anywhere;
}

.mkv__timeline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.mkv__track {
  position: relative;
  flex: 1;
  min-width: 160px;
  height: 22px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
}

.mkv__now {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 2px;
  margin-left: -1px;
  background: var(--text-3);
}

.mkv__mark {
  position: absolute;
  top: 3px;
  width: 12px;
  height: 16px;
  margin-left: -6px;
  padding: 0;
  border: 2px solid var(--surface);
  border-radius: var(--radius-xs);
  background: var(--accent);
  cursor: pointer;
}

.mkv__mark.is-resolved {
  background: var(--surface-3);
}

.mkv__mark.is-on {
  outline: 3px solid var(--accent-soft);
}

.mkv__confirm {
  position: fixed;
  left: 8px;
  right: 8px;
  /* Acima da barra de ação do card (44px + respiro) e da tab bar. */
  bottom: calc(var(--shell-bottom-inset, 0px) + 72px);
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

.mkv__confirm span {
  flex: 1;
}

.mkv__notice {
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--info) 10%, var(--surface));
  color: var(--text-2);
  font-size: 12.5px;
}

.mkv__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-3);
}

.mkv__meta-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
  font-weight: 600;
}

.mkv__meta-dims {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mkv__thumbs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 2px;
  scrollbar-width: thin;
}

.mkv__thumb {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.mkv__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mkv__thumb.is-on {
  border-color: var(--accent);
}

.mkv__thumb:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mkv__thumb-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--surface);
  border-radius: 50%;
  background: var(--accent);
}

@media (max-width: 640px) {
  .mkv__stage {
    min-height: 180px;
    padding: 6px;
  }

  .mkv__pin {
    width: 30px;
    height: 30px;
    margin: -15px 0 0 -15px;
  }

  /* Alvo de 44px sem aumentar o desenho do pino. */
  .mkv__pin::after {
    content: '';
    position: absolute;
    inset: -9px;
  }

  .mkv__img {
    max-height: 70vh;
  }

  .mkv__meta-dims {
    display: none;
  }

  .mkv__mark {
    width: 16px;
    margin-left: -8px;
  }
}
</style>
