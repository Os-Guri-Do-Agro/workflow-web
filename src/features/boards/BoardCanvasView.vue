<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HocuspocusProvider } from '@hocuspocus/provider'
import getStroke from 'perfect-freehand'
import * as Y from 'yjs'
import {
  ArrowLeft,
  ArrowRight,
  BringToFront,
  Circle,
  Copy,
  Diamond,
  Download,
  Hand,
  Highlighter,
  ImagePlus,
  Link,
  Maximize2,
  Minus,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Loader2,
  Minimize2,
  MousePointer2,
  Paintbrush,
  Save,
  SendToBack,
  Sparkles,
  Square,
  StickyNote,
  Type,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next'
import { useBoard, useBoardMutations } from '@/composables/useBoards'
// Resolução token→cor canônica (cacheada e invalidada na troca de tema);
// substitui a antiga cópia local sem cache deste arquivo.
import { resolveCssColor } from '@/plugins/echarts-theme'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import boardsService from '@/service/boards/boards-service'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'
import aiService from '@/service/ai/ai-service'
import { apiBaseUrl, getApiErrorMessage } from '@/service/api'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

type BoardPoint = {
  x: number
  y: number
  pressure?: number
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
  type: 'freedraw' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'diamond' | 'text' | 'note' | 'image'
  color: string
  width: number
  opacity: number
  start?: BoardPoint
  end?: BoardPoint
  points?: BoardPoint[]
  text?: string
  fontSize?: number
  fill?: string
  fillStyle?: 'none' | 'solid' | 'hachure'
  variant?: 'flow-card' | 'sticky'
  src?: string
  createdAt: number
}

type CanvasTool = 'select' | 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'diamond' | 'text' | 'note' | 'image'
type TextDraft = {
  x: number
  y: number
  value: string
  color: string
  fontSize: number
  editingElementId?: string
}
type CanvasContextMenu = {
  x: number
  y: number
  point: BoardPoint
}
type DragState = {
  elementId: string
  origin: BoardPoint
  element: BoardElement
}
type ResizeHandle = 'e' | 's' | 'se'
type ResizeState = {
  elementId: string
  origin: BoardPoint
  element: BoardElement
  handle: ResizeHandle
}
type PanState = {
  originClient: {
    x: number
    y: number
  }
  originOffset: BoardPoint
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

const pageRef = ref<HTMLElement | null>(null)
const svgRef = ref<SVGSVGElement | null>(null)
const textInputRef = ref<HTMLTextAreaElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const elements = ref<BoardElement[]>([])
const currentStroke = ref<BoardElement | null>(null)
const currentElement = ref<BoardElement | null>(null)
const textDraft = ref<TextDraft | null>(null)
const dragState = ref<DragState | null>(null)
const resizeState = ref<ResizeState | null>(null)
const panState = ref<PanState | null>(null)
const contextMenu = ref<CanvasContextMenu | null>(null)
const imageInsertPoint = ref<BoardPoint | null>(null)
const selectedElementId = ref<string | null>(null)
const remotePresences = ref<RemotePresence[]>([])
const status = ref<ConnectionStatus>('connecting')
const synced = ref(false)
const showInspector = ref(true)
const showGrid = ref(true)
const actionsMenuOpen = ref(false)
const showClearConfirm = ref(false)
const isFullscreen = ref(false)
const isSpacePanning = ref(false)
const viewportOffset = ref<BoardPoint>({ x: 0, y: 0 })
const surfaceSize = ref({ width: 1, height: 1 })
const zoom = ref(1)
const tool = ref<CanvasTool>('select')
const color = ref('var(--accent)')
const customColor = ref('#f59e0b')
const backgroundColor = ref('transparent')
const strokeWidth = ref(3)
const titleDraft = ref('')
const diagramPrompt = ref('')
const diagramLoading = ref(false)
const colorOptions = [
  { label: 'Texto', value: 'var(--text)' },
  { label: 'Erro', value: 'var(--err)' },
  { label: 'Sucesso', value: 'var(--success)' },
  { label: 'Info', value: 'var(--info)' },
  { label: 'Accent', value: 'var(--accent)' },
  { label: 'Aviso', value: 'var(--warn)' },
]
const backgroundOptions = [
  { label: 'Transparente', value: 'transparent' },
  { label: 'Surface', value: 'var(--surface)' },
  { label: 'Suave', value: 'var(--surface-3)' },
  { label: 'Sucesso', value: 'color-mix(in srgb, var(--success) 18%, var(--surface))' },
  { label: 'Info', value: 'color-mix(in srgb, var(--info) 20%, var(--surface))' },
  { label: 'Aviso', value: 'color-mix(in srgb, var(--warn) 22%, var(--surface))' },
  { label: 'Erro', value: 'color-mix(in srgb, var(--err) 18%, var(--surface))' },
]

let ydoc: Y.Doc | null = null
let provider: HocuspocusProvider | null = null
let yElements: Y.Array<BoardElement> | null = null
let yLegacyStrokes: Y.Array<BoardStroke> | null = null

const toolOptions: Array<{ id: CanvasTool; label: string; icon: Component }> = [
  { id: 'select', label: 'Selecionar', icon: MousePointer2 },
  { id: 'pen', label: 'Caneta', icon: Pencil },
  { id: 'marker', label: 'Marca-texto', icon: Highlighter },
  { id: 'arrow', label: 'Seta', icon: ArrowRight },
  { id: 'line', label: 'Conector', icon: Minus },
  { id: 'rect', label: 'Retângulo', icon: Square },
  { id: 'diamond', label: 'Decisão', icon: Diamond },
  { id: 'ellipse', label: 'Elipse', icon: Circle },
  { id: 'text', label: 'Texto', icon: Type },
  { id: 'note', label: 'Nota', icon: StickyNote },
  { id: 'image', label: 'Imagem', icon: ImagePlus },
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
  const freedraw = elements.value.filter((element) => element.type === 'freedraw')
  if (!currentStroke.value) return freedraw
  return [...freedraw, currentStroke.value]
})
const allElements = computed(() => {
  const nonFreedraw = elements.value.filter((element) => element.type !== 'freedraw')
  if (!currentElement.value) return nonFreedraw
  return [...nonFreedraw, currentElement.value]
})
const objectCount = computed(() => elements.value.length)
const selectedElement = computed(() => elements.value.find((element) => element.id === selectedElementId.value) ?? null)
const selectedBounds = computed(() => (selectedElement.value ? elementBounds(selectedElement.value) : null))
const isPanningMode = computed(() => isSpacePanning.value || !!panState.value)
const viewportSize = computed(() => ({
  width: surfaceSize.value.width / zoom.value,
  height: surfaceSize.value.height / zoom.value,
}))
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)
const svgViewBox = computed(() => {
  return `${viewportOffset.value.x} ${viewportOffset.value.y} ${viewportSize.value.width} ${viewportSize.value.height}`
})
const gridRect = computed(() => {
  return {
    x: viewportOffset.value.x,
    y: viewportOffset.value.y,
    width: viewportSize.value.width,
    height: viewportSize.value.height,
  }
})

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

async function connectBoard(id: string) {
  teardown()

  const token = localStorage.getItem('token')
  if (!token) {
    status.value = 'disconnected'
    showError('Sessão expirada. Faça login novamente.')
    return
  }

  ydoc = new Y.Doc()
  yElements = ydoc.getArray<BoardElement>('elements')
  yLegacyStrokes = ydoc.getArray<BoardStroke>('strokes')
  yElements.observe(syncElements)

  await applySnapshot(id)
  migrateLegacyStrokes()
  scheduleSurfaceSizeSync()

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
    syncElements()
    migrateLegacyStrokes()
    scheduleSurfaceSizeSync()
  })
  provider.on('authenticationFailed', (event: { reason: string }) => {
    status.value = 'disconnected'
    showError(event.reason || 'Sem acesso ao board')
  })
  awareness.on('change', syncAwareness)
  syncElements()
}

function teardown() {
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  if (provider) {
    provider.awareness?.setLocalStateField('cursor', null)
    provider.destroy()
  }
  if (ydoc) ydoc.destroy()

  provider = null
  ydoc = null
  yElements = null
  yLegacyStrokes = null
  elements.value = []
  remotePresences.value = []
  synced.value = false
  status.value = 'connecting'
}

