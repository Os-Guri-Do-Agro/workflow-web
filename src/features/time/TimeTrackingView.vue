<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, DollarSign, Pencil, Play, Plus, Square, Trash2, Users, X } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import TaskPicker from '@/components/ui/TaskPicker.vue'
import TimeInsightsRail from '@/features/time/components/TimeInsightsRail.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SaveStatus from '@/components/ui/SaveStatus.vue'
import TeamView from '@/features/time/components/TeamView.vue'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useTimeEntries, useTimeSummary, useTimeTracking } from '@/composables/useTimeTracking'
import { buildPulseBars, useTimePeriod } from '@/features/time/composables/useTimePeriod'
import PeriodPicker from '@/features/time/components/PeriodPicker.vue'
import { useCompanyActivities } from '@/composables/useCompanyActivities'
import { useRunningEntryEditor } from '@/composables/useRunningEntryEditor'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { useTimerSounds } from '@/composables/useTimerSounds'
import { getApiErrorMessage } from '@/service/api'
import type { TimeEntry } from '@/service/time/time-service'
import {
  dayKey,
  formatClock,
  formatDayLabel,
  formatDurationLong,
  formatTimer,
} from '@/utils/duration'

// F3 — timer é considerado "esquecido" após 8h rodando (avisa, não para).
const FORGOTTEN_SEC = 8 * 60 * 60

const { error: showError, success } = useToast()
const workspace = useWorkspaceStore()
const { isRunning, elapsedSec, start, stop, createManual, updateEntry, deleteEntry } =
  useTimeTracking()
const { companyOf } = useCompanyActivities()
const { playStart, playStop } = useTimerSounds()
// Ociosidade: a view é um dos pontos de início do timer, então também é onde o
// pedido de permissão do aviso pode ser ancorado (spec timer-ociosidade).
const alerts = useIdleAlerts()

// ─── Abas: Meu tempo | Equipe ─────────────────────────────────────────────────
// A aba Equipe era exclusiva de ADMIN; virou o ranking da empresa, aberto a
// qualquer membro (o servidor segue exigindo membership na empresa ativa). Sem
// empresa ativa não há equipe para ranquear, então aí ela some.
type Tab = 'me' | 'team'
const activeTab = ref<Tab>('me')
const hasCompany = computed(() => !!workspace.activeCompanyId)

