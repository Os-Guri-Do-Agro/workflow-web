<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, User, X } from 'lucide-vue-next'
import { useWorkspaceStore, type ActivityItem } from '@/stores/workspaceStores'
import { getUserToken } from '@/utils/authContent'
import { useToast } from '@/composables/useToast'
import activityService from '@/service/activities/activity-service'
import { useActivityBoardRealtime } from '@/composables/useActivityBoardRealtime'
import type { ActivityMovedPayload } from '@/service/realtime/realtime-service'
import AppSelect from '@/components/ui/AppSelect.vue'
import TaskCard, { type TaskCardTask } from '@/components/tasks/TaskCard.vue'
import TaskColumn from '@/components/tasks/TaskColumn.vue'
import TaskDetailPanel from '@/features/tasks/components/TaskDetailPanel.vue'
import { ACTIVITY_STATUSES, PRIORITY_OPTIONS, priorityLevel } from '@/features/tasks/task-meta'
import { taskKey } from '@/features/tasks/task-key'
import { useCollapsedColumns } from '@/features/tasks/composables/useCollapsedColumns'

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

/**
 * Filtro por tag, guardado na URL (`?tags=cms,infra`) por SLUG e não por id: o
 * link fica legível e sobrevive a rename. É o único filtro desta tela que
 * persiste, por ser o recorte que as pessoas compartilham ("me manda só o do
 * CMS"); espalhar todo o estado de UI pela query string deixaria a URL ilegível.
 */
function parseTagsParam(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value.split(',').map((s) => s.trim()).filter(Boolean)
}

const filterTags = ref<string[]>(parseTagsParam(route.query.tags))
const draggedTask = ref<ActivityItem | null>(null)

type ColumnStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

// Colunas, rótulos, ícones e escala de prioridade vêm do task-meta: a mesma
// fonte do board do mês. Antes esta tela tinha a própria escala (P0 = Crítica),
// oposta à do formulário, e a mesma tarefa trocava de cor ao mudar de tela.
const columns = ACTIVITY_STATUSES

const { isCollapsed, canCollapse, toggle: toggleCollapsed } = useCollapsedColumns()

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
    // Por NÍVEL: "Urgente" pega 4 e 5 (task-meta, D3).
    const level = priorityLevel(filterPriority.value)
    activities = activities.filter((a) => priorityLevel(a.priority) === level)
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

  if (filterTags.value.length) {
    // E, não OU: cada tag marcada restringe. Com OU, marcar mais tags mostraria
    // mais cards, que é o oposto de filtrar.
    activities = activities.filter((a) => {
      const slugs = new Set((a.tags ?? []).map((t) => t.slug))
      return filterTags.value.every((slug) => slugs.has(slug))
    })
  }

  return activities
})

watch(filterTags, (next) => {
  const query = { ...route.query }
  if (next.length) query.tags = next.join(',')
  else delete query.tags
  void router.replace({ query })
})

watch(
  () => route.query.tags,
  (value) => {
    const next = parseTagsParam(value)
    if (next.join(',') !== filterTags.value.join(',')) filterTags.value = next
  },
)

function toggleTagFilter(slug: string): void {
  filterTags.value = filterTags.value.includes(slug)
    ? filterTags.value.filter((s) => s !== slug)
    : [...filterTags.value, slug]
}

// Urgente primeiro, depois o prazo mais perto. Aqui não existe ordem manual:
// `position` é por (mês, status) e este board mistura meses e empresas. Antes a
// ordem era crescente pelo número, e o 0 padrão subia ao topo como "crítico".
const columnTasks = computed(() => {
  const byStatus = {} as Record<ColumnStatus, ActivityItem[]>
  for (const column of columns) {
    byStatus[column.value] = allActivities.value
      .filter((a) => a.status === column.value)
      .sort((a, b) => {
        const byPriority = priorityLevel(b.priority) - priorityLevel(a.priority)
        if (byPriority) return byPriority
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        if (a.dueDate || b.dueDate) return a.dueDate ? -1 : 1
        return 0
      })
  }
  return byStatus
})

/** O item achatado do `/dashboard/workspace` no formato do card único. */
function toCard(a: ActivityItem): TaskCardTask {
  return {
    id: a.id,
    title: a.title,
    priorityNumber: a.priority,
    dueDate: a.dueDate,
    responsibles: (a.responsibles ?? []).map((r) => ({ userId: r.id, user: { name: r.name } })),
    tags: (a.tags ?? []).map((tag) => ({ tag })),
    _count: { docs: a.docCount ?? 0, attachments: a.attachmentCount ?? 0 },
  }
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
  ...PRIORITY_OPTIONS,
]

const hasFilters = computed(
  () =>
    !!searchQuery.value ||
    !!filterCompany.value ||
    filterPriority.value !== null ||
    !!filterPerson.value ||
    !!filterMonth.value ||
    filterTags.value.length > 0,
)

