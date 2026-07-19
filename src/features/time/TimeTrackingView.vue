<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, DollarSign, Pencil, Play, Plus, Square, Trash2, X } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useTimeEntries, useTimeTracking } from '@/composables/useTimeTracking'
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
const { running, isRunning, elapsedSec, start, stop, createManual, updateEntry, deleteEntry } =
  useTimeTracking()

// ─── Opções de empresa / tarefa (compartilhadas por vários formulários) ───────
const companyOptions = computed(() => [
  { label: 'Pessoal', value: null as string | null },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

function activityOptionsFor(companyId: string | null) {
  const tasks = workspace.workspaceData?.activities ?? []
  const filtered = companyId ? tasks.filter((t) => t.companyId === companyId) : []
  return [
    { label: 'Sem tarefa', value: null as string | null },
    ...filtered.map((t) => ({ label: t.title, value: t.id })),
  ]
}

// ─── Barra do timer (topo) ────────────────────────────────────────────────────
const timerForm = reactive({
  description: '',
  companyId: workspace.activeCompanyId as string | null,
  activityId: null as string | null,
  billable: false, // F5
})
watch(
  () => timerForm.companyId,
  () => {
    timerForm.activityId = null
  },
)

const liveClock = computed(() => formatTimer(elapsedSec.value))

// F3 — aviso de timer esquecido (>8h).
const forgotten = computed(() => isRunning.value && elapsedSec.value > FORGOTTEN_SEC)
const runningHours = computed(() => Math.floor(elapsedSec.value / 3600))

async function handleStart() {
  try {
    await start.mutateAsync({
      description: timerForm.description.trim() || undefined,
      companyId: timerForm.companyId,
      activityId: timerForm.activityId,
      billable: timerForm.billable,
    })
    timerForm.description = ''
    timerForm.activityId = null
    timerForm.billable = false
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível iniciar o timer'))
  }
}

async function handleStop() {
  try {
    await stop.mutateAsync()
  } catch {
    showError('Não foi possível parar o timer')
  }
}

// F6 — "Continuar": reinicia um timer com a mesma descrição/empresa/tarefa.
async function handleContinue(entry: TimeEntry) {
  try {
    await start.mutateAsync({
      description: entry.description || undefined,
      companyId: entry.companyId,
      activityId: entry.activityId,
      billable: entry.billable,
    })
    success('Timer retomado')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível retomar o timer'))
  }
}

// ─── Filtro por período e empresa ─────────────────────────────────────────────
type Preset = 'today' | '7d' | '30d'
const preset = ref<Preset>('7d')
const filterCompanyId = ref<string | null | 'all'>('all')

function rangeFor(p: Preset): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)
  const from = new Date(now)
  if (p === 'today') from.setHours(0, 0, 0, 0)
  else if (p === '7d') {
    from.setDate(from.getDate() - 6)
    from.setHours(0, 0, 0, 0)
  } else {
    from.setDate(from.getDate() - 29)
    from.setHours(0, 0, 0, 0)
  }
  return { from: from.toISOString(), to: to.toISOString() }
}

// F4 — paginação incremental. "Carregar mais" aumenta o take em blocos de 50.
const PAGE_SIZE = 50
const limit = ref(PAGE_SIZE)

const entriesFilters = computed(() => {
  const { from, to } = rangeFor(preset.value)
  const base: { from: string; to: string; companyId?: string; take: number } = {
    from,
    to,
    take: limit.value,
  }
  // 'all' e '__personal__' (recorte "sem empresa", aplicado no client) não
  // viram filtro de companyId no backend.
  const value = filterCompanyId.value
  if (value && value !== 'all' && value !== '__personal__') {
    base.companyId = value
  }
  return base
})

const entries = useTimeEntries(entriesFilters)

// Trocar de período/empresa reinicia a paginação.
watch([preset, filterCompanyId], () => {
  limit.value = PAGE_SIZE
})

