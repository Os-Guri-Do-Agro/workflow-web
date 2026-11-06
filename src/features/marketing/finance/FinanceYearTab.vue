<script setup lang="ts">
import { computed, ref } from 'vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { getApiErrorMessage } from '@/service/api'
import type { YearCell } from '@/service/marketing/marketing-finance'
import { centsPlain, currentYm, MONTH_SHORT } from './finance-format'
import { useFinanceYear } from './useFinance'

/**
 * Aba Ano: 12 meses x categorias, total por linha e por coluna. Um valor por
 * vez (pago, previsto, pago + previsto ou orçado) para a matriz continuar
 * legível; clicar no mês abre os lançamentos dele.
 */
const props = defineProps<{
  groupId: string
  year: number
  brandFilter: string | null
}>()

const emit = defineEmits<{ openMonth: [month: string] }>()

type Measure = 'spent' | 'paid' | 'planned' | 'budget'
const measure = ref<Measure>('spent')
const MEASURES: Array<{ key: Measure; label: string }> = [
  { key: 'spent', label: 'Pago + previsto' },
  { key: 'paid', label: 'Pago' },
  { key: 'planned', label: 'Previsto' },
  { key: 'budget', label: 'Orçado' },
]

const query = useFinanceYear(() => props.groupId, () => props.year, () => props.brandFilter, () => true)
const data = computed(() => query.data.value)
const nowMonth = currentYm()

function pick(cell: YearCell): number | null {
  if (measure.value === 'paid') return cell.paidCents
  if (measure.value === 'planned') return cell.plannedCents
  if (measure.value === 'budget') return cell.budgetCents
  return cell.paidCents + cell.plannedCents
}

/** Todas as categorias da lista aparecem, como numa planilha (vazio vira "-"). */
const rows = computed(() => data.value?.rows ?? [])

function over(cell: YearCell): boolean {
  return cell.budgetCents !== null && cell.paidCents + cell.plannedCents > cell.budgetCents
}
</script>

<template>
  <div class="fy">
    <div class="fy-head">
      <div class="fin-seg" role="group" aria-label="Valor mostrado">
        <button
          v-for="m in MEASURES"
          :key="m.key"
          type="button"
          :class="{ 'is-active': measure === m.key }"
          :aria-pressed="measure === m.key"
          @click="measure = m.key"
        >
          {{ m.label }}
        </button>
      </div>
      <span class="mk-hint">Valores em R$. Vermelho: mês da categoria passou do orçado.</span>
    </div>

    <div v-if="query.isLoading.value && !data" class="fy-loading">
      <Skeleton type="row" />
      <Skeleton type="row" />
    </div>

    <!-- Falha de rede: aviso com "Tentar de novo" (antes a aba ficava em branco) -->
    <div v-else-if="query.isError.value && !data" class="mk-load-error" role="alert">
      <p>{{ getApiErrorMessage(query.error.value, `Não foi possível carregar ${year}.`) }}</p>
      <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
    </div>

    <div v-else-if="data" class="fin-scroll">
      <table class="mk-table fin-table fy-table">
        <thead>
          <tr>
            <th class="fy-cat">Categoria</th>
            <th v-for="(m, i) in data.months" :key="m" class="mk-num" :class="{ 'is-now': m === nowMonth }">
              <button type="button" class="fy-month" :title="`Abrir os lançamentos de ${MONTH_SHORT[i]}`" @click="emit('openMonth', m)">
                {{ MONTH_SHORT[i] }}
              </button>
            </th>
            <th class="mk-num fy-total">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.category">
            <td class="fy-cat">{{ r.category }}</td>
            <td
              v-for="(c, i) in r.months"
              :key="i"
              class="mk-num"
              :class="{
                'is-now': data.months[i] === nowMonth,
                'fin-muted': !pick(c),
                'fin-neg': measure !== 'budget' && over(c),
              }"
            >
              {{ pick(c) ? centsPlain(pick(c)) : '-' }}
            </td>
            <td class="mk-num fy-total" :class="{ 'fin-muted': !pick(r.total) }">
              {{ pick(r.total) ? centsPlain(pick(r.total)) : '-' }}
            </td>
          </tr>
          <tr v-if="!rows.length" class="fin-empty-row">
            <td :colspan="14">Nada em {{ year }}.</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="fy-cat">Total</td>
            <td
              v-for="(c, i) in data.totals"
              :key="i"
              class="mk-num"
              :class="{ 'is-now': data.months[i] === nowMonth, 'fin-neg': measure !== 'budget' && over(c) }"
            >
              {{ pick(c) ? centsPlain(pick(c)) : '-' }}
            </td>
            <td class="mk-num fy-total">{{ centsPlain(pick(data.total) ?? 0) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.fy {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.fy-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.fy-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fy-table {
  min-width: 1060px;
  font-size: 12.5px;
}

.fy-table td,
.fy-table th {
  padding: 6px 7px;
}

.fy-cat {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 150px;
  max-width: 200px;
  overflow: hidden;
  background: var(--surface);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
  box-shadow: 1px 0 0 var(--border);
}

thead .fy-cat {
  z-index: 2;
}

tfoot .fy-cat {
  background: var(--surface-2);
}

/* Total sempre à vista, preso à direita quando a matriz rola */
.fy-total {
  position: sticky;
  right: 0;
  z-index: 1;
  background: var(--surface);
  font-weight: 700;
  box-shadow: -1px 0 0 var(--border);
}

thead .fy-total {
  z-index: 2;
}

tfoot .fy-total {
  background: var(--surface-2);
}

.is-now {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.fy-month {
  padding: 2px 4px;
  border: 0;
  border-radius: var(--radius-xs);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.fy-month:hover {
  background: var(--surface-3);
  color: var(--text);
}

.fy-month:focus-visible {
  outline: 2px solid var(--accent);
}

@media (max-width: 640px) {
  .fy-month {
    min-height: 36px;
  }
}
</style>
