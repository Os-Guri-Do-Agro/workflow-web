<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertTriangle,
  CircleCheck,
  Maximize2,
  Paperclip,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import {
  createExpense,
  EXPENSE_STATUS_LABEL,
  type ExpenseFilter,
  type ExpenseStatus,
  type FinanceOptions,
  type MarketingExpense,
} from '@/service/marketing/marketing-finance'
import { safeStorage } from '@/utils/safe-storage'
import { brandTone, formatCents, toneStyle } from '../marketing-labels'
import { entriesFromDrop, filesFromInput, hasFiles as dragHasFiles } from '../uploads/file-sources'
import { isUploadPending, useUploadQueue } from '../uploads/upload-queue'
import { expenseInvoiceTarget } from '../uploads/upload-targets'
import FinanceExpenseDialog from './FinanceExpenseDialog.vue'
import MoneyInput from './MoneyInput.vue'
import { dayBr, defaultDateFor, monthLabel, weekdayShort } from './finance-format'
import { useFinanceExpenses, useFinanceInvalidate } from './useFinance'

/**
 * Aba Lançamentos: planilha do mês. Linha de lançamento rápido no topo
 * (Enter lança), filtros na URL, chip "sem nota", soltar a nota fiscal em cima
 * da linha e totais pago/previsto. No celular a tabela vira lista.
 */
const props = defineProps<{
  groupId: string
  month: string
  brandFilter: string | null
  brands: MarketingBrand[]
  canEdit: boolean
  options: FinanceOptions | undefined
}>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const isPhone = usePhoneViewport()
const invalidate = useFinanceInvalidate(() => props.groupId)

// ── Filtros na URL ──
const q = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')
function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v) query[k] = v
    else delete query[k]
  }
  void router.replace({ query })
}

const search = ref(q('q'))
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (v) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: v.trim() || null }), 300)
})

const filter = computed<ExpenseFilter>(() => ({
  month: props.month,
  companyId: props.brandFilter,
  category: q('categoria') || null,
  status: (['PAID', 'PLANNED'].includes(q('situacao')) ? q('situacao') : null) as ExpenseStatus | null,
  missingInvoice: q('semNota') === '1',
  campaignId: q('campanha') || null,
  activationId: q('ativacao') || null,
  q: q('q') || null,
}))
const hasFilter = computed(
  () =>
    !!(filter.value.category || filter.value.status || filter.value.missingInvoice || filter.value.campaignId) ||
    !!(filter.value.activationId || filter.value.q),
)

/** Celular: os selects ficam atrás do botão Filtros (abre sozinho se já houver filtro). */
const selectFilterCount = computed(
  () =>
    [filter.value.category, filter.value.status, filter.value.campaignId, filter.value.activationId].filter(Boolean)
      .length,
)
const filtersOpen = ref(selectFilterCount.value > 0)

function clearFilters() {
  search.value = ''
  setQuery({ categoria: null, situacao: null, semNota: null, campanha: null, ativacao: null, q: null })
}

const list = useFinanceExpenses(() => props.groupId, filter, () => true)
const items = computed(() => list.data.value?.items ?? [])
const totals = computed(() => list.data.value?.totals)

const multiBrand = computed(() => props.brands.length > 1 && !props.brandFilter)
const brandOf = (id: string) => props.brands.find((b) => b.companyId === id)

const campaignsInScope = computed(() =>
  (props.options?.campaigns ?? []).filter((c) => !props.brandFilter || c.companyId === props.brandFilter),
)
const activationsInScope = computed(() =>
  (props.options?.activations ?? []).filter((a) => !props.brandFilter || a.companyId === props.brandFilter),
)

// ── Lançamento rápido ──
const LAST_BRAND = 'marketing.finance.lastBrand'
const quick = reactive({
  date: defaultDateFor(props.month),
  description: '',
  amountCents: null as number | null,
  category: '',
  status: 'PAID' as ExpenseStatus,
  companyId: '',
})
const quickBusy = ref(false)
const quickError = ref('')
const quickDesc = ref<HTMLInputElement | null>(null)

