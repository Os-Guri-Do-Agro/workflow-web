<script setup lang="ts">
/**
 * "Agrupar: Pessoa" do board do mês (spec board-tarefas-redesign, D12): as
 * mesmas quatro colunas em linhas recolhíveis por responsável, no padrão do
 * Taskboard do Azure (swimlanes por pessoa) com a pele do board do mês.
 *
 * - Quem monta as linhas é `groupByPerson` (primeiro responsável; "Sem
 *   responsável" no topo), sempre a partir das colunas filtradas do MESMO ref
 *   que o arraste e o realtime mutam. Aqui só se desenha.
 * - Cabeçalhos das colunas presos no topo enquanto as linhas rolam.
 * - Cabeçalho da linha: avatar, nome ("você" na sua), contagem por status com
 *   os ícones do task-meta e o chevron. O card esconde o avatar do dono da
 *   linha; os outros responsáveis continuam nele.
 * - Arraste só dentro da MESMA linha (cada linha é um grupo do Sortable): muda
 *   o status e a ordem como no board simples. A ordem é da coluna do mês
 *   inteiro, então o `move-task` leva a ordem visível da célula e o TasksView
 *   traduz pela âncora do vizinho (`resolveDropIndex`). Entre linhas fica
 *   desligado na v1: reatribuir uma tarefa com vários responsáveis pede uma
 *   decisão de produto.
 * - Durante o arraste a prop nova é ignorada, como no `KanbanBoard`.
 */
