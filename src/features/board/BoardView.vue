<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Calendar,
  User,
  LayoutGrid,
  AlertCircle,
  ChevronDown,
  X,
} from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useToast } from '@/composables/useToast'

const { error: showError } = useToast()

const router = useRouter()
const workspace = useWorkspaceStore()

const loading = ref(true)
const searchQuery = ref('')
const filterCompany = ref<string | null>(null)
const filterPriority = ref<number | null>(null)
const draggedTask = ref<any>(null)

type ColumnStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

const columns: { id: ColumnStatus; title: string; token: string }[] = [
  { id: 'TODO', title: 'A fazer', token: 'var(--status-todo)' },
  { id: 'IN_PROGRESS', title: 'Em andamento', token: 'var(--status-prog)' },
  { id: 'IN_TESTING', title: 'Em teste', token: 'var(--status-test)' },
  { id: 'DONE', title: 'Concluído', token: 'var(--status-done)' },
]

type PrioritySpec = { label: string; token: string }
const priorityMeta: Record<number, PrioritySpec> = {
  0: { label: 'P0', token: 'var(--err)' },
  1: { label: 'P1', token: 'var(--warn)' },
  2: { label: 'P2', token: 'var(--info)' },
  3: { label: 'P3', token: 'var(--text-3)' },
}
const PRIORITY_FALLBACK: PrioritySpec = { label: '—', token: 'var(--text-3)' }
const prio = (p: number): PrioritySpec => priorityMeta[p] ?? PRIORITY_FALLBACK

const allActivities = computed(() => {
  let activities = workspace.workspaceData?.activities || []

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    activities = activities.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.companyName.toLowerCase().includes(q),
    )
  }

  if (filterCompany.value) {
    activities = activities.filter((a) => a.companyId === filterCompany.value)
  }

  if (filterPriority.value !== null) {
    activities = activities.filter((a) => a.priority === filterPriority.value)
  }

  return activities
})

const getColumnTasks = (status: string) => {
  return allActivities.value
    .filter((a) => a.status === status)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      return 0
    })
}

const companies = computed(() => {
  return (
    workspace.workspaceData?.companies?.map((c) => ({
      id: c.company.id,
      name: c.company.name,
    })) || []
  )
})

const hasFilters = computed(
  () => !!searchQuery.value || !!filterCompany.value || filterPriority.value !== null,
)

const clearFilters = () => {
  searchQuery.value = ''
  filterCompany.value = null
  filterPriority.value = null
}

async function loadData() {
  loading.value = true
  try {
    const hasStaleData = workspace.workspaceData?.activities.some((a) => !a.monthId)
    if (hasStaleData) workspace.workspaceData = null
    await workspace.fetchWorkspace()
  } catch (err) {
    showError('Erro ao carregar atividades')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

watch(
  () => workspace.activeCompanyId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      await nextTick()
      await loadData()
    }
  },
)

async function openTask(activity: any) {
  if (!activity.monthId) {
    await workspace.fetchWorkspace()
    const fresh = workspace.workspaceData?.activities.find((a) => a.id === activity.id)
    if (!fresh?.monthId) {
      console.error('monthId não encontrado para a atividade', activity.id)
      return
    }
    activity = fresh
  }

  router.push({
    path: `/tasks/${activity.monthId}/${activity.id}`,
    query: activity.companyId ? { company: activity.companyId } : undefined,
  })
}

function formatDate(date: string | null) {
  if (!date) return 'Sem prazo'
  const d = new Date(date)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return `Atrasada ${Math.abs(days)}d`
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  return `${days}d`
}

function isOverdue(activity: any) {
  if (!activity.dueDate || activity.status === 'DONE') return false
  return new Date(activity.dueDate) < new Date()
}

async function updateTaskStatus(taskId: string, newStatus: string) {
  console.log('Update task', taskId, 'to', newStatus)
}

function handleDragStart(task: any) {
  draggedTask.value = task
}

function handleDrop(columnId: string) {
  if (draggedTask.value && draggedTask.value.status !== columnId) {
    updateTaskStatus(draggedTask.value.id, columnId)
  }
  draggedTask.value = null
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase()
}
</script>

