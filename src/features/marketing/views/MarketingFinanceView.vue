<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Lock,
  Repeat,
} from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  blobErrorMessage,
  downloadFinanceFile,
  generateRecurring,
  type FinanceFileKind,
} from '@/service/marketing/marketing-finance'
import { useMarketing } from '../composables/useMarketing'
import { formatCents } from '../marketing-labels'
import FinanceBudgetTab from '../finance/FinanceBudgetTab.vue'
import FinanceExpensesTab from '../finance/FinanceExpensesTab.vue'
import FinanceRecurringTab from '../finance/FinanceRecurringTab.vue'
import FinanceYearTab from '../finance/FinanceYearTab.vue'
import { addMonths, currentYm, isYm, monthLabel, monthTitle } from '../finance/finance-format'
import { isForbidden, useFinanceInvalidate, useFinanceOptions, useFinanceSummary } from '../finance/useFinance'
import '../finance/finance.css'

/**
 * Financeiro da ala Marketing (spec m3-dinheiro-eventos.md, M3-A). Estado na
 * URL: `?mes=YYYY-MM`, `?aba=lancamentos|orcamento|ano|recorrentes`, os
 * filtros da aba Lançamentos e o `?marca=` do layout.
 */
type Tab = 'lancamentos' | 'orcamento' | 'ano' | 'recorrentes'
const TABS: Tab[] = ['lancamentos', 'orcamento', 'ano', 'recorrentes']

const route = useRoute()
const router = useRouter()
const toast = useToast()
const mk = useMarketing()

const groupId = computed(() => mk.groupId.value ?? '')
const brandFilter = computed(() => mk.brandFilter.value)
const canSee = computed(() => !!mk.permissions.value?.seeFinance)
const canEdit = computed(() => mk.can('EDITOR'))
const canAdmin = computed(() => mk.can('ADMIN'))

const month = computed(() => {
  const q = route.query.mes
  return isYm(q) ? q : currentYm()
})
const tab = computed<Tab>(() => {
  const q = route.query.aba
  return typeof q === 'string' && (TABS as string[]).includes(q) ? (q as Tab) : 'lancamentos'
})
const year = computed(() => Number(month.value.slice(0, 4)))

function go(patch: Record<string, string | null>) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v) query[k] = v
    else delete query[k]
  }
  void router.replace({ query })
}
const step = computed(() => (tab.value === 'ano' ? 12 : 1))
const isCurrent = computed(() =>
  tab.value === 'ano' ? year.value === Number(currentYm().slice(0, 4)) : month.value === currentYm(),
)
const navLabel = computed(() => (tab.value === 'ano' ? String(year.value) : monthTitle(month.value)))

const summary = useFinanceSummary(groupId, month, brandFilter, canSee)
const options = useFinanceOptions(groupId, canSee)
const invalidate = useFinanceInvalidate(groupId)
const s = computed(() => summary.data.value)

const forbidden = computed(
  () => !canSee.value || isForbidden(summary.error.value) || isForbidden(options.error.value),
)

// ── Recorrentes pendentes do mês ──
const generating = ref(false)
async function launchRecurring() {
  if (generating.value) return
  generating.value = true
  try {
    const r = await generateRecurring(groupId.value, month.value, brandFilter.value)
    toast.success(
      r.created
        ? `${r.created} recorrente${r.created === 1 ? '' : 's'} lançado${r.created === 1 ? '' : 's'} em ${monthLabel(month.value)}.`
        : 'Os recorrentes deste mês já estavam lançados.',
    )
    await invalidate()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível lançar os recorrentes.'))
  } finally {
    generating.value = false
  }
}

// ── Exportar ──
const exporting = ref<FinanceFileKind | null>(null)
async function exportFile(kind: FinanceFileKind) {
  if (exporting.value) return
  exporting.value = kind
  try {
    const name = await downloadFinanceFile(groupId.value, kind, {
      month: month.value,
      year: year.value,
      companyId: brandFilter.value,
    })
    toast.success(`${name} baixado.`)
  } catch (e) {
    toast.error(await blobErrorMessage(e, 'Não foi possível gerar o arquivo.'))
  } finally {
    exporting.value = null
  }
}
const excelKind = computed<FinanceFileKind>(() => (tab.value === 'ano' ? 'xlsx-year' : 'xlsx-month'))
const noInvoices = computed(() => (s.value?.invoiceCount ?? 0) === 0)

