<script setup lang="ts">
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  Circle,
  CircleDashed,
  CircleDot,
  CircleCheck,
  Check,
  Calendar,
  ChevronDown,
  Trash2,
  Inbox,
} from 'lucide-vue-next'
import type { LucideIcon } from 'lucide-vue-next'
import { formatDateOnly, isOverdue } from '@/utils/date'
// Iniciais e tom da pessoa vêm do util compartilhado: o ranking da equipe usa
// os mesmos, então a mesma pessoa tem a mesma cor no board e no /time.
import { avatarTone, initials as getUserInitials } from '@/utils/avatar'

// Shapes locais de propósito: o board é um componente compartilhado e não deve
// depender de tipos de `features/*` (regra de boundary do projeto). Campos
// opcionais porque cada chamador envia o subconjunto que a API dele devolve.
export interface KanbanTaskResponsible {
  userId?: string
  user: { name: string }
}

export interface KanbanTaskSubtask {
  id: string
  title: string
  status: string
}

export interface KanbanTaskAttachment {
  filename: string
  url: string
}

export interface KanbanTask {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  responsibles?: KanbanTaskResponsible[]
  subtasks?: KanbanTaskSubtask[]
  attachments?: KanbanTaskAttachment[]
}

export type KanbanApiStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'
type ColumnKey = 'todo' | 'in-progress' | 'testing' | 'done'

interface Props {
  tasks: Partial<Record<KanbanApiStatus, KanbanTask[]>> | null | undefined
  readonly?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  // Único evento de arraste: cobre troca de coluna (@add) e reordenação (@update).
  'move-task': [payload: { taskId: string; status: string; position: number }]
  'open-details': [task: KanbanTask]
  'delete-task': [task: KanbanTask]
  'rename-task': [taskId: string, title: string]
}>()

// ── Inline editing ──
const editingTaskId = ref<string | null>(null)
const editingTitle = ref('')

const startEditing = (task: KanbanTask, e: Event) => {
  e.stopPropagation()
  editingTaskId.value = task.id
  editingTitle.value = task.title ?? ''
}

const commitEdit = (task: KanbanTask) => {
  const newTitle = editingTitle.value.trim()
  if (newTitle && newTitle !== task.title) {
    task.title = newTitle // optimistic
    emit('rename-task', task.id, newTitle)
  }
  editingTaskId.value = null
}

const cancelEdit = () => {
  editingTaskId.value = null
}

interface ColumnDef {
  status: ColumnKey
  apiStatus: KanbanApiStatus
  title: string
  token: string
  icon: LucideIcon
}

// Cor de cada coluna vem dos tokens de status do design system (theme-aware),
// não de hex solto: a mesma família azul/laranja/violeta/verde do resto do app.
const columns: ColumnDef[] = [
  { status: 'todo', apiStatus: 'TODO', title: 'A Fazer', token: 'var(--status-todo)', icon: Circle },
  { status: 'in-progress', apiStatus: 'IN_PROGRESS', title: 'Em Andamento', token: 'var(--status-prog)', icon: CircleDashed },
  { status: 'testing', apiStatus: 'IN_TESTING', title: 'Em Teste', token: 'var(--status-test)', icon: CircleDot },
  { status: 'done', apiStatus: 'DONE', title: 'Concluído', token: 'var(--status-done)', icon: CircleCheck },
]

const isDragging = ref(false)
const dragOverColumn = ref<string | null>(null)
const columnActivities = ref<Record<ColumnKey, KanbanTask[]>>({
  todo: [],
  'in-progress': [],
  testing: [],
  done: [],
})

watch(
  () => props.tasks,
  () => {
    if (!isDragging.value) {
      columns.forEach((col) => {
        columnActivities.value[col.status] = props.tasks?.[col.apiStatus] || []
      })
    }
  },
  { immediate: true, deep: true },
)

const MAX_AVATARS = 3

/** Nomes escondidos atrás do "+N" — viram tooltip para não perder informação. */
const extraNames = (task: KanbanTask) =>
  (task.responsibles ?? [])
    .slice(MAX_AVATARS)
    .map((r) => r.user.name)
    .join(', ')

