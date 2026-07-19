<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Search,
  Calendar,
  User,
  LayoutGrid,
  AlertCircle,
  X,
} from 'lucide-vue-next'
import { useWorkspaceStore, type ActivityItem } from '@/stores/workspaceStores'
import { getUserToken } from '@/utils/authContent'
import { dateOnlyDiffDays, isOverdue as isDueDateOverdue } from '@/utils/date'
import { useToast } from '@/composables/useToast'
import activityService from '@/service/activities/activity-service'
import { useActivityBoardRealtime } from '@/composables/useActivityBoardRealtime'
import type { ActivityMovedPayload } from '@/service/realtime/realtime-service'
import AppSelect from '@/components/ui/AppSelect.vue'
import TaskDetailPanel from '@/features/tasks/components/TaskDetailPanel.vue'

const { error: showError, success: showSuccess } = useToast()

const router = useRouter()
const route = useRoute()
const workspace = useWorkspaceStore()

const loading = ref(true)
const searchQuery = ref('')
const filterCompany = ref<string | null>(null)
const filterPriority = ref<number | null>(null)
// Filtros combinaveis: pessoa responsavel e mes de entrega. Os dados ja vem no
// payload de /dashboard/workspace, entao o recorte e todo no cliente.
const filterPerson = ref<string | null>(null)
const filterMonth = ref<string | null>(null)
const draggedTask = ref<ActivityItem | null>(null)

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
const PRIORITY_FALLBACK: PrioritySpec = { label: 'P?', token: 'var(--text-3)' }
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

  if (filterPerson.value) {
    activities = activities.filter((a) =>
      filterPerson.value === UNASSIGNED
        ? !a.responsibles?.length
        : a.responsibles?.some((r) => r.id === filterPerson.value),
    )
  }

  if (filterMonth.value) {
    // Compara por nome canônico do mês. Aceita monthId também, para não quebrar
    // link antigo que tenha sido compartilhado com o id na query string.
    const wanted = filterMonth.value
    activities = activities.filter(
      (a) => monthKey(a.month || '') === wanted || a.monthId === wanted,
    )
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

/** Valor sentinela: "sem responsável" precisa ser selecionável, e null já é "todos". */
const UNASSIGNED = '__unassigned__'

/**
 * Pessoas e meses saem das atividades visíveis, respeitando os OUTROS filtros
 * ativos. Assim as opções nunca levam a um board vazio (se o filtro de empresa
 * está em PetJourney, só aparece quem tem tarefa lá).
 */
const scopeForOptions = computed(() => {
  let activities = workspace.workspaceData?.activities || []
  if (filterCompany.value) {
    activities = activities.filter((a) => a.companyId === filterCompany.value)
  }
  return activities
})

const personItems = computed(() => {
  const byId = new Map<string, { name: string; count: number }>()
  let unassigned = 0
  for (const a of scopeForOptions.value) {
    if (!a.responsibles?.length) {
      unassigned++
      continue
    }
    for (const r of a.responsibles) {
      const cur = byId.get(r.id)
      if (cur) cur.count++
      else byId.set(r.id, { name: r.name, count: 1 })
    }
  }
  const people = [...byId.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name, 'pt-BR'))
    .map(([id, v]) => ({ label: `${v.name} (${v.count})`, value: id as string | null }))
  return [
    { label: 'Todas as pessoas', value: null as string | null },
    ...people,
    ...(unassigned ? [{ label: `Sem responsável (${unassigned})`, value: UNASSIGNED as string | null }] : []),
  ]
})

