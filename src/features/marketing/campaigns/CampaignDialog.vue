<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { CampaignInput, MarketingCampaign } from '@/service/marketing/marketing-campaigns'
import { parseMoneyToCents } from '../marketing-labels'
import { asText, selectItems } from '../select-items'
import { CHANNEL_SUGGESTIONS, centsToInput } from './campaign-labels'

/**
 * Criar e editar campanha. A marca só se escolhe ao criar: cards, UTMs e
 * lançamentos ligados já pertencem a ela.
 */
const props = defineProps<{
  modelValue: boolean
  campaign: MarketingCampaign | null
  brands: MarketingBrand[]
  defaultBrandId?: string | null
  saving?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [input: CampaignInput]
}>()

const companyId = ref('')
const name = ref('')
const objective = ref('')
const startDate = ref('')
const endDate = ref('')
const budget = ref('')
const daily = ref('')
const audience = ref('')
const channels = ref<string[]>([])
const channelDraft = ref('')
const submitted = ref(false)

const brandItems = computed(() => selectItems(props.brands, (b) => b.companyId, (b) => b.name))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    submitted.value = false
    channelDraft.value = ''
    const c = props.campaign
    companyId.value = c?.companyId ?? props.defaultBrandId ?? (props.brands.length === 1 ? props.brands[0]!.companyId : '')
    name.value = c?.name ?? ''
    objective.value = c?.objective ?? ''
    startDate.value = c?.startDate ?? ''
    endDate.value = c?.endDate ?? ''
    budget.value = centsToInput(c?.budgetCents)
    daily.value = centsToInput(c?.dailyBudgetCents)
    audience.value = c?.audience ?? ''
    channels.value = [...(c?.channels ?? [])]
  },
  { immediate: true },
)

const errors = computed(() => {
  const out: Record<string, string> = {}
  if (!submitted.value) return out
  if (!companyId.value) out.companyId = 'Escolha a marca.'
  if (!name.value.trim()) out.name = 'Dê um nome para a campanha.'
  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    out.endDate = 'O fim não pode ser antes do início.'
  }
  if (budget.value.trim() && parseMoneyToCents(budget.value) === null) out.budget = 'Valor inválido.'
  if (daily.value.trim() && parseMoneyToCents(daily.value) === null) out.daily = 'Valor inválido.'
  return out
})

const suggestions = computed(() => {
  const extra = channels.value.filter((c) => !CHANNEL_SUGGESTIONS.includes(c))
  return [...CHANNEL_SUGGESTIONS, ...extra]
})

function toggleChannel(channel: string) {
  channels.value = channels.value.includes(channel)
    ? channels.value.filter((c) => c !== channel)
    : [...channels.value, channel]
}

function addChannel() {
  const text = channelDraft.value.trim().slice(0, 40)
  channelDraft.value = ''
  if (text && !channels.value.some((c) => c.toLowerCase() === text.toLowerCase())) {
    channels.value = [...channels.value, text]
  }
}

function money(text: string): number | null {
  return text.trim() ? parseMoneyToCents(text) : null
}

function submit() {
  submitted.value = true
  if (Object.keys(errors.value).length || props.saving) return
  emit('save', {
    companyId: companyId.value,
    name: name.value.trim(),
    objective: objective.value.trim() || null,
    startDate: startDate.value || null,
    endDate: endDate.value || null,
    budgetCents: money(budget.value),
    dailyBudgetCents: money(daily.value),
    audience: audience.value.trim() || null,
    channels: channels.value,
  })
}