const clearFilters = () => {
  searchQuery.value = ''
  filterCompany.value = null
  filterPriority.value = null
  filterPerson.value = null
  filterMonth.value = null
  // Some da URL junto: filtro invisível preso na query string faz alguém
  // compartilhar um link que mostra menos do que ele estava vendo.
  filterTags.value = []
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
  // Aceita 0 a 5 (links antigos) e guarda o NÍVEL: 5 vira "Urgente" (4).
  const p = str(q.prioridade)
  filterPriority.value = p !== null && /^[0-5]$/.test(p) ? priorityLevel(p) : null
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
  } catch {
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
// A store é reativa; setar .status faz columnTasks reordenar sozinho. Match
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

/**
 * Quem pode mexer no card: o papel na empresa DO CARD (o /board mistura
 * empresas), o `myRole` que o servidor manda junto. Resposta antiga sem o campo
 * cai no papel do token, a mesma regra do painel. VIEWER vê, abre e não move.
 */
function canEditTask(task: ActivityItem): boolean {
  const role: string | undefined =
    task.myRole ??
    getUserToken()?.companies?.find((c) => c.companyId === task.companyId)?.role
  return role === 'ADMIN' || role === 'WORKER'
}

async function updateTaskStatus(task: ActivityItem, newStatus: ColumnStatus) {
  if (task.status === newStatus) return
  // Guarda também aqui (e não só no card): o arraste nativo e o "Mover para"
  // chegam por caminhos diferentes, e nenhum deles pode gravar sem permissão.
  if (!canEditTask(task)) return
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

// Arraste HTML5 nativo, só de status: sem ordem manual neste board (ver acima).
const overColumn = ref<ColumnStatus | null>(null)

function handleDragStart(task: ActivityItem) {
  if (!canEditTask(task)) return
  draggedTask.value = task
}

// Soltar fora de qualquer coluna (ou apertar Esc) também encerra o arraste; sem
// isto o card de origem ficava como lugar vazio até o próximo arraste.
function handleDragEnd() {
  draggedTask.value = null
  overColumn.value = null
}

function handleDrop(columnId: ColumnStatus) {
  const task = draggedTask.value
  if (task && task.status !== columnId) {
    updateTaskStatus(task, columnId)
  }
  handleDragEnd()
}

</script>

<template>
  <div class="board-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-main">
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

    <!-- Kanban: as mesmas colunas e o mesmo card do board do mês -->
    <div class="kanban">
      <TaskColumn
        v-for="column in columns"
        :key="column.value"
        :status="column.value"
        :count="columnTasks[column.value].length"
        :collapsible="canCollapse(column.value)"
        :collapsed="isCollapsed(column.value)"
        :over="!!draggedTask && overColumn === column.value && draggedTask.status !== column.value"
        @toggle-collapse="toggleCollapsed(column.value)"
        @dragenter="overColumn = column.value"
        @dragover.prevent
        @drop.prevent="handleDrop(column.value)"
      >
        <div class="col-body">
          <template v-if="loading">
            <div v-for="i in 3" :key="i" class="card-skel" />
          </template>

          <p v-else-if="!columnTasks[column.value].length" class="col-empty">Nenhuma tarefa</p>

          <template v-else>
            <TaskCard
              v-for="task in columnTasks[column.value]"
              :key="task.id"
              :task="toCard(task)"
              :status="column.value"
              :task-key="taskKey(task, task.companyName)"
              :context="task.companyName"
              :renamable="false"
              :deletable="false"
              :readonly="!canEditTask(task)"
              :active-tags="filterTags"
              :dragging="draggedTask?.id === task.id"
              :draggable="canEditTask(task) ? 'true' : 'false'"
              @dragstart="handleDragStart(task)"
              @dragend="handleDragEnd"
              @open="openTask(task)"
              @move="updateTaskStatus(task, $event)"
              @tag="toggleTagFilter"
            />
          </template>
        </div>
      </TaskColumn>
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

/* ---- Kanban: poços de 280px lado a lado (TaskColumn) ---- */
.kanban {
  container: task-board / inline-size;
  display: flex;
  gap: 8px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.col-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: thin;
}

.col-empty {
  margin: 0;
  padding: 18px 0 0;
  text-align: center;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

.card-skel {
  flex: none;
  height: 64px;
  background: linear-gradient(
    90deg,
    var(--surface) 0%,
    var(--surface-2) 50%,
    var(--surface) 100%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-raised);
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

/* ---- Responsive ---- */
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
}

@media (max-width: 640px) {
  .kanban {
    scroll-snap-type: x mandatory;
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-input {
    transition-duration: 1ms;
  }
  .card-skel {
    animation-duration: 2s;
  }
}
</style>
