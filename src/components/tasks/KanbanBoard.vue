<script setup lang="ts">
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  Circle,
  CircleDashed,
  CircleDot,
  CircleCheck,
  Plus,
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Trash2,
} from 'lucide-vue-next'
import type { Activity } from '@/core/types'

interface Props {
  tasks: any
  readonly?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update-status': [taskId: string, status: string]
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

const columns = [
  {
    status: 'todo',
    apiStatus: 'TODO',
    title: 'A Fazer',
    color: '#6B7280',
    icon: Circle,
  },
  {
    status: 'in-progress',
    apiStatus: 'IN_PROGRESS',
    title: 'Em Andamento',
    color: '#F59E0B',
    icon: CircleDashed,
  },
  {
    status: 'testing',
    apiStatus: 'IN_TESTING',
    title: 'Em Teste',
    color: '#8B5CF6',
    icon: CircleDot,
  },
  {
    status: 'done',
    apiStatus: 'DONE',
    title: 'Concluído',
    color: '#10B981',
    icon: CircleCheck,
  },
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
    0: '#10B981',
    1: '#3B82F6',
    2: '#F59E0B',
    3: '#EF4444',
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

const onAdd = (evt: any, apiStatus: string) => {
  const taskId = evt.item?.dataset?.id
  if (taskId) emit('update-status', taskId, apiStatus)
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

const isOverdue = (dueDate: string) => {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

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
  <div class="kanban-board">
    <div v-for="column in columns" :key="column.status" class="kanban-col">
      <!-- Column header -->
      <div class="column-header">
        <div class="column-head-row">
          <div class="column-head-left">
            <component
              :is="column.icon"
              :size="13"
              :color="column.color"
              class="column-icon"
            />
            <span class="column-title">{{ column.title }}</span>
          </div>
          <span
            class="column-count"
            :style="{
              color: column.color,
              background: `color-mix(in srgb, ${column.color} 14%, var(--surface-2))`,
              borderColor: `color-mix(in srgb, ${column.color} 30%, var(--border))`,
            }"
          >
            {{ columnActivities[column.status]?.length || 0 }}
          </span>
        </div>
        <div
          class="column-accent-line"
          :style="{ background: `color-mix(in srgb, ${column.color} 50%, transparent)` }"
        />
      </div>

      <!-- Drop zone -->
      <VueDraggable
        v-model="columnActivities[column.status]"
        class="column-content"
        :class="{
          'column-drop-active': isDragging && dragOverColumn === column.status,
        }"
        group="activities"
        :animation="180"
        :disabled="props.readonly"
        ghost-class="drag-ghost"
        chosen-class="drag-chosen"
        drag-class="drag-moving"
        @start="onStart"
        @end="onEnd"
        @add="(evt) => onAdd(evt, column.apiStatus)"
        @dragenter="onEnterColumn(column.status)"
        @dragleave="onLeaveColumn"
      >
        <!-- Empty -->
        <div
          v-if="(columnActivities[column.status]?.length || 0) === 0 && !isDragging"
          class="empty-column"
        >
          <Plus :size="14" />
          <span>Vazio</span>
        </div>

        <!-- Task card -->
        <div
          v-for="task in columnActivities[column.status]"
          :key="task.id"
          :data-id="task.id"
          class="task-card"
          :style="{ '--priority-color': getPriorityColor(task.priorityNumber) }"
          @click="emit('open-details', task)"
        >
          <!-- cover image -->
          <div v-if="getImageAttachment(task)" class="card-image">
            <img :src="getImageAttachment(task)" alt="" loading="lazy" />
          </div>

          <div class="card-body">
            <!-- top row -->
            <div class="card-top">
              <input
                v-if="editingTaskId === task.id"
                v-model="editingTitle"
                class="card-title-input"
                @keydown.enter="commitEdit(task)"
                @keydown.esc="cancelEdit"
                @blur="commitEdit(task)"
                @click.stop
                autofocus
              />
              <span
                v-else
                class="card-title"
                @dblclick="startEditing(task, $event)"
              >
                {{ task.title }}
              </span>
              <button
                v-if="!props.readonly"
                class="card-action"
                aria-label="Excluir"
                @click.stop="openDeleteConfirm(task)"
              >
                <Trash2 :size="12" />
              </button>
            </div>

            <!-- meta -->
            <div class="card-meta">
              <span
                v-if="task.priorityNumber !== undefined"
                class="meta-pill priority-pill"
                :title="getPriorityLabel(task.priorityNumber)"
                :style="{
                  color: getPriorityColor(task.priorityNumber),
                  background: `color-mix(in srgb, ${getPriorityColor(task.priorityNumber)} 14%, var(--surface-2))`,
                  borderColor: `color-mix(in srgb, ${getPriorityColor(task.priorityNumber)} 30%, var(--border))`,
                }"
              >
                P{{ task.priorityNumber }}
              </span>