const heading = computed(() => (props.campaign ? 'Editar campanha' : 'Nova campanha'))
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="heading"
    size="lg"
    :loading="saving"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="cd" novalidate @submit.prevent="submit">
      <header class="cd__head">
        <h2>{{ heading }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </header>

      <div class="cd__body">
        <div class="cd__row cd__row--brand">
          <label class="mk-field">
            <span class="mk-label">Nome</span>
            <input
              v-model="name"
              class="mk-input"
              maxlength="200"
              autocomplete="off"
              autofocus
              :aria-invalid="!!errors.name"
              placeholder="Ex.: Dia dos Pets 2026"
            />
            <span v-if="errors.name" class="mk-error" role="alert">{{ errors.name }}</span>
          </label>
          <div class="mk-field" :class="{ 'mk-select-invalid': !!errors.companyId }" data-field="brand">
            <span class="mk-label">Marca</span>
            <AppSelect
              :model-value="companyId"
              :items="brandItems"
              label="Marca"
              placeholder="Escolha"
              density="compact"
              :disabled="!!campaign"
              @update:model-value="companyId = asText($event)"
            />
            <span v-if="errors.companyId" class="mk-error" role="alert">{{ errors.companyId }}</span>
            <span v-else-if="campaign" class="mk-hint">A marca não muda depois de criada.</span>
          </div>
        </div>

        <label class="mk-field">
          <span class="mk-label">Objetivo</span>
          <textarea
            v-model="objective"
            class="mk-textarea"
            rows="2"
            maxlength="5000"
            placeholder="O que a campanha precisa conseguir"
          />
        </label>

        <div class="cd__row">
          <label class="mk-field">
            <span class="mk-label">Início</span>
            <input v-model="startDate" type="date" class="mk-input" />
          </label>
          <label class="mk-field">
            <span class="mk-label">Fim</span>
            <input v-model="endDate" type="date" class="mk-input" :min="startDate || undefined" :aria-invalid="!!errors.endDate" />
            <span v-if="errors.endDate" class="mk-error" role="alert">{{ errors.endDate }}</span>
          </label>
        </div>

        <div class="cd__row">
          <label class="mk-field">
            <span class="mk-label">Orçamento total (R$)</span>
            <input v-model="budget" class="mk-input" inputmode="decimal" autocomplete="off" placeholder="0,00" :aria-invalid="!!errors.budget" />
            <span v-if="errors.budget" class="mk-error" role="alert">{{ errors.budget }}</span>
          </label>
          <label class="mk-field">
            <span class="mk-label">Valor por dia (R$)</span>
            <input v-model="daily" class="mk-input" inputmode="decimal" autocomplete="off" placeholder="0,00" :aria-invalid="!!errors.daily" />
            <span v-if="errors.daily" class="mk-error" role="alert">{{ errors.daily }}</span>
            <span v-else class="mk-hint">Em branco: o orçamento dividido pelos dias.</span>
          </label>
        </div>

        <label class="mk-field">
          <span class="mk-label">Público</span>
          <textarea
            v-model="audience"
            class="mk-textarea"
            rows="2"
            maxlength="5000"
            placeholder="Quem a campanha quer alcançar"
          />
        </label>

        <div class="mk-field">
          <span class="mk-label">Canais</span>
          <div class="cd__channels">
            <button
              v-for="c in suggestions"
              :key="c"
              type="button"
              class="cd__channel"
              :class="{ 'is-on': channels.includes(c) }"
              :aria-pressed="channels.includes(c)"
              @click="toggleChannel(c)"
            >
              {{ c }}
            </button>
            <input
              v-model="channelDraft"
              class="cd__channel-input"
              maxlength="40"
              autocomplete="off"
              placeholder="Outro canal"
              aria-label="Adicionar outro canal"
              @keydown.enter.prevent="addChannel"
              @blur="addChannel"
            />
          </div>
        </div>
      </div>

      <footer class="cd__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="emit('update:modelValue', false)">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="saving">
          <Loader2 v-if="saving" :size="14" class="cd__spin" />
          {{ campaign ? 'Salvar' : 'Criar campanha' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.cd {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 40px);
}

.cd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.cd__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.cd__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
  overflow-y: auto;
}

.cd__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.cd__row--brand {
  grid-template-columns: 1.6fr 1fr;
}

.cd__channels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cd__channel {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.cd__channel:hover {
  background: var(--surface-2);
}

.cd__channel.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.cd__channel:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.cd__channel-input {
  width: 130px;
  padding: 3px 10px;
  border: 1px dashed var(--border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}

.cd__channel-input:focus {
  outline: none;
  border-style: solid;
  border-color: var(--accent);
}

.cd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.cd__spin {
  animation: cd-spin 0.8s linear infinite;
}

@keyframes cd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .cd__row,
  .cd__row--brand {
    grid-template-columns: 1fr;
  }

  .cd__channel {
    min-height: 44px;
    padding-inline: 14px;
  }

  .cd__channel-input {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd__spin {
    animation: none;
  }
}
</style>
