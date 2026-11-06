<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import { getApiErrorMessage } from '@/service/api'
import {
  createActivation,
  updateActivation,
  type ActivationBase,
  type ActivationInput,
  type ActivationKind,
  type ActivationStatus,
} from '@/service/marketing/marketing-activations'
import { useToast } from '@/composables/useToast'
import { useMarketing } from '../composables/useMarketing'
import AppSelect from '@/components/ui/AppSelect.vue'
import FormDialog from '../events/FormDialog.vue'
import { asText, labelItems, selectItems } from '../select-items'
import { usePartnersList } from '../partners/usePartners'
import {
  ACTIVATION_KIND_LABEL,
  ACTIVATION_KINDS,
  ACTIVATION_STATUS_LABEL,
  ACTIVATION_STATUSES,
  joinSp,
  splitIso,
} from './activation-meta'
import { todaySp } from '../calendar/calendar-time'

/** Criar e editar ativação. A marca só se escolhe ao criar. */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  /** Presente = edição */
  activation?: ActivationBase | null
  /** Data pré-preenchida ao criar ('YYYY-MM-DD') */
  defaultDate?: string
  defaultPartnerId?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [activation: ActivationBase]
}>()

const mk = useMarketing()
const qc = useQueryClient()
const { success } = useToast()

const editing = computed(() => !!props.activation)

const form = reactive({
  companyId: '',
  title: '',
  kind: 'EVENT' as ActivationKind,
  status: 'PLANNED' as ActivationStatus,
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  location: '',
  partnerId: '',
  notes: '',
})
const error = ref('')

const partnersQuery = usePartnersList(
  () => props.groupId,
  () => ({ companyId: form.companyId || null }),
)
const partnerOptions = computed(() => partnersQuery.data.value ?? [])

const kindItems = labelItems(ACTIVATION_KINDS, ACTIVATION_KIND_LABEL)
const statusItems = labelItems(ACTIVATION_STATUSES, ACTIVATION_STATUS_LABEL)
const brandItems = computed(() => selectItems(mk.brands.value, (b) => b.companyId, (b) => b.name))
const partnerItems = computed(() => selectItems(partnerOptions.value, (p) => p.id, (p) => p.name, 'Nenhum'))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    error.value = ''
    const a = props.activation
    if (a) {
      const start = splitIso(a.startAt, '00:00')
      const end = splitIso(a.endAt, '23:59')
      Object.assign(form, {
        companyId: a.companyId,
        title: a.title,
        kind: a.kind,
        status: a.status,
        startDate: start.date,
        startTime: start.time,
        endDate: end.date,
        endTime: end.time,
        location: a.location ?? '',
        partnerId: a.partnerId ?? '',
        notes: a.notes ?? '',
      })
    } else {
      Object.assign(form, {
        companyId: mk.brandFilter.value ?? mk.brands.value[0]?.companyId ?? '',
        title: '',
        kind: 'EVENT',
        status: 'PLANNED',
        startDate: props.defaultDate ?? todaySp(),
        startTime: '',
        endDate: '',
        endTime: '',
        location: '',
        partnerId: props.defaultPartnerId ?? '',
        notes: '',
      })
    }
  },
  { immediate: true },
)

const brandName = computed(() => mk.brandById(form.companyId)?.name ?? '')

function buildInput(): ActivationInput {
  if (!form.title.trim()) throw new Error('Dê um nome para a ativação.')
  if (!form.startDate) throw new Error('Informe a data de início.')
  // Data e hora do formulário são de Brasília (o calendário e a API também).
  const startAt = joinSp(form.startDate, form.startTime, '00:00')!
  const endAt = form.endDate ? joinSp(form.endDate, form.endTime, '23:59') : null
  if (endAt && new Date(endAt).getTime() < new Date(startAt).getTime()) {
    throw new Error('O fim da ativação não pode ser antes do início.')
  }
  return {
    title: form.title.trim(),
    kind: form.kind,
    status: form.status,
    startAt,
    endAt,
    location: form.location.trim() || null,
    partnerId: form.partnerId || null,
    notes: form.notes.trim() || null,
  }
}

