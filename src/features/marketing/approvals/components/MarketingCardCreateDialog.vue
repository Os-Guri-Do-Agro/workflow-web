<script setup lang="ts">
/**
 * Criar card de marketing (M1-A). Autossuficiente: lê o grupo, as marcas e a
 * equipe pelo `useMarketing`, então qualquer tela da ala pode abrir (a M1-B
 * pode usar no calendário, passando `defaultPublishAt`). Grava pelo
 * `POST /cards`, que usa a `MarketingCardFactory` da fundação.
 */
import { computed, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { Loader2, Plus, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { getApiErrorMessage } from '@/service/api'
import { hasMarketingRole } from '@/service/marketing/marketing-core'
import { createCard, type MarketingCardDetail } from '@/service/marketing/marketing-cards'
import { useMarketing, useMarketingMembers } from '../../composables/useMarketing'
import {
  CARD_KIND_LABEL,
  CARD_NETWORK_LABEL,
  brandTone,
  toneStyle,
  type CardKind,
  type CardNetwork,
} from '../../marketing-labels'
import { cardKeys } from '../approvals-meta'
import { asText, labelItems, selectItems } from '../../select-items'
// Campos de data e hora em Brasília (o calendário e a API também).
import { spLocalInput, spLocalInputToIso } from '../../calendar/calendar-time'

const props = defineProps<{
  modelValue: boolean
  defaultCompanyId?: string | null
  defaultKind?: CardKind
  /** ISO; ex.: o dia clicado no calendário às 10:00 */
  defaultPublishAt?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [card: MarketingCardDetail]
}>()

const mk = useMarketing()
const members = useMarketingMembers(mk.groupId)
const queryClient = useQueryClient()

const KINDS = Object.keys(CARD_KIND_LABEL) as CardKind[]
const NETWORKS = Object.keys(CARD_NETWORK_LABEL) as CardNetwork[]

const companyId = ref('')
const kind = ref<CardKind>('POST')
const title = ref('')
const networks = ref<CardNetwork[]>([])
const dueAt = ref('')
const publishAt = ref('')
const assigneeId = ref('')
const startStatus = ref<'IDEA' | 'IN_PRODUCTION'>('IN_PRODUCTION')
const saving = ref(false)
const error = ref('')
const titleInput = ref<HTMLInputElement | null>(null)

const brands = computed(() => mk.brands.value)

/** Responsável: Editor+ que enxerga a marca escolhida. */
const assignees = computed(() =>
  (members.data.value ?? []).filter(
    (m) =>
      hasMarketingRole(m.role, 'EDITOR') &&
      (m.brandIds.length === 0 || m.brandIds.includes(companyId.value)),
  ),
)

const brandItems = computed(() => selectItems(brands.value, (b) => b.companyId, (b) => b.name))
const kindItems = labelItems(KINDS, CARD_KIND_LABEL)
const assigneeItems = computed(() => selectItems(assignees.value, (m) => m.userId, (m) => m.name, 'Sem responsável'))
const startItems = [
  { label: 'Em produção', value: 'IN_PRODUCTION' },
  { label: 'Ideia', value: 'IDEA' },
]

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    companyId.value =
      props.defaultCompanyId ?? mk.brandFilter.value ?? brands.value[0]?.companyId ?? ''
    kind.value = props.defaultKind ?? 'POST'
    title.value = ''
    networks.value = kind.value === 'PRINT' ? [] : ['INSTAGRAM']
    dueAt.value = ''
    publishAt.value = spLocalInput(props.defaultPublishAt ?? null)
    assigneeId.value = ''
    startStatus.value = 'IN_PRODUCTION'
    error.value = ''
  },
  { immediate: true },
)

// Responsável que não vê a marca nova sai da seleção.
watch(companyId, () => {
  if (assigneeId.value && !assignees.value.some((m) => m.userId === assigneeId.value)) assigneeId.value = ''
})

