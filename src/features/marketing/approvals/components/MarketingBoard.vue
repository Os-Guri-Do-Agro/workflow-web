<script setup lang="ts">
/**
 * Board da Aprovação: uma coluna por status da trilha (`statusesFor`).
 *
 * - Computador: as colunas DIVIDEM a largura da tela (232px a 320px cada) e só
 *   rola de lado quando nem assim cabe. Coluna vazia e a coluna final da trilha
 *   (Publicado, Impresso e entregue) viram uma faixa de 44px com o nome na
 *   vertical e a contagem (regras em `board-columns.ts`); abrir ou recolher uma
 *   coluna com cards fica guardado por pessoa.
 * - Arrastar o card entre colunas (HTML5 drag and drop) emite `move` com o
 *   status e a posição entre os vizinhos; quem chama grava, e se o servidor
 *   recusar o card volta e a frase aparece. Durante o arraste nada muda de
 *   largura (a grade não pula embaixo do cursor): toda faixa vira alvo de
 *   soltura, e perto da borda o board rola sozinho quando ainda há rolagem.
 * - "Mover para" no próprio card (MarketingMoveMenu): o mesmo `move`, sem
 *   posição (vai para o fim da coluna), e o foco segue o card.
 * - Celular (<= 640px): uma coluna por vez com abas (`BoardColumnTabs` +
 *   `useBoardPager`, os mesmos do board de tarefas) e "Mover para" segurando o
 *   card (`useCardLongPress` + `MarketingMoveSheet`). Deslizar troca de coluna,
 *   nunca move card. Nada recolhe no celular.
 */
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type FunctionalComponent } from 'vue'
import { useEventListener } from '@vueuse/core'
import { ChevronsRightLeft } from 'lucide-vue-next'
import BoardColumnTabs, { type BoardColumnTab } from '@/components/tasks/BoardColumnTabs.vue'
import { useBoardPager } from '@/features/tasks/composables/useBoardPager'
import { useCardLongPress } from '@/features/tasks/composables/useCardLongPress'
import { useCurrentUser } from '@/composables/useCurrentUser'
import type { MarketingBrand, MarketingRole } from '@/service/marketing/marketing-core'
import type { MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { CARD_STATUS_TONE, cardStatusLabel, toneStyle, type CardStatus } from '../../marketing-labels'
import { moveInfoOf, type Track } from '../approvals-meta'
import { columnCollapsed, useBoardColumnChoices } from '../board-columns'
import MarketingBoardCard from './MarketingBoardCard.vue'
import MarketingMoveSheet, { type MoveSheetCard } from './MarketingMoveSheet.vue'

const props = defineProps<{
  cards: MarketingCardSummary[]
  statuses: CardStatus[]
  brands: MarketingBrand[]
  canMove: boolean
  role: MarketingRole | null
  /** Rótulo de "Aprovado" muda na peça impressa. */
  printTrack?: boolean
  pendingIds?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  open: [id: string]
  move: [id: string, status: CardStatus, position: number | undefined]
}>()

const brandOf = (id: string) => props.brands.find((b) => b.companyId === id)
const track = computed<Track>(() => (props.printTrack ? 'print' : 'digital'))

// ── Celular: uma coluna por vez ──────────────────────────────────────────
const scroller = ref<HTMLElement | null>(null)
const { paged, active, goTo } = useBoardPager(scroller)

// ── Colunas recolhidas ───────────────────────────────────────────────────
const { me } = useCurrentUser()
const { choiceOf, choose } = useBoardColumnChoices(() => me.value?.id ?? null)
/** Colunas vazias abertas por agora (clique na faixa); não grava. */
const peek = ref(new Set<CardStatus>())
/** Recolhidas no começo do arraste: o tempo real não mexe na grade embaixo do cursor. */
const frozen = ref<ReadonlySet<CardStatus> | null>(null)
/** Faixa que acabou de receber um card (destaque curto). */
const received = ref<CardStatus | null>(null)

/** Com uma coluna só (filtro de status) ou no celular, nada recolhe. */
const collapsible = computed(() => !paged.value && props.statuses.length > 1)

watch(track, () => {
  peek.value = new Set()
})

const columns = computed(() =>
  props.statuses.map((status) => {
    const cards = props.cards
      .filter((c) => c.status === status)
      .sort((a, b) => a.position - b.position || a.updatedAt.localeCompare(b.updatedAt))
    const collapsed =
      collapsible.value &&
      (frozen.value
        ? frozen.value.has(status)
        : columnCollapsed({
            status,
            count: cards.length,
            track: track.value,
            choice: choiceOf(track.value, status),
            peek: peek.value.has(status),
          }))
    return {
      status,
      label: cardStatusLabel(status, props.printTrack ? 'PRINT' : 'POST'),
      tone: CARD_STATUS_TONE[status],
      cards,
      collapsed,
    }
  }),
)
type Column = (typeof columns.value)[number]

const countLabel = (n: number) => (n === 1 ? '1 card' : `${n} cards`)

function colEl(status: CardStatus) {
  return scroller.value?.querySelector<HTMLElement>(`[data-col="${status}"]`) ?? null
}

async function expand(col: Column) {
  if (!col.cards.length) peek.value = new Set(peek.value).add(col.status)
  else choose(track.value, col.status, 'open')
  await nextTick()
  colEl(col.status)?.querySelector<HTMLElement>('[data-action="collapse-column"]')?.focus()
}

async function collapse(col: Column) {
  if (!col.cards.length) {
    const next = new Set(peek.value)
    next.delete(col.status)
    peek.value = next
  } else {
    choose(track.value, col.status, 'closed')
  }
  await nextTick()
  colEl(col.status)?.querySelector<HTMLElement>('[data-action="expand-column"]')?.focus()
}

let receivedTimer: ReturnType<typeof setTimeout> | null = null
/** Card chegou numa coluna recolhida: a faixa acende um instante (o card não aparece). */
async function noteArrival(status: CardStatus) {
  await nextTick()
  if (!columns.value.find((c) => c.status === status)?.collapsed) return
  received.value = status
  if (receivedTimer) clearTimeout(receivedTimer)
  receivedTimer = setTimeout(() => (received.value = null), 1400)
}

/** Ponto na cor do status, no lugar do ícone da aba (as abas pedem um componente). */
const dots = new Map<string, FunctionalComponent>()
function statusDot(tone: string): FunctionalComponent {
  let dot = dots.get(tone)
  if (!dot) {
    dot = () => h('span', { class: 'mk-dot', style: toneStyle(tone), 'aria-hidden': 'true' })
    dots.set(tone, dot)
  }
  return dot
}

const tabs = computed<BoardColumnTab[]>(() =>
  columns.value.map((c) => ({ value: c.status, label: c.label, icon: statusDot(c.tone), count: c.cards.length })),
)

const sheetOpen = ref(false)
const sheetCard = ref<MoveSheetCard | null>(null)
const sheetFocus = ref<HTMLElement | null>(null)

useCardLongPress({
  root: scroller,
  enabled: () => props.canMove && paged.value,
  canHold: (id) => !props.pendingIds?.has(id),
  onHold: (id, el) => {
    const c = props.cards.find((x) => x.id === id)
    if (!c) return
    sheetCard.value = { id: c.id, title: c.title, ...moveInfoOf(c) }
    sheetFocus.value = el
    sheetOpen.value = true
  },
})

function onSheetSelect(status: CardStatus) {
  const c = sheetCard.value
  if (!c || status === c.status) return
  emit('move', c.id, status, undefined)
}

// ── "Mover para" no card (computador) ────────────────────────────────────
/** Card movido pelo menu: o foco vai atrás dele (coluna nova, ou de volta se o servidor recusar). */
const followId = ref<string | null>(null)

function focusCard(id: string) {
  const root = scroller.value
  if (!root) return
  // Só repõe foco perdido (o botão do menu sumiu junto com o card); nunca rouba.
  const current = document.activeElement as HTMLElement | null
  const lost = !current || current === document.body
  if (!lost && current.closest('.mkc')?.getAttribute('data-id') !== id) return
  const card = root.querySelector<HTMLElement>(`.mkc[data-id="${CSS.escape(id)}"]`)
  if (card) {
    card.focus()
    return
  }
  const status = props.cards.find((c) => c.id === id)?.status
  if (status) colEl(status)?.querySelector<HTMLElement>('[data-action="expand-column"]')?.focus()
}

watch(
  () => (followId.value ? props.cards.find((c) => c.id === followId.value)?.status : undefined),
  async (status) => {
    if (!status || !followId.value) return
    await nextTick()
    focusCard(followId.value)
  },
  { flush: 'post' },
)

watch(
  () => (followId.value ? !!props.pendingIds?.has(followId.value) : false),
  (pending, was) => {
    if (was && !pending) setTimeout(() => (followId.value = null), 0)
  },
)

function onMenuMove(card: MarketingCardSummary, status: CardStatus) {
  if (status === card.status || props.pendingIds?.has(card.id)) return
  followId.value = card.id
  emit('move', card.id, status, undefined)
  void noteArrival(status)
}

// ── Computador: arrastar entre colunas ───────────────────────────────────
const dragId = ref<string | null>(null)
const overStatus = ref<CardStatus | null>(null)

function onDragStart(e: DragEvent, id: string) {
  if (!props.canMove || paged.value) return
  dragId.value = id
  frozen.value = new Set(columns.value.filter((c) => c.collapsed).map((c) => c.status))
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function endDrag() {
  dragId.value = null
  overStatus.value = null
  frozen.value = null
  stopEdgeScroll()
}

function onDragOver(e: DragEvent, status: CardStatus) {
  if (!dragId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  overStatus.value = status
}

function onDragLeave(e: DragEvent, status: CardStatus) {
  const to = e.relatedTarget as Node | null
  if (to && (e.currentTarget as HTMLElement).contains(to)) return
  if (overStatus.value === status) overStatus.value = null
}

/** Posição entre os vizinhos do ponto onde o card caiu (a ordem é por `position`). */
function dropPosition(e: DragEvent, column: Column, id: string) {
  const list = column.cards.filter((c) => c.id !== id)
  const lane = e.currentTarget as HTMLElement
  // Faixa recolhida não mostra os cards: o card vai para o fim da coluna.
  const els = [...lane.querySelectorAll<HTMLElement>('[data-id]')].filter((el) => el.dataset.id !== id)
  let index = list.length
  for (let i = 0; i < els.length; i++) {
    const r = els[i]!.getBoundingClientRect()
    if (e.clientY < r.top + r.height / 2) {
      index = i
      break
    }
  }
  const prev = list[index - 1]
  const next = list[index]
  if (prev && next) return (prev.position + next.position) / 2
  if (next) return next.position - 512
  if (prev) return prev.position + 1024
  return undefined
}

function onDrop(e: DragEvent, column: Column) {
  e.preventDefault()
  const id = dragId.value ?? e.dataTransfer?.getData('text/plain') ?? null
  endDrag()
  if (!id) return
  const card = props.cards.find((c) => c.id === id)
  if (!card) return
  const position = dropPosition(e, column, id)
  if (card.status === column.status && position === undefined) return
  emit('move', id, column.status, position)
  if (card.status !== column.status) void noteArrival(column.status)
}

// ── Rolagem automática pela borda durante o arraste ──────────────────────
// O arraste nativo do Edge/Chrome só rola numa borda de ~20px e com atraso;
// aqui a faixa é de 80px e a velocidade cresce perto da borda. Continua com o
// cursor parado (o laço é por quadro, com a última posição conhecida).
const EDGE = 80
const MAX_STEP = 20
let edgeFrame = 0
let pointer: { x: number; y: number } | null = null

function stopEdgeScroll() {
  if (edgeFrame) cancelAnimationFrame(edgeFrame)
  edgeFrame = 0
  pointer = null
}

function edgeTick() {
  edgeFrame = 0
  const el = scroller.value
  if (!el || !dragId.value || !pointer || paged.value) return
  const max = el.scrollWidth - el.clientWidth
  if (max <= 0) return
  const r = el.getBoundingClientRect()
  if (pointer.y < r.top || pointer.y > r.bottom) return
  // A borda que conta é a que a pessoa VÊ: se a moldura passar da janela (em
  // 1024px a da ala passa), a ponta da fita fica fora da tela.
  const fromLeft = pointer.x - Math.max(r.left, 0)
  const fromRight = Math.min(r.right, document.documentElement.clientWidth || window.innerWidth) - pointer.x
  let step = 0
  if (fromLeft < EDGE && el.scrollLeft > 0) step = -Math.ceil(MAX_STEP * Math.min(1, (EDGE - fromLeft) / EDGE))
  else if (fromRight < EDGE && el.scrollLeft < max - 0.5) step = Math.ceil(MAX_STEP * Math.min(1, (EDGE - fromRight) / EDGE))
  if (!step) return
  el.scrollLeft += step
  edgeFrame = requestAnimationFrame(edgeTick)
}

useEventListener(window, 'dragover', (e: DragEvent) => {
  if (!dragId.value) return
  pointer = { x: e.clientX, y: e.clientY }
  if (!edgeFrame) edgeFrame = requestAnimationFrame(edgeTick)
})
// Saiu da janela arrastando: para de rolar.
useEventListener(document, 'dragleave', (e: DragEvent) => {
  if (dragId.value && !e.relatedTarget) stopEdgeScroll()
})
// O card de origem pode ter saído do DOM antes do `dragend` (mudou de coluna).
useEventListener(window, 'dragend', () => {
  if (dragId.value) endDrag()
})

// ── Altura: a coluna vai até o pé da tela (alvo de soltura inteiro) ──────
const MIN_LANES = 360
const BOTTOM_GAP = 12
let measureFrame = 0

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
  }
  return null
}

/** Mede onde a fita começa (sem contar a rolagem da página) e encosta o pé na tela. */
function measureLanes() {
  measureFrame = 0
  const el = scroller.value
  if (!el) return
  if (paged.value) {
    el.style.height = ''
    return
  }
  let scrolled = 0
  for (let p = el.parentElement; p; p = p.parentElement) scrolled += p.scrollTop
  const top = el.getBoundingClientRect().top + scrolled
  const raw = Math.max(MIN_LANES, Math.floor(window.innerHeight - top - BOTTOM_GAP))
  el.style.height = `${raw}px`
  // O respiro de baixo varia por moldura: se a página passou a rolar, devolve a sobra.
  const sp = scrollParentOf(el)
  const over = sp ? sp.scrollHeight - sp.clientHeight : 0
  if (over > 0) el.style.height = `${Math.max(MIN_LANES, raw - over)}px`
}

function scheduleMeasure() {
  if (!measureFrame) measureFrame = requestAnimationFrame(measureLanes)
}

useEventListener(window, 'resize', scheduleMeasure, { passive: true })
watch(paged, () => void nextTick(scheduleMeasure))
// O que fica acima do board muda de altura depois de montar (fonte, barra de
// rolagem das abas da ala, filtros quebrando linha): a moldura da ala avisa.
// A altura só depende do topo, então a medida para de mudar na segunda volta.
let layoutObserver: ResizeObserver | null = null
onMounted(() => {
  scheduleMeasure()
  void document.fonts?.ready.then(scheduleMeasure)
  const el = scroller.value
  if (el && typeof ResizeObserver !== 'undefined') {
    layoutObserver = new ResizeObserver(scheduleMeasure)
    layoutObserver.observe(el.closest('.mk-layout') ?? el.parentElement ?? el)
  }
})

onBeforeUnmount(() => {
  stopEdgeScroll()
  layoutObserver?.disconnect()
  if (measureFrame) cancelAnimationFrame(measureFrame)
  if (receivedTimer) clearTimeout(receivedTimer)
})
</script>

<template>
  <div class="mkb" :class="{ 'is-dragging': !!dragId }">
    <BoardColumnTabs
      v-if="paged"
      :columns="tabs"
      :active="active"
      panel-prefix="mk-col"
      label="Status do board"
      @select="goTo($event)"
    />
    <div ref="scroller" class="mkb__lanes" :class="{ 'mkb__lanes--paged': paged }">
      <section
        v-for="col in columns"
        :id="`mk-col-${col.status}`"
        :key="col.status"
        class="mkb__col"
        :class="{
          'is-over': overStatus === col.status,
          'is-collapsed': col.collapsed,
          'is-received': received === col.status,
        }"
        :data-col="col.status"
        :data-collapsed="col.collapsed ? 'true' : undefined"
        :aria-label="`${col.label}: ${countLabel(col.cards.length)}`"
        @dragover="onDragOver($event, col.status)"
        @dragleave="onDragLeave($event, col.status)"
        @drop="onDrop($event, col)"
      >
        <button
          v-if="col.collapsed"
          type="button"
          class="mkb__rail"
          data-action="expand-column"
          :aria-expanded="false"
          :aria-label="`Abrir a coluna ${col.label}, ${countLabel(col.cards.length)}`"
          :title="`Abrir ${col.label}`"
          @click="expand(col)"
        >
          <span class="mk-dot" :style="toneStyle(col.tone)" aria-hidden="true" />
          <span class="mkb__count mkb__rail-count">{{ col.cards.length }}</span>
          <span class="mkb__rail-label">{{ col.label }}</span>
        </button>

        <template v-else>
          <header v-if="!paged" class="mkb__head">
            <span class="mk-dot" :style="toneStyle(col.tone)" aria-hidden="true" />
            <span class="mkb__label">{{ col.label }}</span>
            <span class="mkb__count">{{ col.cards.length }}</span>
            <button
              v-if="collapsible"
              type="button"
              class="mkb__head-btn"
              data-action="collapse-column"
              :aria-expanded="true"
              :aria-label="`Recolher a coluna ${col.label}`"
              title="Recolher coluna"
              @click="collapse(col)"
            >
              <ChevronsRightLeft :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>
          <div class="mkb__cards">
            <MarketingBoardCard
              v-for="c in col.cards"
              :key="c.id"
              :card="c"
              :brand="brandOf(c.companyId)"
              :draggable="canMove && !paged && !pendingIds?.has(c.id)"
              :pending="pendingIds?.has(c.id)"
              :movable="canMove && !paged"
              :role="role"
              @open="emit('open', $event)"
              @move="onMenuMove(c, $event)"
              @dragstart="onDragStart($event, c.id)"
              @dragend="endDrag"
            />
            <p v-if="!col.cards.length" class="mkb__empty">Nenhum card</p>
          </div>
        </template>
      </section>
    </div>

    <MarketingMoveSheet
      v-model:open="sheetOpen"
      :card="sheetCard"
      :role="role"
      :return-focus="sheetFocus"
      @select="onSheetSelect"
    />
  </div>