// Há mais itens se o backend devolveu exatamente o take pedido.
const hasMore = computed(() => (entries.data.value?.length ?? 0) >= limit.value)

function loadMore() {
  limit.value += PAGE_SIZE
}

const filterCompanyOptions = computed(() => [
  { label: 'Todas', value: 'all' as const },
  { label: 'Pessoal', value: '__personal__' },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

// "Pessoal" no filtro = entradas sem empresa. Aplicado no client (o back filtra
// por companyId específico; "sem empresa" é um recorte local).
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

const rangeTotalSec = computed(() =>
  visibleEntries.value.reduce((acc, e) => acc + (e.durationSec ?? 0), 0),
)

// F5 — total faturável do período (só entradas com billable=true).
const rangeBillableSec = computed(() =>
  visibleEntries.value.reduce((acc, e) => acc + (e.billable ? (e.durationSec ?? 0) : 0), 0),
)

const todayTotalSec = computed(() => {
  const today = dayKey(new Date().toISOString())
  return visibleEntries.value
    .filter((e) => dayKey(e.startedAt) === today)
    .reduce((acc, e) => acc + (e.durationSec ?? 0), 0)
})

// ─── Edição inline ────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null)
const editForm = reactive({
  description: '',
  companyId: null as string | null,
  activityId: null as string | null,
  startedAt: '',
  endedAt: '',
  billable: false, // F5
})

// F6 — preview de duração (fim − início) no formulário de edição.
const editPreview = computed(() => durationPreview(editForm.startedAt, editForm.endedAt))

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString()
}

// F6 — "2h 15m" a partir de dois datetime-local (ou null se inválido/negativo).
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
        activityId: editForm.activityId ?? '',
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
watch(
  () => manualForm.companyId,
  () => {
    manualForm.activityId = null
  },
)

// F6 — preview de duração no formulário manual.
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
      activityId: manualForm.activityId,
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

const presets: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
]
</script>

