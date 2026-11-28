<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import AppSelect from '@/components/ui/AppSelect.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  createPartner,
  updatePartner,
  type Partner,
  type PartnerInput,
  type PartnerKind,
  type PartnerStatus,
} from '@/service/marketing/marketing-partners'
import { useMarketing } from '../composables/useMarketing'
import FormDialog from '../events/FormDialog.vue'
import { asText, labelItems, selectItems } from '../select-items'
import {
  formatPhone,
  PARTNER_KIND_LABEL,
  PARTNER_KINDS,
  PARTNER_STATUS_LABEL,
  PARTNER_STATUSES,
  toDateInput,
} from './partner-meta'

/** Criar e editar parceiro. A marca (ou "todas") só se escolhe ao criar. */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  /** Presente = edição */
  partner?: Partner | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [partner: Partner]
}>()

const mk = useMarketing()
const qc = useQueryClient()
const { success } = useToast()

const editing = computed(() => !!props.partner)
const form = reactive({
  name: '',
  companyId: '',
  kind: 'OTHER' as PartnerKind,
  status: 'PROSPECT' as PartnerStatus,
  contactName: '',
  phone: '',
  email: '',
  instagram: '',
  city: '',
  nextStep: '',
  nextStepAt: '',
  notes: '',
})
const error = ref('')
const kindItems = labelItems(PARTNER_KINDS, PARTNER_KIND_LABEL)
const statusItems = labelItems(PARTNER_STATUSES, PARTNER_STATUS_LABEL)
const brandItems = computed(() => selectItems(mk.brands.value, (b) => b.companyId, (b) => b.name, 'Todas as marcas'))

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    error.value = ''
    const p = props.partner
    if (p) {
      Object.assign(form, {
        name: p.name,
        companyId: p.companyId ?? '',
        kind: p.kind,
        status: p.status,
        contactName: p.contactName ?? '',
        phone: p.phone ? formatPhone(p.phone) : '',
        email: p.email ?? '',
        instagram: p.instagram ? `@${p.instagram}` : '',
        city: p.city ?? '',
        nextStep: p.nextStep ?? '',
        nextStepAt: toDateInput(p.nextStepAt),
        notes: p.notes ?? '',
      })
    } else {
      Object.assign(form, {
        name: '',
        companyId: mk.brandFilter.value ?? '',
        kind: 'OTHER',
        status: 'PROSPECT',
        contactName: '',
        phone: '',
        email: '',
        instagram: '',
        city: '',
        nextStep: '',
        nextStepAt: '',
        notes: '',
      })
    }
  },
  { immediate: true },
)

const brandLabel = computed(() =>
  props.partner?.companyId ? (mk.brandById(props.partner.companyId)?.name ?? '') : 'Todas as marcas',
)

const mutation = useMutation({
  mutationFn: async () => {
    if (!form.name.trim()) throw new Error('Dê um nome para o parceiro.')
    const input: PartnerInput = {
      name: form.name.trim(),
      kind: form.kind,
      status: form.status,
      contactName: form.contactName.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      instagram: form.instagram.trim() || null,
      city: form.city.trim() || null,
      nextStep: form.nextStep.trim() || null,
      nextStepAt: form.nextStepAt || null,
      notes: form.notes.trim() || null,
    }
    if (props.partner) return updatePartner(props.groupId, props.partner.id, input)
    return createPartner(props.groupId, { ...input, companyId: form.companyId || null })
  },
  onSuccess: (saved) => {
    void qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
    success(editing.value ? 'Parceiro atualizado.' : 'Parceiro cadastrado.')
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
    :title="editing ? 'Editar parceiro' : 'Novo parceiro'"
    size="lg"
    :loading="mutation.isPending.value"
    @update:model-value="emit('update:modelValue', $event)"
    @submit="mutation.mutate()"
  >
    <div class="mk-field">
      <label class="mk-label" for="pf-name">Nome</label>
      <input id="pf-name" v-model="form.name" class="mk-input" maxlength="200" placeholder="Ex.: Clínica Vida Felina" autocomplete="off" />
    </div>

    <div class="pf__row">
      <div class="mk-field">
        <span class="mk-label">Tipo</span>
        <AppSelect :model-value="form.kind" :items="kindItems" label="Tipo" density="compact" @update:model-value="form.kind = $event as PartnerKind" />
      </div>
      <div class="mk-field">
        <span class="mk-label">Situação</span>
        <AppSelect :model-value="form.status" :items="statusItems" label="Situação" density="compact" @update:model-value="form.status = $event as PartnerStatus" />
      </div>
    </div>

    <div v-if="mk.brands.value.length > 1 || editing" class="mk-field">
      <label v-if="editing" class="mk-label" for="pf-brand">Marca</label>
      <span v-else class="mk-label">Marca</span>
      <input v-if="editing" id="pf-brand" class="mk-input" :value="brandLabel" disabled />
      <AppSelect v-else :model-value="form.companyId" :items="brandItems" label="Marca" density="compact" @update:model-value="form.companyId = asText($event)" />
    </div>

    <div class="pf__row">
      <div class="mk-field">
        <label class="mk-label" for="pf-contact">Pessoa de contato</label>
        <input id="pf-contact" v-model="form.contactName" class="mk-input" maxlength="200" autocomplete="off" />
      </div>
      <div class="mk-field">
        <label class="mk-label" for="pf-phone">Telefone ou WhatsApp</label>
        <input id="pf-phone" v-model="form.phone" class="mk-input" inputmode="tel" placeholder="(67) 99999-8888" autocomplete="off" />
      </div>
    </div>

    <div class="pf__row">
      <div class="mk-field">
        <label class="mk-label" for="pf-email">E-mail</label>
        <input id="pf-email" v-model="form.email" type="email" class="mk-input" maxlength="200" autocomplete="off" />
      </div>
      <div class="mk-field">
        <label class="mk-label" for="pf-ig">Instagram</label>
        <input id="pf-ig" v-model="form.instagram" class="mk-input" maxlength="200" placeholder="@perfil" autocomplete="off" />
      </div>
    </div>

    <div class="mk-field">
      <label class="mk-label" for="pf-city">Cidade</label>
      <input id="pf-city" v-model="form.city" class="mk-input" maxlength="120" autocomplete="off" />
    </div>

    <div class="pf__row pf__row--step">
      <div class="mk-field">
        <label class="mk-label" for="pf-step">Próximo passo</label>
        <input id="pf-step" v-model="form.nextStep" class="mk-input" maxlength="500" placeholder="Ex.: enviar proposta de folders" autocomplete="off" />
      </div>
      <div class="mk-field">
        <label class="mk-label" for="pf-step-at">Para quando</label>
        <input id="pf-step-at" v-model="form.nextStepAt" type="date" class="mk-input" />
      </div>
    </div>

    <div class="mk-field">
      <label class="mk-label" for="pf-notes">Observações</label>
      <textarea id="pf-notes" v-model="form.notes" class="mk-textarea" rows="3" maxlength="5000" />
    </div>

    <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
  </FormDialog>
</template>

<style scoped>
.pf__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.pf__row--step {
  grid-template-columns: 1fr 160px;
}

@media (max-width: 640px) {
  .pf__row,
  .pf__row--step {
    grid-template-columns: 1fr;
  }
}
</style>