function quickBrandDefault() {
  if (props.brandFilter) return props.brandFilter
  const last = safeStorage.getItem(LAST_BRAND)
  if (last && props.brands.some((b) => b.companyId === last)) return last
  return props.brands[0]?.companyId ?? ''
}

watch(
  () => props.month,
  (m) => (quick.date = defaultDateFor(m)),
)
watch(
  () => [props.brandFilter, props.brands.length] as const,
  () => (quick.companyId = quickBrandDefault()),
  { immediate: true },
)
watch(
  () => props.options?.categories,
  (cats) => {
    if (cats?.length && !cats.includes(quick.category)) quick.category = cats[0]!
  },
  { immediate: true },
)

async function quickAdd() {
  if (quickBusy.value) return
  quickError.value = ''
  if (!quick.description.trim()) return void (quickError.value = 'Descreva o lançamento.')
  if (!quick.amountCents || quick.amountCents <= 0) return void (quickError.value = 'Informe o valor.')
  if (!quick.date.startsWith(`${props.month}-`)) {
    // Lançar fora do mês aberto some da tela: avisa em vez de "sumir".
    toast.info(`Lançado em ${dayBr(quick.date, true)}, fora de ${monthLabel(props.month)}.`)
  }
  quickBusy.value = true
  try {
    await createExpense(props.groupId, {
      companyId: quick.companyId,
      date: quick.date,
      description: quick.description.trim(),
      amountCents: quick.amountCents,
      category: quick.category,
      status: quick.status,
    })
    safeStorage.setItem(LAST_BRAND, quick.companyId)
    quick.description = ''
    quick.amountCents = null
    await invalidate()
    await nextTick()
    quickDesc.value?.focus()
  } catch (e) {
    quickError.value = getApiErrorMessage(e, 'Não foi possível lançar.')
  } finally {
    quickBusy.value = false
  }
}

// ── Diálogo ──
/**
 * O lançamento aberto não pode depender do filtro: com "Sem nota" ligado,
 * anexar a nota tira a linha da lista e o diálogo virava "Novo lançamento"
 * (e o Salvar duplicava). Por isso guarda a cópia de quando abriu e, se a
 * linha sair do filtro, busca o mês dele SEM filtro para seguir atualizado.
 */
const dialogOpen = ref(false)
const pinned = ref<MarketingExpense | null>(null)
const inFilteredList = computed(() => !!pinned.value && items.value.some((i) => i.id === pinned.value!.id))
const outsideFilter = computed<ExpenseFilter>(() => ({
  month: pinned.value?.date.slice(0, 7) ?? props.month,
  companyId: pinned.value?.companyId ?? null,
}))
const outsideList = useFinanceExpenses(
  () => props.groupId,
  outsideFilter,
  () => dialogOpen.value && !!pinned.value && !inFilteredList.value,
)
const selected = computed<MarketingExpense | null>(() => {
  const id = pinned.value?.id
  if (!id) return null
  return (
    items.value.find((i) => i.id === id) ??
    outsideList.data.value?.items.find((i) => i.id === id) ??
    pinned.value
  )
})
function openExpense(e: MarketingExpense) {
  pinned.value = { ...e }
  dialogOpen.value = true
}
function openNew() {
  pinned.value = null
  dialogOpen.value = true
}
// Ao fechar, `pinned` fica: o título não pisca "Novo lançamento" na saída e a
// busca de fora do filtro já está desligada (depende de `dialogOpen`).

// ── Nota na linha (soltar ou escolher) ──
// Sobe pela fila global da ala (bandeja "Envios"); a linha mostra o progresso.
const dropTarget = ref<string | null>(null)
const queue = useUploadQueue()
const rowFile = ref<HTMLInputElement | null>(null)
let pickFor: string | null = null

