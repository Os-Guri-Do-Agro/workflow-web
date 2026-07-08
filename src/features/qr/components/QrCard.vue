<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  BarChart3,
  Ban,
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  User,
} from 'lucide-vue-next'
import QrPreview from './QrPreview.vue'
import type { QrCode, QrFolder } from '@/service/qr/qr-service'
import { useToast } from '@/composables/useToast'
import { exportQr } from '@/utils/qr-styled'

const props = defineProps<{
  qr: QrCode
  /** Pastas disponíveis no MESMO escopo deste QR (para o menu "mover"). */
  folders?: QrFolder[]
}>()
const emit = defineEmits<{
  edit: []
  metrics: []
  cancel: []
  remove: []
  // Move o QR para uma pasta (id) ou tira da pasta (null).
  move: [folderId: string | null]
}>()

// Nome da pasta atual (mostrado como chip no card).
const currentFolderName = computed(
  () => props.folders?.find((f) => f.id === props.qr.folderId)?.name ?? null,
)

const { success, error: showError } = useToast()

// ─── Copiar redirectUrl ───────────────────────────────────────────────────────
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(props.qr.redirectUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    showError('Não foi possível copiar o link')
  }
}

// ─── Menu de exportação (honra o style do QR) ─────────────────────────────────
const exportOpen = ref(false)
const exportRef = ref<HTMLElement | null>(null)

function baseName() {
  const raw = props.qr.label?.trim() || props.qr.code
  return `qr-${raw}`.replace(/[^\w.-]+/g, '-').toLowerCase()
}

async function doExport(fmt: 'png' | 'jpg' | 'svg') {
  exportOpen.value = false
  try {
    // Sempre exporta a partir do redirectUrl do backend + o style persistido.
    const text = props.qr.redirectUrl
    const style = props.qr.style
    if (fmt === 'png') await exportQr(text, style, 'png', `${baseName()}.png`)
    else if (fmt === 'jpg') await exportQr(text, style, 'jpeg', `${baseName()}.jpg`)
    else await exportQr(text, style, 'svg', `${baseName()}.svg`)
    success(`QR exportado (${fmt.toUpperCase()})`)
  } catch (e) {
    showError(e instanceof Error ? e.message : 'Falha ao exportar o QR')
  }
}

// ─── Menu "mover para pasta" ──────────────────────────────────────────────────
const moveOpen = ref(false)
const moveRef = ref<HTMLElement | null>(null)

function moveTo(folderId: string | null) {
  moveOpen.value = false
  if (folderId === (props.qr.folderId ?? null)) return // já está nela
  emit('move', folderId)
}

