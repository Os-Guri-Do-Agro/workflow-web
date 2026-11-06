<script setup lang="ts">
import { ref, watch } from 'vue'
import { Loader2, Printer, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { PrintCard } from '@/service/marketing/marketing-print'
import { usePrintMutations } from './usePrint'

/** Nova peça impressa: marca e título; o resto (arquivo, especificação) é feito depois, no painel. */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  brands: MarketingBrand[]
  defaultBrandId: string | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [card: PrintCard]
}>()

const mut = usePrintMutations(() => props.groupId)
const companyId = ref('')
const title = ref('')
const error = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    companyId.value = props.defaultBrandId ?? props.brands[0]?.companyId ?? ''
    title.value = ''
    error.value = ''
  },
  { immediate: true },
)

async function submit() {
  error.value = ''
  if (!title.value.trim()) {
    error.value = 'Dê um nome para a peça (ex.: Placa de balcão).'
    return
  }
  try {
    const card = await mut.create.mutateAsync({ companyId: companyId.value, title: title.value.trim() })
    emit('created', card)
    emit('update:modelValue', false)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Não foi possível criar a peça.')
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Nova peça impressa"
    size="sm"
    :loading="mut.create.isPending.value"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="pn" @submit.prevent="submit">
      <header class="pn-head">
        <span class="pn-icon"><Printer :size="16" /></span>
        <h2>Nova peça impressa</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" @click="emit('update:modelValue', false)"><X :size="16" /></button>
      </header>
      <label v-if="brands.length > 1" class="mk-field">
        <span class="mk-label">Marca</span>
        <select v-model="companyId" class="mk-select" data-testid="print-brand">
          <option v-for="b in brands" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
        </select>
      </label>
      <label class="mk-field">
        <span class="mk-label">Nome da peça</span>
        <input v-model="title" class="mk-input" maxlength="200" autocomplete="off" placeholder="Placa de balcão" data-testid="print-title" />
      </label>
      <p class="mk-hint">A peça nasce Em produção. Suba a arte no card e peça a aprovação; depois ela segue para a gráfica aqui.</p>
      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      <footer class="pn-foot">
        <button type="button" class="mk-btn mk-btn--ghost" @click="emit('update:modelValue', false)">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="mut.create.isPending.value">
          <Loader2 v-if="mut.create.isPending.value" :size="14" class="pn-spin" />Criar peça
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.pn {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 18px;
}

.pn-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pn-head h2 {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.pn-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.pn-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pn-spin {
  animation: pn-spin 0.9s linear infinite;
}

@keyframes pn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pn-spin {
    animation: none;
  }
}
</style>