function collabUrl() {
  // apiBaseUrl normaliza a env (com/sem https://); sem esquema, o new URL
  // resolveria relativo ao origin do front e apontaria pro host errado.
  const raw = apiBaseUrl() || window.location.origin
  const url = new URL(raw, window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/collab'
  url.search = ''
  return url.toString()
}

function syncElements() {
  elements.value = yElements?.toArray() ?? []
}

async function applySnapshot(id: string) {
  if (!ydoc) return

  try {
    const snapshot = await boardsService.snapshot(id)
    if (!snapshot.ydocStateBase64) return

    const bytes = Uint8Array.from(atob(snapshot.ydocStateBase64), (char) => char.charCodeAt(0))
    Y.applyUpdate(ydoc, bytes)
    syncElements()
  } catch {
    /* O WebSocket ainda pode sincronizar o documento mesmo sem snapshot REST. */
  }
}

function migrateLegacyStrokes() {
  if (!yLegacyStrokes || !yElements || yLegacyStrokes.length === 0) return

  const migrated = yLegacyStrokes.toArray().map(strokeToElement)
  yElements.push(migrated)
  yLegacyStrokes.delete(0, yLegacyStrokes.length)
  syncElements()
}

function strokeToElement(stroke: BoardStroke): BoardElement {
  return {
    id: stroke.id,
    type: 'freedraw',
    color: stroke.color,
    width: stroke.width,
    opacity: stroke.opacity,
    points: stroke.points,
    createdAt: stroke.createdAt,
  }
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
  const pressure = 'pressure' in event && event.pressure > 0 ? event.pressure : 0.5

  return {
    x: Math.round((event.clientX - rect.left) / zoom.value + viewportOffset.value.x),
    y: Math.round((event.clientY - rect.top) / zoom.value + viewportOffset.value.y),
    pressure,
  }
}

function handlePointerDown(event: PointerEvent) {
  if (isPanningMode.value) {
    startPan(event)
    return
  }

  if (!canWrite.value) return

  contextMenu.value = null
  actionsMenuOpen.value = false
  const point = pointFromEvent(event)
  if (tool.value === 'select') {
    selectedElementId.value = null
    return
  }

  if (tool.value === 'text') {
    updateCursor(point)
    return
  }

  if (tool.value === 'note') {
    createNote(point)
    updateCursor(point)
    return
  }

  if (tool.value === 'image') {
    imageInsertPoint.value = point
    imageInputRef.value?.click()
    updateCursor(point)
    return
  }

  if (tool.value === 'pen' || tool.value === 'marker') {
    currentStroke.value = {
      id: crypto.randomUUID(),
      type: 'freedraw',
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
      fill: backgroundColor.value,
      fillStyle: backgroundColor.value === 'transparent' ? 'none' : 'solid',
      createdAt: Date.now(),
    }
  }
  updateCursor(point)
}

function handleCanvasClick(event: MouseEvent) {
  contextMenu.value = null
  actionsMenuOpen.value = false
  if (!canWrite.value || tool.value !== 'text') return
  openTextDraft(pointFromEvent(event))
}

function handleCanvasContextMenu(event: MouseEvent) {
  event.preventDefault()
  if (!canWrite.value) return

  actionsMenuOpen.value = false
  const point = pointFromEvent(event)
  const rect = svgRef.value?.getBoundingClientRect()
  contextMenu.value = {
    point,
    x: event.clientX - (rect?.left ?? 0),
    y: event.clientY - (rect?.top ?? 0),
  }
}

function handlePointerMove(event: PointerEvent) {
  const point = pointFromEvent(event)
  updateCursor(point)

  if (panState.value) return

  if (resizeState.value) {
    const dx = point.x - resizeState.value.origin.x
    const dy = point.y - resizeState.value.origin.y
    replaceElement(
      resizeState.value.elementId,
      resizeElement(resizeState.value.element, resizeState.value.handle, dx, dy),
    )
    return
  }

  if (dragState.value) {
    const dx = point.x - dragState.value.origin.x
    const dy = point.y - dragState.value.origin.y
    replaceElement(dragState.value.elementId, moveElement(dragState.value.element, dx, dy))
    return
  }

  if (currentStroke.value) {
    currentStroke.value = {
      ...currentStroke.value,
      points: [...(currentStroke.value.points ?? []), point],
    }
  }

  if (currentElement.value) {
    currentElement.value = {
      ...currentElement.value,
      end: point,
    }
  }
}

function handleWindowPointerMove(event: PointerEvent) {
  if (panState.value) {
    const dx = (event.clientX - panState.value.originClient.x) / zoom.value
    const dy = (event.clientY - panState.value.originClient.y) / zoom.value
    viewportOffset.value = {
      x: panState.value.originOffset.x - dx,
      y: panState.value.originOffset.y - dy,
    }
    return
  }

  if (resizeState.value) {
    const point = pointFromEvent(event)
    const dx = point.x - resizeState.value.origin.x
    const dy = point.y - resizeState.value.origin.y
    replaceElement(
      resizeState.value.elementId,
      resizeElement(resizeState.value.element, resizeState.value.handle, dx, dy),
    )
    return
  }

  if (!dragState.value) return

  const point = pointFromEvent(event)
  const dx = point.x - dragState.value.origin.x
  const dy = point.y - dragState.value.origin.y
  replaceElement(dragState.value.elementId, moveElement(dragState.value.element, dx, dy))
}

function handleWindowPointerUp() {
  dragState.value = null
  resizeState.value = null
  panState.value = null
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
}

function startPan(event: PointerEvent) {
  event.preventDefault()
  contextMenu.value = null
  actionsMenuOpen.value = false
  panState.value = {
    originClient: {
      x: event.clientX,
      y: event.clientY,
    },
    originOffset: { ...viewportOffset.value },
  }
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerUp)
}

function resetViewport() {
  viewportOffset.value = { x: 0, y: 0 }
  zoom.value = 1
}

function setZoom(nextZoom: number) {
  const clamped = Math.min(2.5, Math.max(0.35, nextZoom))
  if (clamped === zoom.value) return

  const center = {
    x: viewportOffset.value.x + viewportSize.value.width / 2,
    y: viewportOffset.value.y + viewportSize.value.height / 2,
  }

  zoom.value = clamped
  viewportOffset.value = {
    x: Math.round(center.x - viewportSize.value.width / 2),
    y: Math.round(center.y - viewportSize.value.height / 2),
  }
}

function zoomIn() {
  const currentPercent = Math.round(zoom.value * 100)
  const nextPercent = Math.ceil(currentPercent / 10) * 10 + 10
  setZoom(nextPercent / 100)
}

function zoomOut() {
  const currentPercent = Math.round(zoom.value * 100)
  const nextPercent = Math.floor(currentPercent / 10) * 10 - 10
  setZoom(nextPercent / 100)
}

function handleResizePointerDown(handle: ResizeHandle, event: PointerEvent) {
  if (!canWrite.value || !selectedElement.value) return

  event.preventDefault()
  event.stopPropagation()
  const point = pointFromEvent(event)
  resizeState.value = {
    elementId: selectedElement.value.id,
    origin: point,
    element: cloneElement(selectedElement.value),
    handle,
  }
  window.removeEventListener('pointermove', handleWindowPointerMove)
  window.removeEventListener('pointerup', handleWindowPointerUp)
  window.addEventListener('pointermove', handleWindowPointerMove)
  window.addEventListener('pointerup', handleWindowPointerUp)
}

function handlePointerUp() {
  if (resizeState.value || panState.value) {
    handleWindowPointerUp()
    return
  }

  if (dragState.value) {
    handleWindowPointerUp()
    return
  }

  if (currentStroke.value && yElements) {
    if ((currentStroke.value.points?.length ?? 0) > 1) {
      yElements.push([currentStroke.value])
    }

    currentStroke.value = null
  }

  if (currentElement.value && yElements) {
    if (distance(elementStart(currentElement.value), elementEnd(currentElement.value)) > 4) {
      yElements.push([currentElement.value])
    }

    currentElement.value = null
  }
}

function handleElementPointerDown(element: BoardElement, event: PointerEvent) {
  if (!canWrite.value) return

  event.stopPropagation()
  const point = pointFromEvent(event)
  selectedElementId.value = element.id

  if (tool.value === 'select') {
    window.removeEventListener('pointermove', handleWindowPointerMove)
    window.removeEventListener('pointerup', handleWindowPointerUp)
    dragState.value = {
      elementId: element.id,
      origin: point,
      element: cloneElement(element),
    }
    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', handleWindowPointerUp)
  }
}