<template>
  <div class="board-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-main">
        <span class="eyebrow">
          <LayoutGrid :size="11" />
          Board
        </span>
        <h1 class="page-title">Visão geral</h1>
        <p class="page-sub">
          {{ allActivities.length }} atividades · {{ workspace.workspaceData?.companies?.length || 0 }} empresa(s)
        </p>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-wrap">
        <Search :size="14" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Buscar atividades…"
          class="search-input"
        />
      </div>

      <div class="filter-group">
        <div class="filter-wrap">
          <select v-model="filterCompany" class="filter-select">
            <option :value="null">Todas empresas</option>
            <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <ChevronDown :size="12" class="filter-chev" />
        </div>

        <div class="filter-wrap">
          <select v-model="filterPriority" class="filter-select">
            <option :value="null">Todas prioridades</option>
            <option :value="0">P0 · Crítica</option>
            <option :value="1">P1 · Alta</option>
            <option :value="2">P2 · Média</option>
            <option :value="3">P3 · Baixa</option>
          </select>
          <ChevronDown :size="12" class="filter-chev" />
        </div>

        <button v-if="hasFilters" class="clear-btn" @click="clearFilters">
          <X :size="13" />
          Limpar
        </button>
      </div>
    </div>

    <!-- Kanban -->
    <div class="kanban">
      <section
        v-for="column in columns"
        :key="column.id"
        class="col"
        :class="{ 'col--drop': draggedTask && draggedTask.status !== column.id }"
        @dragover.prevent
        @drop.prevent="handleDrop(column.id)"
      >
        <header class="col-header">
          <div class="col-title-row">
            <span class="col-dot" :style="{ background: column.token }" />
            <span class="col-title">{{ column.title }}</span>
            <span class="col-count">{{ getColumnTasks(column.id).length }}</span>
          </div>
          <div class="col-bar">
            <div
              class="col-bar-fill"
              :style="{
                width: `${Math.round((getColumnTasks(column.id).length / (allActivities.length || 1)) * 100)}%`,
                background: column.token,
              }"
            />
          </div>
        </header>

        <div class="col-body">
          <template v-if="loading">
            <div v-for="i in 3" :key="i" class="card-skel" />
          </template>

          <template v-else-if="!getColumnTasks(column.id).length">
            <div class="empty">
              <span class="empty-dot" :style="{ background: column.token }" />
              <span class="empty-label">Sem atividades</span>
            </div>
          </template>

          <template v-else>
            <article
              v-for="task in getColumnTasks(column.id)"
              :key="task.id"
              class="card"
              :class="{
                'card--overdue': isOverdue(task),
                'card--mine': task.isMine,
                'card--drag': draggedTask?.id === task.id,
              }"
              draggable="true"
              @dragstart="handleDragStart(task)"
              @click="openTask(task)"
            >
              <div class="card-top">
                <span class="company-chip" :title="task.companyName">
                  <span class="company-initials">{{ initials(task.companyName) }}</span>
                  <span class="company-name">{{ task.companyName }}</span>
                </span>
                <span
                  class="priority-chip"
                  :style="{
                    color: prio(task.priority).token,
                    background: `color-mix(in srgb, ${prio(task.priority).token} 14%, transparent)`,
                  }"
                >
                  {{ prio(task.priority).label }}
                </span>
              </div>

              <h3 class="card-title">{{ task.title }}</h3>

              <div class="card-meta">
                <span class="meta" :class="{ 'meta--overdue': isOverdue(task) }">
                  <AlertCircle v-if="isOverdue(task)" :size="11" />
                  <Calendar v-else :size="11" />
                  {{ formatDate(task.dueDate) }}
                </span>
                <span v-if="task.responsibles?.length" class="meta">
                  <User :size="11" />
                  {{
                    task.responsibles.filter((r: any) => r.isMe).length
                      ? 'Eu'
                      : task.responsibles[0]?.name
                  }}
                  <span v-if="task.responsibles.length > 1" class="more">
                    +{{ task.responsibles.length - 1 }}
                  </span>
                </span>
              </div>

              <footer class="card-foot">
                <span class="quarter">{{ task.quarter }} · {{ task.month }}</span>
              </footer>
            </article>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.board-page {
  padding: 24px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text);
}

/* ---- Header ---- */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text);
  margin: 0;
}

.page-sub {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
}

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 320px;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.search-input::placeholder {
  color: var(--text-4);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.filter-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.filter-chev {
  position: absolute;
  right: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.filter-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 7px 28px 7px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.filter-select:hover {
  border-color: var(--border-strong);
}

.filter-select:focus {
  border-color: var(--accent);
}

.clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.clear-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

/* ---- Kanban ---- */
.kanban {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
}

.col {
  display: flex;
  flex-direction: column;
  min-width: 260px;
  min-height: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.col--drop {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}

.col-header {
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.col-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.col-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.col-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.005em;
  flex: 1;
}

.col-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 2px 7px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.col-bar {
  height: 2px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
}

.col-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width var(--motion) var(--motion-ease);
}

.col-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
}

.card-skel {
  height: 92px;
  background: linear-gradient(
    90deg,
    var(--surface-2) 0%,
    color-mix(in srgb, var(--surface-2) 60%, var(--surface-3)) 50%,
    var(--surface-2) 100%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border);
}

.empty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.6;
}

.empty-label {
  font-size: 11.5px;
  color: var(--text-3);
  font-weight: 500;
}

/* ---- Card ---- */
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 11px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: grab;
  position: relative;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.card:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.card:active {
  cursor: grabbing;
}

.card--mine {
  border-left: 2px solid var(--accent);
}

.card--overdue {
  border-left: 2px solid var(--err);
}

.card--drag {
  opacity: 0.45;
  transform: rotate(1.5deg);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.company-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 65%;
  font-size: 11px;
  color: var(--text-2);
  overflow: hidden;
}

.company-initials {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
}

.company-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.priority-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.card-title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--text);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-3);
}

.meta--overdue {
  color: var(--err);
  font-weight: 600;
}

.more {
  font-size: 10px;
  color: var(--text-4);
  font-weight: 500;
}

.card-foot {
  padding-top: 6px;
  border-top: 1px solid var(--border);
}

.quarter {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4);
}

/* ---- Responsive ---- */
@media (max-width: 1200px) {
  .kanban {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .page-header,
  .toolbar {
    flex-wrap: wrap;
  }
  .search-wrap {
    max-width: 100%;
    width: 100%;
  }
  .filter-group {
    margin-left: 0;
    flex-wrap: wrap;
  }
  .kanban {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .col,
  .search-input,
  .filter-select,
  .col-bar-fill {
    transition-duration: 1ms;
  }
  .card-skel {
    animation-duration: 2s;
  }
}
</style>