import { computed, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { usePreferredReducedMotion } from '@vueuse/core'
import { ChevronDown, Plus, UserRound } from 'lucide-vue-next'
import TaskCard from './TaskCard.vue'
import TaskQuickCreate from './TaskQuickCreate.vue'
import type { KanbanMovePayload, KanbanTask } from './KanbanBoard.vue'
import { ACTIVITY_STATUSES } from '@/features/tasks/task-meta'
import { taskKey } from '@/features/tasks/task-key'
import { isPendingTaskId } from '@/features/tasks/pending-task'
import type { BoardLane } from '@/features/tasks/board-lanes'
import type { ActivityStatus } from '@/features/tasks/activity-types'
import { avatarTone, initials } from '@/utils/avatar'

const props = defineProps<{
  lanes: BoardLane<KanbanTask>[]
  readonly?: boolean
  companyName?: string | null
  /** Linhas recolhidas (chave da linha). */
  collapsedKeys: readonly string[]
  /** Célula com o campo de criação inline aberto. */
  composer?: { laneKey: string; status: ActivityStatus } | null
  composerRestore?: { title: string; nonce: number } | null
}>()

const emit = defineEmits<{
  'move-task': [payload: KanbanMovePayload]
  'open-details': [task: KanbanTask]
  'delete-task': [task: KanbanTask]
  /** `previous`: o título antes do otimista, para o chamador desfazer se o servidor recusar. */
  'rename-task': [taskId: string, title: string, previous: string]
  'show-occurrences': [task: KanbanTask]
  'toggle-lane': [key: string]
  /** "+" da linha: abrir o campo inline em "A fazer" desta pessoa. */
  'create-in': [status: ActivityStatus, laneKey: string]
  'quick-create': [status: ActivityStatus, title: string]
  'composer-cancel': [status: ActivityStatus, reason: 'escape' | 'blur']
}>()

const columns = ACTIVITY_STATUSES

type Cells = Record<string, Record<ActivityStatus, KanbanTask[]>>

const isDragging = ref(false)
const cells = ref<Cells>({})

function syncCells() {
  const next: Cells = {}
  for (const lane of props.lanes) {
    next[lane.key] = {
      TODO: [...lane.columns.TODO],
      IN_PROGRESS: [...lane.columns.IN_PROGRESS],
      IN_TESTING: [...lane.columns.IN_TESTING],
      DONE: [...lane.columns.DONE],
    }
  }
  cells.value = next
}

watch(
  () => props.lanes,
  () => {
    if (!isDragging.value) syncCells()
  },
  { immediate: true, deep: true },
)

/** Total de cada coluna somando as linhas (é o que o cabeçalho preso mostra). */
const totals = computed(() => {
  const out = { TODO: 0, IN_PROGRESS: 0, IN_TESTING: 0, DONE: 0 } as Record<ActivityStatus, number>
  for (const lane of props.lanes) {
    for (const col of columns) out[col.value] += lane.counts[col.value]
  }
  return out
})

const isCollapsed = (key: string) => props.collapsedKeys.includes(key)

const reducedMotion = usePreferredReducedMotion()
const sortAnimation = computed(() => (reducedMotion.value === 'reduce' ? 0 : 150))

const keyOf = (task: KanbanTask) => taskKey(task, props.companyName)

const laneName = (lane: BoardLane<KanbanTask>) => lane.name ?? 'Sem responsável'

function laneSummary(lane: BoardLane<KanbanTask>): string {
  const parts = columns.map((c) => `${lane.counts[c.value]} ${c.label.toLowerCase()}`)
  const who = `${laneName(lane)}${lane.isMe ? ' (você)' : ''}`
  return `${who}, ${lane.total} ${lane.total === 1 ? 'tarefa' : 'tarefas'}: ${parts.join(', ')}`
}

interface DragEndEvent {
  item?: HTMLElement
  newIndex?: number
}

function onMove(evt: DragEndEvent, laneKey: string, status: ActivityStatus) {
  const taskId = evt.item?.dataset?.id
  if (!taskId) return
  const visibleIds = (cells.value[laneKey]?.[status] ?? []).map((t) => t.id)
  const at = visibleIds.indexOf(taskId)
  const position = at !== -1 ? at : typeof evt.newIndex === 'number' ? evt.newIndex : 0
  emit('move-task', { taskId, status, position, visibleIds })
}

function onMenuMove(task: KanbanTask, status: ActivityStatus) {
  emit('move-task', { taskId: task.id, status, position: Number.MAX_SAFE_INTEGER })
}

function onRename(task: KanbanTask, title: string) {
  const previous = task.title ?? ''
  task.title = title
  emit('rename-task', task.id, title, previous)
}

const showComposer = (laneKey: string, status: ActivityStatus) =>
  !!props.composer && props.composer.laneKey === laneKey && props.composer.status === status

const onStart = () => {
  isDragging.value = true
}
const onEnd = () => {
  isDragging.value = false
}
</script>

<template>
  <div class="swim" :class="{ 'swim--dragging': isDragging }">
    <div class="swim__inner">
      <!-- Cabeçalhos das colunas, presos no topo enquanto as linhas rolam. -->
      <div class="swim__heads">
        <div class="swim__grid">
          <div v-for="column in columns" :key="column.value" class="swim__head">
            <component :is="column.icon" :size="14" />
            <h2 class="swim__head-title">{{ column.label }}</h2>
            <span class="swim__head-count">{{ totals[column.value] }}</span>
          </div>
        </div>
      </div>

      <section
        v-for="(lane, index) in lanes"
        :key="lane.key"
        class="swim__lane"
        :class="{ 'swim__lane--collapsed': isCollapsed(lane.key) }"
        :data-lane-key="lane.key"
      >
        <div class="swim__lane-head">
          <button
            type="button"
            class="swim__toggle"
            :aria-expanded="!isCollapsed(lane.key)"
            :aria-controls="`swim-body-${index}`"
            :aria-label="`${laneSummary(lane)}. ${isCollapsed(lane.key) ? 'Expandir' : 'Recolher'} linha`"
            @click="emit('toggle-lane', lane.key)"
          >
            <ChevronDown class="swim__chev" :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span
              v-if="lane.name"
              class="swim__avatar"
              :style="{ '--av': avatarTone(lane.name) }"
              aria-hidden="true"
            >
              {{ initials(lane.name) }}
            </span>
            <span v-else class="swim__avatar swim__avatar--none" aria-hidden="true">
              <UserRound :size="14" :stroke-width="1.8" />
            </span>
            <span class="swim__name">
              {{ laneName(lane) }}<span v-if="lane.isMe" class="swim__me"> (você)</span>
            </span>
            <span class="swim__counts" aria-hidden="true">
              <span
                v-for="column in columns"
                :key="column.value"
                class="swim__count"
                :title="`${column.label}: ${lane.counts[column.value]}`"
              >
                <component :is="column.icon" :size="12" />
                {{ lane.counts[column.value] }}
              </span>
            </span>
          </button>
          <button
            v-if="!readonly"
            type="button"
            class="swim__add"
            :data-lane-create="lane.key"
            :aria-label="lane.name ? `Criar tarefa para ${lane.name}` : 'Criar tarefa sem responsável'"
            :title="lane.name ? `Criar tarefa para ${lane.name}` : 'Criar tarefa sem responsável'"
            @click="emit('create-in', 'TODO', lane.key)"
          >
            <Plus :size="14" :stroke-width="1.8" />
          </button>
        </div>

        <div
          v-show="!isCollapsed(lane.key)"
          :id="`swim-body-${index}`"
          class="swim__body"
          :data-nav-group="lane.key"
        >
          <div class="swim__grid">
            <div
              v-for="column in columns"
              :key="column.value"
              class="swim__cell"
              :aria-label="`${laneName(lane)}, ${column.label}`"
              role="group"
            >
              <VueDraggable
                v-if="cells[lane.key]"
                v-model="cells[lane.key]![column.value]"
                class="swim__list"
                :data-nav-col="column.value"
                :group="`lane:${lane.key}`"
                :animation="sortAnimation"
                easing="cubic-bezier(0.2, 0.9, 0.3, 1.08)"
                :disabled="readonly"
                filter=".no-drag"
                :prevent-on-filter="false"
                ghost-class="drag-ghost"
                chosen-class="drag-chosen"
                drag-class="drag-moving"
                @start="onStart"
                @end="onEnd"
                @add="(evt) => onMove(evt, lane.key, column.value)"
                @update="(evt) => onMove(evt, lane.key, column.value)"
              >
                <TaskCard
                  v-for="task in cells[lane.key]![column.value]"
                  :key="task.id"
                  :task="task"
                  :status="column.value"
                  :task-key="keyOf(task)"
                  :readonly="readonly"
                  :pending="isPendingTaskId(task.id)"
                  :omit-person="lane.name"
                  @open="emit('open-details', task)"
                  @rename="onRename(task, $event)"
                  @delete="emit('delete-task', task)"
                  @move="onMenuMove(task, $event)"
                  @show-occurrences="emit('show-occurrences', task)"
                />
              </VueDraggable>
              <TaskQuickCreate
                v-if="!readonly && showComposer(lane.key, column.value)"
                :label="`${column.label}, ${laneName(lane)}`"
                :restore="composerRestore"
                @submit="emit('quick-create', column.value, $event)"
                @cancel="emit('composer-cancel', column.value, $event)"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Um scroll só para a matriz: as linhas crescem com os cards (sem rolagem
   por célula) e os cabeçalhos das colunas ficam presos no topo. */
.swim {
  container: task-board / inline-size;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-bottom: 16px;
  scrollbar-width: thin;
}

.swim__inner {
  width: max-content;
  min-width: 100%;
}

.swim__grid {
  display: grid;
  grid-template-columns: repeat(4, 280px);
  gap: 8px;
}

/* Mesma régua do board simples: abaixo de 1144px de largura útil, 244px. */
@container task-board (max-width: 1143px) {
  .swim__grid {
    grid-template-columns: repeat(4, 244px);
  }
}

/* ── Cabeçalhos das colunas (presos) ── */
.swim__heads {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg);
  padding-bottom: 2px;
}