function openTextDraft(point: BoardPoint) {
  contextMenu.value = null
  textDraft.value = {
    x: point.x,
    y: point.y,
    value: '',
    color: color.value,
    fontSize: textFontSize(),
  }
  nextTick(() => textInputRef.value?.focus())
}

function openElementTextEditor(element: BoardElement) {
  if (element.type !== 'text' && element.type !== 'note') return

  const normalized = normalizedElement(element)
  const point =
    element.type === 'note'
      ? { x: normalized.x + 18, y: normalized.y + 20 }
      : elementStart(element)

  selectedElementId.value = element.id
  contextMenu.value = null
  actionsMenuOpen.value = false
  textDraft.value = {
    x: point.x,
    y: point.y,
    value: element.text ?? '',
    color: element.color,
    fontSize: element.fontSize ?? textFontSize(),
    editingElementId: element.id,
  }
  nextTick(() => {
    textInputRef.value?.focus()
    textInputRef.value?.select()
  })
}

function handleContextAction(action: CanvasTool | 'duplicate-selection' | 'delete-selection' | 'bring-front' | 'send-back') {
  const point = contextMenu.value?.point ?? centerPoint()
  contextMenu.value = null

  if (action === 'duplicate-selection') {
    handleDuplicateSelected()
    return
  }

  if (action === 'delete-selection') {
    handleDeleteSelected()
    return
  }

  if (action === 'bring-front') {
    handleBringToFront()
    return
  }

  if (action === 'send-back') {
    handleSendToBack()
    return
  }

  if (action === 'text') {
    openTextDraft(point)
    return
  }

  if (action === 'note') {
    createNote(point)
    return
  }

  if (action === 'image') {
    imageInsertPoint.value = point
    imageInputRef.value?.click()
    return
  }

  if (action === 'rect' || action === 'ellipse' || action === 'line' || action === 'arrow' || action === 'diamond') {
    createQuickShape(action, point)
  }
}

function commitTextDraft() {
  if (!textDraft.value || !yElements) return

  const text = textDraft.value.value.trim()
  const editingId = textDraft.value.editingElementId
  if (editingId) {
    const target = elements.value.find((element) => element.id === editingId)
    if (target && text) {
      replaceElement(editingId, {
        ...cloneElement(target),
        text,
        color: textDraft.value.color,
        fontSize: textDraft.value.fontSize,
      })
    }
    textDraft.value = null
    return
  }

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

function freehandPath(element: BoardElement) {
  const points = element.points ?? []
  if (points.length < 2) return ''

  const outline = getStroke(
    points.map((point) => [point.x, point.y, point.pressure ?? 0.5]),
    {
      size: element.width,
      thinning: 0.58,
      smoothing: 0.62,
      streamline: 0.45,
      simulatePressure: false,
      start: { taper: element.width * 1.4, cap: true },
      end: { taper: element.width * 1.8, cap: true },
    },
  )

  if (!outline.length) return ''

  const first = outline[0]
  const rest = outline.slice(1)
  return `M ${first?.[0] ?? 0} ${first?.[1] ?? 0} ${rest
    .map((point) => `L ${point[0]} ${point[1]}`)
    .join(' ')} Z`
}

function textLines(text?: string) {
  return (text || '').split('\n').filter((line) => line.length > 0)
}

function elementFill(element: BoardElement) {
  const fillStyle = element.fillStyle ?? (element.fill ? 'solid' : 'none')
  if (fillStyle === 'hachure') return 'url(#flow-hachure)'
  if (fillStyle === 'solid') return element.fill || 'var(--surface)'
  return 'transparent'
}

function resolvedElementFill(element: BoardElement) {
  const fillStyle = element.fillStyle ?? (element.fill ? 'solid' : 'none')
  if (fillStyle === 'solid') return resolveCssColor(element.fill || 'var(--surface)')
  if (fillStyle === 'hachure') return 'url(#flow-hachure)'
  return 'none'
}

function diamondPoints(element: BoardElement) {
  const normalized = normalizedElement(element)
  return [
    `${normalized.cx},${normalized.y}`,
    `${normalized.x + normalized.width},${normalized.cy}`,
    `${normalized.cx},${normalized.y + normalized.height}`,
    `${normalized.x},${normalized.cy}`,
  ].join(' ')
}

function arrowHeadPoints(element: BoardElement) {
  const start = elementStart(element)
  const end = elementEnd(element)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const size = Math.max(10, element.width * 4)
  const left = {
    x: end.x - size * Math.cos(angle - Math.PI / 6),
    y: end.y - size * Math.sin(angle - Math.PI / 6),
  }
  const right = {
    x: end.x - size * Math.cos(angle + Math.PI / 6),
    y: end.y - size * Math.sin(angle + Math.PI / 6),
  }
  return `${end.x},${end.y} ${left.x},${left.y} ${right.x},${right.y}`
}

function normalizedElement(element: BoardElement) {
  const start = elementStart(element)
  const end = elementEnd(element)
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)

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

function elementBounds(element: BoardElement) {
  if (element.type === 'freedraw' && element.points?.length) {
    const xs = element.points.map((point) => point.x)
    const ys = element.points.map((point) => point.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    const width = Math.max(Math.max(...xs) - x, 1)
    const height = Math.max(Math.max(...ys) - y, 1)
    return { x, y, width, height }
  }

  if (element.type === 'text') {
    const start = elementStart(element)
    const fontSize = element.fontSize ?? 16
    const lines = textLines(element.text)
    const longestLine = Math.max(...lines.map((line) => line.length), 1)
    return {
      x: start.x,
      y: start.y,
      width: Math.max(longestLine * fontSize * 0.62, 32),
      height: Math.max(lines.length, 1) * fontSize * 1.25,
    }
  }

  const normalized = normalizedElement(element)
  return {
    x: normalized.x,
    y: normalized.y,
    width: Math.max(normalized.width, 1),
    height: Math.max(normalized.height, 1),
  }
}

function elementStart(element: BoardElement): BoardPoint {
  return element.start ?? element.points?.[0] ?? { x: 0, y: 0 }
}

function elementEnd(element: BoardElement): BoardPoint {
  return element.end ?? element.points?.[element.points.length - 1] ?? elementStart(element)
}

function distance(a: BoardPoint, b: BoardPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function handleUndo() {
  if (!canWrite.value) return

  const lastElement = elements.value[elements.value.length - 1]

  if (lastElement) yElements?.delete(Math.max(0, (yElements?.length ?? 1) - 1), 1)
}

function handleDeleteSelected() {
  if (!selectedElementId.value) return
  removeElement(selectedElementId.value)
  selectedElementId.value = null
}

function handleDuplicateSelected() {
  if (!selectedElement.value || !yElements) return

  const duplicate = moveElement(
    {
      ...cloneElement(selectedElement.value),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    },
    24,
    24,
  )
  yElements.push([duplicate])
  selectedElementId.value = duplicate.id
}

function handleBringToFront() {
  if (!selectedElement.value || !yElements) return

  const selected = cloneElement(selectedElement.value)
  removeElement(selected.id)
  yElements.push([selected])
  selectedElementId.value = selected.id
}

function handleSendToBack() {
  if (!selectedElement.value || !yElements) return

  const selected = cloneElement(selectedElement.value)
  removeElement(selected.id)
  yElements.insert(0, [selected])
  selectedElementId.value = selected.id
}

function updateSelectedElement(patch: Partial<BoardElement>) {
  if (!selectedElement.value) return
  replaceElement(selectedElement.value.id, {
    ...cloneElement(selectedElement.value),
    ...patch,
  })
}

function updateSelectedStroke(value: string) {
  color.value = value
  if (selectedElement.value) updateSelectedElement({ color: value })
}

function handleCustomColorInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  customColor.value = value
  updateSelectedStroke(value)
}

function updateSelectedFill(value: string) {
  backgroundColor.value = value
  if (selectedElement.value) {
    updateSelectedElement({
      fill: value,
      fillStyle: value === 'transparent' ? 'none' : 'solid',
    })
  }
}

function updateSelectedFillStyle(fillStyle: BoardElement['fillStyle']) {
  if (selectedElement.value) updateSelectedElement({ fillStyle })
}

function updateSelectedWidth(value: number) {
  strokeWidth.value = value
  if (selectedElement.value) updateSelectedElement({ width: value })
}

function updateSelectedOpacity(value: number) {
  if (selectedElement.value) updateSelectedElement({ opacity: value / 100 })
}

function handleOpacityInput(event: Event) {
  updateSelectedOpacity(Number((event.target as HTMLInputElement).value))
}

function handleClear() {
  if (!canWrite.value || objectCount.value === 0) return
  showClearConfirm.value = true
}

function confirmClear() {
  if (yElements?.length) yElements.delete(0, yElements.length)
  showClearConfirm.value = false
  success('Canvas limpo')
}

function createNote(point: BoardPoint) {
  if (!yElements) return

  const note: BoardElement = {
    id: crypto.randomUUID(),
    type: 'note',
    color: 'var(--text)',
    fill: 'var(--surface-3)',
    fillStyle: 'solid',
    variant: 'flow-card',
    width: 2,
    opacity: 1,
    start: point,
    end: { x: point.x + 320, y: point.y + 150 },
    text: 'O que esperado:\nDescreva o comportamento aqui',
    fontSize: 16,
    createdAt: Date.now(),
  }
  yElements.push([note])
  selectedElementId.value = note.id
  tool.value = 'select'
}

function createQuickShape(type: 'line' | 'arrow' | 'rect' | 'ellipse' | 'diamond', point: BoardPoint) {
  if (!yElements) return

  const end =
    type === 'line' || type === 'arrow'
      ? { x: point.x + 180, y: point.y + 80 }
      : { x: point.x + 180, y: point.y + 110 }

  const shape: BoardElement = {
    id: crypto.randomUUID(),
    type,
    color: color.value,
    width: strokeWidth.value,
    opacity: 1,
    start: point,
    end,
    fill: backgroundColor.value,
    fillStyle: backgroundColor.value === 'transparent' ? 'none' : 'solid',
    createdAt: Date.now(),
  }
  yElements.push([shape])
  selectedElementId.value = shape.id
  tool.value = 'select'
}

async function generateDiagramFromPrompt() {
  const prompt = diagramPrompt.value.trim()
  if (!prompt || !yElements) return

  diagramLoading.value = true
  try {
    const diagram = await aiService.diagram(prompt)
    const origin = centerPoint()
    const nodePositions = new Map<string, BoardPoint>()
    const generated: BoardElement[] = diagram.nodes.map((node, index) => {
      const column = index % 3
      const row = Math.floor(index / 3)
      const start = { x: origin.x + column * 300 - 300, y: origin.y + row * 190 - 120 }
      nodePositions.set(node.id, start)
      return {
        id: crypto.randomUUID(),
        type: node.kind === 'decision' ? 'diamond' : 'note',
        color: 'var(--text)',
        width: 2,
        opacity: 1,
        start,
        end: { x: start.x + 220, y: start.y + 110 },
        text: node.label,
        fontSize: 16,
        fill: node.kind === 'decision'
          ? 'color-mix(in srgb, var(--warn) 18%, var(--surface))'
          : 'var(--surface-3)',
        fillStyle: 'solid',
        variant: 'flow-card',
        createdAt: Date.now(),
      }
    })

    const edges: BoardElement[] = diagram.edges.flatMap((edge) => {
      const from = nodePositions.get(edge.from)
      const to = nodePositions.get(edge.to)
      if (!from || !to) return []
      return [{
        id: crypto.randomUUID(),
        type: 'arrow',
        color: 'var(--accent)',
        width: 2,
        opacity: 1,
        start: { x: from.x + 220, y: from.y + 55 },
        end: { x: to.x, y: to.y + 55 },
        text: edge.label,
        fontSize: 12,
        createdAt: Date.now(),
      }]
    })

    yElements.push([...generated, ...edges])
    diagramPrompt.value = ''
    actionsMenuOpen.value = false
    success('Diagrama gerado no canvas')
  } catch (err) {
    // Surface a mensagem do backend (ex.: 503 "IA indisponível") em vez de texto
    // genérico — conforme o spec de integração copilot.
    showError(getApiErrorMessage(err, 'Não foi possível gerar o diagrama'))
  } finally {
    diagramLoading.value = false
  }
}

function handleImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !file.type.startsWith('image/')) return

  const reader = new FileReader()
  reader.onload = () => {
    if (!yElements || typeof reader.result !== 'string') return

    const point = imageInsertPoint.value ?? centerPoint()
    const image: BoardElement = {
      id: crypto.randomUUID(),
      type: 'image',
      color: 'var(--text)',
      width: 1,
      opacity: 1,
      start: point,
      end: { x: point.x + 320, y: point.y + 200 },
      src: reader.result,
      createdAt: Date.now(),
    }
    yElements.push([image])
    selectedElementId.value = image.id
    tool.value = 'select'
    imageInsertPoint.value = null
  }
  reader.readAsDataURL(file)
}

