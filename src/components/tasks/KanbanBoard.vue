<script setup lang="ts">
/**
 * Board do mês (spec board-tarefas-redesign, S1). Quatro colunas de
 * `TaskColumn` com `TaskCard` dentro, arrastáveis pelo Sortable
 * (vue-draggable-plus): troca de coluna e reordenação.
 *
 * O que NÃO pode quebrar, e por quê:
 * - durante o arraste a prop nova é ignorada (o `watch` abaixo): o Sortable
 *   mexe na lista local e um refetch no meio devolveria o card para trás;
 * - o `move-task` leva a ordem VISÍVEL da coluna de destino, porque com filtro
 *   ligado o índice do Sortable é o da lista filtrada, e quem traduz para o
 *   índice absoluto é o TasksView (`resolveDropIndex`);
 * - card virtual de rotina (`rec:*`) não tem chave e o clique é do chamador
 *   (abre o gerenciador de rotinas).
 *
 * S4: "Criar" no rodapé de cada coluna (logo depois do último card, como no
 * Jira) e o "+" do cabeçalho abrem o campo inline no lugar; quem cria é o
 * TasksView. O card otimista (`tmp:*`) não arrasta nem abre. "Ordenar por
 * prioridade" reordena só a tela desta coluna e desliga a reordenação dentro
 * dela (soltar ali só troca a coluna), porque a ordem vista deixa de ser a
 * gravada. Colunas e cards levam `data-nav-col` para o teclado (J/K e setas).
 */