// Prioridade sinaliza pela COR DO PONTO, não pelo texto: P4/P5 em texto vermelho
// por card inteiro vira fadiga de alarme quando o mês tem muitos bloqueantes.
const getPriorityColor = (priority: number) => {
  const colors: Record<number, string> = {
    0: 'var(--success)',
    1: 'var(--info)',
    2: 'var(--warn)',
    3: 'var(--warn)',
    4: 'var(--err)',
    5: 'var(--err)',
  }
  return colors[priority] ?? 'var(--text-4)'
}

const getPriorityLabel = (priority: number) => {
  const labels: Record<number, string> = {
    0: 'Baixíssima',
    1: 'Baixa',
    2: 'Média',
    3: 'Alta',
    4: 'Crítica',
    5: 'Bloqueante',
  }
  return labels[priority] ?? 'Sem prioridade'
}

/** Subconjunto do SortableEvent que o handler realmente lê. */
interface DragEndEvent {
  item?: HTMLElement
  newIndex?: number
}

// Arraste (add=cruzou coluna, update=reordenou na mesma): emite um único
// move-task com o índice de destino (newIndex) p/ persistir a ordem manual.
const onMove = (evt: DragEndEvent, apiStatus: KanbanApiStatus) => {
  const taskId = evt.item?.dataset?.id
  if (!taskId) return
  const position = typeof evt.newIndex === 'number' ? evt.newIndex : 0
  emit('move-task', { taskId, status: apiStatus, position })
}

const getImageAttachment = (task: KanbanTask) =>
  task.attachments?.find((a) => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.filename))?.url

const onStart = () => {
  isDragging.value = true
}
const onEnd = () => {
  isDragging.value = false
  dragOverColumn.value = null
}

const onEnterColumn = (status: string) => {
  if (isDragging.value) dragOverColumn.value = status
}
const onLeaveColumn = () => {
  // limpa só no onEnd pra não piscar
}

const openDeleteConfirm = (task: KanbanTask) => {
  emit('delete-task', task)
}

const getSubtaskProgress = (task: KanbanTask) => {
  if (!task.subtasks?.length) return null
  const done = task.subtasks.filter((s) => s.status === 'DONE').length
  return { done, total: task.subtasks.length }
}

const subtaskPercent = (task: KanbanTask) => {
  const p = getSubtaskProgress(task)
  return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
}

const isAllDone = (task: KanbanTask) => {
  const p = getSubtaskProgress(task)
  return !!p && p.done === p.total
}

// Anel de progresso (SVG): r=9 → circunferência ~56.55. O offset "esvazia" o
// traço proporcionalmente ao que falta.
const RING_CIRC = 2 * Math.PI * 9
const ringOffset = (pct: number) => RING_CIRC * (1 - pct / 100)

// Abrir por teclado só quando o próprio card está focado (`.self`): evita que
// Enter durante a edição do título, ou em botões internos, abra os detalhes.
const openByKey = (task: KanbanTask) => emit('open-details', task)

// ── Subtasks expand/collapse ──
const expandedTasks = ref<Set<string>>(new Set())

const toggleExpand = (taskId: string) => {
  if (expandedTasks.value.has(taskId)) {
    expandedTasks.value.delete(taskId)
  } else {
    expandedTasks.value.add(taskId)
  }
  expandedTasks.value = new Set(expandedTasks.value)
}

const isExpanded = (taskId: string) => expandedTasks.value.has(taskId)
</script>

