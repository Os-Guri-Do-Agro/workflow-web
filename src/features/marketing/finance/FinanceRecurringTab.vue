<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import { deleteRecurring, type RecurringRule } from '@/service/marketing/marketing-finance'
import { brandTone, formatCents, toneStyle } from '../marketing-labels'
import FinanceRecurringDialog from './FinanceRecurringDialog.vue'
import { dayBr, monthShort } from './finance-format'
import { useFinanceInvalidate, useFinanceRecurring } from './useFinance'

/**
 * Aba Recorrentes: as regras mensais e a situação de cada uma no mês aberto.
 * O aviso de pendentes e o botão Lançar ficam no topo da tela (valem para as
 * outras abas também).
 */
const props = defineProps<{
  groupId: string
  month: string
  brandFilter: string | null
  brands: MarketingBrand[]
  categories: string[]
  canEdit: boolean
  canAdmin: boolean
}>()

const toast = useToast()
const invalidate = useFinanceInvalidate(() => props.groupId)
const query = useFinanceRecurring(() => props.groupId, () => props.month, () => true)
const rules = computed(() =>
  (query.data.value?.items ?? []).filter((r) => !props.brandFilter || r.companyId === props.brandFilter),
)
const multiBrand = computed(() => props.brands.length > 1 && !props.brandFilter)
const brandOf = (id: string) => props.brands.find((b) => b.companyId === id)

const dialog = ref(false)
const editing = ref<RecurringRule | null>(null)
const toDelete = ref<RecurringRule | null>(null)
const deleting = ref(false)

function openNew() {
  editing.value = null
  dialog.value = true
}
function openEdit(rule: RecurringRule) {
  editing.value = rule
  dialog.value = true
}

async function doDelete() {
  if (!toDelete.value) return
  deleting.value = true
  try {
    await deleteRecurring(props.groupId, toDelete.value.id)
    toast.success('Regra apagada. Os lançamentos já feitos ficam.')
    toDelete.value = null
    await invalidate()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível apagar a regra.'))
  } finally {
    deleting.value = false
  }
}

function period(r: RecurringRule) {
  return r.endMonth ? `${monthShort(r.startMonth)} a ${monthShort(r.endMonth)}` : `desde ${monthShort(r.startMonth)}`
}

const STATE: Record<string, { label: string; tone: string }> = {
  LAUNCHED: { label: 'Lançado', tone: 'green' },
  PENDING: { label: 'Pendente', tone: 'amber' },
  OUT: { label: 'Fora do período', tone: 'slate' },
}
function stateOf(r: RecurringRule) {
  if (!r.active) return { label: 'Desligada', tone: 'slate' }
  return STATE[r.monthState] ?? STATE.OUT!
}
</script>

<template>
  <div class="frt">
    <div class="frt-head">
      <p class="mk-hint frt-help">
        Regras mensais (assinatura, agência, ferramenta). Nada é lançado sozinho: o aviso no topo mostra o que falta e o botão Lançar cria os lançamentos do mês.
      </p>
      <button v-if="canEdit" type="button" class="mk-btn" @click="openNew">
        <Plus :size="15" aria-hidden="true" /> Nova regra
      </button>
    </div>

    <div v-if="query.isLoading.value && !query.data.value" class="frt-loading">
      <Skeleton type="row" />
      <Skeleton type="row" />
    </div>

    <!-- Falha de rede não é "nenhuma regra" -->
    <div v-else-if="query.isError.value && !query.data.value" class="mk-load-error" role="alert">
      <p>{{ getApiErrorMessage(query.error.value, 'Não foi possível carregar as regras recorrentes.') }}</p>
      <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
    </div>

    <EmptyState
      v-else-if="!rules.length"
      :icon="Repeat"
      title="Nenhuma regra recorrente"
      :description="canEdit ? 'Crie uma regra para o gasto que se repete todo mês.' : 'Quando alguém criar uma regra, ela aparece aqui.'"
    />

    <div v-else class="fin-scroll">
      <table class="mk-table fin-table frt-table">
        <thead>
          <tr>
            <th>Descrição</th>
            <th v-if="multiBrand">Marca</th>
            <th>Categoria</th>
            <th class="mk-num">Dia</th>
            <th>Período</th>
            <th class="mk-num">Valor</th>
            <th>Neste mês</th>
            <th v-if="canEdit" class="frt-actions"><span class="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rules" :key="r.id" :class="{ 'is-off': !r.active }">
            <td>
              <span class="frt-desc">{{ r.description }}</span>
              <span v-if="r.supplier" class="fin-sub">{{ r.supplier }}</span>
            </td>
            <td v-if="multiBrand">
              <span class="frt-brand"><span class="mk-dot" :style="toneStyle(brandTone(brandOf(r.companyId)))" />{{ brandOf(r.companyId)?.name }}</span>
            </td>
            <td class="frt-muted">{{ r.category }}</td>
            <td class="mk-num">{{ r.dayOfMonth }}</td>
            <td class="frt-muted">{{ period(r) }}</td>
            <td class="mk-num frt-value">{{ formatCents(r.amountCents) }}</td>
            <td>
              <span class="mk-chip" data-tone :style="toneStyle(stateOf(r).tone)">{{ stateOf(r).label }}</span>
              <span v-if="r.active && r.monthState !== 'OUT'" class="fin-muted frt-date">{{ dayBr(r.monthDate) }}</span>
            </td>
            <td v-if="canEdit" class="frt-actions">
              <button type="button" class="mk-icon-btn" :aria-label="`Editar ${r.description}`" @click="openEdit(r)">
                <Pencil :size="15" />
              </button>
              <button
                v-if="canAdmin"
                type="button"
                class="mk-icon-btn"
                :aria-label="`Apagar ${r.description}`"
                @click="toDelete = r"
              >
                <Trash2 :size="15" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <FinanceRecurringDialog
      v-model="dialog"
      :group-id="groupId"
      :rule="editing"
      :brands="brands"
      :default-brand="brandFilter"
      :categories="categories"
      :month="month"
      @saved="invalidate"
    />
    <ConfirmDialog
      :model-value="!!toDelete"
      title="Apagar a regra?"
      :message="`${toDelete?.description ?? ''} para de lançar. Os lançamentos já feitos continuam no financeiro.`"
      confirm-label="Apagar"
      danger
      :loading="deleting"
      @update:model-value="(v: boolean) => !v && (toDelete = null)"
      @confirm="doDelete"
    />
  </div>
</template>

<style scoped>
.frt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.frt-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.frt-help {
  flex: 1;
  min-width: 220px;
  margin: 0;
}

.frt-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.frt-table {
  min-width: 720px;
}

.frt-desc {
  font-weight: 600;
}

.frt-muted {
  color: var(--text-2);
}

.frt-value {
  font-weight: 600;
}

.frt-date {
  margin-left: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.frt-brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.frt-actions {
  width: 76px;
  white-space: nowrap;
  text-align: right;
}

tr.is-off td {
  color: var(--text-3);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