.swim__head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
}

.swim__head > svg {
  flex: none;
}

.swim__head-title {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
}

.swim__head-count {
  font-size: 13px;
  line-height: 20px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* ── Linha ── */
.swim__lane {
  border-top: 1px solid var(--border);
}

.swim__lane-head {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 44px;
}

.swim__toggle {
  flex: 1;
  min-width: 0;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 0 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.swim__toggle:hover {
  background: var(--surface-2);
}

.swim__toggle:focus-visible,
.swim__add:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.swim__chev {
  flex: none;
  color: var(--text-3);
  transition: transform 160ms var(--motion-ease);
}

.swim__lane--collapsed .swim__chev {
  transform: rotate(-90deg);
}

/* 24px com as iniciais em 12px (o mínimo de texto da spec cabe no disco). */
.swim__avatar {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--av);
  color: var(--surface);
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  user-select: none;
}

.swim__avatar--none {
  background: var(--surface-3);
  color: var(--text-3);
}

.swim__name {
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.swim__me {
  font-weight: 400;
  color: var(--text-3);
}

.swim__counts {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.swim__count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.swim__add {
  position: relative;
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
}

/* 44px de alvo no desenho de 32px. */
.swim__add::after {
  content: '';
  position: absolute;
  inset: -6px;
}

.swim__lane-head:hover .swim__add,
.swim__add:focus-visible {
  opacity: 1;
}

@media (hover: none) {
  .swim__add {
    opacity: 1;
  }
}

.swim__add:hover {
  background: var(--surface-3);
  color: var(--text);
}

.swim__body {
  padding-bottom: 10px;
}

/* ── Célula: o mesmo poço neutro da coluna ── */
.swim__cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 48px;
  padding: 6px;
  background: var(--surface-sunken);
  border-radius: var(--radius-md);
}

/* A célula inteira é alvo de soltura, mesmo vazia. */
.swim__list {
  flex: 1;
  min-height: 36px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.swim--dragging .swim__list {
  cursor: grabbing;
}

@media (prefers-reduced-motion: reduce) {
  .swim__chev {
    transition: none;
  }
}
</style>