<template>
  <div class="board" :class="{ 'board--dragging': isDragging }">
    <section
      v-for="column in columns"
      :key="column.status"
      class="lane"
      :class="{ 'lane--over': isDragging && dragOverColumn === column.status }"
      :style="{ '--col': column.token }"
      :aria-label="`${column.title}, ${columnActivities[column.status]?.length || 0} atividades`"
    >
      <!-- Column header: fora do scroll, sempre visível -->
      <header class="lane__head">
        <span class="lane__badge" aria-hidden="true">
          <component :is="column.icon" :size="13" />
        </span>
        <h2 class="lane__title">{{ column.title }}</h2>
        <span class="lane__count" :key="columnActivities[column.status]?.length || 0">
          {{ columnActivities[column.status]?.length || 0 }}
        </span>
      </header>

      <!-- Fio de luz: identidade da coluna sem pintar um painel inteiro -->
      <div class="lane__rule" aria-hidden="true" />

      <!-- Drop zone com scroll próprio: a coluna cheia rola, a vazia não vira slab -->
      <div class="lane__scroll">
        <VueDraggable
          v-model="columnActivities[column.status]"
          class="lane__list"
          group="activities"
          :animation="220"
          :disabled="props.readonly"
          ghost-class="drag-ghost"
          chosen-class="drag-chosen"
          drag-class="drag-moving"
          @start="onStart"
          @end="onEnd"
          @add="(evt) => onMove(evt, column.apiStatus)"
          @update="(evt) => onMove(evt, column.apiStatus)"
          @dragenter="onEnterColumn(column.status)"
          @dragleave="onLeaveColumn"
        >
          <!-- Task card -->
          <article
            v-for="(task, i) in columnActivities[column.status]"
            :key="task.id"
            :data-id="task.id"
            class="card"
            :class="{ 'card--done': column.status === 'done' }"
            :style="{ '--i': i }"
            role="button"
            tabindex="0"
            :aria-label="task.title"
            @click="emit('open-details', task)"
            @keydown.enter.self="openByKey(task)"
            @keydown.space.self.prevent="openByKey(task)"
          >
            <!-- cover image: inset com raio próprio, nunca sangrando na borda -->
            <div v-if="getImageAttachment(task)" class="card__cover">
              <img :src="getImageAttachment(task)" alt="" loading="lazy" />
            </div>

            <div class="card__main">
              <!-- top row -->
              <div class="card__top">
                <input
                  v-if="editingTaskId === task.id"
                  v-model="editingTitle"
                  class="card__title-input"
                  @keydown.enter="commitEdit(task)"
                  @keydown.esc="cancelEdit"
                  @blur="commitEdit(task)"
                  @click.stop
                  autofocus
                />
                <h3
                  v-else
                  class="card__title"
                  @dblclick="startEditing(task, $event)"
                >
                  {{ task.title }}
                </h3>
                <button
                  v-if="!props.readonly"
                  class="card__kill"
                  aria-label="Excluir atividade"
                  @click.stop="openDeleteConfirm(task)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>

              <!-- uma única linha de meta: prio · prazo · anel · avatares -->
              <div class="card__meta">
                <span
                  v-if="task.priorityNumber !== undefined"
                  class="prio"
                  :title="getPriorityLabel(task.priorityNumber)"
                  :style="{ '--pc': getPriorityColor(task.priorityNumber) }"
                >
                  <span class="prio__dot" aria-hidden="true" />
                  P{{ task.priorityNumber }}
                </span>

                <span
                  v-if="task.dueDate"
                  class="due"
                  :class="{ 'due--overdue': isOverdue(task.dueDate) && column.status !== 'done' }"
                >
                  <Calendar :size="11" />
                  {{ formatDateOnly(task.dueDate, { month: 'short', year: undefined }) }}
                </span>

                <span class="card__spacer" />

                <!-- progress ring (também é o gatilho de expandir) -->
                <button
                  v-if="task.subtasks?.length"
                  class="ring-btn"
                  :class="{ 'ring-btn--complete': isAllDone(task), 'ring-btn--open': isExpanded(task.id) }"
                  :aria-expanded="isExpanded(task.id)"
                  :aria-label="`${getSubtaskProgress(task)!.done} de ${getSubtaskProgress(task)!.total} subtarefas`"
                  @click.stop="toggleExpand(task.id)"
                >
                  <svg class="ring" viewBox="0 0 22 22" width="18" height="18" aria-hidden="true">
                    <circle class="ring__track" cx="11" cy="11" r="9" />
                    <circle
                      class="ring__fill"
                      cx="11"
                      cy="11"
                      r="9"
                      :stroke-dasharray="RING_CIRC"
                      :style="{ strokeDashoffset: ringOffset(subtaskPercent(task)) }"
                    />
                  </svg>
                  <span class="ring-btn__frac">
                    {{ getSubtaskProgress(task)!.done }}/{{ getSubtaskProgress(task)!.total }}
                  </span>
                  <ChevronDown :size="12" class="ring-btn__chev" />
                </button>

                <!-- responsáveis: tinta suave por pessoa, empilhados; o stack
                     abre em leque no hover para ler cada inicial -->
                <div v-if="task.responsibles?.length" class="crew">
                  <div
                    v-for="(responsible, ai) in task.responsibles.slice(0, MAX_AVATARS)"
                    :key="responsible.userId ?? responsible.user.name"
                    class="crew__avatar"
                    :title="responsible.user.name"
                    :style="{ '--pc': avatarTone(responsible.user.name), zIndex: MAX_AVATARS - ai }"
                  >
                    {{ getUserInitials(responsible.user.name) }}
                  </div>
                  <div
                    v-if="task.responsibles.length > MAX_AVATARS"
                    class="crew__avatar crew__avatar--extra"
                    :title="extraNames(task)"
                  >
                    +{{ task.responsibles.length - MAX_AVATARS }}
                  </div>
                </div>
              </div>

              <!-- subtasks checklist (sem caixa cinza; expande suave) -->
              <Transition name="exp">
                <div v-if="task.subtasks?.length && isExpanded(task.id)" class="exp" @click.stop>
                  <ul class="checklist">
                    <li
                      v-for="subtask in task.subtasks"
                      :key="subtask.id"
                      class="ci"
                      :class="{ 'ci--done': subtask.status === 'DONE' }"
                    >
                      <span class="ci__box" aria-hidden="true">
                        <Check v-if="subtask.status === 'DONE'" :size="11" />
                      </span>
                      <span class="ci__label">{{ subtask.title }}</span>
                    </li>
                  </ul>
                </div>
              </Transition>
            </div>
          </article>
        </VueDraggable>

        <div
          v-if="(columnActivities[column.status]?.length || 0) === 0 && !isDragging"
          class="lane__empty"
          aria-hidden="true"
        >
          <Inbox :size="18" />
          <span>Nada por aqui</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*
 * Board estilo Linear: NENHUM painel gigante por coluna. A coluna é definida
 * pelo header + fio de luz na cor do status; o corpo tem scroll PRÓPRIO.
 * Sem isso, `align-items: stretch` + scroll de página fazia a coluna com 19
 * cards esticar as vizinhas em slabs vazios de milhares de pixels — a
 * sensação exata de "sistema pobre".
 */