function onDocClick(e: MouseEvent) {
  if (exportOpen.value && exportRef.value && !exportRef.value.contains(e.target as Node)) {
    exportOpen.value = false
  }
  if (moveOpen.value && moveRef.value && !moveRef.value.contains(e.target as Node)) {
    moveOpen.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <article class="qc" :class="{ 'qc--inactive': !qr.active }">
    <div class="qc-top">
      <QrPreview :text="qr.redirectUrl" :style="qr.style" :size="112" />
      <div class="qc-meta">
        <div class="qc-title-row">
          <h3 class="qc-label">{{ qr.label || 'Sem nome' }}</h3>
          <span class="qc-badge" :class="qr.active ? 'qc-badge--on' : 'qc-badge--off'">
            {{ qr.active ? 'Ativo' : 'Cancelado' }}
          </span>
        </div>

        <!-- Escopo: pessoal x empresa (+ autor quando é QR de empresa de outra pessoa) -->
        <div class="qc-scope">
          <span class="qc-scope-chip" :class="qr.scope === 'company' ? 'qc-scope-chip--company' : ''">
            <component :is="qr.scope === 'company' ? Building2 : User" :size="12" />
            <span>{{ qr.scope === 'company' ? (qr.companyName || 'Empresa') : 'Pessoal' }}</span>
          </span>
          <span v-if="qr.scope === 'company' && !qr.isMine && qr.ownerName" class="qc-owner">
            por {{ qr.ownerName }}
          </span>
          <!-- Pasta atual (separação visível) -->
          <span v-if="currentFolderName" class="qc-folder-chip">
            <Folder :size="11" />
            <span>{{ currentFolderName }}</span>
          </span>
        </div>

        <!-- Destino atual (o que a feature deixa editável) -->
        <a
          :href="qr.targetUrl"
          class="qc-target"
          target="_blank"
          rel="noopener noreferrer"
          :title="qr.targetUrl"
        >
          <ExternalLink :size="13" />
          <span class="qc-target-text">{{ qr.targetUrl }}</span>
        </a>

        <div class="qc-scans">
          <Eye :size="14" />
          <span><strong>{{ qr.scanCount }}</strong> {{ qr.scanCount === 1 ? 'leitura' : 'leituras' }}</span>
        </div>
      </div>
    </div>

    <!-- Link fixo do QR (redirectUrl) + copiar -->
    <div class="qc-link">
      <span class="qc-link-text" :title="qr.redirectUrl">{{ qr.redirectUrl }}</span>
      <button class="qc-copy" type="button" :aria-label="copied ? 'Copiado' : 'Copiar link'" @click="copyLink">
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
      </button>
    </div>

    <!-- Ações -->
    <div class="qc-actions">
      <!-- Editar destino: só o criador -->
      <button v-if="qr.isMine" class="qc-act qc-act--primary" type="button" @click="emit('edit')">
        <Pencil :size="14" />
        <span>Editar destino</span>
      </button>

      <!-- Exportar: qualquer um pode -->
      <div ref="exportRef" class="qc-export">
        <button
          class="qc-act"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="exportOpen"
          @click="exportOpen = !exportOpen"
        >
          <Download :size="14" />
          <span>Exportar</span>
        </button>
        <div v-if="exportOpen" class="qc-menu" role="menu">
          <button class="qc-menu-item" type="button" role="menuitem" @click="doExport('png')">PNG</button>
          <button class="qc-menu-item" type="button" role="menuitem" @click="doExport('jpg')">JPG</button>
          <button class="qc-menu-item" type="button" role="menuitem" @click="doExport('svg')">SVG</button>
        </div>
      </div>

      <!-- Mover para pasta: só o criador -->
      <div v-if="qr.isMine" ref="moveRef" class="qc-export">
        <button
          class="qc-act"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="moveOpen"
          title="Mover para pasta"
          @click="moveOpen = !moveOpen"
        >
          <FolderOpen :size="14" />
          <span>Pasta</span>
        </button>
        <div v-if="moveOpen" class="qc-menu qc-menu--wide" role="menu">
          <button
            class="qc-menu-item"
            type="button"
            role="menuitem"
            :class="{ 'qc-menu-item--active': !qr.folderId }"
            @click="moveTo(null)"
          >
            <Check :size="13" :class="{ 'qc-menu-check--hidden': !!qr.folderId }" />
            <span>Sem pasta</span>
          </button>
          <div v-if="folders && folders.length" class="qc-menu-sep" />
          <button
            v-for="f in folders"
            :key="f.id"
            class="qc-menu-item"
            type="button"
            role="menuitem"
            :class="{ 'qc-menu-item--active': qr.folderId === f.id }"
            @click="moveTo(f.id)"
          >
            <Check :size="13" :class="{ 'qc-menu-check--hidden': qr.folderId !== f.id }" />
            <Folder :size="13" />
            <span class="qc-menu-item-label">{{ f.name }}</span>
          </button>
          <div v-if="!folders || !folders.length" class="qc-menu-empty">
            Nenhuma pasta neste escopo ainda.
          </div>
        </div>
      </div>

      <!-- Métricas: qualquer um pode ver -->
      <button class="qc-act" type="button" @click="emit('metrics')">
        <BarChart3 :size="14" />
        <span>Métricas</span>
      </button>

      <!-- Cancelar / excluir: só o criador -->
      <button
        v-if="qr.isMine && qr.active"
        class="qc-act"
        type="button"
        @click="emit('cancel')"
      >
        <Ban :size="14" />
        <span>Cancelar</span>
      </button>

      <button
        v-if="qr.isMine"
        class="qc-act qc-act--danger"
        type="button"
        aria-label="Excluir QR"
        @click="emit('remove')"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.qc {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.qc:hover {
  border-color: var(--border-strong);
}

.qc--inactive {
  opacity: 0.72;
}

.qc-top {
  display: flex;
  gap: 14px;
}

.qc-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.qc-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}

.qc-label {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-badge {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.qc-badge--on {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

.qc-badge--off {
  background: var(--surface-2);
  color: var(--text-3);
}

.qc-scope {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.qc-scope-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
}

.qc-scope-chip--company {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.qc-owner {
  font-size: 11.5px;
  color: var(--text-3);
}

.qc-folder-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn) 15%, transparent);
  color: var(--warn);
  font-size: 11px;
  font-weight: 650;
  max-width: 160px;
}

.qc-folder-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 12.5px;
  text-decoration: none;
  min-width: 0;
}

.qc-target:hover {
  text-decoration: underline;
}

.qc-target-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-scans {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 12.5px;
}

.qc-scans strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.qc-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.qc-link-text {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-copy {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.qc-copy:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.qc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qc-export {
  position: relative;
}

.qc-act {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.qc-act:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.qc-act--primary {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--accent);
}

.qc-act--primary:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}

.qc-act--danger:hover {
  border-color: var(--err);
  color: var(--err);
}

.qc-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 40;
  min-width: 120px;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
}

.qc-menu-item {
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.qc-menu-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

/* Menu "mover para pasta": mais largo, itens com ícone + check */
.qc-menu--wide {
  min-width: 200px;
  max-width: 260px;
  max-height: 280px;
  overflow-y: auto;
}

.qc-menu--wide .qc-menu-item {
  display: flex;
  align-items: center;
  gap: 7px;
}

.qc-menu-item--active {
  color: var(--text);
  font-weight: 700;
}

.qc-menu-check--hidden {
  visibility: hidden;
}

.qc-menu-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}

.qc-menu-empty {
  padding: 8px 10px;
  color: var(--text-4);
  font-size: 11.5px;
}
</style>
