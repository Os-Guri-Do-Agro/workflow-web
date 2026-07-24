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
import type { Activity } from '@/core/types'
import { formatDateOnly, isOverdue } from '@/utils/date'

interface Props {
  tasks: any
  readonly?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  // Único evento de arraste: cobre troca de coluna (@add) e reordenação (@update).
  'move-task': [payload: { taskId: string; status: string; position: number }]
  'open-details': [task: Activity]
  'delete-task': [task: any]
  'rename-task': [taskId: string, title: string]
}>()

// ── Inline editing ──
const editingTaskId = ref<string | null>(null)
const editingTitle = ref('')

const startEditing = (task: any, e: Event) => {
  e.stopPropagation()
  editingTaskId.value = task.id
  editingTitle.value = task.title
}

const commitEdit = (task: any) => {
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

// Cor de cada coluna vem dos tokens de status do design system (theme-aware),
// não de hex solto: a mesma família azul/laranja/violeta/verde do resto do app.
const columns = [
  { status: 'todo', apiStatus: 'TODO', title: 'A Fazer', token: 'var(--status-todo)', icon: Circle },
  { status: 'in-progress', apiStatus: 'IN_PROGRESS', title: 'Em Andamento', token: 'var(--status-prog)', icon: CircleDashed },
  { status: 'testing', apiStatus: 'IN_TESTING', title: 'Em Teste', token: 'var(--status-test)', icon: CircleDot },
  { status: 'done', apiStatus: 'DONE', title: 'Concluído', token: 'var(--status-done)', icon: CircleCheck },
]

const isDragging = ref(false)
const dragOverColumn = ref<string | null>(null)
const columnActivities = ref<any>({
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

const getUserInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

const getUserColor = (name: string) => {
  const colors = ['#6366F1', '#10B981', '#EF4444', '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16']
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index] || '#6366F1'
}

const getPriorityColor = (priority: number) => {
  const colors: Record<number, string> = {
    0: '#12B76A',
    1: '#2E90FA',
    2: '#F79009',
    3: '#F04438',
    4: '#DC2626',
    5: '#991B1B',
  }
  return colors[priority] ?? '#6B7280'
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

// Arraste (add=cruzou coluna, update=reordenou na mesma): emite um único
// move-task com o índice de destino (newIndex) p/ persistir a ordem manual.
const onMove = (evt: any, apiStatus: string) => {
  const taskId = evt.item?.dataset?.id
  if (!taskId) return
  const position = typeof evt.newIndex === 'number' ? evt.newIndex : 0
  emit('move-task', { taskId, status: apiStatus, position })
}

const getImageAttachment = (task: any) =>
  task.attachments?.find((a: any) => /\.(jpg|jpeg|png|gif|webp)$/i.test(a.filename))?.url ?? null

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

const openDeleteConfirm = (task: any) => {
  emit('delete-task', task)
}

const getSubtaskProgress = (task: any) => {
  if (!task.subtasks?.length) return null
  const done = task.subtasks.filter((s: any) => s.status === 'DONE').length
  return { done, total: task.subtasks.length }
}

const subtaskPercent = (task: any) => {
  const p = getSubtaskProgress(task)
  return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0
}

const isAllDone = (task: any) => {
  const p = getSubtaskProgress(task)
  return !!p && p.done === p.total
}

// Anel de progresso (SVG): r=9 → circunferência ~56.55. O offset "esvazia" o
// traço proporcionalmente ao que falta.
const RING_CIRC = 2 * Math.PI * 9
const ringOffset = (pct: number) => RING_CIRC * (1 - pct / 100)

// Abrir por teclado só quando o próprio card está focado (`.self`): evita que
// Enter durante a edição do título, ou em botões internos, abra os detalhes.
const openByKey = (task: Activity) => emit('open-details', task)

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
  <div class="board">
    <section
      v-for="column in columns"
      :key="column.status"
      class="lane"
      :class="{ 'lane--over': isDragging && dragOverColumn === column.status }"
      :style="{ '--col': column.token }"
    >
      <div class="lane__aura" aria-hidden="true" />

      <!-- Column header -->
      <header class="lane__head">
        <div class="lane__head-left">
          <component :is="column.icon" :size="14" class="lane__icon" />
          <h2 class="lane__title">{{ column.title }}</h2>
        </div>
        <span class="lane__count" :key="columnActivities[column.status]?.length || 0">
          {{ columnActivities[column.status]?.length || 0 }}
        </span>
      </header>

      <!-- Drop zone -->
      <div class="lane__body">
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
            <span class="card__glow" aria-hidden="true" />

            <!-- cover image -->
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

              <!-- meta -->
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
                  :class="{ 'due--overdue': isOverdue(task.dueDate) }"
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
                  <svg class="ring" viewBox="0 0 22 22" width="20" height="20" aria-hidden="true">
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

              <!-- avatars -->
              <div v-if="task.responsibles?.length" class="card__foot">
                <div class="avatars">
                  <div
                    v-for="(responsible, i) in task.responsibles.slice(0, 4)"
                    :key="responsible.userId"
                    class="avatar"
                    :title="responsible.user.name"
                    :style="{
                      background: getUserColor(responsible.user.name),
                      marginLeft: (i as number) > 0 ? '-8px' : '0',
                      zIndex: 4 - (i as number),
                    }"
                  >
                    {{ getUserInitials(responsible.user.name) }}
                  </div>
                  <div
                    v-if="task.responsibles.length > 4"
                    class="avatar avatar--extra"
                    style="margin-left: -8px"
                  >
                    +{{ task.responsibles.length - 4 }}
                  </div>
                </div>
              </div>
            </div>
          </article>
        </VueDraggable>

        <div
          v-if="(columnActivities[column.status]?.length || 0) === 0 && !isDragging"
          class="lane__empty"
          aria-hidden="true"
        >
          <Inbox :size="19" />
          <span>Nada por aqui</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Molas: overshoot leve na entrada, resposta gostosa no hover. */
.board {
  --spring: cubic-bezier(0.34, 1.42, 0.5, 1);
  --spring-soft: cubic-bezier(0.4, 0.9, 0.3, 1);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  /* stretch: todas as colunas com a MESMA altura (a da mais cheia). Sem isso a
     coluna vazia/curta fica "quebrada" ao lado das altas. */
  align-items: stretch;
}

@media (max-width: 1100px) {
  .board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .board {
    grid-template-columns: 1fr;
  }
}

/* ── Lane (coluna em painel) ─────────────────────────────────── */
.lane {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: color-mix(in srgb, var(--col) 4%, var(--surface-2));
  border: 1px solid var(--border);
  padding: 8px 8px 10px;
  transition:
    background var(--motion) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease),
    border-color var(--motion) var(--motion-ease);
}

/* Halo da cor do status descendo do topo do painel: identidade sem poluir. */
.lane__aura {
  position: absolute;
  inset: 0 0 auto;
  height: 120px;
  border-radius: 16px 16px 0 0;
  background: radial-gradient(
    120% 80% at 50% -10%,
    color-mix(in srgb, var(--col) 22%, transparent),
    transparent 68%
  );
  opacity: 0.5;
  pointer-events: none;
}

.lane--over {
  background: color-mix(in srgb, var(--col) 11%, var(--surface-2));
  border-color: color-mix(in srgb, var(--col) 45%, var(--border-strong));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--col) 30%, transparent);
}