const tabs = computed(() => [
  { key: 'lancamentos' as Tab, label: 'Lançamentos', badge: s.value?.missingInvoiceCount || 0, dot: false, badgeTitle: 'pagos sem nota' },
  { key: 'orcamento' as Tab, label: 'Orçamento', badge: 0, dot: !!s.value?.total.over, badgeTitle: 'O mês passou do orçado' },
  { key: 'ano' as Tab, label: 'Ano', badge: 0, dot: false, badgeTitle: '' },
  { key: 'recorrentes' as Tab, label: 'Recorrentes', badge: s.value?.recurringPending.count || 0, dot: false, badgeTitle: 'pendentes no mês' },
])
</script>

<template>
  <EmptyState
    v-if="forbidden"
    :icon="Lock"
    title="O financeiro não está liberado para o seu papel"
    description="O Dono do grupo decide se o Visualizador vê o financeiro. Peça para ele, se precisar."
  />

  <div v-else-if="groupId" class="mk-page fin">
    <!-- Mês e arquivos -->
    <div class="fin-top">
      <div class="fin-nav" role="group" aria-label="Período">
        <button type="button" class="mk-icon-btn" :aria-label="tab === 'ano' ? 'Ano anterior' : 'Mês anterior'" @click="go({ mes: addMonths(month, -step) })">
          <ChevronLeft :size="18" />
        </button>
        <h2 class="fin-nav__label" aria-live="polite">{{ navLabel }}</h2>
        <button type="button" class="mk-icon-btn" :aria-label="tab === 'ano' ? 'Próximo ano' : 'Próximo mês'" @click="go({ mes: addMonths(month, step) })">
          <ChevronRight :size="18" />
        </button>
        <button v-if="!isCurrent" type="button" class="mk-btn mk-btn--ghost fin-nav__today" @click="go({ mes: null })">
          {{ tab === 'ano' ? 'Este ano' : 'Este mês' }}
        </button>
      </div>
      <span class="mk-toolbar__spacer" />
      <div class="fin-files" role="group" aria-label="Exportar">
        <button type="button" class="mk-btn" :disabled="!!exporting" @click="exportFile(excelKind)">
          <FileSpreadsheet :size="15" aria-hidden="true" />
          {{ exporting === excelKind ? 'Gerando...' : tab === 'ano' ? `Excel ${year}` : 'Excel' }}
        </button>
        <template v-if="tab !== 'ano'">
          <button type="button" class="mk-btn" :disabled="!!exporting" @click="exportFile('pdf')">
            <FileText :size="15" aria-hidden="true" />
            {{ exporting === 'pdf' ? 'Gerando...' : 'PDF' }}
          </button>
          <button
            type="button"
            class="mk-btn"
            aria-label="Notas do mês (.zip)"
            :disabled="!!exporting || noInvoices"
            :title="noInvoices ? 'Nenhuma nota anexada neste mês' : 'Todas as notas do mês num zip'"
            @click="exportFile('zip')"
          >
            <FileArchive :size="15" aria-hidden="true" />
            <template v-if="exporting === 'zip'">Gerando...</template>
            <template v-else>
              <span class="fin-long">Notas do mês (.zip)</span>
              <span class="fin-short" aria-hidden="true">Notas .zip</span>
            </template>
          </button>
        </template>
      </div>
    </div>

    <!-- Números do mês -->
    <dl v-if="s && tab !== 'ano'" class="fin-strip">
      <div>
        <dt>Pago</dt>
        <dd class="mk-num">{{ formatCents(s.total.paidCents) }}</dd>
      </div>
      <div>
        <dt>Previsto</dt>
        <dd class="mk-num">{{ formatCents(s.total.plannedCents) }}</dd>
      </div>
      <div>
        <dt>Orçado</dt>
        <dd class="mk-num" :class="{ 'fin-muted': s.total.budgetCents === null }">
          {{ s.total.budgetCents === null ? 'Sem orçamento' : formatCents(s.total.budgetCents) }}
        </dd>
      </div>
      <div>
        <dt>Saldo</dt>
        <dd class="mk-num" :class="{ 'fin-neg': s.total.over, 'fin-muted': s.total.diffCents === null }">
          {{ s.total.diffCents === null ? '-' : formatCents(s.total.diffCents) }}
        </dd>
      </div>
      <div>
        <dt>Sem nota</dt>
        <dd>
          <button
            v-if="s.missingInvoiceCount"
            type="button"
            class="fin-strip__link"
            @click="go({ aba: null, semNota: '1' })"
          >
            {{ s.missingInvoiceCount }} {{ s.missingInvoiceCount === 1 ? 'lançamento' : 'lançamentos' }}
          </button>
          <span v-else class="fin-muted">Nenhum</span>
        </dd>
      </div>
    </dl>

    <!-- Recorrentes pendentes -->
    <div v-if="s?.recurringPending.count && tab !== 'ano'" class="fin-notice" role="status">
      <Repeat :size="16" aria-hidden="true" />
      <span class="fin-notice__text">
        <strong>{{ s.recurringPending.count }} {{ s.recurringPending.count === 1 ? 'recorrente ainda não lançado' : 'recorrentes ainda não lançados' }}</strong>
        em {{ monthLabel(month) }} ({{ formatCents(s.recurringPending.totalCents) }}):
        {{ s.recurringPending.items.map((i) => i.description).join(', ') }}.
      </span>
      <button v-if="canEdit" type="button" class="mk-btn mk-btn--primary" :disabled="generating" @click="launchRecurring">
        {{ generating ? 'Lançando...' : 'Lançar' }}
      </button>
    </div>

    <!-- Abas -->
    <div class="fin-tabs" role="tablist" aria-label="Financeiro">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        role="tab"
        class="fin-tab"
        :class="{ 'is-active': tab === t.key }"
        :aria-selected="tab === t.key"
        @click="go({ aba: t.key === 'lancamentos' ? null : t.key })"
      >
        {{ t.label }}
        <span v-if="t.dot" class="fin-tab__dot" :title="t.badgeTitle" role="img" :aria-label="t.badgeTitle" />
        <span v-else-if="t.badge" class="fin-tab__badge" :title="`${t.badge} ${t.badgeTitle}`">{{ t.badge }}</span>
      </button>
    </div>

    <FinanceExpensesTab
      v-if="tab === 'lancamentos'"
      :group-id="groupId"
      :month="month"
      :brand-filter="brandFilter"
      :brands="mk.brands.value"
      :can-edit="canEdit"
      :options="options.data.value"
    />
    <FinanceBudgetTab
      v-else-if="tab === 'orcamento'"
      :group-id="groupId"
      :month="month"
      :brand-filter="brandFilter"
      :brands="mk.brands.value"
      :can-admin="canAdmin"
      :summary="s"
      :loading="summary.isLoading.value"
      :error="summary.isError.value ? summary.error.value : null"
      @retry="summary.refetch()"
    />
    <FinanceYearTab
      v-else-if="tab === 'ano'"
      :group-id="groupId"
      :year="year"
      :brand-filter="brandFilter"
      @open-month="(m: string) => go({ mes: m, aba: null })"
    />
    <FinanceRecurringTab
      v-else
      :group-id="groupId"
      :month="month"
      :brand-filter="brandFilter"
      :brands="mk.brands.value"
      :categories="options.data.value?.categories ?? []"
      :can-edit="canEdit"
      :can-admin="canAdmin"
    />
  </div>