const MONTH_ORDER = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** Chave canônica do mês: sem acento, sem caixa, sem espaço em volta. */
function monthKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const monthRank = (key: string) => {
  const i = MONTH_ORDER.indexOf(key)
  return i === -1 ? 99 : i
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

/**
 * Agrupamos por NOME do mês, não por monthId: cada empresa tem o próprio
 * conjunto de meses (Month pertence a Quarter, que pertence a Company), então
 * agrupar por id repetia "Março" uma vez por empresa. A ordenação é pelo mês do
 * calendário, não alfabética (que colocava Junho antes de Maio).
 */
const monthItems = computed(() => {
  const byMonth = new Map<string, { label: string; count: number }>()
  for (const a of scopeForOptions.value) {
    if (!a.month) continue
    const key = monthKey(a.month)
    const cur = byMonth.get(key)
    if (cur) cur.count++
    else byMonth.set(key, { label: capitalize(a.month.trim()), count: 1 })
  }
  const months = [...byMonth.entries()]
    .sort(([ka], [kb]) => monthRank(ka) - monthRank(kb) || ka.localeCompare(kb, 'pt-BR'))
    .map(([key, v]) => ({ label: `${v.label} (${v.count})`, value: key as string | null }))
  return [{ label: 'Todos os meses', value: null as string | null }, ...months]
})

const companyItems = computed(() => [
  { label: 'Todas empresas', value: null as string | null },
  ...companies.value.map((c) => ({ label: c.name, value: c.id })),
])

const priorityItems: { label: string; value: number | null }[] = [
  { label: 'Todas prioridades', value: null },
  { label: 'P0 · Crítica', value: 0 },
  { label: 'P1 · Alta', value: 1 },
  { label: 'P2 · Média', value: 2 },
  { label: 'P3 · Baixa', value: 3 },
]

const hasFilters = computed(
  () =>
    !!searchQuery.value ||
    !!filterCompany.value ||
    filterPriority.value !== null ||
    !!filterPerson.value ||
    !!filterMonth.value,
)

const clearFilters = () => {
  searchQuery.value = ''
  filterCompany.value = null
  filterPriority.value = null
  filterPerson.value = null
  filterMonth.value = null
}

/**
 * Atalho para a pergunta mais comum de gestão: "o que é meu?".
 *
 * O id sai do token, não das atividades. Derivar de `responsibles.isMe` fazia
 * o atalho falhar exatamente quando mais importa: se nenhuma atividade visível
 * tivesse você como responsável, o id resolvia para null, o filtro virava
 * "todas as pessoas" e o board mostrava tudo, inclusive tarefa sem dono.
 */
const myUserId = computed(() => getUserToken()?.sub ?? null)

const onlyMine = computed(() => !!myUserId.value && filterPerson.value === myUserId.value)

const toggleMine = () => {
  if (!myUserId.value) return
  filterPerson.value = onlyMine.value ? null : myUserId.value
}

// Trocar de empresa pode invalidar a pessoa/mês escolhidos (a opção some da
// lista e o board fica vazio "sem motivo"). Limpamos o que não existe mais.
// A guarda de lista vazia é essencial: ao entrar por URL com filtros, este
// watcher dispara antes dos dados chegarem e apagaria os filtros recém-lidos.
watch(filterCompany, () => {
  if (!workspace.workspaceData?.activities?.length) return
  const people = personItems.value.map((i) => i.value)
  if (filterPerson.value && !people.includes(filterPerson.value)) filterPerson.value = null
  const months = monthItems.value.map((i) => i.value)
  if (filterMonth.value && !months.includes(filterMonth.value)) filterMonth.value = null
})

// Filtros na URL: sobrevivem ao voltar da tela de detalhe da tarefa e tornam a
// visão compartilhável ("olha o que está atrasado do cliente X").
const FILTER_KEYS = ['q', 'empresa', 'prioridade', 'pessoa', 'mes'] as const

function readFiltersFromUrl() {
  const q = route.query
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  searchQuery.value = str(q.q) ?? ''
  filterCompany.value = str(q.empresa)
  filterPerson.value = str(q.pessoa)
  filterMonth.value = str(q.mes)
  const p = str(q.prioridade)
  filterPriority.value = p !== null && /^[0-3]$/.test(p) ? Number(p) : null
}

watch(
  [searchQuery, filterCompany, filterPriority, filterPerson, filterMonth],
  () => {
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (!FILTER_KEYS.includes(key as (typeof FILTER_KEYS)[number]) && typeof value === 'string') {
        query[key] = value
      }
    }
    if (searchQuery.value) query.q = searchQuery.value
    if (filterCompany.value) query.empresa = filterCompany.value
    if (filterPriority.value !== null) query.prioridade = String(filterPriority.value)
    if (filterPerson.value) query.pessoa = filterPerson.value
    if (filterMonth.value) query.mes = filterMonth.value
    router.replace({ query })
  },
)