/** Progresso (0 a 100) das notas subindo por lançamento; quem não está subindo não aparece. */
const uploading = computed(() => {
  const acc = new Map<string, { size: number; sent: number }>()
  for (const i of queue.items.value) {
    if (i.groupId !== props.groupId || !i.target.key.startsWith('expense:') || !isUploadPending(i)) continue
    const id = i.target.key.slice('expense:'.length)
    const cur = acc.get(id) ?? { size: 0, sent: 0 }
    cur.size += i.size
    cur.sent += i.sent
    acc.set(id, cur)
  }
  const out = new Map<string, number>()
  for (const [id, v] of acc) out.set(id, v.size ? Math.min(99, Math.floor((v.sent / v.size) * 100)) : 0)
  return out
})

function onDragOver(event: DragEvent, id: string) {
  if (!props.canEdit || !dragHasFiles(event.dataTransfer)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dropTarget.value = id
}
function onDragLeave(event: DragEvent, id: string) {
  const to = event.relatedTarget as Node | null
  if (to && (event.currentTarget as HTMLElement).contains(to)) return
  if (dropTarget.value === id) dropTarget.value = null
}
function onDrop(event: DragEvent, expense: MarketingExpense) {
  if (!props.canEdit || !dragHasFiles(event.dataTransfer)) return
  event.preventDefault()
  dropTarget.value = null
  void entriesFromDrop(event.dataTransfer!).then((entries) => attach(expense, entries.map((e) => e.file)))
}
function pickInvoice(expense: MarketingExpense) {
  pickFor = expense.id
  rowFile.value?.click()
}
function onRowPick(event: Event) {
  const files = filesFromInput(event).map((e) => e.file)
  const expense = items.value.find((i) => i.id === pickFor)
  pickFor = null
  if (expense && files.length) attach(expense, files)
}

function attach(expense: MarketingExpense, files: File[]) {
  if (!files.length) return
  const batch = queue.enqueue(
    props.groupId,
    files.map((file) => ({ file })),
    expenseInvoiceTarget(expense.id, expense.description),
  )
  if (batch.rejected.length) toast.error('Nota fiscal: envie PDF, XML ou imagem.')
}

function linksOf(e: MarketingExpense): string {
  return [e.supplier, e.partnerName, e.campaignName, e.activationTitle, e.cardTitle].filter(Boolean).join(' · ')
}

const statusTone: Record<ExpenseStatus, string> = { PAID: 'green', PLANNED: 'slate' }
</script>

<template>
  <div class="fe">
    <!-- Filtros -->
    <div class="fe-filters" role="search">
      <label class="fe-search">
        <Search :size="15" aria-hidden="true" />
        <input v-model="search" class="mk-input" type="search" placeholder="Buscar descrição, fornecedor, nº da nota" aria-label="Buscar lançamento" />
      </label>
      <button
        v-if="isPhone"
        type="button"
        class="mk-btn fe-filter-toggle"
        :aria-expanded="filtersOpen"
        @click="filtersOpen = !filtersOpen"
      >
        <SlidersHorizontal :size="15" aria-hidden="true" />
        Filtros<template v-if="selectFilterCount"> ({{ selectFilterCount }})</template>
      </button>
      <template v-if="!isPhone || filtersOpen">
      <select
        class="mk-select fe-filter"
        aria-label="Categoria"
        :value="filter.category ?? ''"
        @change="setQuery({ categoria: ($event.target as HTMLSelectElement).value || null })"
      >
        <option value="">Todas as categorias</option>
        <option v-for="c in options?.categories ?? []" :key="c" :value="c">{{ c }}</option>
      </select>
      <select
        class="mk-select fe-filter"
        aria-label="Situação"
        :value="filter.status ?? ''"
        @change="setQuery({ situacao: ($event.target as HTMLSelectElement).value || null })"
      >
        <option value="">Pago e previsto</option>
        <option value="PAID">Só pago</option>
        <option value="PLANNED">Só previsto</option>
      </select>
      <select
        v-if="campaignsInScope.length"
        class="mk-select fe-filter"
        aria-label="Campanha"
        :value="filter.campaignId ?? ''"
        @change="setQuery({ campanha: ($event.target as HTMLSelectElement).value || null })"
      >
        <option value="">Todas as campanhas</option>
        <option v-for="c in campaignsInScope" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select
        v-if="activationsInScope.length"
        class="mk-select fe-filter"
        aria-label="Ativação"
        :value="filter.activationId ?? ''"
        @change="setQuery({ ativacao: ($event.target as HTMLSelectElement).value || null })"
      >
        <option value="">Todas as ativações</option>
        <option v-for="a in activationsInScope" :key="a.id" :value="a.id">{{ a.title }}</option>
      </select>
      </template>
      <button
        type="button"
        class="mk-btn fe-missing"
        :class="{ 'is-on': filter.missingInvoice }"
        :aria-pressed="filter.missingInvoice"
        @click="setQuery({ semNota: filter.missingInvoice ? null : '1' })"
      >
        <AlertTriangle :size="14" aria-hidden="true" />
        Sem nota
      </button>
      <button
        v-if="hasFilter"
        type="button"
        class="mk-btn mk-btn--ghost"
        @click="clearFilters"
      >
        Limpar filtros
      </button>
    </div>

    <!-- Celular: o formulário completo é o caminho (a linha de planilha não cabe) -->
    <button v-if="canEdit && isPhone" type="button" class="mk-btn mk-btn--primary fe-new-phone" @click="openNew">
      <Plus :size="16" aria-hidden="true" /> Novo lançamento
    </button>

    <!-- Lançamento rápido -->
    <div
      v-else-if="canEdit"
      class="fe-quick"
      :class="{ 'fe-quick--brand': brands.length > 1 && !brandFilter }"
      @keydown.enter.prevent="quickAdd"
    >
      <input v-model="quick.date" type="date" class="mk-input" aria-label="Data do lançamento" />
      <input
        ref="quickDesc"
        v-model="quick.description"
        class="mk-input"
        maxlength="200"
        placeholder="Novo lançamento: descrição"
        aria-label="Descrição do lançamento"
      />
      <select v-model="quick.category" class="mk-select" aria-label="Categoria do lançamento">
        <option v-for="c in options?.categories ?? []" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-if="brands.length > 1 && !brandFilter" v-model="quick.companyId" class="mk-select" aria-label="Marca do lançamento">
        <option v-for="b in brands" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
      </select>
      <select v-model="quick.status" class="mk-select" aria-label="Situação do lançamento">
        <option value="PAID">Pago</option>
        <option value="PLANNED">Previsto</option>
      </select>
      <MoneyInput v-model="quick.amountCents" label="Valor do lançamento" />
      <button type="button" class="mk-btn mk-btn--primary" :disabled="quickBusy" @click="quickAdd">
        <Plus :size="15" aria-hidden="true" /> {{ quickBusy ? 'Lançando...' : 'Lançar' }}
      </button>
      <button
        type="button"
        class="mk-icon-btn fe-full"
        aria-label="Lançamento completo"
        title="Lançamento completo (fornecedor, vínculos, nota fiscal)"
        @click="openNew"
      >
        <Maximize2 :size="15" />
      </button>
    </div>
    <p v-if="quickError" class="mk-error" role="alert">{{ quickError }}</p>
    <p v-if="list.data.value?.truncated" class="mk-hint fe-truncated" role="status" data-testid="expenses-truncated">
      Mostrando {{ items.length.toLocaleString('pt-BR') }} de {{ (totals?.count ?? 0).toLocaleString('pt-BR') }} lançamentos.
      Os totais contam todos; filtre por marca, categoria ou busca para ver o resto.
    </p>

    <!-- Lista -->
    <div v-if="list.isLoading.value" class="fe-loading">
      <Skeleton type="row" />
      <Skeleton type="row" />
      <Skeleton type="row" />
    </div>

    <!-- Falha de rede não é "nenhum lançamento" -->
    <div v-else-if="list.isError.value && !list.data.value" class="mk-load-error" role="alert">
      <p>{{ getApiErrorMessage(list.error.value, 'Não foi possível carregar os lançamentos.') }}</p>
      <button type="button" class="mk-btn" @click="list.refetch()">Tentar de novo</button>
    </div>

    <EmptyState
      v-else-if="!items.length"
      :icon="hasFilter ? Search : CircleCheck"
      :title="hasFilter ? 'Nada com esses filtros' : `Nenhum lançamento em ${monthLabel(month)}`"
      :description="
        hasFilter
          ? 'Tire um filtro ou troque o mês.'
          : canEdit
            ? 'Use a linha acima para lançar o primeiro gasto do mês.'
            : 'Quando alguém lançar um gasto, ele aparece aqui.'
      "
    />

    <!-- Celular: lista -->
    <ul v-else-if="isPhone" class="fe-cards">
      <li
        v-for="e in items"
        :key="e.id"
        class="fe-card"
        :class="{ 'is-drop': dropTarget === e.id }"
      >
        <button type="button" class="fe-card__main" @click="openExpense(e)">
          <span class="fe-card__line">
            <span class="fe-card__desc">{{ e.description }}</span>
            <span class="mk-num fe-card__value">{{ formatCents(e.amountCents) }}</span>
          </span>
          <span class="fe-card__meta">
            <span>{{ dayBr(e.date) }}</span>
            <span>{{ e.category }}</span>
            <span v-if="multiBrand" class="fe-brand"><span class="mk-dot" :style="toneStyle(brandTone(brandOf(e.companyId)))" />{{ brandOf(e.companyId)?.name }}</span>
            <span :class="e.status === 'PLANNED' ? 'fin-muted' : ''">{{ EXPENSE_STATUS_LABEL[e.status] }}</span>
          </span>
        </button>
        <span class="fe-card__side">
          <span v-if="uploading.has(e.id)" class="fin-muted mk-num">{{ uploading.get(e.id) }}%</span>
          <span v-else-if="e.missingInvoice" class="mk-chip fe-chip-missing">Sem nota</span>
          <span v-else-if="e.invoices.length" class="mk-chip"><Paperclip :size="12" aria-hidden="true" />{{ e.invoices.length }}</span>
          <button
            v-if="canEdit"
            type="button"
            class="mk-icon-btn"
            :aria-label="`Anexar nota em ${e.description}`"
            @click="pickInvoice(e)"
          >
            <Upload :size="16" />
          </button>
        </span>
      </li>
      <li class="fe-cards__total">
        <span>{{ totals?.count ?? 0 }} lançamentos</span>
        <span class="mk-num">Pago {{ formatCents(totals?.paidCents) }}</span>
        <span class="mk-num fin-muted">Previsto {{ formatCents(totals?.plannedCents) }}</span>
      </li>
    </ul>

    <!-- Desktop: tabela -->
    <div v-else class="fin-scroll">
      <table class="mk-table fin-table fe-table">
        <thead>
          <tr>
            <th class="fe-col-date">Data</th>
            <th>Descrição</th>
            <th class="fe-col-cat">Categoria</th>
            <th v-if="multiBrand" class="fe-col-brand">Marca</th>
            <th class="fe-col-status">Situação</th>
            <th class="fe-col-invoice">Nota fiscal</th>
            <th class="mk-num fe-col-value">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in items"
            :key="e.id"
            class="fe-row"
            :class="{ 'is-drop': dropTarget === e.id, 'is-planned': e.status === 'PLANNED' }"
            tabindex="0"
            :aria-label="`${e.description}, ${formatCents(e.amountCents)}`"
            @click="openExpense(e)"
            @keydown.enter.self="openExpense(e)"
            @dragover="onDragOver($event, e.id)"
            @dragenter="onDragOver($event, e.id)"
            @dragleave="onDragLeave($event, e.id)"
            @drop="onDrop($event, e)"
          >
            <td class="fe-col-date mk-num">
              {{ dayBr(e.date) }} <span class="fin-muted fe-wd">{{ weekdayShort(e.date) }}</span>
            </td>
            <td class="fe-desc">
              <span class="fe-desc__title">
                <Repeat v-if="e.recurringId" :size="13" class="fin-muted" aria-label="Recorrente" />
                {{ e.description }}
              </span>
              <span v-if="linksOf(e)" class="fin-sub">{{ linksOf(e) }}</span>
            </td>
            <td class="fe-col-cat" :title="e.category">{{ e.category }}</td>
            <td v-if="multiBrand" class="fe-col-brand">
              <span class="fe-brand"><span class="mk-dot" :style="toneStyle(brandTone(brandOf(e.companyId)))" />{{ brandOf(e.companyId)?.name }}</span>
            </td>
            <td class="fe-col-status">
              <span class="mk-chip" data-tone :style="toneStyle(statusTone[e.status])">{{ EXPENSE_STATUS_LABEL[e.status] }}</span>
            </td>
            <td class="fe-col-invoice" @click.stop>
              <span v-if="dropTarget === e.id" class="fe-drop-hint">Solte para anexar</span>
              <span v-else-if="uploading.has(e.id)" class="fin-muted mk-num">Enviando {{ uploading.get(e.id) }}%</span>
              <template v-else>
                <button
                  v-if="e.invoices.length"
                  type="button"
                  class="fe-invoice"
                  :title="e.invoices.map((i) => i.name).join(', ')"
                  @click="openExpense(e)"
                >
                  <Paperclip :size="13" aria-hidden="true" />
                  {{ e.invoices.length === 1 ? '1 nota' : `${e.invoices.length} notas` }}
                </button>
                <span v-else-if="e.missingInvoice" class="mk-chip fe-chip-missing">Sem nota</span>
                <span v-else-if="e.noInvoiceNeeded" class="fin-muted">Não precisa</span>
                <span v-else class="fin-muted">-</span>
                <button
                  v-if="canEdit"
                  type="button"
                  class="mk-icon-btn fe-attach"
                  :aria-label="`Anexar nota em ${e.description}`"
                  title="Anexar nota (ou solte o arquivo na linha)"
                  @click="pickInvoice(e)"
                >
                  <Upload :size="14" />
                </button>
              </template>
            </td>
            <td class="mk-num fe-col-value">{{ formatCents(e.amountCents) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td :colspan="multiBrand ? 4 : 3">{{ totals?.count ?? 0 }} lançamentos</td>
            <td colspan="2" class="fin-muted fe-foot-planned">Previsto {{ formatCents(totals?.plannedCents) }}</td>
            <td class="mk-num">Pago {{ formatCents(totals?.paidCents) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-if="canEdit && items.length && !isPhone" class="mk-hint">
      Arraste a nota fiscal (PDF, XML ou imagem) para a linha do lançamento.
    </p>

    <input
      ref="rowFile"
      type="file"
      class="fe-hidden"
      multiple
      accept=".pdf,.xml,image/*,application/pdf,text/xml,application/xml"
      @change="onRowPick"
    />

    <FinanceExpenseDialog
      v-model="dialogOpen"
      :group-id="groupId"
      :expense="selected"
      :brands="brands"
      :default-brand="brandFilter"
      :month="month"
      :options="options"
      :can-edit="canEdit"
      @changed="invalidate"
    />
  </div>
</template>

<style scoped>
.fe {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  /* A linha de lançamento rápido se arruma pela largura DESTA área (com ou sem
     o menu lateral), não pela da janela. */
  container-type: inline-size;
}

.fe-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.fe-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  max-width: 320px;
  color: var(--text-3);
}

.fe-search svg {
  position: absolute;
  left: 9px;
  pointer-events: none;
}

.fe-search .mk-input {
  padding-left: 30px;
}

.fe-filter {
  width: auto;
  max-width: 200px;
}

.fe-missing.is-on {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  background: color-mix(in srgb, var(--warn) 14%, var(--surface));
  color: var(--text);
}

.fe-missing svg {
  color: var(--warn);
}

.fe-quick {
  display: grid;
  grid-template-columns: minmax(118px, 140px) minmax(140px, 1fr) minmax(120px, 180px) minmax(92px, 110px) minmax(120px, 150px) auto auto;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.fe-quick--brand {
  grid-template-columns: minmax(118px, 140px) minmax(140px, 1fr) minmax(120px, 170px) minmax(110px, 150px) minmax(92px, 110px) minmax(120px, 150px) auto auto;
}

/* Área estreita (1024 px com o menu lateral): a descrição ganha a linha de
   cima e o resto quebra embaixo, sem passar da largura. */
@container (max-width: 1000px) {
  .fe-quick,
  .fe-quick--brand {
    display: flex;
    flex-wrap: wrap;
  }

  .fe-quick > * {
    flex: 1 1 130px;
    min-width: 0;
  }

  .fe-quick > :nth-child(2) {
    flex-basis: 100%;
    order: -1;
  }

  .fe-quick > .mk-btn,
  .fe-quick > .fe-full {
    flex: 0 0 auto;
  }
}

.fe-full {
  border-color: var(--border);
  background: var(--surface);
}

.fe-new-phone {
  width: 100%;
}

.fe-filter-toggle {
  flex: 1 1 0;
}

.fe-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fe-table {
  min-width: 760px;
}

.fe-row {
  cursor: pointer;
}

.fe-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.fe-row.is-planned .fe-col-value {
  color: var(--text-2);
}

.fe-row.is-drop {
  background: var(--accent-soft) !important;
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
}

.fe-col-date {
  width: 76px;
  text-align: left;
}

.fe-wd {
  font-size: 11px;
}

.fe-col-cat {
  width: 170px;
  max-width: 170px;
  overflow: hidden;
  color: var(--text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe-col-brand {
  width: 130px;
}

.fe-col-status {
  width: 92px;
}

.fe-col-invoice {
  width: 150px;
  cursor: default;
}

.fe-col-invoice > * {
  vertical-align: middle;
}

.fe-col-value {
  width: 120px;
  font-weight: 600;
}

.fe-desc {
  max-width: 0;
  min-width: 220px;
}

.fe-desc__title {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe-brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.fe-chip-missing {
  color: var(--text);
  background: color-mix(in srgb, var(--warn) 22%, transparent);
}

.fe-invoice {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.fe-invoice:hover {
  background: var(--surface-3);
  color: var(--text);
}

.fe-attach {
  width: 26px;
  height: 26px;
  margin-left: 2px;
  opacity: 0;
}

.fe-row:hover .fe-attach,
.fe-row:focus-within .fe-attach {
  opacity: 1;
}

.fe-drop-hint {
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 700;
}

.fe-foot-planned {
  font-weight: 600;
  text-align: right;
}

.fe-hidden {
  display: none;
}

/* Celular */
.fe-cards {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.fe-card {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 6px 4px 0;
  border-bottom: 1px solid var(--border);
}

.fe-card__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  min-height: 52px;
  padding: 6px 10px;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.fe-card__line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.fe-card__desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fe-card__value {
  font-weight: 700;
}

.fe-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  color: var(--text-3);
  font-size: 12px;
}

.fe-card__side {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.fe-cards__total {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 10px 12px;
  background: var(--surface-2);
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1100px) {
  .fe-quick,
  .fe-quick--brand {
    grid-template-columns: 140px minmax(0, 1fr) minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .fe-search {
    max-width: none;
    flex-basis: 100%;
  }

  .fe-filter {
    flex: 1 1 100%;
    max-width: none;
  }

  .fe-missing {
    flex: 1 1 0;
  }
}
</style>