const mutation = useMutation({
  mutationFn: async () => {
    const input = buildInput()
    if (props.activation) return updateActivation(props.groupId, props.activation.id, input)
    return createActivation(props.groupId, { ...input, companyId: form.companyId })
  },
  onSuccess: (saved) => {
    void qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
    success(editing.value ? 'Ativação atualizada.' : 'Ativação criada.')
    emit('update:modelValue', false)
    emit('saved', saved)
  },
  onError: (e) => {
    error.value =
      e instanceof Error && !axios.isAxiosError(e) ? e.message : getApiErrorMessage(e, 'Não foi possível salvar.')
  },
})
</script>

<template>
  <FormDialog
    :model-value="modelValue"
    :title="editing ? 'Editar ativação' : 'Nova ativação'"
    size="lg"
    :loading="mutation.isPending.value"
    @update:model-value="emit('update:modelValue', $event)"
    @submit="mutation.mutate()"
  >
    <div class="mk-field">
      <label class="mk-label" for="af-title">Nome</label>
      <input id="af-title" v-model="form.title" class="mk-input" maxlength="200" placeholder="Ex.: Feira Pet Show 2026" autocomplete="off" />
    </div>

    <div class="af__row">
      <div class="mk-field">
        <span class="mk-label">Tipo</span>
        <AppSelect
          :model-value="form.kind"
          :items="kindItems"
          label="Tipo"
          density="compact"
          @update:model-value="form.kind = $event as ActivationKind"
        />
      </div>
      <div class="mk-field">
        <span class="mk-label">Situação</span>
        <AppSelect
          :model-value="form.status"
          :items="statusItems"
          label="Situação"
          density="compact"
          @update:model-value="form.status = $event as ActivationStatus"
        />
      </div>
    </div>

    <div v-if="mk.brands.value.length > 1 || editing" class="mk-field">
      <label v-if="editing" class="mk-label" for="af-brand">Marca</label>
      <span v-else class="mk-label">Marca</span>
      <input v-if="editing" id="af-brand" class="mk-input" :value="brandName" disabled />
      <AppSelect
        v-else
        :model-value="form.companyId"
        :items="brandItems"
        label="Marca"
        density="compact"
        @update:model-value="form.companyId = asText($event)"
      />
    </div>

    <div class="af__row">
      <div class="mk-field">
        <label class="mk-label" for="af-sd">Início</label>
        <input id="af-sd" v-model="form.startDate" type="date" class="mk-input" />
      </div>
      <div class="mk-field">
        <label class="mk-label" for="af-st">Hora (opcional)</label>
        <input id="af-st" v-model="form.startTime" type="time" class="mk-input" />
      </div>
    </div>
    <div class="af__row">
      <div class="mk-field">
        <label class="mk-label" for="af-ed">Fim (se durar mais de um dia)</label>
        <input id="af-ed" v-model="form.endDate" type="date" class="mk-input" :min="form.startDate" />
      </div>
      <div class="mk-field">
        <label class="mk-label" for="af-et">Hora do fim (opcional)</label>
        <input id="af-et" v-model="form.endTime" type="time" class="mk-input" :disabled="!form.endDate" />
      </div>
    </div>

    <div class="af__row">
      <div class="mk-field">
        <label class="mk-label" for="af-loc">Local</label>
        <input id="af-loc" v-model="form.location" class="mk-input" maxlength="300" placeholder="Cidade, espaço ou endereço" autocomplete="off" />
      </div>
      <div class="mk-field">
        <span class="mk-label">Parceiro</span>
        <AppSelect
          :model-value="form.partnerId"
          :items="partnerItems"
          label="Parceiro"
          density="compact"
          @update:model-value="form.partnerId = asText($event)"
        />
      </div>
    </div>

    <div class="mk-field">
      <label class="mk-label" for="af-notes">Observações</label>
      <textarea id="af-notes" v-model="form.notes" class="mk-textarea" rows="3" maxlength="5000" />
    </div>

    <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
  </FormDialog>
</template>

<style scoped>
.af__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 640px) {
  .af__row {
    grid-template-columns: 1fr;
  }
}
</style>