async function loadData() {
  const hasStaleData = workspace.workspaceData?.activities.some((a) => !a.monthId)
  if (hasStaleData) workspace.workspaceData = null
  // Skeleton só quando não há nada para mostrar. Com o painel de detalhe aberto
  // por cima, cada autosave devolve um `activity:updated` que cai aqui: trocar o
  // board inteiro por skeleton a cada gravação piscava a tela atrás do painel.
  loading.value = !workspace.workspaceData?.activities?.length
  try {
    await workspace.fetchWorkspace()
  } catch (err) {
    showError('Erro ao carregar atividades')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  readFiltersFromUrl()
  loadData()
})

// ── Realtime: reflete arraste feito em outras abas/usuários na visão agregada ──
// A store é reativa; setar .status faz getColumnTasks reordenar sozinho. Match
// por id cobre todas as empresas do workspace (o usuário recebe eventos de todas).
function applyRemoteMove(p: ActivityMovedPayload) {
  const activity = workspace.workspaceData?.activities.find((a) => a.id === p.activityId)
  if (activity) activity.status = p.status
}

useActivityBoardRealtime(applyRemoteMove, loadData)

watch(
  () => workspace.activeCompanyId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      await nextTick()
      await loadData()
    }
  },
)

// ── Painel de detalhe sobre o board ──────────────────────────────────────────
// A tarefa aberta vive na URL (`?task=&company=`), não em estado local: o link
// continua compartilhável e sobrevive ao F5, sem trocar de página. Como a view
// não desmonta, fechar devolve o board com filtros, scroll e posição intactos.
// A rota de página cheia (`/tasks/:month/:taskId`) segue viva para links antigos.
const PANEL_KEYS = ['task', 'company'] as const

const openTaskId = computed(() =>
  typeof route.query.task === 'string' && route.query.task ? route.query.task : null,
)

const openTaskCompanyId = computed(() =>
  typeof route.query.company === 'string' && route.query.company ? route.query.company : null,
)

const openTaskCompanyName = computed(() => {
  const id = openTaskCompanyId.value
  if (!id) return null
  return companies.value.find((c) => c.id === id)?.name ?? null
})

function openTask(activity: ActivityItem) {
  router.push({ query: { ...route.query, task: activity.id, company: activity.companyId } })
}

function closeTask() {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (!PANEL_KEYS.includes(key as (typeof PANEL_KEYS)[number]) && typeof value === 'string') {
      query[key] = value
    }
  }
  router.replace({ query })
}

function formatDate(date: string | null) {
  if (!date) return 'Sem prazo'
  const days = dateOnlyDiffDays(date)

  if (days < 0) return `Atrasada ${Math.abs(days)}d`
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Amanhã'
  return `${days}d`
}

function isOverdue(activity: any) {
  if (activity.status === 'DONE') return false
  return isDueDateOverdue(activity.dueDate)
}

async function updateTaskStatus(task: ActivityItem, newStatus: ColumnStatus) {
  const previousStatus = task.status
  // Update otimista: o card move na hora.
  task.status = newStatus
  try {
    await activityService.patchActivityStatus(task.id, newStatus, task.companyId)
    showSuccess('Atividade movida')
  } catch {
    // Reverte em caso de erro.
    task.status = previousStatus
    showError('Não foi possível mover a atividade')
  }
}

function handleDragStart(task: ActivityItem) {
  draggedTask.value = task
}