/* ── Lane header ────────────────────────────────────────────── */
.lane__head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 10px;
}

.lane__head-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.lane__icon {
  color: var(--col);
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--col) 55%, transparent));
  flex-shrink: 0;
}

.lane__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-2);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lane__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 8px;
  color: var(--col);
  background: color-mix(in srgb, var(--col) 15%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--col) 24%, transparent);
  animation: count-pop 260ms var(--spring);
}

@keyframes count-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

/* ── Lista / drop zone ──────────────────────────────────────── */
.lane__body {
  position: relative;
  z-index: 1;
  /* Preenche a altura da lane (stretch) para a coluna toda virar drop zone. */
  flex: 1;
  display: flex;
  flex-direction: column;
}

.lane__list {
  /* flex ITEM (não flex container): cresce pra preencher a lane, mas os cards
     continuam em fluxo block + margin-bottom (sortablejs não gosta de flex+gap). */
  flex: 1;
  min-height: 72px;
}

.card {
  margin-bottom: 10px;
}
.card:last-child {
  margin-bottom: 0;
}

.lane__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 110px;
  border-radius: 12px;
  border: 1.5px dashed color-mix(in srgb, var(--col) 24%, var(--border));
  color: color-mix(in srgb, var(--col) 50%, var(--text-4));
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
}