.board {
  --spring: cubic-bezier(0.34, 1.42, 0.5, 1);
  --spring-soft: cubic-bezier(0.4, 0.9, 0.3, 1);
  height: 100%;
  min-height: 0;
  display: flex;
  gap: 12px;
  align-items: stretch;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

/* ── Lane (coluna etérea: sem painel, com well que aparece na interação) ── */
.lane {
  position: relative;
  flex: 1 1 0;
  min-width: 252px;
  max-width: 384px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-lg);
  padding: 6px 4px 0;
}

/* Well: invisível em repouso, sobe a 3% no hover e acende no drag-over.
   A estrutura aparece quando importa, sem pintar quatro caixas o dia todo. */
.lane::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--col) 4%, transparent);
  opacity: 0;
  transition: opacity var(--motion) var(--motion-ease);
  pointer-events: none;
}

.lane:hover::before {
  opacity: 0.7;
}

.lane--over::before {
  opacity: 1;
  background: color-mix(in srgb, var(--col) 7%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--col) 28%, transparent);
}

/* ── Lane header ────────────────────────────────────────────── */
.lane__head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 9px;
  flex-shrink: 0;
}

.lane__badge {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: color-mix(in srgb, var(--col) 82%, var(--text));
  background: color-mix(in srgb, var(--col) 9%, transparent);
  flex-shrink: 0;
}

.lane__title {
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lane__count {
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  animation: count-pop 260ms var(--spring);
}

@keyframes count-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* Régua da coluna: hairline discreta, colorida só no primeiro trecho.
   Sem glow — a cor é sinal, não luminária. */
.lane__rule {
  height: 2px;
  border-radius: 999px;
  margin: 0 8px 4px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--col) 55%, transparent),
    color-mix(in srgb, var(--col) 18%, transparent) 34%,
    var(--border) 70%
  );
  flex-shrink: 0;
  transition: background var(--motion) var(--motion-ease);
}