function centerPoint(): BoardPoint {
  return {
    x: Math.round(viewportOffset.value.x + viewportSize.value.width / 2 - 160),
    y: Math.round(viewportOffset.value.y + viewportSize.value.height / 2 - 100),
  }
}

function replaceElement(id: string, next: BoardElement) {
  if (!yElements) return
  const arr = yElements
  const index = arr.toArray().findIndex((element) => element.id === id)
  if (index < 0) return
  // delete + insert como UMA transação atômica: move/resize gera um único update
  // Yjs e não corre o risco de perder o elemento se a conexão cair entre as duas
  // operações (era um delete e um insert separados).
  ;(arr.doc ?? ydoc)?.transact(() => {
    arr.delete(index, 1)
    arr.insert(index, [next])
  })
  selectedElementId.value = next.id
}

function removeElement(id: string) {
  if (!yElements) return
  const index = yElements.toArray().findIndex((element) => element.id === id)
  if (index < 0) return
  yElements.delete(index, 1)
}

function cloneElement(element: BoardElement): BoardElement {
  return {
    ...element,
    start: element.start ? { ...element.start } : undefined,
    end: element.end ? { ...element.end } : undefined,
    points: element.points?.map((point) => ({ ...point })),
  }
}

function moveElement(element: BoardElement, dx: number, dy: number): BoardElement {
  return {
    ...element,
    start: element.start ? { x: element.start.x + dx, y: element.start.y + dy } : undefined,
    end: element.end ? { x: element.end.x + dx, y: element.end.y + dy } : undefined,
    points: element.points?.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
  }
}

