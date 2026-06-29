<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Loader2, Paintbrush } from 'lucide-vue-next'
import * as Y from 'yjs'
import shareService, { type PublicBoardResponse } from '@/service/share/share-service'

type BoardPoint = { x: number; y: number }
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
  src?: string
}

const route = useRoute()
const response = ref<PublicBoardResponse | null>(null)
const elements = ref<BoardElement[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const token = computed(() => String(route.params.token ?? ''))
const viewBox = computed(() => {
  const points = elements.value.flatMap((element) => {
    if (element.points?.length) return element.points
    return [element.start, element.end].filter(Boolean) as BoardPoint[]
  })

  if (!points.length) return '0 0 1200 800'

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs) - 80
  const minY = Math.min(...ys) - 80
  const width = Math.max(...xs) - minX + 160
  const height = Math.max(...ys) - minY + 160
  return `${minX} ${minY} ${Math.max(width, 600)} ${Math.max(height, 400)}`
})

onMounted(async () => {
  try {
    response.value = await shareService.publicBoard(token.value)
    elements.value = decodeElements(response.value.ydocStateBase64)
  } catch {
    error.value = 'Não foi possível abrir este board público.'
  } finally {
    loading.value = false
  }
})

function decodeElements(state: string) {
  if (!state) return []

  const ydoc = new Y.Doc()
  const bytes = Uint8Array.from(atob(state), (char) => char.charCodeAt(0))
  Y.applyUpdate(ydoc, bytes)
  const next = ydoc.getArray<BoardElement>('elements').toArray()
  ydoc.destroy()
  return next
}

function pathFromPoints(points: BoardPoint[] = []) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function rectFor(element: BoardElement) {
  const start = element.start ?? { x: 0, y: 0 }
  const end = element.end ?? start
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function diamondPoints(element: BoardElement) {
  const rect = rectFor(element)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return `${cx},${rect.y} ${rect.x + rect.width},${cy} ${cx},${rect.y + rect.height} ${rect.x},${cy}`
}
</script>

<template>
  <main class="public-board">
    <section v-if="loading" class="state">
      <Loader2 :size="22" class="spin" />
      <span>Carregando board...</span>
    </section>

    <section v-else-if="error" class="state error">
      <Paintbrush :size="24" />
      <strong>{{ error }}</strong>
    </section>

    <template v-else-if="response">
      <header class="board-header">
        <span class="eyebrow">Board público</span>
        <h1>{{ response.board.title }}</h1>
        <p>Visualização somente leitura compartilhada pela equipe.</p>
      </header>

      <section class="canvas-shell">
        <svg class="canvas" :viewBox="viewBox" role="img" :aria-label="response.board.title">
          <g v-for="element in elements" :key="element.id" :opacity="element.opacity || 1">
            <path
              v-if="element.type === 'freedraw'"
              :d="pathFromPoints(element.points)"
              :stroke="element.color"
              :stroke-width="element.width"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <line
              v-else-if="element.type === 'line' || element.type === 'arrow'"
              :x1="element.start?.x"
              :y1="element.start?.y"
              :x2="element.end?.x"
              :y2="element.end?.y"
              :stroke="element.color"
              :stroke-width="element.width"
              stroke-linecap="round"
            />
            <rect
              v-else-if="element.type === 'rect' || element.type === 'note'"
              v-bind="rectFor(element)"
              :stroke="element.color"
              :stroke-width="element.width"
              :fill="element.fill || 'transparent'"
              rx="12"
            />
            <ellipse
              v-else-if="element.type === 'ellipse'"
              :cx="rectFor(element).x + rectFor(element).width / 2"
              :cy="rectFor(element).y + rectFor(element).height / 2"
              :rx="rectFor(element).width / 2"
              :ry="rectFor(element).height / 2"
              :stroke="element.color"
              :stroke-width="element.width"
              :fill="element.fill || 'transparent'"
            />
            <polygon
              v-else-if="element.type === 'diamond'"
              :points="diamondPoints(element)"
              :stroke="element.color"
              :stroke-width="element.width"
              :fill="element.fill || 'transparent'"
            />
            <image
              v-else-if="element.type === 'image' && element.src"
              :href="element.src"
              v-bind="rectFor(element)"
              preserveAspectRatio="xMidYMid slice"
            />
            <text
              v-if="element.text"
              :x="element.start?.x"
              :y="element.start?.y"
              :fill="element.color"
              :font-size="element.fontSize || 18"
            >
              {{ element.text }}
            </text>
          </g>
        </svg>
      </section>
    </template>
  </main>
</template>

<style scoped>
.public-board {
  min-height: 100vh;
  padding: 28px;
  background: var(--bg);
  color: var(--text);
}

.board-header {
  margin-bottom: 18px;
}

.eyebrow {
  color: var(--text-4);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.board-header h1 {
  margin: 8px 0;
  font-size: clamp(28px, 4vw, 44px);
}

.board-header p {
  margin: 0;
  color: var(--text-2);
}

.canvas-shell,
.state {
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
}

.canvas-shell {
  overflow: hidden;
  min-height: calc(100vh - 150px);
}

.canvas {
  display: block;
  width: 100%;
  min-height: calc(100vh - 150px);
  background:
    linear-gradient(var(--border) 1px, transparent 1px),
    linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 32px 32px;
}

.state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 220px;
  max-width: 520px;
  margin: 15vh auto 0;
  padding: 28px;
  color: var(--text-2);
  text-align: center;
}

.state.error {
  color: var(--err);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
