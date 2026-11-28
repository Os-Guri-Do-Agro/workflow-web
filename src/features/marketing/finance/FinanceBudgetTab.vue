<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Copy, Pencil } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import {
  deleteBudget,
  upsertBudget,
  type FinanceSummary,
  type SummaryLine,
} from '@/service/marketing/marketing-finance'
import { formatCents } from '../marketing-labels'
import MoneyInput from './MoneyInput.vue'
import { addMonths, monthLabel, monthShort, usePercent } from './finance-format'
import { useFinanceBudgets, useFinanceInvalidate } from './useFinance'

/**
 * Aba Orçamento: orçado x pago x previsto por categoria, com barra fina e
 * saldo em vermelho quando estoura. Admin edita o orçado na própria célula
 * (Enter grava, Esc desfaz, vazio tira o orçamento). Orçamento é por marca:
 * com "Todas as marcas" e mais de uma marca a coluna é a soma, só leitura.
 */
const props = defineProps<{
  groupId: string
  month: string
  brandFilter: string | null
  brands: MarketingBrand[]
  canAdmin: boolean
  summary: FinanceSummary | undefined
  loading: boolean
  /** Erro do resumo do mês (que alimenta esta aba) */
  error?: unknown
}>()

const emit = defineEmits<{ retry: [] }>()

const toast = useToast()
const invalidate = useFinanceInvalidate(() => props.groupId)

/** Marca do orçamento editável: a do filtro, ou a única que a pessoa vê. */
const editBrand = computed(() => props.brandFilter ?? (props.brands.length === 1 ? props.brands[0]!.companyId : null))
const editable = computed(() => props.canAdmin && !!editBrand.value)
const year = computed(() => Number(props.month.slice(0, 4)))
const budgets = useFinanceBudgets(() => props.groupId, year, editBrand, () => editable.value)

function budgetRow(category: string, month = props.month) {
  return budgets.data.value?.find((b) => b.month === month && b.category === category && b.companyId === editBrand.value)
}

const lines = computed(() => props.summary?.categories ?? [])
const total = computed(() => props.summary?.total)

/** Falha de rede vira aviso com "Tentar de novo", não uma tabela vazia. */
const loadError = computed(() => {
  if (props.error && !props.summary) return getApiErrorMessage(props.error, 'Não foi possível carregar o orçamento.')
  if (editable.value && budgets.isError.value && !budgets.data.value) {
    return getApiErrorMessage(budgets.error.value, 'Não foi possível carregar o orçamento para editar.')
  }
  return ''
})
function retry() {
  if (props.error) emit('retry')
  if (budgets.isError.value) void budgets.refetch()
}

// ── Edição na célula ──
const editing = ref<string | null>(null) // categoria ('' = total)
const draft = ref<number | null>(null)
const saving = ref(false)
const cellInput = ref<InstanceType<typeof MoneyInput> | null>(null)
/** Ref por função: dentro do v-for um `ref="x"` viraria lista. */
function setCell(el: unknown) {
  if (el) cellInput.value = el as InstanceType<typeof MoneyInput>
}

async function startEdit(category: string, current: number | null) {
  if (!editable.value) return
  editing.value = category
  draft.value = current
  await nextTick()
  cellInput.value?.focus()
  cellInput.value?.select()
}

function cancel() {
  editing.value = null
}

async function commit() {
  const category = editing.value
  if (category === null || saving.value || !editBrand.value) return
  const existing = budgetRow(category)
  const value = draft.value
  if ((value ?? null) === (existing?.amountCents ?? null)) return cancel()
  saving.value = true
  try {
    if (value === null) {
      if (existing) await deleteBudget(props.groupId, existing.id)
    } else {
      await upsertBudget(props.groupId, { companyId: editBrand.value, month: props.month, category, amountCents: value })
    }
    editing.value = null
    await invalidate()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível salvar o orçamento.'))
  } finally {
    saving.value = false
  }
}

