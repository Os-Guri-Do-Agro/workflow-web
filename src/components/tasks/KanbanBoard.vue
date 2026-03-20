<script setup lang="ts">
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
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
    accent: '#6B7280',
    icon: 'mdi-circle-outline',
  },
  {
    status: 'in-progress',
    apiStatus: 'IN_PROGRESS',
    title: 'Em Andamento',
    color: '#F59E0B',
    accent: '#F59E0B',
    icon: 'mdi-circle-slice-4',
  },
  {
    status: 'testing',
    apiStatus: 'IN_TESTING',
    title: 'Em Teste',
    color: '#8B5CF6',
    accent: '#8B5CF6',
    icon: 'mdi-circle-slice-6',
  },
  {
    status: 'done',
    apiStatus: 'DONE',
    title: 'Concluído',
    color: '#10B981',
    accent: '#10B981',
    icon: 'mdi-check-circle',
  },
]

const isDragging = ref(false)
const dragOverColumn = ref<string | null>(null)
const columnActivities = ref<any>({ todo: [], 'in-progress': [], testing: [], done: [] })

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
  const colors = ['#1976D2', '#388E3C', '#D32F2F', '#7B1FA2', '#F57C00', '#0097A7', '#C2185B', '#5D4037']
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
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
  // deixa o dragOverColumn limpar só no onEnd para não piscar
}

const openDeleteConfirm = (task: any) => {
  emit('delete-task', task)
}

const getSubtaskProgress = (task: any) => {
  if (!task.subtasks?.length) return null
  const done = task.subtasks.filter((s: any) => s.completed).length
  return { done, total: task.subtasks.length }
}

const isOverdue = (dueDate: string) => {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}
</script>

<template>
  <div class="kanban-board">
    <div
      v-for="column in columns"
      :key="column.status"
      class="kanban-col"
    >
      <!-- Column header -->
      <div class="column-header mb-2 px-1">
        <div class="d-flex align-center justify-space-between">
          <div class="d-flex align-center ga-2">
            <v-icon :color="column.color" size="16">{{ column.icon }}</v-icon>
            <span class="column-title">{{ column.title }}</span>
          </div>
          <span class="column-count" :style="{ color: column.color }">
            {{ columnActivities[column.status].length }}
          </span>
        </div>
        <!-- accent line -->
        <div
          class="column-accent-line mt-2"
          :style="{ backgroundColor: column.color + '40' }"
        />
      </div>

      <!-- Draggable zone -->
      <VueDraggable
        v-model="columnActivities[column.status]"
        class="column-content"
        :class="{ 'column-drop-active': isDragging && dragOverColumn === column.status }"
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
        <!-- Empty state -->
        <div
          v-if="columnActivities[column.status].length === 0 && !isDragging"
          class="empty-column"
        >
          <v-icon size="20" :color="column.color + '60'">mdi-plus</v-icon>
        </div>

        <!-- Task card -->
        <div
          v-for="task in columnActivities[column.status]"
          :key="task.id"
          :data-id="task.id"
          class="task-card mb-2"
          :style="{ '--priority-color': getPriorityColor(task.priorityNumber) }"
          @click="emit('open-details', task)"
        >
          <!-- cover image -->
          <div v-if="getImageAttachment(task)" class="card-image">
            <img :src="getImageAttachment(task)" alt="" />
          </div>

          <div class="card-body">
            <!-- top row: title + actions -->
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
              >{{ task.title }}</span>
              <div class="card-actions" @click.stop>
                <v-btn
                  v-if="!props.readonly"
                  icon
                  size="x-small"
                  variant="text"
                  class="delete-btn"
                  @click.stop="openDeleteConfirm(task)"
                >
                  <v-icon size="14">mdi-close</v-icon>
                </v-btn>
              </div>
            </div>

            <!-- meta row -->
            <div class="card-meta">
              <!-- priority -->
              <div
                v-if="task.priorityNumber !== undefined"
                class="meta-badge priority-badge"
                :style="{
                  color: getPriorityColor(task.priorityNumber),
                  backgroundColor: getPriorityColor(task.priorityNumber) + '18',
                }"
              >
                <v-tooltip :text="getPriorityLabel(task.priorityNumber)" location="top">
                  <template #activator="{ props: tp }">
                    <span v-bind="tp">P{{ task.priorityNumber }}</span>
                  </template>
                </v-tooltip>
              </div>

              <!-- due date -->
              <div
                v-if="task.dueDate"
                class="meta-badge"
                :class="{ 'overdue': isOverdue(task.dueDate) }"
              >
                <v-icon size="11">mdi-calendar-outline</v-icon>
                {{ new Date(task.dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }}
              </div>

              <!-- subtasks -->
              <div v-if="getSubtaskProgress(task)" class="meta-badge subtask-badge">
                <v-icon size="11">mdi-format-list-checks</v-icon>
                {{ getSubtaskProgress(task)!.done }}/{{ getSubtaskProgress(task)!.total }}
              </div>
            </div>

            <!-- bottom row: avatars -->
            <div v-if="task.responsibles?.length" class="card-avatars">
              <div
                v-for="(responsible, i) in task.responsibles.slice(0, 4)"
                :key="responsible.userId"
                class="avatar-chip"
                :style="{
                  backgroundColor: getUserColor(responsible.user.name),
                  marginLeft: (i as number) > 0 ? '-6px' : '0',
                  zIndex: 4 - (i as number),
                }"
              >
                <v-tooltip :text="responsible.user.name" location="top">
                  <template #activator="{ props: tp }">
                    <span v-bind="tp">{{ getUserInitials(responsible.user.name) }}</span>
                  </template>
                </v-tooltip>
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

          <!-- priority accent bar on left -->
          <div
            class="card-priority-bar"
            :style="{ backgroundColor: getPriorityColor(task.priorityNumber) }"
          />
        </div>
      </VueDraggable>
    </div>
  </div>