</template>

<style scoped>
.fin {
  gap: 12px;
}

.fin-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fin-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.fin-nav__label {
  min-width: 168px;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.fin-nav__today {
  margin-left: 4px;
}

.fin-files {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.fin-strip {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.fin-strip > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 130px;
  padding: 8px 14px;
  border-right: 1px solid var(--border);
}

.fin-strip > div:last-child {
  border-right: 0;
}

.fin-strip dt {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.fin-strip dd {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  text-align: left;
}

.fin-strip__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--warn);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.fin-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.fin-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-bottom: -1px;
  padding: 7px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.fin-tab:hover {
  color: var(--text);
}

.fin-tab.is-active {
  border-bottom-color: var(--accent);
  color: var(--accent-ink);
}

.fin-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.fin-tab__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--err);
}

.fin-short {
  display: none;
}

.fin-tab__badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn) 22%, transparent);
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
  line-height: 17px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .fin-top {
    gap: 6px;
  }

  .fin-nav {
    width: 100%;
    justify-content: space-between;
  }

  .fin-nav__label {
    flex: 1;
    min-width: 0;
  }

  .fin-files {
    width: 100%;
  }

  .fin-files .mk-btn {
    flex: 1 1 0;
    min-width: 0;
    padding: 6px 8px;
  }

  .fin-long {
    display: none;
  }

  .fin-short {
    display: inline;
  }

  /* 3 colunas: Pago, Previsto, Orçado / Saldo, Sem nota */
  .fin-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .fin-strip > div {
    min-width: 0;
    padding: 6px 10px;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .fin-strip > div:nth-child(3n),
  .fin-strip > div:last-child {
    border-right: 0;
  }

  .fin-strip > div:nth-child(n + 4) {
    border-bottom: 0;
  }

  .fin-strip dd {
    overflow: hidden;
    font-size: 13.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fin-tab {
    min-height: 44px;
  }
}
</style>