function resizeElement(element: BoardElement, handle: ResizeHandle, dx: number, dy: number): BoardElement {
  if (element.type === 'freedraw') return element

  if (element.type === 'text') {
    const nextFontSize = Math.max(10, Math.min(96, (element.fontSize ?? 16) + (handle === 'e' ? dx : dy) / 3))
    return {
      ...element,
      fontSize: Math.round(nextFontSize),
    }
  }

  const start = elementStart(element)
  const originalEnd = elementEnd(element)
  const end = {
    x: originalEnd.x + (handle === 'e' || handle === 'se' ? dx : 0),
    y: originalEnd.y + (handle === 's' || handle === 'se' ? dy : 0),
  }

  return {
    ...element,
    start,
    end: {
      x: Math.abs(end.x - start.x) < 12 ? start.x + 12 : end.x,
      y: Math.abs(end.y - start.y) < 12 ? start.y + 12 : end.y,
    },
  }
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
  const defs = `<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${escapeAttr(gridStroke)}" stroke-width="1" opacity="0.35"/></pattern><pattern id="flow-hachure" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="transparent"/><path d="M 0 0 L 0 10" stroke="${escapeAttr(gridStroke)}" stroke-width="2" opacity="0.5"/></pattern></defs>`
  const grid = showGrid.value
    ? `<rect width="100%" height="100%" fill="url(#grid)"/>`
    : ''
  const strokeMarkup = elements.value
    .filter((element) => element.type === 'freedraw')
    .map(
      (stroke) =>
        `<path d="${escapeAttr(freehandPath(stroke))}" fill="${escapeAttr(resolveCssColor(stroke.color))}" opacity="${stroke.opacity}"/>`,
    )
    .join('')
  const elementMarkup = elements.value
    .filter((element) => element.type !== 'freedraw')
    .map(exportElementSvg)
    .join('')
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewportOffset.value.x} ${viewportOffset.value.y} ${width} ${height}"><rect x="${viewportOffset.value.x}" y="${viewportOffset.value.y}" width="${width}" height="${height}" fill="${escapeAttr(background)}"/>${defs}${grid}${strokeMarkup}${elementMarkup}</svg>`

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
  const start = elementStart(element)
  const end = elementEnd(element)

  if (element.type === 'line') {
    return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" ${common}/>`
  }

  if (element.type === 'arrow') {
    return `<g opacity="${element.opacity}"><line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" fill="none" stroke="${stroke}" stroke-width="${element.width}" stroke-linecap="round" stroke-linejoin="round"/><polygon points="${escapeAttr(arrowHeadPoints(element))}" fill="${stroke}"/></g>`
  }

  if (element.type === 'text') {
    return `<text x="${start.x}" y="${start.y}" fill="${stroke}" font-family="Inter, Arial, sans-serif" font-size="${element.fontSize ?? 16}" dominant-baseline="hanging" opacity="${element.opacity}">${escapeText(element.text ?? '')}</text>`
  }

  const normalized = normalizedElement(element)
  if (element.type === 'note') {
    const fill = escapeAttr(resolvedElementFill(element))
    const lines = textLines(element.text)
      .map(
        (line, index) =>
          `<tspan x="${normalized.x + 18}" dy="${index === 0 ? 0 : (element.fontSize ?? 16) * 1.45}">${escapeText(line)}</tspan>`,
      )
      .join('')
    return `<g opacity="${element.opacity}"><rect x="${normalized.x}" y="${normalized.y}" width="${normalized.width}" height="${normalized.height}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="${normalized.x + 18}" y="${normalized.y + 20}" fill="${stroke}" font-family="Inter, Arial, sans-serif" font-size="${element.fontSize ?? 16}" dominant-baseline="hanging">${lines}</text></g>`
  }

  if (element.type === 'image' && element.src) {
    return `<image href="${escapeAttr(element.src)}" x="${normalized.x}" y="${normalized.y}" width="${normalized.width}" height="${normalized.height}" preserveAspectRatio="xMidYMid meet" opacity="${element.opacity}"/>`
  }

  if (element.type === 'rect') {
    return `<rect x="${normalized.x}" y="${normalized.y}" width="${normalized.width}" height="${normalized.height}" fill="${escapeAttr(resolvedElementFill(element))}" stroke="${stroke}" stroke-width="${element.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.opacity}"/>`
  }

  if (element.type === 'diamond') {
    return `<polygon points="${escapeAttr(diamondPoints(element))}" fill="${escapeAttr(resolvedElementFill(element))}" stroke="${stroke}" stroke-width="${element.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.opacity}"/>`
  }

  return `<ellipse cx="${normalized.cx}" cy="${normalized.cy}" rx="${normalized.rx}" ry="${normalized.ry}" fill="${escapeAttr(resolvedElementFill(element))}" stroke="${stroke}" stroke-width="${element.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${element.opacity}"/>`
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

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable
}

function handleKeyDown(event: KeyboardEvent) {
  if (isTypingTarget(event.target)) return

  if (event.code === 'Space') {
    event.preventDefault()
    isSpacePanning.value = true
    return
  }

  if (event.key === 'Escape') {
    contextMenu.value = null
    actionsMenuOpen.value = false
    cancelTextDraft()
    selectedElementId.value = null
    return
  }

  if (event.key === 'Enter' && selectedElement.value?.type === 'text') {
    event.preventDefault()
    openElementTextEditor(selectedElement.value)
    return
  }

  if (event.key === 'Enter' && selectedElement.value?.type === 'note') {
    event.preventDefault()
    openElementTextEditor(selectedElement.value)
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    handleUndo()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    handleDuplicateSelected()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    success('Auto-save ativo: o board já está sincronizando em tempo real')
    return
  }

  if (event.ctrlKey || event.metaKey) {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomIn()
      return
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      zoomOut()
      return
    }
    if (event.key === '0') {
      event.preventDefault()
      resetViewport()
      return
    }
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedElement.value) {
      event.preventDefault()
      handleDeleteSelected()
    }
    return
  }

  const nextTool = shortcutTool(event.key)
  if (nextTool) {
    tool.value = nextTool
    event.preventDefault()
  }
}

function handleKeyUp(event: KeyboardEvent) {
  if (event.code === 'Space') isSpacePanning.value = false
}

function shortcutTool(key: string): CanvasTool | null {
  const shortcut = key.toLowerCase()
  const shortcuts: Record<string, CanvasTool> = {
    v: 'select',
    p: 'pen',
    h: 'marker',
    a: 'arrow',
    l: 'line',
    r: 'rect',
    d: 'diamond',
    o: 'ellipse',
    t: 'text',
    n: 'note',
    i: 'image',
  }
  return shortcuts[shortcut] ?? null
}