/* ── Corpo com scroll próprio ───────────────────────────────── */
.lane__scroll {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 4px 18px;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text-4) 30%, transparent) transparent;
  /* Fade nas bordas: os cards "nascem" e "morrem" suave em vez de cortar seco. */
  mask-image: linear-gradient(180deg, transparent 0, #000 8px, #000 calc(100% - 14px), transparent);
}

.lane__list {
  /* Ocupa a altura toda para a coluna INTEIRA ser drop zone, mesmo vazia. */
  min-height: 100%;
}

.card {
  margin-bottom: 8px;
}
.card:last-child {
  margin-bottom: 0;
}

.lane__empty {
  position: absolute;
  inset: 8px 4px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: color-mix(in srgb, var(--col) 36%, var(--text-4));
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}

/* ── Card ───────────────────────────────────────────────────── */
.card {
  position: relative;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition:
    transform 240ms var(--spring),
    border-color var(--motion) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease);
  will-change: transform;
  /* Entrada escalonada com mola; delay tetado em 8 posições p/ colunas longas
     não ficarem "pingando" por segundos. */
  animation: card-in 420ms var(--spring) backwards;
  animation-delay: calc(min(var(--i, 0), 8) * 38ms);
}

/* Brilho de topo (elevação do design system). */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--elev-1);
  opacity: 0.8;
  pointer-events: none;
  z-index: 0;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--col) 30%, var(--border-strong));
  box-shadow: var(--shadow);
}

.card:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--col) 60%, var(--border-strong));
  box-shadow:
    var(--shadow),
    0 0 0 2px color-mix(in srgb, var(--col) 60%, transparent);
}

.card:active {
  transform: translateY(0) scale(0.995);
}

/* Concluído: card assenta — some o alarme, fica o registro. */
.card--done .card__title {
  color: var(--text-2);
}

.card--done {
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}

.card__cover {
  position: relative;
  z-index: 1;
  margin: 6px 6px 0;
  height: 92px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-slow) var(--spring-soft);
}

.card:hover .card__cover img {
  transform: scale(1.04);
}

.card__main {
  position: relative;
  z-index: 1;
  padding: 11px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

/* card top */
.card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.card__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  letter-spacing: -0.008em;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.card__title-input {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 6px;
  padding: 3px 6px;
  font-family: inherit;
  outline: none;
  min-width: 0;
}

.card__kill {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text-4);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(3px);
  transition:
    opacity var(--motion-fast),
    transform var(--motion-fast) var(--spring),
    color var(--motion-fast),
    background var(--motion-fast),
    border-color var(--motion-fast);
}

.card:hover .card__kill,
.card:focus-within .card__kill {
  opacity: 1;
  transform: translateX(0);
}

.card__kill:hover {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 32%, var(--border));
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

.card__kill:focus-visible {
  opacity: 1;
  transform: none;
  outline: 2px solid var(--err);
  outline-offset: 1px;
}

/* meta: UMA linha — prio, prazo, anel, avatares */
.card__meta {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 22px;
}

.card__spacer {
  flex: 1;
}

/* prioridade: sinal na cor do PONTO; o texto fica neutro (sem gritaria) */
.prio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-3);
}

.prio__dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: var(--pc);
}

.due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-3);
}

.due--overdue {
  color: var(--err);
  font-weight: 600;
}

/* ── Anel de progresso ──────────────────────────────────────── */
.ring-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px 2px 2px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast),
    color var(--motion-fast);
}

.ring-btn:hover {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text-2);
}

.ring-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.ring {
  flex-shrink: 0;
  overflow: visible;
}

.ring__track {
  fill: none;
  stroke: color-mix(in srgb, var(--text-4) 26%, transparent);
  stroke-width: 3;
}

.ring__fill {
  fill: none;
  stroke: var(--status-done);
  stroke-width: 3;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 11px 11px;
  transition: stroke-dashoffset 620ms var(--spring-soft);
}

.ring-btn--complete {
  color: var(--status-done);
}

.ring-btn__chev {
  color: var(--text-4);
  transition: transform var(--motion) var(--spring);
}