function handleDrop(columnId: ColumnStatus) {
  const task = draggedTask.value
  if (task && task.status !== columnId) {
    updateTaskStatus(task, columnId)
  }
  draggedTask.value = null
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
        <button
          v-if="myUserId"
          class="mine-btn"
          :class="{ 'mine-btn--on': onlyMine }"
          type="button"
          :aria-pressed="onlyMine"
          title="Mostrar apenas as atividades em que eu sou responsável"
          @click="toggleMine"
        >
          <User :size="13" />
          Minhas
        </button>

        <div class="filter-select-wrap">
          <AppSelect
            v-model="filterCompany"
            :items="companyItems"
            placeholder="Todas empresas"
            label="Filtrar por empresa"
            density="compact"
          />
        </div>

        <div class="filter-select-wrap">
          <AppSelect
            v-model="filterPerson"
            :items="personItems"
            placeholder="Todas as pessoas"
            label="Filtrar por pessoa"
            density="compact"
          />
        </div>

        <div class="filter-select-wrap">
          <AppSelect
            v-model="filterMonth"
            :items="monthItems"
            placeholder="Todos os meses"
            label="Filtrar por mês"
            density="compact"
          />
        </div>

        <div class="filter-select-wrap">
          <AppSelect
            v-model="filterPriority"
            :items="priorityItems"
            placeholder="Todas prioridades"
            label="Filtrar por prioridade"
            density="compact"
          />
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
                  <img src="/brand/caneca-circulo.svg" alt="" class="company-logo" draggable="false" />
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

    <TaskDetailPanel
      v-if="openTaskId"
      :key="openTaskId"
      :task-id="openTaskId"
      :company-id="openTaskCompanyId"
      :company-name="openTaskCompanyName"
      @close="closeTask"
    />
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
  flex-wrap: wrap;
  justify-content: flex-end;
}

.filter-select-wrap {
  min-width: 150px;
}

/* Atalho "Minhas": vira toggle sólido quando ligado, para o estado ser óbvio. */
.mine-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 11px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.mine-btn:hover {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border-strong);
}

.mine-btn--on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent);
}

.mine-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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

/* Coluna de destino durante o arraste: além da cor, um anel do acento deixa
   claro onde o card vai cair, mesmo em tela grande com o cursor longe. */
.col--drop {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
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
  /* Elevação: cor de base + gradiente de luz + fio claro na borda de cima.
     No escuro é isso que levanta o card, já que sombra preta sobre fundo
     escuro praticamente não aparece. */
  background-color: var(--surface-2);
  background-image: var(--elev-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow:
    var(--shadow-sm),
    inset 0 1px 0 var(--elev-hi);
  cursor: grab;
  position: relative;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.card:hover {
  border-color: var(--border-strong);
  background-color: var(--surface-3);
  /* Sobe 2px e ganha sombra: o card "descola" da coluna em vez de só mudar de cor. */
  transform: translateY(-2px);
  box-shadow:
    var(--shadow),
    inset 0 1px 0 var(--elev-hi);
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

/* Card sendo arrastado: fica "erguido" e levemente torto, e some a sombra de
   repouso para não competir com a coluna de destino, que acende embaixo.
   A dupla classe é proposital: durante o arraste o cursor está sobre o card,
   então `:hover` continua casando e, com a mesma especificidade, quem vencesse
   dependeria da ordem no arquivo. */
.card.card--drag {
  opacity: 0.5;
  transform: rotate(2deg) scale(1.02);
  box-shadow: var(--shadow-overlay);
  border-color: var(--accent);
  cursor: grabbing;
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

.company-logo {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: contain;
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
  .col-bar-fill {
    transition-duration: 1ms;
  }
  /* Quem pediu menos movimento continua tendo o feedback, só que por cor e
     sombra: o deslocamento vertical é o que incomoda, não o destaque. */
  .card:hover {
    transform: none;
  }
  .card--drag {
    transform: none;
  }
  .card-skel {
    animation-duration: 2s;
  }
}
</style>
