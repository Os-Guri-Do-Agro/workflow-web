<script setup lang="ts">
/**
 * Board da Aprovação: uma coluna por status da trilha (`statusesFor`).
 *
 * - Computador: arrastar o card entre colunas (HTML5 drag and drop) emite
 *   `move` com o status e a posição entre os vizinhos; quem chama grava, e se
 *   o servidor recusar o card volta e a frase aparece.
 * - Celular (<= 640px): uma coluna por vez com abas (`BoardColumnTabs` +
 *   `useBoardPager`, os mesmos do board de tarefas) e "Mover para" segurando o
 *   card (`useCardLongPress` + `MarketingMoveSheet`). Deslizar troca de coluna,
 *   nunca move card.
 */
import { computed, h, ref, type FunctionalComponent } from 'vue'
import BoardColumnTabs, { type BoardColumnTab } from '@/components/tasks/BoardColumnTabs.vue'
import { useBoardPager } from '@/features/tasks/composables/useBoardPager'
import { useCardLongPress } from '@/features/tasks/composables/useCardLongPress'
import type { MarketingBrand, MarketingRole } from '@/service/marketing/marketing-core'
import type { MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { CARD_STATUS_TONE, cardStatusLabel, toneStyle, type CardStatus } from '../../marketing-labels'
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

const columns = computed(() =>
  props.statuses.map((status) => ({
    status,
    label: cardStatusLabel(status, props.printTrack ? 'PRINT' : 'POST'),
    tone: CARD_STATUS_TONE[status],
    cards: props.cards
      .filter((c) => c.status === status)
      .sort((a, b) => a.position - b.position || a.updatedAt.localeCompare(b.updatedAt)),
  })),
)

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

// ── Celular: uma coluna por vez ──────────────────────────────────────────
const scroller = ref<HTMLElement | null>(null)
const { paged, active, goTo } = useBoardPager(scroller)

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
    sheetCard.value = { id: c.id, title: c.title, kind: c.kind, status: c.status }
    sheetFocus.value = el
    sheetOpen.value = true
  },
})

function onSheetSelect(status: CardStatus) {
  const c = sheetCard.value
  if (!c || status === c.status) return
  emit('move', c.id, status, undefined)
}

// ── Computador: arrastar entre colunas ───────────────────────────────────
const dragId = ref<string | null>(null)
const overStatus = ref<CardStatus | null>(null)

function onDragStart(e: DragEvent, id: string) {
  if (!props.canMove || paged.value) return
  dragId.value = id
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  dragId.value = null
  overStatus.value = null
}

function onDragOver(e: DragEvent, status: CardStatus) {
  if (!dragId.value) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  overStatus.value = status
}

/** Posição entre os vizinhos do ponto onde o card caiu (a ordem é por `position`). */
function dropPosition(e: DragEvent, column: (typeof columns.value)[number], id: string) {
  const list = column.cards.filter((c) => c.id !== id)
  const lane = e.currentTarget as HTMLElement
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

function onDrop(e: DragEvent, column: (typeof columns.value)[number]) {
  e.preventDefault()
  const id = dragId.value ?? e.dataTransfer?.getData('text/plain') ?? null
  overStatus.value = null
  dragId.value = null
  if (!id) return
  const card = props.cards.find((c) => c.id === id)
  if (!card) return
  const position = dropPosition(e, column, id)
  if (card.status === column.status && position === undefined) return
  emit('move', id, column.status, position)
}
</script>

<template>
  <div class="mkb">
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
        :class="{ 'is-over': overStatus === col.status }"
        :data-col="col.status"
        :aria-label="`${col.label}: ${col.cards.length} card(s)`"
        @dragover="onDragOver($event, col.status)"
        @dragleave.self="overStatus = null"
        @drop="onDrop($event, col)"
      >
        <header v-if="!paged" class="mkb__head">
          <span class="mk-dot" :style="toneStyle(col.tone)" aria-hidden="true" />
          <span class="mkb__label">{{ col.label }}</span>
          <span class="mkb__count">{{ col.cards.length }}</span>
        </header>
        <div class="mkb__cards">
          <MarketingBoardCard
            v-for="c in col.cards"
            :key="c.id"
            :card="c"
            :brand="brandOf(c.companyId)"
            :draggable="canMove && !paged && !pendingIds?.has(c.id)"
            :pending="pendingIds?.has(c.id)"
            @open="emit('open', $event)"
            @dragstart="onDragStart($event, c.id)"
            @dragend="onDragEnd"
          />
          <p v-if="!col.cards.length" class="mkb__empty">Nenhum card</p>
        </div>
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
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mkb__lanes {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  overflow-x: auto;
  padding-bottom: 8px;
  min-width: 0;
}

.mkb__col {
  flex: 0 0 272px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: calc(100dvh - 230px);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  transition: box-shadow var(--motion-fast) var(--motion-ease);
}

.mkb__col.is-over {
  box-shadow: inset 0 0 0 2px var(--accent);
}

.mkb__head {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 10px;
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

.mkb__cards {
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

/* Celular: a fita rola de coluna em coluna, cada uma na largura toda. */
.mkb__lanes--paged {
  gap: 0;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.mkb__lanes--paged::-webkit-scrollbar {
  display: none;
}

.mkb__lanes--paged .mkb__col {
  flex: 0 0 100%;
  max-height: none;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  background: transparent;
}

.mkb__lanes--paged .mkb__cards {
  padding: 2px 0 8px;
  overflow: visible;
}
</style>