/* ── Card ───────────────────────────────────────────────────── */
.card {
  position: relative;
  border-radius: 14px;
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
  /* Entrada escalonada com mola; roda uma vez por card (nós keyed não remontam
     ao reordenar/refetch). `backwards` p/ não travar o transform do hover. */
  animation: card-in 460ms var(--spring) backwards;
  animation-delay: calc(var(--i, 0) * 42ms);
}

/* Brilho de topo (elevação do design system) + fio de luz na borda superior. */
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

/* Glow da cor do status, sobe do topo no hover. */
.card__glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    130% 85% at 50% 0%,
    color-mix(in srgb, var(--col) 20%, transparent),
    transparent 62%
  );
  opacity: 0;
  transition: opacity var(--motion) var(--motion-ease);
  pointer-events: none;
  z-index: 0;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.965);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.card:hover {
  transform: translateY(-4px) scale(1.014);
  border-color: color-mix(in srgb, var(--col) 42%, var(--border-strong));
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--col) 22%, transparent);
}

.card:hover .card__glow {
  opacity: 1;
}

.card:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--col) 60%, var(--border-strong));
  box-shadow:
    var(--shadow),
    0 0 0 2px color-mix(in srgb, var(--col) 60%, transparent);
}

.card:active {
  transform: translateY(-1px) scale(0.998);
}

.card--done .card__title {
  color: var(--text-2);
}

.card__cover {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 108px;
  overflow: hidden;
  background: var(--surface-2);
}

.card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform var(--motion-slow) var(--spring-soft);
}

.card:hover .card__cover img {
  transform: scale(1.05);
}

.card__main {
  position: relative;
  z-index: 1;
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

/* card top */
.card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.card__title {
  font-size: 13.5px;
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
  font-size: 13.5px;
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
  width: 25px;
  height: 25px;
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

/* meta */
.card__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card__spacer {
  flex: 1;
}

/* prioridade discreta: ponto + rótulo, sem pill de fundo colorido */
.prio {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: color-mix(in srgb, var(--pc) 62%, var(--text-2));
}

.prio__dot {
  width: 7px;
  height: 7px;
  border-radius: 2.5px;
  background: var(--pc);
  box-shadow: 0 0 7px color-mix(in srgb, var(--pc) 65%, transparent);
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
  gap: 6px;
  padding: 3px 7px 3px 3px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
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
  padding: 10px 2px 2px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  width: 16px;
  height: 16px;
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

/* ── Avatares ───────────────────────────────────────────────── */
.card__foot {
  display: flex;
  align-items: center;
}

.avatars {
  display: flex;
  align-items: center;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 700;
  color: white;
  border: 2px solid var(--surface);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.28);
  flex-shrink: 0;
  cursor: default;
  transition: transform var(--motion) var(--spring);
}

.card:hover .avatar {
  transform: translateY(-2px);
}

.avatar--extra {
  background: var(--surface-3) !important;
  color: var(--text-3) !important;
  border-color: var(--surface) !important;
  box-shadow: none !important;
}

/* ── Estados de arraste ─────────────────────────────────────── */
.drag-ghost {
  opacity: 0.45 !important;
  background: color-mix(in srgb, var(--col) 9%, var(--surface-2)) !important;
  border: 1.5px dashed color-mix(in srgb, var(--col) 55%, var(--accent)) !important;
  border-radius: 14px !important;
  box-shadow: none !important;
}

.drag-ghost::before,
.drag-ghost .card__glow {
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
  .exp-leave-active {
    transition: none;
  }
}
</style>