async function toggleFullscreen() {
  const target = pageRef.value
  if (!target) return

  if (document.fullscreenElement) {
    await document.exitFullscreen()
  } else {
    await target.requestFullscreen()
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  nextTick(updateSurfaceSize)
}

function updateSurfaceSize() {
  const svg = svgRef.value
  const rect = svg?.getBoundingClientRect()
  const fallbackHeight = Math.max(window.innerHeight - 140, 480)
  surfaceSize.value = {
    width: Math.max(rect?.width ?? svg?.clientWidth ?? 1, 1),
    height: Math.max(rect?.height ?? svg?.clientHeight ?? fallbackHeight, 1),
  }
}

function scheduleSurfaceSizeSync() {
  void nextTick(() => {
    updateSurfaceSize()
    window.requestAnimationFrame(updateSurfaceSize)
    window.setTimeout(updateSurfaceSize, 120)
  })
}

function cleanupCanvasPage() {
  teardown()
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('resize', updateSurfaceSize)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
}

onMounted(() => {
  ensureActiveRole()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('resize', updateSurfaceSize)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  scheduleSurfaceSizeSync()
})
onBeforeUnmount(cleanupCanvasPage)
</script>

<template>
  <main ref="pageRef" class="canvas-page" :class="{ 'canvas-page--fullscreen': isFullscreen }">
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
              :aria-label="option.label"
              @click="tool = option.id"
            >
              <component :is="option.icon" :size="14" />
              <span class="tool-tab-label">{{ option.label }}</span>
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
            <label
              class="color-swatch color-swatch--custom"
              :class="{ 'color-swatch--active': color === customColor }"
              title="Cor personalizada"
              :style="{ '--swatch-color': customColor }"
            >
              <input :value="customColor" type="color" aria-label="Cor personalizada" @input="handleCustomColorInput" />
            </label>
          </div>

          <label class="range-field">
            <span>{{ strokeWidth }}px</span>
            <input v-model.number="strokeWidth" type="range" min="1" max="12" />
          </label>

          <div class="toolbar-divider" />

          <div class="zoom-controls" aria-label="Zoom do canvas">
            <button class="tool-btn tool-btn--square" type="button" title="Ctrl -" @click="zoomOut">
              <ZoomOut :size="14" />
            </button>
            <button class="zoom-value" type="button" title="Ctrl 0" @click="resetViewport">
              {{ zoomLabel }}
            </button>
            <button class="tool-btn tool-btn--square" type="button" title="Ctrl +" @click="zoomIn">
              <ZoomIn :size="14" />
            </button>
          </div>

          <div class="toolbar-divider" />

          <button class="tool-btn" type="button" :disabled="!canWrite" title="Ctrl+Z" @click="handleUndo">
            <Undo2 :size="14" />
            Desfazer
          </button>
          <button class="tool-btn" type="button" :disabled="!selectedElement" title="Ctrl+D" @click="handleDuplicateSelected">
            <Copy :size="14" />
            Duplicar
          </button>
          <button class="tool-btn" type="button" :disabled="!selectedElement" title="Delete" @click="handleDeleteSelected">
            <Trash2 :size="14" />
            Excluir item
          </button>
          <div class="actions-menu-wrap">
            <button class="tool-btn" type="button" @click="actionsMenuOpen = !actionsMenuOpen">
              <MoreHorizontal :size="14" />
              Ações
            </button>
            <div v-if="actionsMenuOpen" class="actions-menu" @click.stop>
              <div class="actions-menu__header">
                <strong>Ações do canvas</strong>
                <span>Visualização, exportação e organização</span>
              </div>

              <div class="actions-menu__section">
                <span class="actions-menu__label">Visualização</span>
                <div class="actions-menu__grid">
                  <button type="button" @click="actionsMenuOpen = false; toggleFullscreen()">
                    <component :is="isFullscreen ? Minimize2 : Maximize2" :size="14" />
                    <span>{{ isFullscreen ? 'Sair da tela cheia' : 'Tela cheia' }}</span>
                  </button>
                  <button type="button" @click="actionsMenuOpen = false; resetViewport()">
                    <Hand :size="14" />
                    <span>Centralizar</span>
                  </button>
                  <button type="button" @click="actionsMenuOpen = false; showGrid = !showGrid">
                    <Square :size="14" />
                    <span>{{ showGrid ? 'Ocultar grade' : 'Mostrar grade' }}</span>
                  </button>
                  <button type="button" @click="actionsMenuOpen = false; showInspector = !showInspector">
                    <PanelRight :size="14" />
                    <span>{{ showInspector ? 'Ocultar painel' : 'Mostrar painel' }}</span>
                  </button>
                </div>
              </div>

              <div class="actions-menu__section">
                <span class="actions-menu__label">Seleção</span>
                <div class="actions-menu__grid">
                  <button type="button" :disabled="!selectedElement" @click="actionsMenuOpen = false; handleBringToFront()">
                    <BringToFront :size="14" />
                    <span>Para frente</span>
                  </button>
                  <button type="button" :disabled="!selectedElement" @click="actionsMenuOpen = false; handleSendToBack()">
                    <SendToBack :size="14" />
                    <span>Para fundo</span>
                  </button>
                  <button type="button" :disabled="!selectedElement" @click="actionsMenuOpen = false; handleDuplicateSelected()">
                    <Copy :size="14" />
                    <span>Duplicar</span>
                  </button>
                  <button
                    class="danger"
                    type="button"
                    :disabled="!selectedElement"
                    @click="actionsMenuOpen = false; handleDeleteSelected()"
                  >
                    <Trash2 :size="14" />
                    <span>Excluir item</span>
                  </button>
                </div>
              </div>

              <div class="actions-menu__section">
                <span class="actions-menu__label">IA</span>
                <textarea
                  v-model="diagramPrompt"
                  class="actions-menu__textarea"
                  rows="3"
                  placeholder="Descreva um fluxo para transformar em diagrama..."
                  :disabled="diagramLoading || !canWrite"
                />
                <button
                  class="actions-menu__row"
                  type="button"
                  :disabled="!diagramPrompt.trim() || diagramLoading || !canWrite"
                  @click="generateDiagramFromPrompt"
                >
                  <Sparkles :size="14" />
                  <span>
                    <strong>{{ diagramLoading ? 'Gerando...' : 'Texto para diagrama' }}</strong>
                    <small>Insere cards e conectores no canvas</small>
                  </span>
                </button>
              </div>

              <div class="actions-menu__section">
                <span class="actions-menu__label">Arquivo</span>
                <button class="actions-menu__row" type="button" @click="actionsMenuOpen = false; handleExportSvg()">
                  <Download :size="14" />
                  <span>
                    <strong>Exportar SVG</strong>
                    <small>Baixa uma cópia vetorial do fluxo</small>
                  </span>
                </button>
              </div>

              <div class="actions-menu__section actions-menu__section--danger">
                <span class="actions-menu__label">Perigo</span>
                <button class="actions-menu__row danger" type="button" :disabled="!canWrite" @click="actionsMenuOpen = false; handleClear()">
                  <Trash2 :size="14" />
                  <span>
                    <strong>Limpar canvas</strong>
                    <small>Remove todos os objetos deste board</small>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <section v-if="isLoading" class="state">
      <Loader2 :size="22" class="spin" />
      <span>Carregando board...</span>
    </section>

    <section v-else class="canvas-shell" :class="{ 'canvas-shell--inspector': showInspector }">
      <div
        class="canvas-stage"
        :class="{ 'canvas-stage--panning': isPanningMode }"
        @click="handleCanvasClick"
        @contextmenu="handleCanvasContextMenu"
      >
        <div class="floating-help">
          <Save :size="13" />
          <span>Auto-save via realtime</span>
        </div>

        <svg
          ref="svgRef"
          class="drawing-surface"
          :viewBox="svgViewBox"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointerleave="handlePointerUp"
        >
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" class="grid-line" />
            </pattern>
            <pattern id="flow-hachure" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="10" fill="transparent" />
              <path d="M 0 0 L 0 10" class="hachure-line" />
            </pattern>
          </defs>
          <rect
            v-if="showGrid"
            :x="gridRect.x"
            :y="gridRect.y"
            :width="gridRect.width"
            :height="gridRect.height"
            fill="url(#grid)"
          />
          <path
            v-for="stroke in allStrokes"
            :key="stroke.id"
            :d="freehandPath(stroke)"
            :fill="stroke.color"
            :opacity="stroke.opacity"
            class="freehand-stroke selectable"
            :class="{ selected: selectedElementId === stroke.id }"
            @pointerdown="handleElementPointerDown(stroke, $event)"
          />
          <polyline
            v-for="stroke in allStrokes"
            :key="`${stroke.id}-hit`"
            :points="pathPoints(stroke.points ?? [])"
            :stroke-width="Math.max(18, stroke.width + 12)"
            class="hit-stroke"
            @pointerdown="handleElementPointerDown(stroke, $event)"
          />
          <template v-for="element in allElements" :key="element.id">
            <line
              v-if="element.type === 'line'"
              :x1="elementStart(element).x"
              :y1="elementStart(element).y"
              :x2="elementEnd(element).x"
              :y2="elementEnd(element).y"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="stroke selectable"
              :class="{ selected: selectedElementId === element.id }"
              @pointerdown="handleElementPointerDown(element, $event)"
            />
            <g
              v-else-if="element.type === 'arrow'"
              class="selectable"
              :class="{ selected: selectedElementId === element.id }"
              @pointerdown="handleElementPointerDown(element, $event)"
            >
              <line
                :x1="elementStart(element).x"
                :y1="elementStart(element).y"
                :x2="elementEnd(element).x"
                :y2="elementEnd(element).y"
                :stroke="element.color"
                :stroke-width="element.width"
                :opacity="element.opacity"
                class="stroke"
              />
              <polygon :points="arrowHeadPoints(element)" :fill="element.color" :opacity="element.opacity" />
            </g>
            <rect
              v-else-if="element.type === 'rect'"
              :x="normalizedElement(element).x"
              :y="normalizedElement(element).y"
              :width="normalizedElement(element).width"
              :height="normalizedElement(element).height"
              :fill="elementFill(element)"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="shape selectable"
              :class="{ selected: selectedElementId === element.id }"
              @pointerdown="handleElementPointerDown(element, $event)"
            />
            <polygon
              v-else-if="element.type === 'diamond'"
              :points="diamondPoints(element)"
              :fill="elementFill(element)"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="shape selectable"
              :class="{ selected: selectedElementId === element.id }"
              @pointerdown="handleElementPointerDown(element, $event)"
            />
            <g
              v-else-if="element.type === 'note'"
              class="selectable flow-note"
              :class="{ selected: selectedElementId === element.id }"
              @dblclick.stop="openElementTextEditor(element)"
              @pointerdown="handleElementPointerDown(element, $event)"
            >
              <rect
                :x="normalizedElement(element).x"
                :y="normalizedElement(element).y"
                :width="normalizedElement(element).width"
                :height="normalizedElement(element).height"
                :fill="elementFill(element)"
                :stroke="element.color"
                :stroke-width="element.width"
                :opacity="0.96"
                rx="10"
              />
              <text
                :x="normalizedElement(element).x + 18"
                :y="normalizedElement(element).y + 20"
                :fill="element.color"
                :font-size="element.fontSize ?? 16"
                class="canvas-text"
              >
                <tspan
                  v-for="(line, index) in textLines(element.text)"
                  :key="`${element.id}-${index}`"
                  :x="normalizedElement(element).x + 18"
                  :dy="index === 0 ? 0 : (element.fontSize ?? 16) * 1.45"
                >
                  {{ line }}
                </tspan>
              </text>
            </g>
            <image
              v-else-if="element.type === 'image'"
              :href="element.src"
              :x="normalizedElement(element).x"
              :y="normalizedElement(element).y"
              :width="normalizedElement(element).width"
              :height="normalizedElement(element).height"
              preserveAspectRatio="xMidYMid meet"
              class="selectable image-element"
              :class="{ selected: selectedElementId === element.id }"
              @pointerdown="handleElementPointerDown(element, $event)"
            />
            <text
              v-else-if="element.type === 'text'"
              :x="elementStart(element).x"
              :y="elementStart(element).y"
              :fill="element.color"
              :font-size="element.fontSize ?? 16"
              :opacity="element.opacity"
              class="canvas-text selectable"
              :class="{ selected: selectedElementId === element.id }"
              @dblclick.stop="openElementTextEditor(element)"
              @pointerdown="handleElementPointerDown(element, $event)"
            >
              {{ element.text }}
            </text>
            <ellipse
              v-else
              :cx="normalizedElement(element).cx"
              :cy="normalizedElement(element).cy"
              :rx="normalizedElement(element).rx"
              :ry="normalizedElement(element).ry"
              :fill="elementFill(element)"
              :stroke="element.color"
              :stroke-width="element.width"
              :opacity="element.opacity"
              class="shape selectable"
              :class="{ selected: selectedElementId === element.id }"
              @pointerdown="handleElementPointerDown(element, $event)"
            />
          </template>
          <g v-if="selectedBounds && selectedElement?.type !== 'freedraw'" class="selection-box">
            <rect
              :x="selectedBounds.x - 8"
              :y="selectedBounds.y - 8"
              :width="selectedBounds.width + 16"
              :height="selectedBounds.height + 16"
              rx="6"
            />
            <circle
              class="resize-handle resize-handle--e"
              :cx="selectedBounds.x + selectedBounds.width + 8"
              :cy="selectedBounds.y + selectedBounds.height / 2"
              r="4.5"
              @pointerdown="handleResizePointerDown('e', $event)"
            />
            <circle
              class="resize-handle resize-handle--s"
              :cx="selectedBounds.x + selectedBounds.width / 2"
              :cy="selectedBounds.y + selectedBounds.height + 8"
              r="4.5"
              @pointerdown="handleResizePointerDown('s', $event)"
            />
            <circle
              class="resize-handle resize-handle--se"
              :cx="selectedBounds.x + selectedBounds.width + 8"
              :cy="selectedBounds.y + selectedBounds.height + 8"
              r="5.5"
              @pointerdown="handleResizePointerDown('se', $event)"
            />
          </g>
        </svg>

        <input
          ref="imageInputRef"
          class="hidden-file-input"
          type="file"
          accept="image/*"
          @change="handleImageSelected"
        />

        <textarea
          v-if="textDraft"
          ref="textInputRef"
          v-model="textDraft.value"
          class="text-draft-input"
          :style="{
            transform: `translate(${(textDraft.x - viewportOffset.x) * zoom}px, ${(textDraft.y - viewportOffset.y) * zoom}px)`,
            color: textDraft.color,
            fontSize: `${textDraft.fontSize}px`,
          }"
          placeholder="Digite..."
          @blur="commitTextDraft"
          @keydown.ctrl.enter.prevent="commitTextDraft"
          @keydown.meta.enter.prevent="commitTextDraft"
          @keydown.esc.prevent="cancelTextDraft"
          @click.stop
        />

        <div
          v-if="contextMenu"
          class="canvas-context-menu"
          :style="{ transform: `translate(${contextMenu.x}px, ${contextMenu.y}px)` }"
          @click.stop
          @contextmenu.prevent
        >
          <span class="context-title">Inserir</span>
          <button type="button" @click="handleContextAction('text')">
            <Type :size="13" />
            Texto
          </button>
          <button type="button" @click="handleContextAction('note')">
            <StickyNote :size="13" />
            Flow card
          </button>
          <button type="button" @click="handleContextAction('image')">
            <ImagePlus :size="13" />
            Imagem
          </button>
          <div class="context-sep" />
          <span class="context-title">Formas rápidas</span>
          <div class="context-grid">
            <button type="button" @click="handleContextAction('rect')">
              <Square :size="13" />
              Retângulo
            </button>
            <button type="button" @click="handleContextAction('ellipse')">
              <Circle :size="13" />
              Elipse
            </button>
            <button type="button" @click="handleContextAction('line')">
              <Minus :size="13" />
              Linha
            </button>
            <button type="button" @click="handleContextAction('arrow')">
              <ArrowRight :size="13" />
              Seta
            </button>
            <button type="button" @click="handleContextAction('diamond')">
              <Diamond :size="13" />
              Decisão
            </button>
          </div>
          <template v-if="selectedElement">
            <div class="context-sep" />
            <span class="context-title">Seleção</span>
            <button type="button" @click="handleContextAction('duplicate-selection')">
              <Copy :size="13" />
              Duplicar
            </button>
            <button type="button" class="danger" @click="handleContextAction('delete-selection')">
              <Trash2 :size="13" />
              Excluir
            </button>
          </template>
        </div>

        <div v-if="!canWrite" class="readonly-banner">
          Seu papel atual permite visualizar, mas não desenhar neste board.
        </div>

        <div
          v-for="presence in remotePresences"
          :key="presence.clientId"
          class="remote-cursor"
          :style="{
            transform: `translate(${(presence.cursor.x - viewportOffset.x) * zoom}px, ${(presence.cursor.y - viewportOffset.y) * zoom}px)`,
            '--cursor-color': presence.color,
          }"
        >
          <MousePointer2 :size="16" />
          <span>{{ presence.name }}</span>
        </div>
      </div>

      <aside v-if="showInspector" class="inspector">
        <div v-if="selectedElement" class="inspector-card inspector-card--selected">
          <span class="inspector-label">Selecionado</span>
          <strong>{{ selectedElement.type }}</strong>
          <p>Arraste para mover. Em texto/card, duplo clique ou Enter abre edição inline.</p>
        </div>
        <div class="style-panel">
          <div class="style-section">
            <span class="style-label">Stroke</span>
            <div class="swatch-grid">
              <button
                v-for="option in colorOptions"
                :key="`stroke-${option.value}`"
                class="style-swatch"
                :class="{ 'style-swatch--active': (selectedElement?.color ?? color) === option.value }"
                type="button"
                :title="option.label"
                :style="{ '--swatch-color': option.value }"
                @click="updateSelectedStroke(option.value)"
              />
            </div>
          </div>

          <div class="style-section">
            <span class="style-label">Background</span>
            <div class="swatch-grid">
              <button
                v-for="option in backgroundOptions"
                :key="`bg-${option.value}`"
                class="style-swatch"
                :class="{ 'style-swatch--active': (selectedElement?.fill ?? backgroundColor) === option.value }"
                type="button"
                :title="option.label"
                :style="{ '--swatch-color': option.value }"
                @click="updateSelectedFill(option.value)"
              />
            </div>
          </div>

          <div class="style-section">
            <span class="style-label">Fill</span>
            <div class="segmented-buttons">
              <button
                type="button"
                :class="{ active: (selectedElement?.fillStyle ?? 'none') === 'none' }"
                @click="updateSelectedFillStyle('none')"
              >
                vazio
              </button>
              <button
                type="button"
                :class="{ active: (selectedElement?.fillStyle ?? 'none') === 'hachure' }"
                @click="updateSelectedFillStyle('hachure')"
              >
                hachura
              </button>
              <button
                type="button"
                :class="{ active: (selectedElement?.fillStyle ?? 'none') === 'solid' }"
                @click="updateSelectedFillStyle('solid')"
              >
                sólido
              </button>
            </div>
          </div>

          <div class="style-section">
            <span class="style-label">Stroke width</span>
            <div class="segmented-buttons">
              <button
                v-for="width in [2, 4, 7]"
                :key="width"
                type="button"
                :class="{ active: (selectedElement?.width ?? strokeWidth) === width }"
                @click="updateSelectedWidth(width)"
              >
                {{ width }}px
              </button>
            </div>
          </div>

          <label class="style-section">
            <span class="style-label">Opacity</span>
            <input
              :value="Math.round((selectedElement?.opacity ?? 1) * 100)"
              type="range"
              min="10"
              max="100"
              @input="handleOpacityInput"
            />
          </label>

          <div class="style-section">
            <span class="style-label">Layers</span>
            <div class="action-grid">
              <button type="button" :disabled="!selectedElement" @click="handleSendToBack">
                <SendToBack :size="14" />
                fundo
              </button>
              <button type="button" :disabled="!selectedElement" @click="handleBringToFront">
                <BringToFront :size="14" />
                frente
              </button>
            </div>
          </div>

          <div class="style-section">
            <span class="style-label">Actions</span>
            <div class="action-grid">
              <button type="button" :disabled="!selectedElement" @click="handleDuplicateSelected">
                <Copy :size="14" />
                duplicar
              </button>
              <button type="button" :disabled="!selectedElement" @click="success('Link copiado para este elemento')">
                <Link :size="14" />
                link
              </button>
              <button type="button" :disabled="!selectedElement" class="danger" @click="handleDeleteSelected">
                <Trash2 :size="14" />
                excluir
              </button>
            </div>
          </div>
        </div>

        <div class="inspector-card">
          <span class="inspector-label">Atalhos</span>
          <p>Espaço move a tela. Ctrl+Z desfaz. Delete remove. V/P/A/R/D/O/T/N alternam ferramentas.</p>
        </div>

        <CommentsPanel entity-type="BOARD" :entity-id="boardId" title="Comentários do board" compact />
      </aside>
    </section>

    <ConfirmDialog
      v-model="showClearConfirm"
      danger
      title="Limpar canvas?"
      message="Isso remove todos os objetos deste board. Esta ação não pode ser desfeita."
      confirm-label="Limpar canvas"
      @confirm="confirmClear"
    />
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