// ── Copiar do mês anterior ──
const copying = ref(false)
const previousMonth = computed(() => addMonths(props.month, -1))
const previousRows = computed(() =>
  (budgets.data.value ?? []).filter((b) => b.month === previousMonth.value && b.companyId === editBrand.value),
)
const currentHasBudget = computed(() =>
  (budgets.data.value ?? []).some((b) => b.month === props.month && b.companyId === editBrand.value),
)

async function copyPrevious() {
  if (!editBrand.value || copying.value) return
  copying.value = true
  try {
    for (const b of previousRows.value) {
      await upsertBudget(props.groupId, {
        companyId: editBrand.value,
        month: props.month,
        category: b.category,
        amountCents: b.amountCents,
      })
    }
    toast.success(`Orçamento de ${monthLabel(previousMonth.value)} copiado.`)
    await invalidate()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível copiar o orçamento.'))
  } finally {
    copying.value = false
  }
}

function barStyle(line: SummaryLine) {
  const base = Math.max(line.budgetCents ?? 0, line.spentCents, 1)
  return {
    paid: { width: `${(line.paidCents / base) * 100}%` },
    planned: { width: `${(line.plannedCents / base) * 100}%` },
  }
}

const sourceHint = computed(() => {
  const s = total.value?.budgetSource
  if (s === 'categories') return 'Sem orçamento total do mês: o total é a soma das categorias.'
  if (s === 'mixed') return 'Total somado marca a marca (orçamento total de uma, soma das categorias de outra).'
  return ''
})
</script>

