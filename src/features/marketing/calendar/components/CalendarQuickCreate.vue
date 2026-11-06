<script setup lang="ts">
/**
 * Criação rápida pelo calendário (clicar no dia): título, marca (se houver
 * mais de uma), tipo, data e hora (padrão 10:00, Brasília) e as redes. O card
 * nasce em Ideia pela mesma fábrica do `POST /cards`; o resto (responsável,
 * prazo, legenda) se completa na página do card.
 */
import { computed, reactive, ref, watch } from 'vue'
import { CalendarPlus, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { QuickCreateInput } from '@/service/marketing/marketing-calendar-api'
import {
  CARD_KIND_LABEL,
  CARD_NETWORK_LABEL,
  brandTone,
  toneStyle,
  type CardKind,
  type CardNetwork,
} from '../../marketing-labels'
import { formatLongDay, isYmd, spDateTimeToIso } from '../calendar-time'

const props = defineProps<{
  modelValue: boolean
  day: string
  time: string
  brands: MarketingBrand[]
  defaultBrand: string | null
  submit: (input: QuickCreateInput) => Promise<unknown>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const KINDS = (Object.keys(CARD_KIND_LABEL) as CardKind[]).filter((k) => k !== 'PRINT')
const NETWORKS = Object.keys(CARD_NETWORK_LABEL) as CardNetwork[]

const form = reactive({
  title: '',
  companyId: '',
  kind: 'POST' as CardKind,
  day: '',
  time: '10:00',
  networks: [] as CardNetwork[],
})
const saving = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.title = ''
    form.companyId = props.defaultBrand ?? props.brands[0]?.companyId ?? ''
    form.kind = 'POST'
    form.day = props.day
    form.time = props.time || '10:00'
    form.networks = []
    error.value = null
  },
  { immediate: true },
)

const valid = computed(
  () => !!form.title.trim() && !!form.companyId && isYmd(form.day) && /^\d{2}:\d{2}$/.test(form.time),
)

function toggleNetwork(n: CardNetwork) {
  form.networks = form.networks.includes(n) ? form.networks.filter((x) => x !== n) : [...form.networks, n]
}

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function onSubmit() {
  if (!valid.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    await props.submit({
      companyId: form.companyId,
      title: form.title.trim(),
      kind: form.kind,
      publishAt: spDateTimeToIso(form.day, form.time),
      networks: form.networks,
    })
    saving.value = false
    emit('update:modelValue', false)
  } catch (err) {
    const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
    error.value = typeof message === 'string' ? message : 'Não deu para criar o card. Tente de novo.'
    saving.value = false
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Novo card no calendário"
    size="md"
    :loading="saving"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="qc" @submit.prevent="onSubmit">
      <header class="qc__head">
        <CalendarPlus :size="17" aria-hidden="true" />
        <div class="qc__title">
          <h2>Novo card</h2>
          <p v-if="isYmd(form.day)">{{ formatLongDay(form.day) }}</p>
        </div>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="qc__body">
        <label class="mk-field">
          <span class="mk-label">Título</span>
          <input
            v-model="form.title"
            class="mk-input"
            maxlength="200"
            placeholder="Ex.: Reel de dicas de banho"
            autofocus
            data-field="title"
          />
        </label>

        <div class="qc__row">
          <label v-if="brands.length > 1" class="mk-field">
            <span class="mk-label">Marca</span>
            <select v-model="form.companyId" class="mk-select" data-field="brand">
              <option v-for="b in brands" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
            </select>
          </label>
          <label class="mk-field">
            <span class="mk-label">Tipo</span>
            <select v-model="form.kind" class="mk-select" data-field="kind">
              <option v-for="k in KINDS" :key="k" :value="k">{{ CARD_KIND_LABEL[k] }}</option>
            </select>
          </label>
        </div>

        <div class="qc__row">
          <label class="mk-field">
            <span class="mk-label">Data</span>
            <input v-model="form.day" type="date" class="mk-input" required data-field="day" />
          </label>
          <label class="mk-field">
            <span class="mk-label">Hora (Brasília)</span>
            <input v-model="form.time" type="time" class="mk-input" required step="300" data-field="time" />
          </label>
        </div>

        <fieldset class="qc__nets">
          <legend class="mk-label">Redes <span class="qc__opt">(opcional)</span></legend>
          <div class="qc__chips">
            <button
              v-for="n in NETWORKS"
              :key="n"
              type="button"
              class="qc__chip"
              :class="{ 'is-on': form.networks.includes(n) }"
              :aria-pressed="form.networks.includes(n)"
              @click="toggleNetwork(n)"
            >
              {{ CARD_NETWORK_LABEL[n] }}
            </button>
          </div>
        </fieldset>

        <p v-if="brands.length === 1" class="mk-hint">
          <span class="mk-dot" :style="toneStyle(brandTone(brands[0]))" aria-hidden="true" />
          {{ brands[0]!.name }}
        </p>
        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>

      <footer class="qc__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="!valid || saving" data-action="create">
          <Loader2 v-if="saving" :size="14" class="qc__spin" aria-hidden="true" />
          Criar card
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.qc {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.qc__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 10px 18px;
  color: var(--accent-ink);
}

.qc__title {
  flex: 1;
  min-width: 0;
  color: var(--text);
}

.qc__title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.qc__title p {
  margin: 1px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.qc__body {
  display: grid;
  gap: 12px;
  padding: 4px 18px 14px;
  overflow-y: auto;
}

.qc__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.qc__nets {
  margin: 0;
  padding: 0;
  border: 0;
}

.qc__opt {
  color: var(--text-3);
  font-weight: 500;
}

.qc__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.qc__chip {
  min-height: 28px;
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.qc__chip:hover {
  border-color: var(--border-strong);
}

.qc__chip.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.qc__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.qc .mk-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.qc .mk-error {
  margin: 0;
}

.qc__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}

.qc__spin {
  animation: qc-spin 0.8s linear infinite;
}

@keyframes qc-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .qc__chip {
    min-height: 40px;
  }
}
</style>