.ring-btn--open .ring-btn__chev {
  transform: rotate(180deg);
}

/* ── Checklist (expansão sem caixa cinza) ───────────────────── */
.exp {
  display: grid;
  grid-template-rows: 1fr;
}

.checklist {
  min-height: 0;
  overflow: hidden;
  list-style: none;
  margin: 0;
  padding: 9px 2px 1px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  border-top: 1px solid var(--border);
}

.ci {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  color: var(--text-2);
}

.ci__box {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  border: 1.5px solid var(--border-strong);
  color: #fff;
  transition:
    background var(--motion-fast),
    border-color var(--motion-fast);
}

.ci--done .ci__box {
  background: var(--status-done);
  border-color: var(--status-done);
}

.ci--done .ci__label {
  color: var(--text-4);
  text-decoration: line-through;
}

.ci__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exp-enter-active,
.exp-leave-active {
  transition:
    grid-template-rows 320ms var(--spring-soft),
    opacity 220ms var(--motion-ease);
}

.exp-enter-from,
.exp-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

/* ── Responsáveis (dentro da linha de meta) ─────────────────────
   Cor como TINTA, não como luz: fundo é o tom da pessoa a 16% sobre a
   superfície, iniciais no mesmo tom puxado pro texto, hairline no tom.
   Sem sombra colorida, sem chapado saturado com texto branco. O anel
   na cor do card corta a sobreposição limpa; no hover o stack abre em
   leque (mola) pra ler todas as iniciais. */
.crew {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.crew__avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--pc) 16%, var(--surface));
  color: color-mix(in srgb, var(--pc) 64%, var(--text));
  border: 1px solid color-mix(in srgb, var(--pc) 32%, transparent);
  box-shadow: 0 0 0 2px var(--surface);
  flex-shrink: 0;
  cursor: default;
  user-select: none;
  transition: margin 260ms var(--spring);
}

.crew__avatar + .crew__avatar {
  margin-left: -6px;
}

.crew:hover .crew__avatar + .crew__avatar {
  margin-left: 3px;
}

/* O "+N" é informação (quantos faltam), não decoração: fica ACIMA do stack
   para nunca ser soterrado pelo avatar vizinho. */
.crew__avatar--extra {
  background: var(--surface-3);
  color: var(--text-3);
  border-color: var(--border);
  font-size: 8.5px;
  font-variant-numeric: tabular-nums;
  position: relative;
  z-index: 4;
}

/* ── Estados de arraste ─────────────────────────────────────── */
.drag-ghost {
  opacity: 0.45 !important;
  background: color-mix(in srgb, var(--col) 9%, var(--surface-2)) !important;
  border: 1.5px dashed color-mix(in srgb, var(--col) 55%, var(--accent)) !important;
  border-radius: 12px !important;
  box-shadow: none !important;
}

.drag-ghost::before {
  display: none;
}

.drag-chosen {
  cursor: grabbing !important;
  transform: rotate(2deg) scale(1.04) !important;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.48) !important;
  z-index: 9999 !important;
  border-color: var(--accent) !important;
}

.drag-moving {
  cursor: grabbing !important;
}

/* Notebook de 1280: com 252px de coluna as quatro somavam ~40px a mais que a
   área útil e o board nascia com scroll horizontal, escondendo parte da última
   coluna. Estreitar um pouco faz as quatro caberem inteiras. */
@media (max-width: 1400px) {
  .lane {
    min-width: 228px;
  }
}

/* ── Mobile: colunas em fita com snap (padrão de kanban touch) ── */
@media (max-width: 640px) {
  .board {
    scroll-snap-type: x mandatory;
    gap: 10px;
    padding-bottom: 4px;
  }

  .lane {
    flex: 0 0 84vw;
    max-width: 320px;
    scroll-snap-align: start;
  }
}

/* ── Menos movimento ────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .card,
  .lane__count {
    animation: none !important;
  }
  .card:hover {
    transform: none;
  }
  .card:hover .card__cover img {
    transform: none;
  }
  .ring__fill,
  .exp-enter-active,
  .exp-leave-active,
  .crew__avatar {
    transition: none;
  }
}
</style>