</template>

<style scoped>
.mkb {
  /* Largura das colunas: dividem a tela entre o mínimo e o máximo. */
  --mkb-col-min: 232px;
  --mkb-col-max: 320px;
  --mkb-rail: 44px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mkb__lanes {
  display: flex;
  gap: 8px;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 8px;
  min-width: 0;
  /* A altura é medida e escrita aqui (measureLanes). Com "reduzir movimento",
     o reset.css dá 0.01ms de transição a TUDO, e a leitura logo depois da
     escrita vinha com a altura antiga: a medida oscilava entre dois valores. */
  transition-property: none;
}

.mkb__col {
  flex: 1 1 var(--mkb-col-min);
  min-width: var(--mkb-col-min);
  max-width: var(--mkb-col-max);
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  /* O card encolhe a capa em coluna estreita (MarketingBoardCard). */
  container: mkb-col / inline-size;
  transition:
    box-shadow var(--motion-fast) var(--motion-ease),
    background-color var(--motion) var(--motion-ease);
}

.mkb__col.is-over {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.mkb__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 5px 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.mkb__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkb__count {
  color: var(--text-3);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* Recolher: aparece no hover e no foco da coluna (sempre à vista no toque). */
.mkb__head-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.mkb__col:hover .mkb__head-btn,
.mkb__head-btn:focus-visible {
  opacity: 1;
}

.mkb__head-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.mkb__head-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (hover: none) {
  .mkb__head-btn {
    opacity: 1;
  }
}

.mkb__cards {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 56px;
  padding: 0 6px 8px;
  overflow-y: auto;
}

.mkb__empty {
  margin: 0;
  padding: 14px 4px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
}

/* ── Recolhida: faixa de 44px, clicável inteira ── */
.mkb__col.is-collapsed {
  flex: 0 0 var(--mkb-rail);
  min-width: var(--mkb-rail);
  max-width: var(--mkb-rail);
}

.mkb__rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 0;
  padding: 14px 0 12px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  overflow: hidden;
}

.mkb__rail:hover {
  background: color-mix(in srgb, var(--surface-sunken), var(--text) 4%);
}

.mkb__rail:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mkb__rail-count {
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}

.mkb__rail-label {
  writing-mode: vertical-rl;
  min-height: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 18px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Arrastando: toda faixa é alvo de soltura, sem mudar de largura. */
.mkb.is-dragging .mkb__col.is-collapsed {
  box-shadow: inset 0 0 0 1px var(--border-strong);
}

.mkb.is-dragging .mkb__col.is-collapsed.is-over {
  box-shadow: inset 0 0 0 2px var(--accent);
  background: var(--accent-soft);
}

.mkb.is-dragging .mkb__col.is-collapsed.is-over .mkb__rail-label {
  color: var(--accent-ink);
}

/* Acabou de receber um card estando recolhida. */
.mkb__col.is-collapsed.is-received {
  background: var(--accent-soft);
}

.mkb__col.is-collapsed.is-received .mkb__rail-count {
  color: var(--accent-ink);
}

/* Celular: a fita rola de coluna em coluna, cada uma na largura toda. */
.mkb__lanes--paged {
  gap: 0;
  overflow-y: visible;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.mkb__lanes--paged::-webkit-scrollbar {
  display: none;
}

.mkb__lanes--paged .mkb__col {
  flex: 0 0 100%;
  min-width: 0;
  max-width: none;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  background: transparent;
}

.mkb__lanes--paged .mkb__cards {
  padding: 2px 0 8px;
  overflow: visible;
}

@media (prefers-reduced-motion: reduce) {
  .mkb__col {
    transition: none;
  }
}
</style>