<template>
  <div class="time-view">
    <header class="tv-head">
      <div>
        <p class="tv-eyebrow">Pessoal</p>
        <h1 class="tv-title">Meu tempo</h1>
      </div>
    </header>

    <!-- ─── Barra do timer ─────────────────────────────────────────────── -->
    <section class="tv-timer" :class="{ 'tv-timer--running': isRunning }">
      <input
        v-model="timerForm.description"
        class="tv-timer-input"
        type="text"
        placeholder="No que você está trabalhando?"
        maxlength="500"
        :disabled="isRunning"
      />

      <div class="tv-timer-selects">
        <AppSelect
          v-model="timerForm.companyId"
          :items="companyOptions"
          placeholder="Pessoal"
          label="Empresa"
          density="compact"
          :disabled="isRunning"
        />
        <AppSelect
          v-if="timerForm.companyId && !isRunning"
          v-model="timerForm.activityId"
          :items="activityOptionsFor(timerForm.companyId)"
          placeholder="Sem tarefa"
          label="Tarefa"
          density="compact"
        />
      </div>

      <!-- F5 — faturável (só no estado parado) -->
      <label v-if="!isRunning" class="tv-toggle" title="Marcar como faturável">
        <input v-model="timerForm.billable" type="checkbox" class="tv-toggle-input" />
        <span class="tv-toggle-box"><DollarSign :size="14" /></span>
        <span class="tv-toggle-text">Faturável</span>
      </label>

      <div class="tv-timer-clock">{{ liveClock }}</div>

      <button
        v-if="!isRunning"
        class="tv-btn tv-btn--start"
        type="button"
        :disabled="start.isPending.value"
        @click="handleStart"
      >
        <Play :size="16" />
        <span>Iniciar</span>
      </button>
      <button
        v-else
        class="tv-btn tv-btn--stop"
        type="button"
        :disabled="stop.isPending.value"
        @click="handleStop"
      >
        <Square :size="16" />
        <span>Parar</span>
      </button>
    </section>

    <!-- F3 — aviso de timer esquecido (>8h). -->
    <div v-if="forgotten" class="tv-forgotten" role="alert">
      <AlertTriangle :size="16" />
      <span>Timer rodando há {{ runningHours }}h. Ainda está trabalhando?</span>
      <button class="tv-forgotten-btn" type="button" :disabled="stop.isPending.value" @click="handleStop">
        Parar
      </button>
    </div>

    <div v-else-if="isRunning && running" class="tv-running-hint">
      Rodando: <strong>{{ running.description || 'Sem descrição' }}</strong>
      <span v-if="running.company"> · {{ running.company.name }}</span>
      <span v-if="running.billable" class="tv-inline-bill"><DollarSign :size="12" /> Faturável</span>
    </div>

    <!-- ─── Filtros + totais ───────────────────────────────────────────── -->
    <section class="tv-controls">
      <div class="tv-presets">
        <button
          v-for="p in presets"
          :key="p.id"
          class="tv-chip"
          :class="{ 'tv-chip--on': preset === p.id }"
          type="button"
          @click="preset = p.id"
        >
          {{ p.label }}
        </button>
      </div>

      <div class="tv-company-filter">
        <AppSelect
          v-model="filterCompanyId"
          :items="filterCompanyOptions"
          label="Filtrar por empresa"
          density="compact"
        />
      </div>

      <div class="tv-totals">
        <div class="tv-total">
          <span class="tv-total-label">Hoje</span>
          <span class="tv-total-value">{{ formatDurationLong(todayTotalSec) }}</span>
        </div>
        <div class="tv-total">
          <span class="tv-total-label">Período</span>
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
        <label class="tv-field">
          <span class="tv-label">Empresa</span>
          <AppSelect
            v-model="manualForm.companyId"
            :items="companyOptions"
            placeholder="Pessoal"
            label="Empresa"
            density="compact"
          />
        </label>
        <label v-if="manualForm.companyId" class="tv-field">
          <span class="tv-label">Tarefa</span>
          <AppSelect
            v-model="manualForm.activityId"
            :items="activityOptionsFor(manualForm.companyId)"
            placeholder="Sem tarefa"
            label="Tarefa"
            density="compact"
          />
        </label>
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
    <!-- F4 — loading: skeleton -->
    <div v-if="entries.isLoading.value" class="tv-skeletons">
      <Skeleton v-for="i in 4" :key="i" type="row" height="18px" />
    </div>

    <!-- F4 — erro: tentar de novo -->
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
            <!-- Linha normal -->
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
                  v-model="editForm.companyId"
                  :items="companyOptions"
                  placeholder="Pessoal"
                  label="Empresa"
                  density="compact"
                />
                <AppSelect
                  v-if="editForm.companyId"
                  v-model="editForm.activityId"
                  :items="activityOptionsFor(editForm.companyId)"
                  placeholder="Sem tarefa"
                  label="Tarefa"
                  density="compact"
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

      <!-- F4 — paginação incremental -->
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
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 20px 64px;
  display: flex;
  flex-direction: column;
  gap: 18px;
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

/* ── Barra do timer ── */
.tv-timer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.tv-timer--running {
  border-color: var(--accent);
}

.tv-timer-input {
  flex: 1 1 auto;
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

.tv-timer-selects {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
  width: 260px;
}

.tv-timer-clock {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  min-width: 96px;
  text-align: right;
}

.tv-running-hint {
  color: var(--text-2);
  font-size: 12.5px;
  padding: 0 4px;
}

.tv-running-hint strong {
  color: var(--text);
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
  background: var(--surface-2);
  color: var(--err);
  border-color: var(--border);
}

.tv-btn--stop:hover:not(:disabled) {
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

.tv-presets {
  display: inline-flex;
  gap: 6px;
}

.tv-chip {
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tv-chip--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
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

.tv-state {
  padding: 40px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
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

.tv-inline-bill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 8px;
  color: var(--success);
  font-weight: 600;
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
  .tv-timer {
    flex-wrap: wrap;
  }
  .tv-timer-selects {
    width: 100%;
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
