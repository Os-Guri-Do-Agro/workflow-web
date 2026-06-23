<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import {
  ArrowLeft,
  Circle,
  Download,
  Eraser,
  Highlighter,
  Minus,
  PanelRight,
  Pencil,
  Loader2,
  MousePointer2,
  Paintbrush,
  Save,
  Square,
  Type,
  Trash2,
} from 'lucide-vue-next'
import { useBoard, useBoardMutations } from '@/composables/useBoards'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'

type BoardPoint = {
  x: number
  y: number
}

type BoardStroke = {
  id: string
  type: 'stroke'
  color: string
  width: number
  opacity: number
  points: BoardPoint[]
  createdAt: number
}

type BoardElement = {
  id: string
  type: 'line' | 'rect' | 'ellipse' | 'text'
  color: string
  width: number
  opacity: number
  start: BoardPoint
  end: BoardPoint
  text?: string
  fontSize?: number
  createdAt: number
}

type CanvasTool = 'pen' | 'marker' | 'line' | 'rect' | 'ellipse' | 'text'
type TextDraft = {
  x: number
  y: number
  value: string
  color: string
  fontSize: number
}

type RemotePresence = {
  clientId: number
  name: string
  color: string
  cursor: BoardPoint
}

type AwarenessPayload = {
  user?: {
    name?: string
    color?: string
  }
  cursor?: BoardPoint | null
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'authenticated' | 'synced'

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()
const { error: showError, success } = useToast()

const boardId = computed(() => String(route.params.id ?? ''))
const { data: board, isLoading } = useBoard(() => boardId.value)
const { updateBoard } = useBoardMutations()

const svgRef = ref<SVGSVGElement | null>(null)
const textInputRef = ref<HTMLInputElement | null>(null)
const strokes = ref<BoardStroke[]>([])
const elements = ref<BoardElement[]>([])
const currentStroke = ref<BoardStroke | null>(null)
const currentElement = ref<BoardElement | null>(null)
const textDraft = ref<TextDraft | null>(null)
const remotePresences = ref<RemotePresence[]>([])
const status = ref<ConnectionStatus>('connecting')
const synced = ref(false)
const showInspector = ref(true)
const showGrid = ref(true)
const tool = ref<CanvasTool>('pen')
const color = ref('var(--accent)')
const strokeWidth = ref(3)
const titleDraft = ref('')
const colorOptions = [
  { label: 'Accent', value: 'var(--accent)' },
  { label: 'Info', value: 'var(--info)' },
  { label: 'Sucesso', value: 'var(--success)' },
  { label: 'Aviso', value: 'var(--warn)' },
  { label: 'Erro', value: 'var(--err)' },
  { label: 'Texto', value: 'var(--text)' },
]

let ydoc: Y.Doc | null = null
let provider: HocuspocusProvider | null = null
let yStrokes: Y.Array<BoardStroke> | null = null
let yElements: Y.Array<BoardElement> | null = null

const toolOptions: Array<{ id: CanvasTool; label: string; icon: Component }> = [
  { id: 'pen', label: 'Caneta', icon: Pencil },
  { id: 'marker', label: 'Marca-texto', icon: Highlighter },
  { id: 'line', label: 'Linha', icon: Minus },
  { id: 'rect', label: 'Retângulo', icon: Square },
  { id: 'ellipse', label: 'Elipse', icon: Circle },
  { id: 'text', label: 'Texto', icon: Type },
]

const roleKnown = computed(() => !!workspace.activeRole)
const canWrite = computed(() => !roleKnown.value || workspace.canEdit)
const statusLabel = computed(() => {
  if (synced.value) return 'Sincronizado'
  if (status.value === 'connected') return 'Conectado'
  if (status.value === 'authenticated') return 'Autenticado'
  if (status.value === 'disconnected') return 'Desconectado'
  return 'Conectando'
})

const allStrokes = computed(() => {
  if (!currentStroke.value) return strokes.value
  return [...strokes.value, currentStroke.value]
})
const allElements = computed(() => {
  if (!currentElement.value) return elements.value
  return [...elements.value, currentElement.value]
})
const objectCount = computed(() => strokes.value.length + elements.value.length)

watch(
  () => board.value?.title,
  (title) => {
    titleDraft.value = title || ''
  },
  { immediate: true },
)

watch(
  boardId,
  (id) => {
    if (!id) return
    connectBoard(id)
  },
  { immediate: true },
)

function connectBoard(id: string) {
  teardown()

  const token = localStorage.getItem('token')
  if (!token) {
    status.value = 'disconnected'
    showError('Sessão expirada. Faça login novamente.')
    return
  }

  ydoc = new Y.Doc()
  yStrokes = ydoc.getArray<BoardStroke>('strokes')
  yElements = ydoc.getArray<BoardElement>('elements')
  yStrokes.observe(syncStrokes)
  yElements.observe(syncElements)

  provider = new HocuspocusProvider({
    url: collabUrl(),
    name: id,
    token,
    document: ydoc,
  })

  const awareness = provider.awareness
  if (!awareness) {
    status.value = 'disconnected'
    showError('Provider de presença indisponível')
    return
  }

  awareness.setLocalStateField('user', {
    name: 'Você',
    color: pickUserColor(),
  })

  provider.on('status', (event: { status: ConnectionStatus }) => {
    status.value = event.status
  })
  provider.on('synced', () => {
    synced.value = true
    syncStrokes()
    syncElements()
  })
  provider.on('authenticationFailed', (event: { reason: string }) => {
    status.value = 'disconnected'
    showError(event.reason || 'Sem acesso ao board')
  })
  awareness.on('change', syncAwareness)
  syncStrokes()
}

function teardown() {
  if (provider) {
    provider.awareness?.setLocalStateField('cursor', null)
    provider.destroy()
  }
  if (ydoc) ydoc.destroy()

  provider = null
  ydoc = null
  yStrokes = null
  yElements = null
  strokes.value = []
  elements.value = []
  remotePresences.value = []
  synced.value = false
  status.value = 'connecting'
}

function collabUrl() {
  const raw = import.meta.env.VITE_API_URL || window.location.origin
  const url = new URL(raw, window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/collab'
  url.search = ''
  return url.toString()
}

function syncStrokes() {
  strokes.value = yStrokes?.toArray() ?? []
}

function syncElements() {
  elements.value = yElements?.toArray() ?? []
}

function syncAwareness() {
  const awareness = provider?.awareness
  if (!awareness) return

  const currentClientId = awareness.clientID
  const next: RemotePresence[] = []

  awareness.getStates().forEach((state, clientId) => {
    if (clientId === currentClientId) return
    if (!isAwarenessPayload(state) || !state.cursor) return

    next.push({
      clientId,
      name: state.user?.name || 'Colaborador',
      color: state.user?.color || 'var(--accent)',
      cursor: state.cursor,
    })
  })

  remotePresences.value = next
}

function isAwarenessPayload(value: unknown): value is AwarenessPayload {
  if (!value || typeof value !== 'object') return false
  return 'cursor' in value || 'user' in value
}

function pointFromEvent(event: PointerEvent | MouseEvent): BoardPoint {
  const rect = svgRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }

  return {
    x: Math.round(event.clientX - rect.left),
    y: Math.round(event.clientY - rect.top),
  }
}

function handlePointerDown(event: PointerEvent) {
  if (!canWrite.value) return

  const point = pointFromEvent(event)
  if (tool.value === 'text') {
    updateCursor(point)
    return
  }

  if (tool.value === 'pen' || tool.value === 'marker') {
    currentStroke.value = {
      id: crypto.randomUUID(),
      type: 'stroke',
      color: color.value,
      width: tool.value === 'marker' ? Math.max(strokeWidth.value * 3, 8) : strokeWidth.value,
      opacity: tool.value === 'marker' ? 0.32 : 1,
      points: [point],
      createdAt: Date.now(),
    }
  } else {
    currentElement.value = {
      id: crypto.randomUUID(),
      type: tool.value,
      color: color.value,
      width: strokeWidth.value,
      opacity: 1,
      start: point,
      end: point,
      createdAt: Date.now(),
    }
  }
  updateCursor(point)
}

function handleCanvasClick(event: MouseEvent) {
  if (!canWrite.value || tool.value !== 'text') return
  openTextDraft(pointFromEvent(event))
}

function handlePointerMove(event: PointerEvent) {
  const point = pointFromEvent(event)
  updateCursor(point)

  if (currentStroke.value) {
    currentStroke.value = {
      ...currentStroke.value,
      points: [...currentStroke.value.points, point],
    }
  }

  if (currentElement.value) {
    currentElement.value = {
      ...currentElement.value,
      end: point,
    }
  }
}

function handlePointerUp() {
  if (currentStroke.value && yStrokes) {
    if (currentStroke.value.points.length > 1) {
      yStrokes.push([currentStroke.value])
    }

    currentStroke.value = null
  }

  if (currentElement.value && yElements) {
    if (distance(currentElement.value.start, currentElement.value.end) > 4) {
      yElements.push([currentElement.value])
    }

    currentElement.value = null
  }
}

function openTextDraft(point: BoardPoint) {
  textDraft.value = {
    x: point.x,
    y: point.y,
    value: '',
    color: color.value,
    fontSize: textFontSize(),
  }
  nextTick(() => textInputRef.value?.focus())
}

function commitTextDraft() {
  if (!textDraft.value || !yElements) return

  const text = textDraft.value.value.trim()
  if (text) {
    yElements.push([
      {
        id: crypto.randomUUID(),
        type: 'text',
        color: textDraft.value.color,
        width: 1,
        opacity: 1,
        start: { x: textDraft.value.x, y: textDraft.value.y },
        end: { x: textDraft.value.x, y: textDraft.value.y },
        text,
        fontSize: textDraft.value.fontSize,
        createdAt: Date.now(),
      },
    ])
  }

  textDraft.value = null
}

function cancelTextDraft() {
  textDraft.value = null
}

function textFontSize() {
  return Math.max(14, Math.min(36, strokeWidth.value * 4))
}

function updateCursor(point: BoardPoint) {
  provider?.awareness?.setLocalStateField('cursor', point)
}

function pathPoints(points: BoardPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function normalizedElement(element: BoardElement) {
  const x = Math.min(element.start.x, element.end.x)
  const y = Math.min(element.start.y, element.end.y)
  const width = Math.abs(element.end.x - element.start.x)
  const height = Math.abs(element.end.y - element.start.y)

  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
    rx: width / 2,
    ry: height / 2,
  }
}

function distance(a: BoardPoint, b: BoardPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function handleUndo() {
  if (!canWrite.value) return

  const lastStroke = strokes.value[strokes.value.length - 1]
  const lastElement = elements.value[elements.value.length - 1]

  if (lastElement && (!lastStroke || lastElement.createdAt > lastStroke.createdAt)) {
    yElements?.delete(Math.max(0, (yElements?.length ?? 1) - 1), 1)
    return
  }

  if (lastStroke) yStrokes?.delete(Math.max(0, (yStrokes?.length ?? 1) - 1), 1)
}

function handleClear() {
  if (!canWrite.value || objectCount.value === 0) return
  if (!window.confirm('Limpar todos os objetos deste board?')) return
  if (yStrokes?.length) yStrokes.delete(0, yStrokes.length)
  if (yElements?.length) yElements.delete(0, yElements.length)
  success('Canvas limpo')
}

async function handleRename() {
  if (!boardId.value || !titleDraft.value.trim() || titleDraft.value.trim() === board.value?.title) return

  try {
    await updateBoard.mutateAsync({
      id: boardId.value,
      input: { title: titleDraft.value.trim() },
    })
    success('Nome do board atualizado')
  } catch {
    showError('Não foi possível renomear o board')
  }
}

function handleExportSvg() {
  const svg = svgRef.value
  if (!svg) return

  const width = Math.max(svg.clientWidth, 1)
  const height = Math.max(svg.clientHeight, 1)
  const gridStroke = resolveCssColor('var(--border)')
  const background = resolveCssColor('var(--surface)')
  const grid = showGrid.value
    ? `<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${escapeAttr(gridStroke)}" stroke-width="1" opacity="0.35"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>`
    : ''
  const strokeMarkup = strokes.value
    .map(
      (stroke) =>
        `<polyline points="${escapeAttr(pathPoints(stroke.points))}" fill="none" stroke="${escapeAttr(resolveCssColor(stroke.color))}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${stroke.opacity}"/>`,
    )
    .join('')
  const elementMarkup = elements.value.map(exportElementSvg).join('')
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeAttr(background)}"/>${grid}${strokeMarkup}${elementMarkup}</svg>`

  const blob = new Blob([markup], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFileName(board.value?.title || 'board')}.svg`
  link.click()
  URL.revokeObjectURL(url)
}

function exportElementSvg(element: BoardElement) {
  const stroke = escapeAttr(resolveCssColor(element.color))
  const common = `fill="none" stroke="${stroke}" stroke-width="${element.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.opacity}"`

  if (element.type === 'line') {
    return `<line x1="${element.start.x}" y1="${element.start.y}" x2="${element.end.x}" y2="${element.end.y}" ${common}/>`
  }

  if (element.type === 'text') {
    return `<text x="${element.start.x}" y="${element.start.y}" fill="${stroke}" font-family="Inter, Arial, sans-serif" font-size="${element.fontSize ?? 16}" dominant-baseline="hanging" opacity="${element.opacity}">${escapeText(element.text ?? '')}</text>`
  }

  const normalized = normalizedElement(element)
  if (element.type === 'rect') {
    return `<rect x="${normalized.x}" y="${normalized.y}" width="${normalized.width}" height="${normalized.height}" ${common}/>`
  }

  return `<ellipse cx="${normalized.cx}" cy="${normalized.cy}" rx="${normalized.rx}" ry="${normalized.ry}" ${common}/>`
}

function resolveCssColor(value: string) {
  const match = value.match(/^var\((--[^)]+)\)$/)
  if (!match) return value

  return getComputedStyle(document.documentElement).getPropertyValue(match[1] ?? '').trim() || value
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeFileName(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase()
}

async function ensureActiveRole() {
  if (workspace.activeRole) return

  try {
    const companies = await workspace.fetchCompanies()
    const activeId = workspace.activeCompanyId || localStorage.getItem('activeCompany') || companies[0]?.id
    if (activeId) workspace.setActiveCompany(activeId)
  } catch {
    /* O backend ainda valida permissão; não bloqueia desenho por falha de role. */
  }
}

function pickUserColor() {
  const colors = ['var(--accent)', 'var(--info)', 'var(--success)', 'var(--warn)', 'var(--status-test)']
  const index = Math.floor(Math.random() * colors.length)
  return colors[index] ?? 'var(--accent)'
}

onMounted(ensureActiveRole)
onBeforeUnmount(teardown)
</script>

<template>
  <main class="canvas-page">
    <header class="canvas-topbar">
      <div class="topbar-main">
        <button class="back-btn" type="button" @click="router.push('/boards')">
          <ArrowLeft :size="15" />
          <span>Boards</span>
        </button>

        <div class="title-wrap">
          <span class="eyebrow">
            <Paintbrush :size="11" />
            Canvas
          </span>
          <input
            v-model="titleDraft"
            class="title-input"
            :disabled="updateBoard.isPending.value"
            placeholder="Nome do board"
            @blur="handleRename"
            @keydown.enter.prevent="handleRename"
          />
        </div>

        <div class="spacer" />

        <div class="status-cluster">
          <div class="status-pill" :class="{ 'status-pill--synced': synced }">
            <span class="status-dot" />
            {{ statusLabel }}
          </div>
          <div class="meta-pill">{{ objectCount }} objetos</div>
        </div>
      </div>

      <div class="toolbar-row" :class="{ 'toolbar-row--disabled': !canWrite }">
        <div class="toolbar-scroll">
          <div class="tool-tabs" aria-label="Ferramentas">
            <button
              v-for="option in toolOptions"
              :key="option.id"
              class="tool-tab"
              :class="{ 'tool-tab--active': tool === option.id }"
              type="button"
              :title="option.label"
              @click="tool = option.id"
            >
              <component :is="option.icon" :size="14" />
              <span>{{ option.label }}</span>
            </button>
          </div>

          <div class="toolbar-divider" />

          <div class="color-field" aria-label="Cor do pincel">
            <Circle :size="14" />
            <button
              v-for="option in colorOptions"
              :key="option.value"
              class="color-swatch"
              :class="{ 'color-swatch--active': color === option.value }"
              type="button"
              :title="option.label"
              :style="{ '--swatch-color': option.value }"
              @click="color = option.value"
            />
          </div>

          <label class="range-field">
            <span>{{ strokeWidth }}px</span>
            <input v-model.number="strokeWidth" type="range" min="1" max="12" />
          </label>

          <div class="toolbar-divider" />

          <button class="tool-btn" type="button" :disabled="!canWrite" @click="handleUndo">
            <Eraser :size="14" />
            Desfazer
          </button>
          <button class="tool-btn" type="button" @click="showGrid = !showGrid">
            <Square :size="14" />
            {{ showGrid ? 'Grade on' : 'Grade off' }}
          </button>
          <button class="tool-btn" type="button" @click="handleExportSvg">
            <Download :size="14" />
            SVG
          </button>
          <button class="tool-btn" type="button" @click="showInspector = !showInspector">
            <PanelRight :size="14" />
            Painel
          </button>
          <button class="tool-btn tool-btn--danger" type="button" :disabled="!canWrite" @click="handleClear">
            <Trash2 :size="14" />
            Limpar
          </button>
        </div>
      </div>
    </header>

    <section v-if="isLoading" class="state">
      <Loader2 :size="22" class="spin" />
      <span>Carregando board...</span>
    </section>

    <section v-else class="canvas-shell" :class="{ 'canvas-shell--inspector': showInspector }">
      <div class="canvas-stage" @click="handleCanvasClick">
        <div class="floating-help">
          <Save :size="13" />
          <span>Auto-save via realtime</span>
        </div>

        <svg
          ref="svgRef"
          class="drawing-surface"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointerleave="handlePointerUp"
        >
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" class="grid-line" />
            </pattern>
          </defs>
          <rect v-if="showGrid" width="100%" height="100%" fill="url(#grid)" />
          <polyline
            v-for="stroke in allStrokes"
            :key="stroke.id"
            :points="pathPoints(stroke.points)"
            :stroke="stroke.color"
            :stroke-width="stroke.width"
            :opacity="stroke.opacity"
            class="stroke"
          />
          <template v-for="element in allElements" :key="element.id">
            <line
              v-if="element.type === 'line'"
              :x1="element.start.x"
              :y1="element.start.y"
              :x2="element.end.x"
              :y2="element.end.y"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="stroke"
            />
            <rect
              v-else-if="element.type === 'rect'"
              :x="normalizedElement(element).x"
              :y="normalizedElement(element).y"
              :width="normalizedElement(element).width"
              :height="normalizedElement(element).height"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="shape"
            />
            <text
              v-else-if="element.type === 'text'"
              :x="element.start.x"
              :y="element.start.y"
              :fill="element.color"
              :font-size="element.fontSize ?? 16"
              :opacity="element.opacity"
              class="canvas-text"
            >
              {{ element.text }}
            </text>
            <ellipse
              v-else
              :cx="normalizedElement(element).cx"
              :cy="normalizedElement(element).cy"
              :rx="normalizedElement(element).rx"
              :ry="normalizedElement(element).ry"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="shape"
            />
          </template>
        </svg>

        <input
          v-if="textDraft"
          ref="textInputRef"
          v-model="textDraft.value"
          class="text-draft-input"
          :style="{
            transform: `translate(${textDraft.x}px, ${textDraft.y}px)`,
            color: textDraft.color,
            fontSize: `${textDraft.fontSize}px`,
          }"
          placeholder="Digite..."
          @blur="commitTextDraft"
          @keydown.enter.prevent="commitTextDraft"
          @keydown.esc.prevent="cancelTextDraft"
          @click.stop
        />

        <div v-if="!canWrite" class="readonly-banner">
          Seu papel atual permite visualizar, mas não desenhar neste board.
        </div>

        <div
          v-for="presence in remotePresences"
          :key="presence.clientId"
          class="remote-cursor"
          :style="{
            transform: `translate(${presence.cursor.x}px, ${presence.cursor.y}px)`,
            '--cursor-color': presence.color,
          }"
        >
          <MousePointer2 :size="16" />
          <span>{{ presence.name }}</span>
        </div>
      </div>

      <aside v-if="showInspector" class="inspector">
        <div class="inspector-card">
          <span class="inspector-label">Status</span>
          <strong>{{ statusLabel }}</strong>
          <p>O desenho é transmitido pelo documento Yjs deste board.</p>
        </div>
        <div class="inspector-card">
          <span class="inspector-label">Conteúdo</span>
          <strong>{{ objectCount }} objetos</strong>
          <p>{{ strokes.length }} traços · {{ elements.length }} formas</p>
        </div>
        <div class="inspector-card">
          <span class="inspector-label">Ferramenta ativa</span>
          <strong>{{ toolOptions.find((item) => item.id === tool)?.label }}</strong>
          <p>Espessura {{ strokeWidth }}px</p>
        </div>
        <div class="inspector-card">
          <span class="inspector-label">Atalhos de uso</span>
          <p>Enter no título renomeia. O botão SVG exporta uma cópia local do canvas.</p>
        </div>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.canvas-page {
  height: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
}

.canvas-topbar {
  min-height: 96px;
  padding: 10px 14px 9px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-main {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn,
.tool-btn,
.status-pill,
.meta-pill,
.color-field,
.range-field {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: inherit;
  font-size: 12px;
}

.back-btn,
.tool-btn {
  padding: 0 10px;
  cursor: pointer;
}

.back-btn:hover,
.tool-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.title-wrap {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 1px 0;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.title-wrap h1 {
  margin: 2px 0 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 780;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.title-input {
  width: min(320px, 28vw);
  display: block;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 16px;
  font-weight: 780;
}

.title-input:focus {
  color: var(--accent);
}

.spacer {
  flex: 1;
}

.status-cluster {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-pill,
.meta-pill {
  padding: 0 10px;
  color: var(--text-3);
}

.status-pill--synced {
  color: var(--success);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.toolbar-row {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
}

.toolbar-row--disabled {
  opacity: 0.65;
}

.toolbar-scroll {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 2px;
}

.toolbar-scroll::-webkit-scrollbar {
  height: 4px;
}

.toolbar-scroll::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 999px;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: var(--border);
  flex: 0 0 auto;
}

.color-field,
.range-field {
  padding: 0 9px;
  flex: 0 0 auto;
}

.tool-tabs {
  height: 34px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.tool-tab {
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.tool-tab:hover {
  color: var(--text);
  background: var(--surface-3);
}

.tool-tab--active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-3));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
}

.color-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--swatch-color);
  cursor: pointer;
}

.color-swatch--active {
  box-shadow:
    0 0 0 2px var(--surface-2),
    0 0 0 4px var(--accent);
}

.range-field input {
  width: 92px;
  accent-color: var(--accent);
}

.tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.tool-btn {
  flex: 0 0 auto;
}

.tool-btn--danger {
  color: var(--err);
}

.canvas-shell {
  display: grid;
  grid-template-columns: 1fr;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-2);
}

.canvas-shell--inspector {
  grid-template-columns: minmax(0, 1fr) 280px;
}

.canvas-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.drawing-surface {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
  cursor: crosshair;
  background: var(--surface);
}

.grid-line {
  stroke: var(--border);
  stroke-width: 1;
  opacity: 0.35;
}

.stroke {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.shape {
  fill: transparent;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.canvas-text {
  font-family: var(--font-family);
  font-weight: 650;
  dominant-baseline: hanging;
  user-select: none;
  pointer-events: none;
}

.text-draft-input {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 4;
  min-width: 180px;
  max-width: 360px;
  height: 40px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  outline: none;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow:
    var(--shadow),
    0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  font-family: var(--font-family);
  font-weight: 650;
}

.text-draft-input::placeholder {
  color: var(--text-4);
}

.floating-help {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  backdrop-filter: blur(12px);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  box-shadow: var(--shadow-sm);
}

.inspector {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.inspector-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.inspector-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inspector-card strong {
  display: block;
  color: var(--text);
  font-size: 14px;
}

.inspector-card p {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.4;
}

.readonly-banner {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  padding: 8px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  box-shadow: var(--shadow);
  font-size: 12px;
}

.remote-cursor {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  color: var(--cursor-color);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.remote-cursor span {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 11px;
  box-shadow: var(--shadow-sm);
}

.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .canvas-topbar {
    min-height: 112px;
  }

  .topbar-main {
    align-items: flex-start;
  }

  .status-cluster {
    align-items: flex-end;
    flex-direction: column;
    gap: 5px;
  }

  .title-input {
    width: min(320px, 70vw);
  }

  .tool-tabs {
    max-width: 100%;
  }

  .canvas-shell--inspector {
    grid-template-columns: 1fr;
  }

  .inspector {
    display: none;
  }
}
</style>