.canvas-page--fullscreen {
  width: 100vw;
  height: 100vh;
  background: var(--bg);
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
  align-items: flex-start;
}

.toolbar-row--disabled {
  opacity: 0.65;
}

.toolbar-scroll {
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: visible;
  scrollbar-width: thin;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 1px;
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
  min-height: 34px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  flex: 0 0 auto;
  max-width: min(100%, 420px);
}

.tool-tab {
  height: 26px;
  width: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.tool-tab-label {
  display: none;
}

.tool-tab:hover {
  color: var(--text);
  background: var(--surface-3);
}

.tool-tab--active {
  color: var(--text);
  background: var(--surface-3);
  box-shadow: inset 0 -2px 0 var(--text);
}

.color-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--swatch-color);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.color-swatch--active {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}

.color-swatch--custom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--swatch-color);
}

.color-swatch--custom::after {
  content: '';
  width: 8px;
  height: 8px;
  border: 1px solid var(--surface);
  border-radius: 999px;
  background: var(--swatch-color);
  box-shadow: 0 0 0 1px var(--border-strong);
}

.color-swatch--custom input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  opacity: 0;
  cursor: pointer;
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

.tool-btn--square {
  width: 34px;
  justify-content: center;
  padding: 0;
}

.tool-btn--danger {
  color: var(--err);
}