// ─── Opções de empresa / tarefa (compartilhadas por vários formulários) ───────
const companyOptions = computed(() => [
  { label: 'Pessoal', value: null as string | null },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

// T3 — regras de consistência empresa↔tarefa aplicadas a qualquer form de vínculo.
interface LinkForm {
  companyId: string | null
  activityId: string | null
}
// O AppSelect emite SelectValuePrimitive; company/activity são sempre id ou null.
const toId = (v: unknown): string | null => (typeof v === 'string' ? v : null)

function applyCompanyChange(form: LinkForm, raw: unknown) {
  const companyId = toId(raw)
  form.companyId = companyId
  // Só zera a tarefa se ela não pertence à nova empresa (antes zerava sempre).
  if (form.activityId && companyOf(form.activityId) !== companyId) {
    form.activityId = null
  }
}
function applyActivityChange(form: LinkForm, raw: unknown) {
  const activityId = toId(raw)
  form.activityId = activityId
  // Escolher a tarefa preenche a empresa dela se ainda não houver.
  if (activityId && !form.companyId) form.companyId = companyOf(activityId)
}

// ─── Barra do timer (topo) — estado PARADO ────────────────────────────────────
const timerForm = reactive({
  description: '',
  companyId: workspace.activeCompanyId as string | null,
  activityId: null as string | null,
  billable: false, // F5
})

// ─── Barra do timer — estado RODANDO (edição ao vivo, T2) ─────────────────────
const editor = useRunningEntryEditor({ companyOf })

const liveClock = computed(() => formatTimer(elapsedSec.value))

// F3 — aviso de timer esquecido (>8h).
const forgotten = computed(() => isRunning.value && elapsedSec.value > FORGOTTEN_SEC)
const runningHours = computed(() => Math.floor(elapsedSec.value / 3600))

async function handleStart() {
  // Antes do await: o pedido de permissão precisa do gesto vivo (ver useIdleAlerts).
  alerts.askOnStart()
  try {
    await start.mutateAsync({
      description: timerForm.description.trim() || undefined,
      companyId: timerForm.companyId,
      activityId: timerForm.companyId ? timerForm.activityId : null,
      billable: timerForm.billable,
    })
    playStart()
    timerForm.description = ''
    timerForm.activityId = null
    timerForm.billable = false
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível iniciar o timer'))
  }
}

async function handleStop() {
  try {
    editor.flush() // garante que a última edição pendente foi salva antes de parar
    await stop.mutateAsync()
    playStop()
  } catch {
    showError('Não foi possível parar o timer')
  }
}

// F6 — "Continuar": reinicia um timer com a mesma descrição/empresa/tarefa.
async function handleContinue(entry: TimeEntry) {
  alerts.askOnStart()
  try {
    await start.mutateAsync({
      description: entry.description || undefined,
      companyId: entry.companyId,
      activityId: entry.activityId,
      billable: entry.billable,
    })
    playStart()
    success('Timer retomado')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível retomar o timer'))
  }
}

// ─── Filtro por período e empresa ─────────────────────────────────────────────
const period = useTimePeriod()
const filterCompanyId = ref<string | null | 'all'>('all')

// F4 — paginação incremental. "Carregar mais" aumenta o take em blocos de 50.
const PAGE_SIZE = 50
const limit = ref(PAGE_SIZE)

const entriesFilters = computed(() => {
  const base: { from?: string; to?: string; companyId?: string; take: number } = {
    ...period.range.value,
    take: limit.value,
  }
  const value = filterCompanyId.value
  if (value && value !== 'all' && value !== '__personal__') {
    base.companyId = value
  }
  return base
})

const entries = useTimeEntries(entriesFilters)

watch([() => period.kind.value, () => period.anchor.value, filterCompanyId], () => {
  limit.value = PAGE_SIZE
})

/**
 * O backend limita `take` a 200 (`time-tracking.service.ts`), então pedir mais
 * devolve 200 calado. Sem este teto, no 5º "carregar mais" a lista parava de
 * crescer e `hasMore` virava false — a nota de amostra sumia e as 200 entradas
 * passavam por período completo.
 */
const MAX_TAKE = 200

const loadedIsCapped = computed(() => (entries.data.value?.length ?? 0) >= MAX_TAKE)

const hasMore = computed(
  () => limit.value < MAX_TAKE && (entries.data.value?.length ?? 0) >= limit.value,
)

function loadMore() {
  limit.value = Math.min(limit.value + PAGE_SIZE, MAX_TAKE)
}

const filterCompanyOptions = computed(() => [
  { label: 'Todas', value: 'all' as const },
  { label: 'Pessoal', value: '__personal__' },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

const visibleEntries = computed<TimeEntry[]>(() => {
  const list = entries.data.value ?? []
  // Só entradas já fechadas aparecem na lista (o timer rodando fica na barra).
  const closed = list.filter((e) => e.endedAt)
  if (filterCompanyId.value === '__personal__') {
    return closed.filter((e) => !e.companyId)
  }
  return closed
})

// ─── Agrupamento por dia ──────────────────────────────────────────────────────
interface DayGroup {
  key: string
  label: string
  totalSec: number
  entries: TimeEntry[]
}

const groups = computed<DayGroup[]>(() => {
  const map = new Map<string, DayGroup>()
  for (const e of visibleEntries.value) {
    const key = dayKey(e.startedAt)
    let g = map.get(key)
    if (!g) {
      g = { key, label: formatDayLabel(key), totalSec: 0, entries: [] }
      map.set(key, g)
    }
    g.entries.push(e)
    g.totalSec += e.durationSec ?? 0
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
})

// ─── Totais do período: servidor, não amostra ─────────────────────────────────
/**
 * Somar as entradas da tela dava o número certo por acidente enquanto o período
 * máximo era 30 dias e cabia nas 50 entradas da primeira página. Com mês e
 * "Tudo", a lista trunca e o total mentiria para baixo até o usuário clicar
 * "carregar mais" o bastante. `/time/summary` agrega no servidor, sem paginação.
 *
 * O endpoint não aceita `companyId` (só from/to/tzOffset), então com filtro de
 * empresa a tela volta a derivar da amostra — e diz isso, em vez de exibir
 * número calado e errado.
 */
const summary = useTimeSummary(period.range, period.staleTime)

const isCompanyFiltered = computed(() => filterCompanyId.value !== 'all')

const statsExact = computed(() => !!summary.data.value && !isCompanyFiltered.value)

const sampleByDay = computed(() => new Map(groups.value.map((g) => [g.key, g.totalSec])))

const byDaySec = computed<Map<string, number>>(() => {
  const s = summary.data.value
  if (statsExact.value && s) return new Map(s.byDay.map((d) => [d.day, d.totalSec]))
  return sampleByDay.value
})

const rangeTotalSec = computed(() => {
  const s = summary.data.value
  if (statsExact.value && s) return s.totalSec
  return visibleEntries.value.reduce((acc, e) => acc + (e.durationSec ?? 0), 0)
})

const rangeBillableSec = computed(() => {
  const s = summary.data.value
  if (statsExact.value && s) return s.billableSec
  return visibleEntries.value.reduce((acc, e) => acc + (e.billable ? (e.durationSec ?? 0) : 0), 0)
})

/**
 * "Hoje" continua sendo o número do dia corrente, independente do período
 * escolhido — é o que a pessoa olha para saber se já bateu o dia. Em período que
 * não contém hoje (mês passado, por exemplo), some em vez de mostrar zero.
 */
const todayKeyNow = computed(() => dayKey(new Date().toISOString()))

const periodHasToday = computed(() => {
  // No modo "Hoje" o próprio total do período já é o de hoje: dois blocos com o
  // mesmo rótulo e o mesmo número não informam nada.
  if (period.kind.value === 'today') return false
  if (period.kind.value === 'all') return true
  return period.isCurrentMonth.value
})

const todayTotalSec = computed(() => byDaySec.value.get(todayKeyNow.value) ?? 0)

/**
 * Base dos números derivados da amostra. Sem isso, "top tarefas" de um ano
 * inteiro pareceria completo olhando só as últimas 50 entradas.
 */
const loadedCount = computed(() => visibleEntries.value.length)
/** Truncado tanto por página quanto pelo teto de 200 do servidor. */
const isSampled = computed(() => hasMore.value || loadedIsCapped.value)
const sampleNote = computed(() =>
  isSampled.value ? `nas ${loadedCount.value} entradas carregadas` : '',
)

// ─── Rail de insights ─────────────────────────────────────────────────────────
const activeDaysCount = computed(
  () => [...byDaySec.value.values()].filter((sec) => sec > 0).length,
)

const avgPerDaySec = computed(() =>
  activeDaysCount.value ? Math.round(rangeTotalSec.value / activeDaysCount.value) : 0,
)

const billablePct = computed(() =>
  rangeTotalSec.value ? Math.round((rangeBillableSec.value / rangeTotalSec.value) * 100) : 0,
)

/**
 * Ritmo do período. Fora do modo "Hoje" o range do ritmo é o próprio período,
 * então esta query tem a MESMA chave do resumo e o Vue Query a serve do cache.
 */
const pulseSummary = useTimeSummary(period.pulseRange, period.staleTime)

const pulseByDay = computed<Map<string, number>>(() => {
  if (period.kind.value !== 'today') return byDaySec.value
  // Com filtro de empresa o summary não serve (ele ignora `companyId`): o
  // gráfico mostraria todas as empresas enquanto o resto da tela está filtrado.
  const s = pulseSummary.data.value
  if (s && !isCompanyFiltered.value) return new Map(s.byDay.map((d) => [d.day, d.totalSec]))
  return sampleByDay.value
})

const pulse = computed(() =>
  buildPulseBars(period.kind.value, period.anchor.value, pulseByDay.value),
)

const pulseMax = computed(() => Math.max(1, ...pulse.value.map((d) => d.sec)))

/** Acima de 12 barras o gráfico precisa de gap e fonte menores para não borrar. */
const pulseDense = computed(() => pulse.value.length > 12)

const pulseTitle = computed(() => `Ritmo (${period.shortLabel.value})`)

/**
 * Agrupa as entradas visíveis por um rótulo e devolve o top N com percentual.
 * O denominador é o total DA AMOSTRA, não o do período: misturar um total exato
 * do servidor com fatias contadas na página faria os percentuais somarem menos
 * de 100 sem explicação nenhuma na tela.
 */
function topBy(label: (e: TimeEntry) => string, limitTo = 5) {
  const map = new Map<string, number>()
  let total = 0
  for (const e of visibleEntries.value) {
    const sec = e.durationSec ?? 0
    total += sec
    const name = label(e)
    map.set(name, (map.get(name) ?? 0) + sec)
  }
  const base = total || 1
  return [...map.entries()]
    .map(([name, sec]) => ({ name, sec, pct: Math.round((sec / base) * 100) }))
    .sort((a, b) => b.sec - a.sec)
    .slice(0, limitTo)
}

/**
 * Distribuição por empresa: o summary já entrega isso agregado do período
 * inteiro (`byCompany`), então aqui não há motivo para contar na amostra.
 */
const byProject = computed(() => {
  const s = summary.data.value
  if (statsExact.value && s) {
    const total = s.totalSec || 1
    return s.byCompany
      .map((c) => ({ name: c.name, sec: c.totalSec, pct: Math.round((c.totalSec / total) * 100) }))
      .filter((c) => c.sec > 0)
      .sort((a, b) => b.sec - a.sec)
      .slice(0, 5)
  }
  return topBy((e) => e.company?.name ?? 'Pessoal')
})

/**
 * Onde o tempo foi por TAREFA (top 5). Único card que não tem equivalente
 * agregado na API (`/time/summary` não quebra por atividade), por isso continua
 * na amostra e declara a base quando a lista está truncada.
 */
const byTask = computed(() => topBy((e) => e.activity?.title ?? 'Sem tarefa'))

/** Dia mais produtivo do período (rótulo + total), sobre o agregado do período. */
const bestDay = computed(() => {
  let best: { key: string; sec: number } | null = null
  for (const [key, sec] of byDaySec.value) {
    if (sec > 0 && (!best || sec > best.sec)) best = { key, sec }
  }
  return best ? { label: formatDayLabel(best.key), sec: best.sec } : null
})

/**
 * Sequência de dias seguidos com tempo registrado, contada de trás para frente.
 * Começa em ontem quando hoje ainda não tem registro, senão o dia em curso
 * zeraria a sequência de quem só vai começar à tarde.
 */
const streakDays = computed(() => {
  const days = new Set([...byDaySec.value].filter(([, sec]) => sec > 0).map(([key]) => key))
  const cursor = new Date()
  if (!days.has(dayKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (days.has(dayKey(cursor.toISOString()))) {
    count += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
})

/** Maior sessão única do período (uma entrada só). */
const longestSessionSec = computed(() =>
  visibleEntries.value.reduce((max, e) => Math.max(max, e.durationSec ?? 0), 0),
)

// ─── Edição inline (entradas fechadas) ────────────────────────────────────────
const editingId = ref<string | null>(null)
const editForm = reactive({
  description: '',
  companyId: null as string | null,
  activityId: null as string | null,
  startedAt: '',
  endedAt: '',
  billable: false, // F5
})

const editPreview = computed(() => durationPreview(editForm.startedAt, editForm.endedAt))

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString()
}

function durationPreview(startLocal: string, endLocal: string): string | null {
  const s = new Date(startLocal).getTime()
  const e = new Date(endLocal).getTime()
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null
  return formatDurationLong(Math.round((e - s) / 1000))
}

function beginEdit(entry: TimeEntry) {
  editingId.value = entry.id
  editForm.description = entry.description
  editForm.companyId = entry.companyId
  editForm.activityId = entry.activityId
  editForm.startedAt = toLocalInput(entry.startedAt)
  editForm.endedAt = entry.endedAt ? toLocalInput(entry.endedAt) : ''
  editForm.billable = entry.billable
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(id: string) {
  try {
    await updateEntry.mutateAsync({
      id,
      data: {
        description: editForm.description.trim(),
        companyId: editForm.companyId ?? '',
        activityId: editForm.companyId ? (editForm.activityId ?? '') : '',
        startedAt: fromLocalInput(editForm.startedAt),
        endedAt: fromLocalInput(editForm.endedAt),
        billable: editForm.billable,
      },
    })
    editingId.value = null
    success('Entrada atualizada')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível salvar (verifique horários e sobreposição)'))
  }
}

// ─── Exclusão com confirmação (F2) ────────────────────────────────────────────
const deleteTarget = ref<string | null>(null)
const showDeleteConfirm = computed({
  get: () => deleteTarget.value !== null,
  set: (v: boolean) => {
    if (!v) deleteTarget.value = null
  },
})

function handleDelete(id: string) {
  deleteTarget.value = id
}

async function confirmDelete() {
  const id = deleteTarget.value
  if (!id) return
  try {
    await deleteEntry.mutateAsync(id)
    deleteTarget.value = null
    success('Entrada excluída')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível excluir a entrada'))
  }
}

// ─── Entrada manual ───────────────────────────────────────────────────────────
const showManual = ref(false)
const manualForm = reactive({
  description: '',
  companyId: workspace.activeCompanyId as string | null,
  activityId: null as string | null,
  startedAt: '',
  endedAt: '',
  billable: false, // F5
})

const manualPreview = computed(() => durationPreview(manualForm.startedAt, manualForm.endedAt))

function openManual() {
  const now = new Date()
  const start = new Date(now.getTime() - 60 * 60 * 1000) // 1h atrás
  manualForm.description = ''
  manualForm.companyId = workspace.activeCompanyId
  manualForm.activityId = null
  manualForm.startedAt = toLocalInput(start.toISOString())
  manualForm.endedAt = toLocalInput(now.toISOString())
  manualForm.billable = false
  showManual.value = true
}

async function submitManual() {
  try {
    await createManual.mutateAsync({
      description: manualForm.description.trim() || undefined,
      companyId: manualForm.companyId,
      activityId: manualForm.companyId ? manualForm.activityId : null,
      startedAt: fromLocalInput(manualForm.startedAt),
      endedAt: fromLocalInput(manualForm.endedAt),
      billable: manualForm.billable,
    })
    showManual.value = false
    success('Entrada adicionada')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível adicionar (fim > início, até 24h, sem sobrepor)'))
  }
}

</script>

<template>
  <div class="time-view">
    <header class="tv-head">
      <!-- O cabeçalho acompanha a aba: a Equipe é um placar, não "o meu tempo". -->
      <div>
        <p class="tv-eyebrow">{{ activeTab === 'team' ? 'Equipe' : 'Pessoal' }}</p>
        <h1 class="tv-title">{{ activeTab === 'team' ? 'Ranking da equipe' : 'Meu tempo' }}</h1>
      </div>

      <nav v-if="hasCompany" class="tv-tabs" aria-label="Seções do tempo">
        <button
          class="tv-tab"
          :class="{ 'tv-tab--on': activeTab === 'me' }"
          type="button"
          @click="activeTab = 'me'"
        >
          Meu tempo
        </button>
        <button
          class="tv-tab"
          :class="{ 'tv-tab--on': activeTab === 'team' }"
          type="button"
          @click="activeTab = 'team'"
        >
          <Users :size="14" />
          Equipe
        </button>
      </nav>
    </header>

    <!-- ═══════════════ ABA: MEU TEMPO ═══════════════ -->
    <template v-if="activeTab === 'me'">
      <!-- ─── Barra do timer ─────────────────────────────────────────────── -->
      <section class="tv-timer" :class="{ 'tv-timer--running': isRunning }">
        <!-- Estado PARADO: formulário de início -->
        <template v-if="!isRunning">
          <input
            v-model="timerForm.description"
            class="tv-timer-input"
            type="text"
            placeholder="No que você está trabalhando?"
            maxlength="500"
            @keyup.enter="handleStart"
          />
          <div class="tv-timer-selects">
            <AppSelect
              :model-value="timerForm.companyId"
              :items="companyOptions"
              placeholder="Pessoal"
              label="Empresa"
              density="compact"
              @update:model-value="applyCompanyChange(timerForm, $event)"
            />
            <TaskPicker
              v-if="timerForm.companyId"
              :model-value="timerForm.activityId"
              :company-id="timerForm.companyId"
              placeholder="Sem tarefa"
              label="Tarefa"
              density="compact"
              @update:model-value="applyActivityChange(timerForm, $event)"
            />
            <span v-else class="tv-task-hint">Escolha uma empresa para atribuir tarefa</span>
          </div>
          <label class="tv-toggle" title="Marcar como faturável">
            <input v-model="timerForm.billable" type="checkbox" class="tv-toggle-input" />
            <span class="tv-toggle-box"><DollarSign :size="14" /></span>
            <span class="tv-toggle-text">Faturável</span>
          </label>
          <div class="tv-timer-clock">{{ liveClock }}</div>
          <button
            class="tv-btn tv-btn--start"
            type="button"
            :disabled="start.isPending.value"
            @click="handleStart"
          >
            <Play :size="16" />
            <span>Iniciar</span>
          </button>
        </template>

        <!-- Estado RODANDO: edição ao vivo (T2) -->
        <template v-else>
          <input
            v-model="editor.form.description"
            class="tv-timer-input"
            type="text"
            placeholder="No que você está trabalhando?"
            maxlength="500"
            @input="editor.touch()"
          />
          <div class="tv-timer-selects">
            <AppSelect
              :model-value="editor.form.companyId"
              :items="companyOptions"
              placeholder="Pessoal"
              label="Empresa"
              density="compact"
              @update:model-value="editor.setCompany($event)"
            />
            <TaskPicker
              v-if="editor.form.companyId"
              :model-value="editor.form.activityId"
              :company-id="editor.form.companyId"
              placeholder="Sem tarefa"
              label="Tarefa"
              density="compact"
              @update:model-value="editor.setActivity($event)"
            />
            <span v-else class="tv-task-hint">Escolha uma empresa para atribuir tarefa</span>
          </div>
          <label class="tv-toggle" title="Marcar como faturável">
            <input
              v-model="editor.form.billable"
              type="checkbox"
              class="tv-toggle-input"
              @change="editor.touch()"
            />
            <span class="tv-toggle-box"><DollarSign :size="14" /></span>
            <span class="tv-toggle-text">Faturável</span>
          </label>
          <div class="tv-timer-clock tv-timer-clock--live">{{ liveClock }}</div>
          <button
            class="tv-btn tv-btn--stop"
            type="button"
            :disabled="stop.isPending.value"
            @click="handleStop"
          >
            <Square :size="16" />
            <span>Parar</span>
          </button>
        </template>
      </section>

      <!-- Indicador de autosave da edição ao vivo -->
      <div v-if="isRunning && editor.state.value !== 'idle'" class="tv-autosave">
        <SaveStatus
          :state="editor.state.value"
          :saved-at="editor.savedAt.value"
          @retry="editor.flush()"
        />
      </div>

      <!-- F3 — aviso de timer esquecido (>8h). -->
      <div v-if="forgotten" class="tv-forgotten" role="alert">
        <AlertTriangle :size="16" />
        <span>Timer rodando há {{ runningHours }}h. Ainda está trabalhando?</span>
        <button class="tv-forgotten-btn" type="button" :disabled="stop.isPending.value" @click="handleStop">
          Parar
        </button>
      </div>

      <!-- Abaixo do timer: lista (principal) + rail de insights (lateral). -->
      <div class="tv-below" :class="{ 'tv-below--solo': !visibleEntries.length }">
        <div class="tv-below-main">
      <!-- ─── Filtros + totais ───────────────────────────────────────────── -->
      <section class="tv-controls">
        <PeriodPicker
          :kind="period.kind.value"
          :month-label="period.anchorLabel.value"
          :can-go-prev="period.canGoPrev.value"
          :can-go-next="period.canGoNext.value"
          @update:kind="period.setKind"
          @prev="period.prev"
          @next="period.next"
        />

        <div class="tv-company-filter">
          <AppSelect
            v-model="filterCompanyId"
            :items="filterCompanyOptions"
            label="Filtrar por empresa"
            density="compact"
          />
        </div>

        <div class="tv-totals">
          <!-- "Hoje" some em período que não contém hoje: zero ali seria lido
               como "não trabalhei", e não como "fora do recorte". -->
          <div v-if="periodHasToday" class="tv-total">
            <span class="tv-total-label">Hoje</span>
            <span class="tv-total-value">{{ formatDurationLong(todayTotalSec) }}</span>
          </div>
          <div class="tv-total">
            <span class="tv-total-label">{{ period.label.value }}</span>
            <span class="tv-total-value">{{ formatDurationLong(rangeTotalSec) }}</span>
          </div>
          <div v-if="rangeBillableSec > 0" class="tv-total">
            <span class="tv-total-label tv-total-label--bill">Faturável</span>
            <span class="tv-total-value tv-total-value--bill">{{ formatDurationLong(rangeBillableSec) }}</span>
          </div>
        </div>

        <button class="tv-btn tv-btn--ghost" type="button" @click="openManual">
          <Plus :size="16" />
          <span>Entrada manual</span>
        </button>
      </section>

      <!-- ─── Formulário de entrada manual ───────────────────────────────── -->
      <section v-if="showManual" class="tv-manual">
        <header class="tv-manual-head">
          <h2 class="tv-manual-title">Nova entrada manual</h2>
          <button class="tv-icon-btn" type="button" title="Fechar" @click="showManual = false">
            <X :size="16" />
          </button>
        </header>
        <div class="tv-manual-grid">
          <label class="tv-field tv-field--wide">
            <span class="tv-label">Descrição</span>
            <input v-model="manualForm.description" class="tv-input" type="text" maxlength="500" />
          </label>
          <div class="tv-field">
            <span class="tv-label">Empresa</span>
            <AppSelect
              :model-value="manualForm.companyId"
              :items="companyOptions"
              placeholder="Pessoal"
              label="Empresa"
              density="compact"
              @update:model-value="applyCompanyChange(manualForm, $event)"
            />
          </div>
          <div v-if="manualForm.companyId" class="tv-field">
            <span class="tv-label">Tarefa</span>
            <TaskPicker
              :model-value="manualForm.activityId"
              :company-id="manualForm.companyId"
              placeholder="Sem tarefa"
              label="Tarefa"
              density="compact"
              @update:model-value="applyActivityChange(manualForm, $event)"
            />
          </div>
          <label class="tv-field">
            <span class="tv-label">Início</span>
            <input v-model="manualForm.startedAt" class="tv-input" type="datetime-local" />
          </label>
          <label class="tv-field">
            <span class="tv-label">Fim</span>
            <input v-model="manualForm.endedAt" class="tv-input" type="datetime-local" />
          </label>
          <label class="tv-field tv-field--wide tv-toggle-field">
            <input v-model="manualForm.billable" type="checkbox" class="tv-toggle-input" />
            <span class="tv-toggle-box"><DollarSign :size="14" /></span>
            <span class="tv-toggle-text">Faturável</span>
          </label>
        </div>
        <div class="tv-manual-actions">
          <span v-if="manualPreview" class="tv-preview">
            Duração: <strong>{{ manualPreview }}</strong>
          </span>
          <button class="tv-btn tv-btn--ghost" type="button" @click="showManual = false">
            Cancelar
          </button>
          <button
            class="tv-btn tv-btn--start"
            type="button"
            :disabled="createManual.isPending.value"
            @click="submitManual"
          >
            <Plus :size="16" />
            <span>Adicionar</span>
          </button>
        </div>
      </section>

      <!-- ─── Lista agrupada por dia ─────────────────────────────────────── -->
      <div v-if="entries.isLoading.value" class="tv-skeletons">
        <Skeleton v-for="i in 4" :key="i" type="row" height="18px" />
      </div>

      <EmptyState
        v-else-if="entries.isError.value"
        :icon="AlertTriangle"
        title="Não foi possível carregar"
        description="Ocorreu um erro ao buscar suas entradas de tempo."
      >
        <template #action>
          <button class="tv-btn tv-btn--ghost" type="button" @click="() => entries.refetch()">
            Tentar de novo
          </button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="groups.length === 0"
        title="Nenhum tempo registrado"
        description="Inicie o timer acima ou adicione uma entrada manual para começar."
      />

      <div v-else class="tv-groups">
        <section v-for="group in groups" :key="group.key" class="tv-group">
          <header class="tv-group-head">
            <span class="tv-group-day">{{ group.label }}</span>
            <span class="tv-group-total">{{ formatDurationLong(group.totalSec) }}</span>
          </header>

          <ul class="tv-list">
            <li v-for="entry in group.entries" :key="entry.id" class="tv-row">
              <template v-if="editingId !== entry.id">
                <div class="tv-row-main">
                  <span class="tv-row-desc">{{ entry.description || 'Sem descrição' }}</span>
                  <div class="tv-row-chips">
                    <span v-if="entry.company" class="tv-tag">{{ entry.company.name }}</span>
                    <span v-else class="tv-tag tv-tag--muted">Pessoal</span>
                    <span v-if="entry.activity" class="tv-tag tv-tag--task">
                      {{ entry.activity.title }}
                    </span>
                    <span v-if="entry.billable" class="tv-tag tv-tag--bill">
                      <DollarSign :size="11" /> Faturável
                    </span>
                    <span
                      v-if="entry.autoStopped"
                      class="tv-tag tv-tag--auto"
                      title="Encerrado automaticamente (timer esquecido)"
                    >
                      auto
                    </span>
                  </div>
                </div>
                <span class="tv-row-interval">
                  {{ formatClock(entry.startedAt) }}–{{ entry.endedAt ? formatClock(entry.endedAt) : '…' }}
                </span>
                <span class="tv-row-dur">{{ formatDurationLong(entry.durationSec ?? 0) }}</span>
                <div class="tv-row-actions">
                  <button
                    class="tv-icon-btn"
                    type="button"
                    title="Continuar (iniciar novo timer igual)"
                    :disabled="start.isPending.value"
                    @click="handleContinue(entry)"
                  >
                    <Play :size="15" />
                  </button>
                  <button class="tv-icon-btn" type="button" title="Editar" @click="beginEdit(entry)">
                    <Pencil :size="15" />
                  </button>
                  <button
                    class="tv-icon-btn tv-icon-btn--danger"
                    type="button"
                    title="Excluir"
                    @click="handleDelete(entry.id)"
                  >
                    <Trash2 :size="15" />
                  </button>
                </div>
              </template>

              <!-- Linha em edição -->
              <div v-else class="tv-edit">
                <input
                  v-model="editForm.description"
                  class="tv-input"
                  type="text"
                  placeholder="Descrição"
                  maxlength="500"
                />
                <div class="tv-edit-grid">
                  <AppSelect
                    :model-value="editForm.companyId"
                    :items="companyOptions"
                    placeholder="Pessoal"
                    label="Empresa"
                    density="compact"
                    @update:model-value="applyCompanyChange(editForm, $event)"
                  />
                  <!-- Busca também aqui: trocar a tarefa de uma entrada já
                       fechada tinha o mesmo problema de rolar dezenas de itens. -->
                  <TaskPicker
                    v-if="editForm.companyId"
                    :model-value="editForm.activityId"
                    :company-id="editForm.companyId"
                    placeholder="Sem tarefa"
                    label="Tarefa"
                    density="compact"
                    @update:model-value="applyActivityChange(editForm, $event)"
                  />
                  <input v-model="editForm.startedAt" class="tv-input" type="datetime-local" />
                  <input v-model="editForm.endedAt" class="tv-input" type="datetime-local" />
                </div>
                <label class="tv-toggle-field">
                  <input v-model="editForm.billable" type="checkbox" class="tv-toggle-input" />
                  <span class="tv-toggle-box"><DollarSign :size="14" /></span>
                  <span class="tv-toggle-text">Faturável</span>
                </label>
                <div class="tv-edit-actions">
                  <span v-if="editPreview" class="tv-preview">
                    Duração: <strong>{{ editPreview }}</strong>
                  </span>
                  <button class="tv-btn tv-btn--ghost" type="button" @click="cancelEdit">
                    Cancelar
                  </button>
                  <button
                    class="tv-btn tv-btn--start"
                    type="button"
                    :disabled="updateEntry.isPending.value"
                    @click="saveEdit(entry.id)"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </section>

        <div v-if="hasMore" class="tv-loadmore">
          <button
            class="tv-btn tv-btn--ghost"
            type="button"
            :disabled="entries.isFetching.value"
            @click="loadMore"
          >
            {{ entries.isFetching.value ? 'Carregando…' : 'Carregar mais' }}
          </button>
        </div>
      </div>
        </div>

        <!-- ─── Rail de insights ─────────────────────────────────────────── -->
        <TimeInsightsRail
          v-if="visibleEntries.length"
          class="tv-rail"
          :range-total-sec="rangeTotalSec"
          :range-billable-sec="rangeBillableSec"
          :avg-per-day-sec="avgPerDaySec"
          :billable-pct="billablePct"
          :pulse="pulse"
          :pulse-max="pulseMax"
          :pulse-title="pulseTitle"
          :pulse-dense="pulseDense"
          :by-project="byProject"
          :by-task="byTask"
          :best-day="bestDay"
          :streak-days="streakDays"
          :longest-session-sec="longestSessionSec"
          :sample-note="sampleNote"
        />
      </div>
    </template>

    <!-- ═══════════════ ABA: EQUIPE (ranking da empresa) ═══════════════ -->
    <TeamView v-else-if="activeTab === 'team' && hasCompany" />

    <!-- F2 — confirmação de exclusão -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Excluir entrada"
      message="Excluir esta entrada de tempo? Ação irreversível."
      confirm-label="Excluir"
      danger
      :loading="deleteEntry.isPending.value"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.time-view {
  /* Ancorado à esquerda (não centralizado) e largo: timer full-width no topo e,
     abaixo, lista + rail de insights ocupam a largura em vez de deixar o vazio. */
  max-width: 1480px;
  margin: 0;
  padding: 24px 28px 64px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ─── Layout abaixo do timer: lista (principal) + rail lateral ─────────────── */
.tv-below {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px 28px;
  align-items: start;
}

.tv-below--solo {
  grid-template-columns: minmax(0, 1fr);
}

.tv-below-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.tv-rail {
  position: sticky;
  top: 8px;
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 1100px) {
  .tv-below {
    grid-template-columns: minmax(0, 1fr);
  }
  .tv-rail {
    position: static;
  }
}


.tv-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.tv-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tv-title {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 760;
}

/* ── Abas Meu tempo | Equipe ── */
.tv-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.tv-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tv-tab:hover {
  color: var(--text);
}

.tv-tab--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

/* ── Barra do timer ── */
.tv-timer {
  display: flex;
  align-items: center;
  /* Quebra em QUALQUER largura, não só no mobile: com empresa + tarefa +
     faturável + cronômetro + botão, a faixa entre ~760px e ~1000px espremia
     tudo e os elementos colidiam. Quebrando, cada peça mantém o tamanho
     legível e desce de linha quando não cabe. */
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--motion) var(--motion-ease);
}

.tv-timer--running {
  border-color: color-mix(in srgb, var(--err) 55%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--err) 22%, transparent), var(--shadow-sm);
}

.tv-timer-input {
  flex: 1 1 260px;
  min-width: 0;
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13.5px;
  outline: none;
}

.tv-timer-input::placeholder {
  color: var(--text-3);
}

.tv-timer-input:focus-visible {
  border-color: var(--accent);
}

/* Empresa + Tarefa lado a lado. Largura fixa de 260px era menor que o conteúdo
   (os dois seletores pedem ~375px juntos): eles estouravam a caixa em ~115px em
   qualquer tela, empurrando o cronômetro e o botão. Agora a dupla encolhe e
   cresce dentro de limites, e cada seletor divide o espaço por igual. */
.tv-timer-selects {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 360px;
  min-width: 220px;
  max-width: 420px;
}

.tv-timer-selects > * {
  flex: 1 1 0;
  min-width: 0;
}

.tv-timer-selects > .tv-task-hint {
  flex: 1 1 auto;
}

.tv-task-hint {
  color: var(--text-4);
  font-size: 11px;
  line-height: 1.3;
  align-self: center;
}

.tv-timer-clock {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  /* Em ch, não em px: quem cronometra 3 dígitos de hora (`120:04:31`) fazia o
     número crescer para dentro do vizinho. Aqui a caixa já nasce do tamanho do
     pior caso e o layout não se mexe conforme o tempo passa. */
  min-width: 9ch;
  text-align: right;
  white-space: nowrap;
}

/* Cronômetro vivo: ponto vermelho pulsando, casando com o favicon/título. */
.tv-timer-clock--live {
  color: var(--err);
}

/* O ponto é PARTE DO FLUXO. Antes era absoluto em `left: -14px`, isto é,
   desenhado fora da própria caixa: ele pousava em cima do rótulo "Faturável"
   do lado, e a distância variava conforme o número encolhia ou crescia. */
.tv-timer-clock--live::before {
  content: '';
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--err);
  animation: tv-rec-pulse 1.6s ease-in-out infinite;
}

@keyframes tv-rec-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.tv-autosave {
  display: flex;
  justify-content: flex-end;
  margin-top: -8px;
  padding: 0 4px;
}

/* ── Botões ── */
.tv-btn {
  height: 44px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.tv-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tv-btn--start {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.tv-btn--start:hover:not(:disabled) {
  filter: brightness(1.05);
}

.tv-btn--stop {
  background: color-mix(in srgb, var(--err) 12%, var(--surface-2));
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 40%, var(--border));
}

.tv-btn--stop:hover:not(:disabled) {
  background: color-mix(in srgb, var(--err) 18%, var(--surface-2));
  border-color: var(--err);
}

.tv-btn--ghost {
  background: var(--surface-2);
  color: var(--text-2);
}

.tv-btn--ghost:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

/* ── Controles ── */
.tv-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.tv-company-filter {
  width: 190px;
}

.tv-totals {
  display: inline-flex;
  gap: 18px;
  margin-left: auto;
}

.tv-total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.tv-total-label {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tv-total-value {
  color: var(--text);
  font-size: 15px;
  font-weight: 720;
  font-variant-numeric: tabular-nums;
}

/* ── Entrada manual ── */
.tv-manual {
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tv-manual-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tv-manual-title {
  margin: 0;
  font-size: 14px;
  font-weight: 720;
  color: var(--text);
}

.tv-manual-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.tv-manual-actions,
.tv-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.tv-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tv-field--wide {
  grid-column: 1 / -1;
}

.tv-label {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
}

.tv-input {
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}

.tv-input:focus-visible {
  border-color: var(--accent);
}

/* ── Lista ── */
.tv-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tv-group {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.tv-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.tv-group-day {
  color: var(--text);
  font-size: 12.5px;
  font-weight: 700;
  text-transform: capitalize;
}

.tv-group-total {
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tv-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tv-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.tv-row:last-child {
  border-bottom: 0;
}

.tv-row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tv-row-desc {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 550;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tv-row-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tv-tag {
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 650;
}

.tv-tag--muted {
  background: var(--surface-2);
  color: var(--text-3);
}

.tv-tag--task {
  background: var(--surface-3);
  color: var(--text-2);
}

.tv-row-interval {
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}

.tv-row-dur {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 62px;
  text-align: right;
  flex: 0 0 auto;
}

.tv-row-actions {
  display: inline-flex;
  gap: 4px;
  flex: 0 0 auto;
}

.tv-icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tv-icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.tv-icon-btn--danger:hover {
  color: var(--err);
}

/* ── Edição inline ── */
.tv-edit {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tv-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

/* ── F4: skeletons + carregar mais ── */
.tv-skeletons {
  padding: 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.tv-loadmore {
  display: flex;
  justify-content: center;
  padding-top: 4px;
}

/* ── F3: banner de timer esquecido ── */
.tv-forgotten {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--warn) 13%, var(--surface));
  color: var(--warn);
  font-size: 13px;
  font-weight: 600;
}

.tv-forgotten span {
  flex: 1 1 auto;
}

.tv-forgotten-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid currentColor;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--warn);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  flex: 0 0 auto;
}

.tv-forgotten-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--warn) 18%, transparent);
}

.tv-forgotten-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── F5: faturável (toggle, chips, totais) ── */
.tv-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  flex: 0 0 auto;
}

.tv-toggle-field {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.tv-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.tv-toggle-box {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  flex: 0 0 auto;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tv-toggle-input:checked + .tv-toggle-box {
  background: color-mix(in srgb, var(--success) 18%, transparent);
  border-color: var(--success);
  color: var(--success);
}

.tv-toggle-input:focus-visible + .tv-toggle-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tv-toggle-text {
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.tv-total-label--bill {
  color: var(--success);
}

.tv-total-value--bill {
  color: var(--success);
}

.tv-tag--bill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
}

.tv-tag--auto {
  background: color-mix(in srgb, var(--warn) 16%, transparent);
  color: var(--warn);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 10px;
}

/* ── F6: preview de duração nos formulários ── */
.tv-preview {
  margin-right: auto;
  align-self: center;
  color: var(--text-3);
  font-size: 12.5px;
}

.tv-preview strong {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .tv-timer-selects {
    width: 100%;
  }
  /* No celular o cronômetro e o botão dividem a última linha. */
  .tv-timer-clock {
    flex: 1 1 auto;
    justify-content: flex-start;
  }
  .tv-manual-grid,
  .tv-edit-grid {
    grid-template-columns: 1fr;
  }
  .tv-row {
    flex-wrap: wrap;
  }
}
</style>