</template>

<style scoped>
/* ─── Layout ─── */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  align-items: start;
}

.kanban-col {
  min-width: 0;
}

/* ─── Column header ─── */
.column-header {
  padding: 0 2px;
}

.column-title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  letter-spacing: 0.01em;
}

.column-count {
  font-size: 12px;
  font-weight: 700;
  min-width: 20px;
  text-align: right;
}

.column-accent-line {
  height: 2px;
  border-radius: 999px;
}

/* ─── Drop zone ─── */
.column-content {
  min-height: 80px;
  border-radius: 10px;
  padding: 4px;
  transition: background 0.15s ease, outline 0.15s ease;
}

.column-drop-active {
  background: rgba(var(--v-theme-secondary), 0.03) !important;
  outline: 1.5px dashed rgba(var(--v-theme-secondary), 0.15);
  outline-offset: 0px;
}

.empty-column {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border-radius: 8px;
  border: 1.5px dashed rgba(var(--v-theme-secondary), 0.08);
}

/* ─── Task card ─── */
.task-card {
  position: relative;
  border-radius: 10px;
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  will-change: transform;
}

.task-card:hover {
  transform: translateY(-2px);
  border-color: rgba(var(--v-theme-secondary), 0.14);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
}

.task-card:active {
  transform: translateY(0);
}

/* priority bar on left edge */
.card-priority-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 10px 0 0 10px;
  opacity: 0.7;
}

/* cover image */
.card-image {
  width: 100%;
  height: 110px;
  overflow: hidden;
}
.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-body {
  padding: 10px 10px 10px 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* title row */
.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.card-title {
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

/* inline edit input */
.card-title-input {
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  line-height: 1.45;
  flex: 1;
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid rgba(var(--v-theme-secondary), 0.18);
  border-radius: 5px;
  padding: 2px 6px;
  outline: none;
  font-family: inherit;
  min-width: 0;
}

.card-title-input:focus {
  border-color: rgba(var(--v-theme-secondary), 0.35);
}

/* delete button — subtle, appears on hover */
.card-actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
  margin-top: -2px;
}

.task-card:hover .card-actions {
  opacity: 1;
}

.delete-btn {
  color: rgba(var(--v-theme-secondary), 0.4) !important;
}
.delete-btn:hover {
  color: rgb(var(--v-theme-error)) !important;
}

/* ─── Meta badges ─── */
.card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.meta-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 999px;
  color: rgba(var(--v-theme-secondary), 0.5);
  background: rgba(var(--v-theme-secondary), 0.07);
  user-select: none;
  white-space: nowrap;
}

.meta-badge.overdue {
  color: #EF4444;
  background: rgba(239, 68, 68, 0.12);
}

.priority-badge {
  font-weight: 700;
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

/* ─── Avatars ─── */
.card-avatars {
  display: flex;
  align-items: center;
}

.avatar-chip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: white;
  position: relative;
  border: 1.5px solid rgb(var(--v-theme-primary));
  flex-shrink: 0;
  cursor: default;
}

.avatar-extra {
  background: rgba(var(--v-theme-secondary), 0.15) !important;
  color: rgba(var(--v-theme-secondary), 0.7);
  font-size: 9px;
}

/* ─── Drag states ─── */
.drag-ghost {
  opacity: 0.25 !important;
  background: rgb(var(--v-theme-surface)) !important;
  border: 1.5px dashed rgba(var(--v-theme-secondary), 0.2) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
}

.drag-chosen {
  cursor: grabbing !important;
  transform: rotate(1.5deg) scale(1.03) !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45) !important;
  z-index: 9999 !important;
  border-color: rgba(var(--v-theme-secondary), 0.2) !important;
}

.drag-moving {
  cursor: grabbing !important;
}
</style>