.zoom-controls {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  flex: 0 0 auto;
}

.zoom-controls .tool-btn {
  height: 26px;
  border: 0;
  background: transparent;
}

.zoom-value {
  min-width: 52px;
  height: 26px;
  border: 0;
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 800;
  cursor: pointer;
}

.zoom-value:hover {
  color: var(--text);
  background: var(--surface-3);
}

.actions-menu-wrap {
  position: relative;
  flex: 0 0 auto;
}

.actions-menu {
  position: fixed;
  right: 18px;
  top: 92px;
  z-index: 40;
  width: min(360px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: 8px 8px 0 color-mix(in srgb, var(--text) 12%, transparent);
}

.actions-menu__header {
  padding: 5px 6px 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.actions-menu__header strong {
  color: var(--text);
  font-size: 13px;
}

.actions-menu__header span {
  color: var(--text-3);
  font-size: 11px;
}

.actions-menu__section {
  padding: 10px 0 0;
}

.actions-menu__section + .actions-menu__section {
  margin-top: 10px;
  border-top: 1px solid var(--border);
}

.actions-menu__section--danger {
  padding-bottom: 2px;
}

.actions-menu__label {
  display: block;
  margin: 0 6px 7px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.actions-menu__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.actions-menu__grid button,
.actions-menu__row {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.actions-menu__grid button:hover,
.actions-menu__row:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
  color: var(--text);
}

.actions-menu__grid button:disabled,
.actions-menu__row:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.actions-menu__row > span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.actions-menu__row strong {
  color: inherit;
  font-size: 12px;
}

.actions-menu__row small {
  color: var(--text-4);
  font-size: 11px;
  line-height: 1.25;
}

.actions-menu__textarea {
  width: 100%;
  min-height: 82px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  padding: 10px 12px;
  font: inherit;
  font-size: 12px;
  outline: none;
}

.actions-menu__textarea:focus {
  border-color: var(--border-strong);
}

.actions-menu__grid button.danger,
.actions-menu__row.danger {
  color: var(--err);
}

.canvas-shell {
  display: grid;
  grid-template-columns: 1fr;
  flex: 1;
  height: calc(100vh - 96px);
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
  min-height: 480px;
  height: 100%;
  overflow: hidden;
}

.canvas-stage--panning .drawing-surface,
.canvas-stage--panning .selectable,
.canvas-stage--panning .hit-stroke {
  cursor: grab;
}

.canvas-stage--panning:active .drawing-surface {
  cursor: grabbing;
}

.drawing-surface {
  width: 100%;
  height: 100%;
  min-height: 480px;
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

.hachure-line {
  stroke: var(--border-strong);
  stroke-width: 2;
  opacity: 0.55;
}

.stroke {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.freehand-stroke {
  vector-effect: non-scaling-stroke;
}

.hit-stroke {
  fill: none;
  stroke: transparent;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: stroke;
  cursor: grab;
}

.shape {
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.selectable {
  cursor: grab;
}

.selectable:active {
  cursor: grabbing;
}

.selected {
  stroke-dasharray: none;
  filter: none;
  outline: none;
}

.image-element {
  opacity: 0.95;
}

.flow-note.selected rect,
.shape.selected,
.image-element.selected {
  stroke: var(--accent);
  stroke-width: 2;
}

.canvas-text.selected {
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 4px;
}

.hidden-file-input {
  display: none;
}

.canvas-text {
  font-family: var(--font-mono);
  font-weight: 650;
  dominant-baseline: hanging;
  user-select: none;
  pointer-events: none;
}

.canvas-text.selectable {
  pointer-events: visiblePainted;
}

.flow-note .canvas-text {
  letter-spacing: -0.02em;
  pointer-events: none;
}

.flow-note rect {
  filter: none;
}

.text-draft-input {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 4;
  min-width: 180px;
  max-width: 360px;
  min-height: 42px;
  height: auto;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  outline: none;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--text) 16%, transparent);
  font-family: var(--font-family);
  font-weight: 650;
  line-height: 1.35;
  resize: both;
  white-space: pre-wrap;
}

.text-draft-input::placeholder {
  color: var(--text-4);
}

.canvas-context-menu {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 8;
  width: 190px;
  padding: 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 6px 6px 0 color-mix(in srgb, var(--text) 14%, transparent);
}

.context-title {
  display: block;
  padding: 5px 8px 4px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.canvas-context-menu button {
  width: 100%;
  height: 31px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.canvas-context-menu button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.canvas-context-menu button.danger {
  color: var(--err);
}

.context-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px;
}

.context-sep {
  height: 1px;
  margin: 5px 3px;
  background: var(--border);
}

.selection-box {
  pointer-events: all;
}

.selection-box rect {
  fill: color-mix(in srgb, var(--accent) 5%, transparent);
  stroke: var(--accent);
  stroke-width: 1.25;
  stroke-dasharray: none;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.resize-handle {
  fill: var(--accent);
  stroke: var(--surface);
  stroke-width: 2;
  pointer-events: all;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

.resize-handle--e {
  cursor: ew-resize;
}

.resize-handle--s {
  cursor: ns-resize;
}

.resize-handle--se {
  cursor: nwse-resize;
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
  background: var(--surface);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--text) 10%, transparent);
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

.inspector-card--selected {
  border-color: var(--border-strong);
  background: var(--surface-3);
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--text) 10%, transparent);
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

.style-panel {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.style-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.style-label {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
}

.swatch-grid {
  display: grid;
  grid-template-columns: repeat(6, 26px);
  gap: 7px;
}

.style-swatch {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 7px;
  background:
    linear-gradient(45deg, var(--surface-3) 25%, transparent 25%),
    linear-gradient(-45deg, var(--surface-3) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--surface-3) 75%),
    linear-gradient(-45deg, transparent 75%, var(--surface-3) 75%),
    var(--swatch-color);
  background-position:
    0 0,
    0 5px,
    5px -5px,
    -5px 0;
  background-size: 10px 10px;
  cursor: pointer;
}

.style-swatch--active {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.segmented-buttons,
.action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.segmented-buttons button,
.action-grid button {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.segmented-buttons button.active,
.action-grid button:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
  color: var(--text);
}

.action-grid button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.action-grid button.danger {
  color: var(--err);
}

.style-section input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
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
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--text) 12%, transparent);
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
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--text) 10%, transparent);
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