<template>
  <div class="fb">
    <div class="fb-head">
      <p class="mk-hint fb-help">
        Saldo = orçado menos pago e previsto. Vermelho é estouro.
        <template v-if="canAdmin && !editBrand"> Para editar o orçamento, escolha uma marca no filtro acima.</template>
        <template v-else-if="editable"> Clique no valor orçado para editar; vazio tira o orçamento.</template>
      </p>
      <button
        v-if="editable && previousRows.length && !currentHasBudget"
        type="button"
        class="mk-btn"
        :disabled="copying"
        @click="copyPrevious"
      >
        <Copy :size="14" aria-hidden="true" /> Copiar de {{ monthShort(previousMonth) }}
      </button>
    </div>

    <div v-if="loading && !summary" class="fb-loading">
      <Skeleton type="row" />
      <Skeleton type="row" />
    </div>

    <div v-else-if="loadError" class="mk-load-error" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="mk-btn" @click="retry">Tentar de novo</button>
    </div>

    <div v-else class="fin-scroll">
      <table class="mk-table fin-table fb-table">
        <thead>
          <tr>
            <th>Categoria</th>
            <th class="mk-num fb-money">Orçado</th>
            <th class="mk-num fb-money">Pago</th>
            <th class="mk-num fb-money">Previsto</th>
            <th class="fb-bar-col">Uso</th>
            <th class="mk-num fb-money">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lines" :key="l.category" :class="{ 'is-over': l.over }">
            <td class="fb-cat">
              {{ l.category }}
              <span v-if="l.count" class="fin-muted fb-count">{{ l.count }}</span>
            </td>
            <td class="mk-num fb-money">
              <MoneyInput
                v-if="editing === l.category"
                :ref="setCell"
                v-model="draft"
                bare
                :label="`Orçado de ${l.category}`"
                :disabled="saving"
                @enter="commit"
                @escape="cancel"
                @blur="commit"
              />
              <button
                v-else-if="editable"
                type="button"
                class="fb-cell"
                :aria-label="`Editar orçado de ${l.category}`"
                @click="startEdit(l.category, l.budgetCents)"
              >
                <span :class="{ 'fin-muted': l.budgetCents === null }">{{ l.budgetCents === null ? 'Definir' : formatCents(l.budgetCents) }}</span>
                <Pencil :size="12" class="fb-pencil" aria-hidden="true" />
              </button>
              <span v-else :class="{ 'fin-muted': l.budgetCents === null }">{{ l.budgetCents === null ? '-' : formatCents(l.budgetCents) }}</span>
            </td>
            <td class="mk-num fb-money">{{ formatCents(l.paidCents) }}</td>
            <td class="mk-num fb-money" :class="{ 'fin-muted': !l.plannedCents }">{{ formatCents(l.plannedCents) }}</td>
            <td class="fb-bar-col">
              <div
                v-if="l.budgetCents !== null || l.spentCents"
                class="fin-bar"
                :class="{ 'is-over': l.over }"
                role="img"
                :aria-label="l.budgetCents === null ? 'Sem orçamento' : `${usePercent(l.spentCents, l.budgetCents)}% do orçado`"
                :title="l.budgetCents === null ? 'Sem orçamento' : `${usePercent(l.spentCents, l.budgetCents)}% do orçado`"
              >
                <span class="fin-bar__paid" :style="barStyle(l).paid" />
                <span class="fin-bar__planned" :style="barStyle(l).planned" />
              </div>
            </td>
            <td class="mk-num fb-money" :class="{ 'fin-neg': l.over, 'fin-muted': l.diffCents === null }">
              {{ l.diffCents === null ? '-' : formatCents(l.diffCents) }}
            </td>
          </tr>
        </tbody>
        <tfoot v-if="total">
          <tr :class="{ 'is-over': total.over }">
            <td>Total do mês</td>
            <td class="mk-num fb-money">
              <MoneyInput
                v-if="editing === ''"
                :ref="setCell"
                v-model="draft"
                bare
                label="Orçamento total do mês"
                :disabled="saving"
                @enter="commit"
                @escape="cancel"
                @blur="commit"
              />
              <button
                v-else-if="editable"
                type="button"
                class="fb-cell"
                aria-label="Editar orçamento total do mês"
                :title="sourceHint || 'Orçamento total do mês'"
                @click="startEdit('', budgetRow('')?.amountCents ?? null)"
              >
                <span :class="{ 'fin-muted': total.budgetCents === null }">{{ total.budgetCents === null ? 'Definir' : formatCents(total.budgetCents) }}</span>
                <Pencil :size="12" class="fb-pencil" aria-hidden="true" />
              </button>
              <span v-else>{{ total.budgetCents === null ? '-' : formatCents(total.budgetCents) }}</span>
            </td>
            <td class="mk-num fb-money">{{ formatCents(total.paidCents) }}</td>
            <td class="mk-num fb-money">{{ formatCents(total.plannedCents) }}</td>
            <td class="fb-bar-col">
              <div v-if="total.budgetCents !== null || total.spentCents" class="fin-bar" :class="{ 'is-over': total.over }">
                <span class="fin-bar__paid" :style="barStyle(total).paid" />
                <span class="fin-bar__planned" :style="barStyle(total).planned" />
              </div>
            </td>
            <td class="mk-num fb-money" :class="{ 'fin-neg': total.over }">
              {{ total.diffCents === null ? '-' : formatCents(total.diffCents) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-if="sourceHint" class="mk-hint">{{ sourceHint }}</p>
  </div>
</template>

<style scoped>
.fb {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.fb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fb-help {
  flex: 1;
  min-width: 220px;
  margin: 0;
}

.fb-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fb-table {
  min-width: 720px;
}

.fb-cat {
  font-weight: 600;
  white-space: nowrap;
}

.fb-count {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 500;
}

.fb-money {
  width: 128px;
}

.fb-bar-col {
  width: 160px;
}

.fb-cell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: text;
}

.fb-cell:hover,
.fb-cell:focus-visible {
  border-color: var(--border);
  background: var(--surface);
}

.fb-cell:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.fb-pencil {
  color: var(--text-4);
}

.fb-cell:hover .fb-pencil {
  color: var(--text-2);
}

tr.is-over .fb-cat {
  color: var(--err);
}

@media (max-width: 640px) {
  .fb-cell {
    min-height: 40px;
  }
}
</style>