              <span
                v-if="task.dueDate"
                class="meta-pill"
                :class="{ 'meta-pill--overdue': isOverdue(task.dueDate) }"
              >
                <Calendar :size="10" />
                {{
                  new Date(task.dueDate).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })
                }}
              </span>
            </div>

            <!-- subtasks -->
            <div v-if="task.subtasks?.length" class="subtasks-section" @click.stop>
              <button class="subtasks-toggle" @click="toggleExpand(task.id)">
                <ChevronUp v-if="isExpanded(task.id)" :size="11" />
                <ChevronDown v-else :size="11" />
                <span>
                  {{ getSubtaskProgress(task)!.done }}/{{ getSubtaskProgress(task)!.total }}
                  subtarefas
                </span>
              </button>

              <div v-if="isExpanded(task.id)" class="subtasks-list">
                <div
                  v-for="subtask in task.subtasks"
                  :key="subtask.id"
                  class="subtask-item"
                  :class="{ 'subtask-done': subtask.status === 'DONE' }"
                >
                  <CheckCircle2
                    v-if="subtask.status === 'DONE'"
                    :size="11"
                    color="#10B981"
                  />
                  <Circle v-else :size="11" />
                  <span class="subtask-title">{{ subtask.title }}</span>
                </div>
              </div>
            </div>

            <!-- avatars -->
            <div v-if="task.responsibles?.length" class="card-avatars">
              <div
                v-for="(responsible, i) in task.responsibles.slice(0, 4)"
                :key="responsible.userId"
                class="avatar-chip"
                :title="responsible.user.name"
                :style="{
                  background: getUserColor(responsible.user.name),
                  marginLeft: (i as number) > 0 ? '-6px' : '0',
                  zIndex: 4 - (i as number),
                }"
              >
                {{ getUserInitials(responsible.user.name) }}
              </div>
              <div
                v-if="task.responsibles.length > 4"
                class="avatar-chip avatar-extra"
                style="margin-left: -6px"
              >
                +{{ task.responsibles.length - 4 }}
              </div>
            </div>
          </div>

          <!-- priority bar -->
          <div
            class="card-priority-bar"
            :style="{ background: getPriorityColor(task.priorityNumber) }"
          />
        </div>
      </VueDraggable>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────── */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  align-items: start;
}

@media (max-width: 1100px) {
  .kanban-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .kanban-board {
    grid-template-columns: 1fr;
  }
}

.kanban-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Column header ──────────────────────────────────────────── */
.column-header {
  padding: 0 2px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.column-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.column-head-left {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.column-icon {
  flex-shrink: 0;
}

.column-title {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-2);
}

.column-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.column-accent-line {
  height: 2px;
  border-radius: 999px;
}

/* ── Drop zone ──────────────────────────────────────────────── */
.column-content {
  min-height: 80px;
  border-radius: var(--radius);
  padding: 4px;
  /* sortablejs/vue-draggable não convive bem com flex+gap aqui;
     mantém block + margin-bottom nos cards. */
  transition: background var(--motion-fast), outline var(--motion-fast);
}

.task-card {
  margin-bottom: 8px;
}
.task-card:last-child {
  margin-bottom: 0;
}

.column-drop-active {
  background: color-mix(in srgb, var(--accent) 6%, transparent) !important;
  outline: 1.5px dashed color-mix(in srgb, var(--accent) 35%, transparent);
  outline-offset: 0;
}

.empty-column {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 56px;
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--border);
  color: var(--text-4);
  font-size: 11.5px;
}

/* ── Task card ──────────────────────────────────────────────── */
.task-card {
  position: relative;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  overflow: hidden;
  transition:
    transform var(--motion-fast),
    border-color var(--motion-fast),
    box-shadow var(--motion-fast);
  will-change: transform;
}

.task-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.card-priority-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: var(--radius) 0 0 var(--radius);
  opacity: 0.85;
}

.card-image {
  width: 100%;
  height: 100px;
  overflow: hidden;
  background: var(--surface-2);
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-body {
  padding: 10px 12px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* card top */
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.card-title-input {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--accent);
  border-radius: 5px;
  padding: 3px 6px;
  font-family: inherit;
  outline: none;
  min-width: 0;
}

.card-action {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-4);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: all var(--motion-fast);
}

.task-card:hover .card-action {
  opacity: 1;
}

.card-action:hover {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 30%, var(--border));
  background: color-mix(in srgb, #ef4444 10%, transparent);
}

/* meta pills */
.card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-3);
  letter-spacing: 0.02em;
}

.priority-pill {
  font-weight: 700;
}

.meta-pill--overdue {
  color: #ef4444;
  background: color-mix(in srgb, #ef4444 12%, var(--surface-2));
  border-color: color-mix(in srgb, #ef4444 30%, var(--border));
}

/* avatars */
.card-avatars {
  display: flex;
  align-items: center;
  margin-top: 2px;
}

.avatar-chip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 700;
  color: white;
  border: 1.5px solid var(--surface);
  flex-shrink: 0;
  cursor: default;
}

.avatar-extra {
  background: var(--surface-2) !important;
  color: var(--text-3) !important;
  border-color: var(--border) !important;
}

/* ── Drag states ────────────────────────────────────────────── */
.drag-ghost {
  opacity: 0.35 !important;
  background: var(--surface-2) !important;
  border: 1.5px dashed var(--accent) !important;
  border-radius: var(--radius) !important;
  box-shadow: none !important;
}

.drag-chosen {
  cursor: grabbing !important;
  transform: rotate(1.5deg) scale(1.02) !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4) !important;
  z-index: 9999 !important;
  border-color: var(--accent) !important;
}

.drag-moving {
  cursor: grabbing !important;
}

/* ── Subtasks ───────────────────────────────────────────────── */
.subtasks-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}

.subtasks-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  align-self: flex-start;
  transition: border-color var(--motion-fast), color var(--motion-fast);
}

.subtasks-toggle:hover {
  border-color: var(--accent);
  color: var(--text);
}

.subtasks-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.subtask-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-2);
}

.subtask-item.subtask-done {
  opacity: 0.55;
}

.subtask-item.subtask-done .subtask-title {
  text-decoration: line-through;
}

.subtask-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
