<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Repeat, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import {
  createRecurring,
  updateRecurring,
  type RecurringInput,
  type RecurringRule,
} from '@/service/marketing/marketing-finance'
import { asText, selectItems } from '../select-items'
import MoneyInput from './MoneyInput.vue'

/** Regra mensal: assinatura, agência, mensalidade de ferramenta. */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  rule: RecurringRule | null
  brands: MarketingBrand[]
  defaultBrand: string | null
  categories: string[]
  month: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const toast = useToast()

const form = reactive({
  companyId: '',
  description: '',
  amountCents: null as number | null,
  category: '',
  supplier: '',
  dayOfMonth: 5,
  startMonth: '',
  endMonth: '',
  active: true,
})
const error = ref('')
const saving = ref(false)
const brandItems = computed(() => selectItems(props.brands, (b) => b.companyId, (b) => b.name))
const categoryItems = computed(() => selectItems(props.categories, (c) => c, (c) => c))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const r = props.rule
    form.companyId = r?.companyId ?? props.defaultBrand ?? props.brands[0]?.companyId ?? ''
    form.description = r?.description ?? ''
    form.amountCents = r?.amountCents ?? null
    form.category = r?.category ?? props.categories[0] ?? ''
    form.supplier = r?.supplier ?? ''
    form.dayOfMonth = r?.dayOfMonth ?? 5
    form.startMonth = r?.startMonth ?? props.month
    form.endMonth = r?.endMonth ?? ''
    form.active = r?.active ?? true
    error.value = ''
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  error.value = ''
  if (!form.description.trim()) return void (error.value = 'Descreva a regra.')
  if (!form.amountCents || form.amountCents <= 0) return void (error.value = 'Informe um valor maior que zero.')
  const day = Number(form.dayOfMonth)
  if (!Number.isInteger(day) || day < 1 || day > 31) return void (error.value = 'Dia do mês: de 1 a 31.')
  if (!form.startMonth) return void (error.value = 'Escolha o primeiro mês.')
  if (form.endMonth && form.endMonth < form.startMonth) return void (error.value = 'O último mês não pode ser antes do primeiro.')
  const input: RecurringInput = {
    companyId: form.companyId,
    description: form.description.trim(),
    amountCents: form.amountCents,
    category: form.category,
    supplier: form.supplier.trim() || null,
    dayOfMonth: day,
    startMonth: form.startMonth,
    endMonth: form.endMonth || null,
    active: form.active,
  }
  saving.value = true
  try {
    if (props.rule) await updateRecurring(props.groupId, props.rule.id, input)
    else await createRecurring(props.groupId, input)
    toast.success(props.rule ? 'Regra atualizada.' : 'Regra criada.')
    emit('saved')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Não foi possível salvar a regra.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog :model-value="modelValue" :label="rule ? 'Editar recorrente' : 'Novo recorrente'" size="md" :loading="saving" persistent @update:model-value="close">
    <header class="fr-head">
      <Repeat :size="18" aria-hidden="true" />
      <h2>{{ rule ? 'Editar recorrente' : 'Novo recorrente' }}</h2>
      <button type="button" class="mk-icon-btn fr-close" aria-label="Fechar" @click="close"><X :size="16" /></button>
    </header>
    <form class="fr-body" novalidate @submit.prevent="save">
      <div class="fr-grid">
        <div v-if="brands.length > 1" class="mk-field fr-span">
          <span class="mk-label">Marca</span>
          <AppSelect :model-value="form.companyId" :items="brandItems" label="Marca" density="compact" @update:model-value="form.companyId = asText($event)" />
        </div>
        <label class="mk-field fr-span">
          <span class="mk-label">Descrição</span>
          <input v-model="form.description" class="mk-input" maxlength="200" placeholder="Ex.: Canva Pro" required />
        </label>
        <div class="mk-field">
          <label class="mk-label" for="fr-amount">Valor por mês</label>
          <MoneyInput id="fr-amount" v-model="form.amountCents" />
        </div>
        <div class="mk-field">
          <span class="mk-label">Categoria</span>
          <AppSelect :model-value="form.category" :items="categoryItems" label="Categoria" density="compact" @update:model-value="form.category = asText($event)" />
        </div>
        <label class="mk-field">
          <span class="mk-label">Fornecedor</span>
          <input v-model="form.supplier" class="mk-input" maxlength="120" />
        </label>
        <label class="mk-field">
          <span class="mk-label">Dia do mês</span>
          <input v-model.number="form.dayOfMonth" type="number" min="1" max="31" class="mk-input mk-num" />
        </label>
        <label class="mk-field">
          <span class="mk-label">Primeiro mês</span>
          <input v-model="form.startMonth" type="month" class="mk-input" required />
        </label>
        <label class="mk-field">
          <span class="mk-label">Último mês (opcional)</span>
          <input v-model="form.endMonth" type="month" class="mk-input" />
        </label>
        <label class="fr-check fr-span">
          <input v-model="form.active" type="checkbox" />
          Ativa (desligada, a regra para de lançar)
        </label>
      </div>
      <p class="mk-hint">Mês mais curto usa o último dia: dia 31 em fevereiro cai no dia 28 (ou 29).</p>
      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      <footer class="fr-foot">
        <button type="button" class="mk-btn mk-btn--ghost" @click="close">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="saving">{{ saving ? 'Salvando...' : 'Salvar' }}</button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.fr-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
}

.fr-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
}

.fr-close {
  margin-left: auto;
}

.fr-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  overflow-y: auto;
}

.fr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.fr-span {
  grid-column: 1 / -1;
}

.fr-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  color: var(--text-2);
  font-size: 13px;
}

.fr-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 640px) {
  .fr-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .fr-check {
    min-height: 44px;
  }
}
</style>