function toggleNetwork(n: CardNetwork) {
  networks.value = networks.value.includes(n) ? networks.value.filter((x) => x !== n) : [...networks.value, n]
}

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function submit() {
  const groupId = mk.groupId.value
  if (!groupId) return
  if (!title.value.trim()) {
    error.value = 'Dê um título ao card.'
    titleInput.value?.focus()
    return
  }
  if (!companyId.value) {
    error.value = 'Escolha a marca.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const card = await createCard(groupId, {
      companyId: companyId.value,
      title: title.value.trim(),
      kind: kind.value,
      status: startStatus.value,
      networks: kind.value === 'PRINT' ? [] : networks.value,
      dueAt: spLocalInputToIso(dueAt.value),
      publishAt: spLocalInputToIso(publishAt.value),
      assigneeId: assigneeId.value || null,
    })
    void queryClient.invalidateQueries({ queryKey: cardKeys.all(groupId) })
    emit('created', card)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para criar o card. Tente de novo.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog :model-value="modelValue" label="Novo card de marketing" size="md" :loading="saving" persistent @update:model-value="close">
    <form class="mkcd" @submit.prevent="submit">
      <header class="mkcd__head">
        <span class="mkcd__icon" aria-hidden="true"><Plus :size="16" /></span>
        <h2 class="mkcd__title">Novo card</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="mkcd__body">
        <label class="mk-field">
          <span class="mk-label">Título</span>
          <input
            ref="titleInput"
            v-model="title"
            class="mk-input"
            name="title"
            maxlength="200"
            autocomplete="off"
            placeholder="Ex.: Post do Dia dos Pets"
            autofocus
          />
        </label>

        <div class="mkcd__row">
          <div v-if="brands.length > 1" class="mk-field" data-field="companyId">
            <span class="mk-label">Marca</span>
            <AppSelect :model-value="companyId" :items="brandItems" label="Marca" density="compact" @update:model-value="companyId = asText($event)" />
          </div>
          <div v-else-if="brands[0]" class="mk-field">
            <span class="mk-label">Marca</span>
            <span class="mkcd__brand">
              <span class="mk-dot" :style="toneStyle(brandTone(brands[0]))" aria-hidden="true" />
              {{ brands[0].name }}
            </span>
          </div>
          <div class="mk-field" data-field="kind">
            <span class="mk-label">Tipo</span>
            <AppSelect :model-value="kind" :items="kindItems" label="Tipo" density="compact" @update:model-value="kind = $event as CardKind" />
          </div>
        </div>

        <fieldset v-if="kind !== 'PRINT'" class="mk-field mkcd__fieldset">
          <legend class="mk-label">Redes</legend>
          <div class="mkcd__chips">
            <button
              v-for="n in NETWORKS"
              :key="n"
              type="button"
              class="mkcd__chip"
              :class="{ 'is-on': networks.includes(n) }"
              :aria-pressed="networks.includes(n)"
              @click="toggleNetwork(n)"
            >
              {{ CARD_NETWORK_LABEL[n] }}
            </button>
          </div>
        </fieldset>

        <div class="mkcd__row">
          <label class="mk-field">
            <span class="mk-label">Prazo da produção</span>
            <input v-model="dueAt" type="datetime-local" class="mk-input" name="dueAt" />
          </label>
          <label class="mk-field">
            <span class="mk-label">Publicação</span>
            <input v-model="publishAt" type="datetime-local" class="mk-input" name="publishAt" />
          </label>
        </div>

        <div class="mkcd__row">
          <div class="mk-field" data-field="assigneeId">
            <span class="mk-label">Responsável</span>
            <AppSelect :model-value="assigneeId" :items="assigneeItems" label="Responsável" density="compact" @update:model-value="assigneeId = asText($event)" />
          </div>
          <div class="mk-field" data-field="status">
            <span class="mk-label">Começa em</span>
            <AppSelect :model-value="startStatus" :items="startItems" label="Começa em" density="compact" @update:model-value="startStatus = $event as 'IDEA' | 'IN_PRODUCTION'" />
          </div>
        </div>

        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>

      <footer class="mkcd__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="saving">
          <Loader2 v-if="saving" :size="14" class="mkcd__spin" aria-hidden="true" />
          Criar card
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.mkcd {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mkcd__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
}

.mkcd__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkcd__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.mkcd__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
  overflow-y: auto;
}

.mkcd__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mkcd__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  font-size: 13px;
  font-weight: 600;
}

.mkcd__fieldset {
  margin: 0;
  padding: 0;
  border: 0;
}

.mkcd__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mkcd__chip {
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.mkcd__chip.is-on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkcd__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.mkcd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.mkcd__spin {
  animation: mkcd-spin 0.8s linear infinite;
}

@keyframes mkcd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .mkcd__row {
    grid-template-columns: 1fr;
  }

  .mkcd__chip {
    min-height: 44px;
  }
}
</style>