import { computed, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { usePreferredReducedMotion } from '@vueuse/core'
import { Plus } from 'lucide-vue-next'
import TaskCard, { type TaskCardTask } from './TaskCard.vue'
import TaskColumn from './TaskColumn.vue'
import TaskQuickCreate from './TaskQuickCreate.vue'
import { ACTIVITY_STATUSES, priorityLevel, statusSpec } from '@/features/tasks/task-meta'
import { taskKey } from '@/features/tasks/task-key'
import { isPendingTaskId } from '@/features/tasks/pending-task'
import { useCollapsedColumns } from '@/features/tasks/composables/useCollapsedColumns'
import type { ActivityStatus } from '@/features/tasks/activity-types'

export type KanbanTask = TaskCardTask
export type KanbanApiStatus = ActivityStatus

export interface KanbanMovePayload {
  taskId: string
  status: ActivityStatus
  /** Índice na lista VISÍVEL (ou `MAX_SAFE_INTEGER` = fim da coluna, pelo menu). */
  position: number
  /** Ordem visível da coluna de destino depois da soltura. Ausente no "Mover para". */
  visibleIds?: string[]
}

interface Props {
  tasks: Partial<Record<ActivityStatus, KanbanTask[]>> | null | undefined
  readonly?: boolean
  /** Nome da empresa ativa: dá o prefixo da chave (`PJ-K7Q2XM`). */
  companyName?: string | null
  /** Coluna com o campo de criação inline aberto (ou nenhuma). */
  composerStatus?: ActivityStatus | null
  /** Título devolvido ao campo quando a criação falhou. */
  composerRestore?: { title: string; nonce: number } | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  // Único evento de arraste: cobre troca de coluna (@add), reordenação
  // (@update) e o "Mover para" do menu do card.
  'move-task': [payload: KanbanMovePayload]
  'open-details': [task: KanbanTask]
  'delete-task': [task: KanbanTask]
  /** `previous`: o título antes do otimista, para o chamador desfazer se o servidor recusar. */
  'rename-task': [taskId: string, title: string, previous: string]
  /** "+17 no mês" / "2 atrasadas": quem chama decide para onde levar (a Agenda). */
  'show-occurrences': [task: KanbanTask]
  /** "Criar", "+" e "Criar tarefa aqui": abrir o campo inline nesta coluna. */
  'create-in': [status: ActivityStatus]
  /** Enter no campo inline. */
  'quick-create': [status: ActivityStatus, title: string]
  /** Esc no campo, ou saiu dele vazio. */
  'composer-cancel': [status: ActivityStatus, reason: 'escape' | 'blur']
}>()

const columns = ACTIVITY_STATUSES

const isDragging = ref(false)
const dragOverColumn = ref<ActivityStatus | null>(null)
const columnActivities = ref<Record<ActivityStatus, KanbanTask[]>>({
  TODO: [],
  IN_PROGRESS: [],
  IN_TESTING: [],
  DONE: [],
})

// ── Ordenar por prioridade (só na tela, some ao recarregar) ──
const sortedColumns = ref<ActivityStatus[]>([])
const isSorted = (status: ActivityStatus) => sortedColumns.value.includes(status)

/** Maior prioridade primeiro; empate fica na ordem manual (sort estável). */
const byPriority = (list: KanbanTask[]) =>
  [...list].sort((a, b) => priorityLevel(b.priorityNumber) - priorityLevel(a.priorityNumber))

function syncColumns() {
  columns.forEach((col) => {
    const list = props.tasks?.[col.value] || []
    columnActivities.value[col.value] = isSorted(col.value) ? byPriority(list) : list
  })
}

watch(
  () => props.tasks,
  () => {
    if (!isDragging.value) syncColumns()
  },
  { immediate: true, deep: true },
)

function toggleSort(status: ActivityStatus) {
  sortedColumns.value = isSorted(status)
    ? sortedColumns.value.filter((s) => s !== status)
    : [...sortedColumns.value, status]
  syncColumns()
}

const { isCollapsed, canCollapse, toggle: toggleCollapsed } = useCollapsedColumns()

// Reordenar e soltar continuam animados (FLIP do Sortable, curto). Quem pediu
// menos movimento recebe a troca seca.
const reducedMotion = usePreferredReducedMotion()
const sortAnimation = computed(() => (reducedMotion.value === 'reduce' ? 0 : 150))

const canCreate = computed(() => !props.readonly)

const keyOf = (task: KanbanTask) => taskKey(task, props.companyName)

/** Subconjunto do SortableEvent que o handler realmente lê. */
interface DragEndEvent {
  item?: HTMLElement
  newIndex?: number
}

// Arraste (add = cruzou coluna, update = reordenou na mesma). O vue-draggable-plus
// já aplicou a soltura no v-model quando este handler roda, então a lista local
// da coluna É a ordem visível que a pessoa acabou de ver.
const onMove = (evt: DragEndEvent, status: ActivityStatus) => {
  const taskId = evt.item?.dataset?.id
  if (!taskId) return
  // Coluna "Ordenada por prioridade": a ordem vista não é a gravada, então o
  // lugar onde o card caiu nela não diz nada sobre a ordem manual. Soltar ali
  // só troca a coluna, e o card vai para o FIM da ordem manual (como o
  // "Mover para"); gravar o índice visto punha o card numa posição arbitrária.
  if (isSorted(status)) {
    emit('move-task', { taskId, status, position: Number.MAX_SAFE_INTEGER })
    return
  }
  const visibleIds = columnActivities.value[status].map((t) => t.id)
  const at = visibleIds.indexOf(taskId)
  const position = at !== -1 ? at : typeof evt.newIndex === 'number' ? evt.newIndex : 0
  emit('move-task', { taskId, status, position, visibleIds })
}

// "Mover para" do menu do card: vai para o FIM da coluna de destino.
const onMenuMove = (task: KanbanTask, status: ActivityStatus) => {
  emit('move-task', { taskId: task.id, status, position: Number.MAX_SAFE_INTEGER })
}

const onRename = (task: KanbanTask, title: string) => {
  const previous = task.title ?? ''
  task.title = title // otimista: o card já mostra o nome novo
  emit('rename-task', task.id, title, previous)
}

const onStart = () => {
  isDragging.value = true
}
const onEnd = () => {
  isDragging.value = false
  dragOverColumn.value = null
  // O que chegou durante o arraste (realtime, refetch) foi ignorado para o
  // Sortable não perder o card no meio do gesto. Arraste cancelado (soltou no
  // mesmo lugar) não muda a prop depois, então nada ressincronizava: o dado
  // novo só aparecia na próxima mudança. Soltura de verdade já mudou `tasks`
  // no `move-task`, e ressincronizar aqui é o mesmo resultado, mais cedo.
  syncColumns()
}

const onEnterColumn = (status: ActivityStatus) => {
  if (isDragging.value) dragOverColumn.value = status
}
</script>

<template>
  <div class="board" :class="{ 'board--dragging': isDragging }">
    <TaskColumn
      v-for="column in columns"
      :key="column.value"
      :status="column.value"
      :count="columnActivities[column.value]?.length || 0"
      :can-create="canCreate"
      :collapsible="canCollapse(column.value)"
      :collapsed="isCollapsed(column.value)"
      :over="isDragging && dragOverColumn === column.value"
      sortable
      :sorted="isSorted(column.value)"
      @create="emit('create-in', column.value)"
      @toggle-collapse="toggleCollapsed(column.value)"
      @toggle-sort="toggleSort(column.value)"
    >
      <!-- Corpo com scroll próprio. Parado, a lista tem a altura dos cards e o
           "Criar" vem logo depois do último; arrastando, a lista cresce até o
           fim da coluna para a coluna inteira (até vazia) ser alvo de soltura. -->
      <div class="lane__scroll">
        <VueDraggable
          v-model="columnActivities[column.value]"
          class="lane__list"
          :data-nav-col="column.value"
          group="activities"
          :animation="sortAnimation"
          easing="cubic-bezier(0.2, 0.9, 0.3, 1.08)"
          :disabled="props.readonly"
          :sort="!isSorted(column.value)"
          filter=".no-drag"
          :prevent-on-filter="false"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          drag-class="drag-moving"
          @start="onStart"
          @end="onEnd"
          @add="(evt) => onMove(evt, column.value)"
          @update="(evt) => onMove(evt, column.value)"
          @dragenter="onEnterColumn(column.value)"
        >
          <TaskCard
            v-for="task in columnActivities[column.value]"
            :key="task.id"
            :task="task"
            :status="column.value"
            :task-key="keyOf(task)"
            :readonly="props.readonly"
            :pending="isPendingTaskId(task.id)"
            @open="emit('open-details', task)"
            @rename="onRename(task, $event)"
            @delete="emit('delete-task', task)"
            @move="onMenuMove(task, $event)"
            @show-occurrences="emit('show-occurrences', task)"
          />
        </VueDraggable>

        <p
          v-if="!canCreate && (columnActivities[column.value]?.length || 0) === 0 && !isDragging"
          class="lane__empty"
          aria-hidden="true"
        >
          Nenhuma tarefa
        </p>

        <div
          v-if="canCreate"
          v-show="!isDragging"
          class="lane__foot"
          :class="{ 'lane__foot--after': (columnActivities[column.value]?.length || 0) > 0 }"
        >
          <TaskQuickCreate
            v-if="composerStatus === column.value"
            :label="statusSpec(column.value).label"
            :restore="composerRestore"
            @submit="emit('quick-create', column.value, $event)"
            @cancel="emit('composer-cancel', column.value, $event)"
          />
          <button
            v-else
            type="button"
            class="lane__create"
            :data-create="column.value"
            :aria-label="`Criar tarefa em ${statusSpec(column.value).label}`"
            @click="emit('create-in', column.value)"
          >
            <Plus :size="14" :stroke-width="1.8" aria-hidden="true" />
            Criar
          </button>
        </div>
      </div>
    </TaskColumn>
  </div>
</template>

<style scoped>
/*
 * Board estilo Jira: quatro poços neutros de 280px lado a lado, cada um com
 * scroll próprio. Sem painel colorido por coluna, sem régua, sem fade.
 */
.board {
  container: task-board / inline-size;
  height: 100%;
  min-height: 0;
  display: flex;
  gap: 8px;
  align-items: stretch;
  padding-bottom: 16px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

/* O próprio container não se consulta: a fita com snap no celular é por viewport. */
@media (max-width: 640px) {
  .board {
    scroll-snap-type: x mandatory;
  }
}

.lane__scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 6px 6px;
  scrollbar-width: thin;
}

.lane__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Arrastando, a altura toda é alvo de soltura, mesmo com a coluna vazia. */
.board--dragging .lane__list {
  min-height: 100%;
}

.lane__empty {
  margin: 0;
  padding: 18px 0 12px;
  text-align: center;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

/* O rodapé fica a 6px do último card, o mesmo vão entre cards. */
.lane__foot--after {
  margin-top: 6px;
}

/* 36px de desenho; o ::after fecha 44px de alvo sem ocupar altura (os 4px de
   cima caem no vão depois do último card, os de baixo no padding da coluna). */
.lane__create {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.lane__create::after {
  content: '';
  position: absolute;
  inset: -4px 0;
}

.lane__create:hover {
  background: var(--surface-3);
  color: var(--text);
}

.lane__create:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.board--dragging .lane__list {
  cursor: grabbing;
}
</style>
