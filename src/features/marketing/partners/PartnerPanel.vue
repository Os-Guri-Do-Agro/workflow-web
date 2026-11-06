<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ArrowLeft, Instagram, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Trash2, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { hasSession } from '@/composables/useSession'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  addPartnerContact,
  deletePartner,
  deletePartnerContact,
  listPartnerContacts,
  updatePartner,
  type ContactChannel,
  type PartnerStatus,
} from '@/service/marketing/marketing-partners'
import { ACTIVATION_STATUS_LABEL, ACTIVATION_STATUS_TONE, formatWhen } from '../activations/activation-meta'
import { useActivationsList } from '../activations/useActivations'
import { todaySp } from '../calendar/calendar-time'
import { useMarketing } from '../composables/useMarketing'
import FormDialog from '../events/FormDialog.vue'
import { brandTone, toneStyle } from '../marketing-labels'
import QuotesPanel from '../quotes/QuotesPanel.vue'
import PartnerFormDialog from './PartnerFormDialog.vue'
import {
  CONTACT_CHANNEL_LABEL,
  CONTACT_CHANNELS,
  formatDay,
  formatPhone,
  PARTNER_KIND_LABEL,
  PARTNER_STATUS_LABEL,
  PARTNER_STATUS_TONE,
  PARTNER_STATUSES,
  sinceLabel,
  stepState,
  toDateInput,
} from './partner-meta'
import { partnerKeys, usePartner } from './usePartners'

/**
 * Painel do parceiro (URL `?parceiro=<id>`): contato com botão de WhatsApp,
 * próximo passo, histórico de contatos, ativações ligadas e orçamentos.
 */
const props = defineProps<{ groupId: string; partnerId: string }>()
const emit = defineEmits<{ close: []; deleted: [] }>()

const mk = useMarketing()
const qc = useQueryClient()
const { success, error: toastError } = useToast()
const { me } = useCurrentUser()

const query = usePartner(
  () => props.groupId,
  () => props.partnerId,
)
const p = computed(() => query.data.value ?? null)
const canEdit = computed(() => mk.can('EDITOR'))
const brand = computed(() => mk.brandById(p.value?.companyId))
const canDelete = computed(() => {
  if (mk.can('ADMIN')) return true
  if (!mk.can('EDITOR')) return false
  return !!mk.settings.value?.editorCanDelete || p.value?.createdById === me.value?.id
})

function refresh() {
  void qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
}
function fail(error: unknown, fallback: string) {
  toastError(getApiErrorMessage(error, fallback))
}

const editOpen = ref(false)

const statusMutation = useMutation({
  mutationFn: (status: PartnerStatus) => updatePartner(props.groupId, props.partnerId, { status }),
  onSuccess: refresh,
  onError: (e) => fail(e, 'Não foi possível mudar a situação.'),
})

/**
 * O select é `:value` (sem v-model): se a API recusa, o valor do servidor não
 * mudou e o Vue não redesenha, então o select ficava mostrando a escolha
 * recusada. Na recusa ele volta ao que está gravado (o toast mostra a frase).
 */
function changeStatus(event: Event) {
  const select = event.target as HTMLSelectElement
  statusMutation.mutate(select.value as PartnerStatus, {
    onError: () => {
      if (p.value) select.value = p.value.status
    },
  })
}

// ── Próximo passo ──────────────────────────────────────────────────────────

const step = reactive({ text: '', date: '' })
/** Último valor vindo do servidor: o rascunho só é trocado se a pessoa não mexeu nele. */
const stepSynced = reactive({ text: '', date: '' })
const stepDirty = computed(() => step.text !== stepSynced.text || step.date !== stepSynced.date)
watch(
  () => [p.value?.nextStep ?? '', toDateInput(p.value?.nextStepAt)] as const,
  ([text, date]) => {
    if (!stepDirty.value) {
      step.text = text
      step.date = date
    }
    stepSynced.text = text
    stepSynced.date = date
  },
  { immediate: true },
)
const stepMutation = useMutation({
  mutationFn: () =>
    updatePartner(props.groupId, props.partnerId, {
      nextStep: step.text.trim() || null,
      nextStepAt: step.date || null,
    }),
  onSuccess: () => {
    success('Próximo passo salvo.')
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível salvar o próximo passo.'),
})
const stepFlag = computed(() => (p.value?.nextStep || p.value?.nextStepAt ? stepState(p.value?.nextStepAt) : null))

// ── Contatos ───────────────────────────────────────────────────────────────

const contactsQuery = useQuery({
  queryKey: computed(() => partnerKeys.contacts(props.groupId, props.partnerId)),
  queryFn: () => listPartnerContacts(props.groupId, props.partnerId),
  enabled: hasSession,
  staleTime: 15_000,
})
const contacts = computed(() => contactsQuery.data.value ?? [])

const contactOpen = ref(false)
const contact = reactive({ channel: 'WHATSAPP' as ContactChannel, note: '', date: todaySp() })
function openContact() {
  contact.channel = 'WHATSAPP'
  contact.note = ''
  contact.date = todaySp()
  contactOpen.value = true
}
const contactMutation = useMutation({
  mutationFn: () =>
    addPartnerContact(props.groupId, props.partnerId, {
      channel: contact.channel,
      note: contact.note.trim(),
      // Só o dia ('YYYY-MM-DD'): a API grava ao meio-dia de Brasília, então o
      // dia escolhido não escorrega com o fuso do navegador.
      at: contact.date,
    }),
  onSuccess: () => {
    contactOpen.value = false
    success('Contato registrado.')
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível registrar o contato.'),
})
function submitContact() {
  if (!contact.note.trim() || !contact.date) return
  contactMutation.mutate()
}
function canDeleteContact(by: { id: string } | null) {
  return mk.can('ADMIN') || (mk.can('EDITOR') && by?.id === me.value?.id)
}
const contactRemove = ref<string | null>(null)
const contactRemoveOpen = computed({
  get: () => !!contactRemove.value,
  set: (v) => {
    if (!v) contactRemove.value = null
  },
})
const contactRemoveMutation = useMutation({
  mutationFn: () => deletePartnerContact(props.groupId, props.partnerId, contactRemove.value!),
  onSuccess: () => {
    contactRemove.value = null
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível apagar o contato.'),
})

// ── Ativações ligadas ──────────────────────────────────────────────────────

const activationsQuery = useActivationsList(
  () => props.groupId,
  () => ({ partnerId: props.partnerId }),
)
const activations = computed(() => activationsQuery.data.value ?? [])

// ── Apagar ─────────────────────────────────────────────────────────────────

const deleteOpen = ref(false)
const deleteMessage = computed(
  () => `"${p.value?.name ?? ''}" e o histórico de contatos saem do sistema. Ativações e orçamentos ligados continuam, sem o parceiro.`,
)
const deleteMutation = useMutation({
  mutationFn: () => deletePartner(props.groupId, props.partnerId),
  onSuccess: () => {
    deleteOpen.value = false
    success('Parceiro apagado.')
    refresh()
    emit('deleted')
  },
  onError: (e) => fail(e, 'Não foi possível apagar o parceiro.'),
})
</script>

<template>
  <aside class="pp" aria-label="Detalhe do parceiro">
    <header class="pp__head">
      <button type="button" class="mk-btn mk-btn--ghost pp__back" @click="emit('close')">
        <ArrowLeft :size="15" aria-hidden="true" />
        Voltar
      </button>
      <div class="pp__heading">
        <h2 class="pp__title">{{ p?.name ?? 'Parceiro' }}</h2>
        <div v-if="p" class="pp__sub">
          <span class="mk-chip">{{ PARTNER_KIND_LABEL[p.kind] }}</span>
          <span v-if="brand && mk.brands.value.length > 1" class="pp__brand">
            <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
            {{ brand.name }}
          </span>
          <span v-else-if="!p.companyId && mk.brands.value.length > 1" class="pp__brand">Todas as marcas</span>
        </div>
      </div>
      <button type="button" class="mk-icon-btn pp__x" aria-label="Fechar painel" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </header>

    <div v-if="query.isLoading.value" class="pp__body"><Skeleton type="block" height="120px" /></div>
    <p v-else-if="query.isError.value || !p" class="pp__body mk-error">
      Não foi possível abrir este parceiro. Ele pode ter sido apagado ou ser de uma marca fora do seu acesso.
    </p>

    <div v-else class="pp__body">
      <!-- Contato -->
      <section class="pp__sec">
        <div class="pp__facts">
          <div class="pp__fact">
            <span class="pp__k">Situação</span>
            <select
              v-if="canEdit"
              class="mk-select pp__status"
              :value="p.status"
              :style="toneStyle(PARTNER_STATUS_TONE[p.status])"
              aria-label="Situação do parceiro"
              :disabled="statusMutation.isPending.value"
              @change="changeStatus"
            >
              <option v-for="s in PARTNER_STATUSES" :key="s" :value="s">{{ PARTNER_STATUS_LABEL[s] }}</option>
            </select>
            <span v-else class="mk-chip" data-tone :style="toneStyle(PARTNER_STATUS_TONE[p.status])">
              {{ PARTNER_STATUS_LABEL[p.status] }}
            </span>
          </div>
          <div class="pp__fact">
            <span class="pp__k">Último contato</span>
            <span class="pp__v">{{ p.lastContactAt ? `${formatDay(p.lastContactAt)} (${sinceLabel(p.lastContactAt)})` : 'Nenhum ainda' }}</span>
          </div>
          <div v-if="p.contactName" class="pp__fact">
            <span class="pp__k">Contato</span>
            <span class="pp__v">{{ p.contactName }}</span>
          </div>
          <div v-if="p.city" class="pp__fact">
            <span class="pp__k">Cidade</span>
            <span class="pp__v"><MapPin :size="13" aria-hidden="true" /> {{ p.city }}</span>
          </div>
        </div>

        <div class="pp__links">
          <a
            v-if="p.whatsappUrl"
            class="mk-btn pp__wa"
            :href="p.whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            data-test="whatsapp"
          >
            <MessageCircle :size="14" aria-hidden="true" />
            WhatsApp
          </a>
          <span v-if="p.phone" class="pp__chip"><Phone :size="13" aria-hidden="true" />{{ formatPhone(p.phone) }}</span>
          <a v-if="p.email" class="pp__chip pp__chip--link" :href="`mailto:${p.email}`">
            <Mail :size="13" aria-hidden="true" />{{ p.email }}
          </a>
          <a
            v-if="p.instagramUrl"
            class="pp__chip pp__chip--link"
            :href="p.instagramUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Instagram :size="13" aria-hidden="true" />@{{ p.instagram }}
          </a>
        </div>
        <p v-if="!p.phone && !p.email && !p.instagram" class="mk-hint">Sem telefone, e-mail ou Instagram cadastrados.</p>

        <p v-if="p.notes" class="pp__notes">{{ p.notes }}</p>
        <div v-if="canEdit" class="pp__row-actions">
          <button type="button" class="mk-btn" @click="editOpen = true">
            <Pencil :size="14" aria-hidden="true" />
            Editar dados
          </button>
        </div>
      </section>

      <!-- Próximo passo -->
      <section class="pp__sec" aria-labelledby="pp-step">
        <h3 id="pp-step" class="pp__h">
          Próximo passo
          <span v-if="stepFlag === 'late'" class="mk-late pp__flag">vencido</span>
          <span v-else-if="stepFlag === 'today'" class="mk-soon pp__flag">para hoje</span>
        </h3>
        <template v-if="canEdit">
          <div class="pp__step">
            <input v-model="step.text" class="mk-input" maxlength="500" placeholder="O que fazer e com quem" aria-label="Próximo passo" autocomplete="off" />
            <input v-model="step.date" type="date" class="mk-input pp__step-date" aria-label="Data do próximo passo" />
          </div>
          <div v-if="stepDirty" class="pp__row-actions">
            <button type="button" class="mk-btn mk-btn--primary" :disabled="stepMutation.isPending.value" @click="stepMutation.mutate()">
              Salvar próximo passo
            </button>
          </div>
        </template>
        <p v-else-if="p.nextStep" class="pp__notes">
          {{ p.nextStep }}<template v-if="p.nextStepAt"> ({{ formatDay(p.nextStepAt) }})</template>
        </p>
        <p v-else class="mk-hint">Nada combinado ainda.</p>
      </section>

      <!-- Contatos -->
      <section class="pp__sec" aria-labelledby="pp-contacts">
        <div class="pp__sec-head">
          <h3 id="pp-contacts" class="pp__h">
            Histórico de contatos
            <span v-if="contacts.length" class="pp__count">{{ contacts.length }}</span>
          </h3>
          <button v-if="canEdit" type="button" class="mk-btn" @click="openContact">
            <Plus :size="14" aria-hidden="true" />
            Registrar contato
          </button>
        </div>
        <p v-if="contactsQuery.isLoading.value" class="mk-hint">Carregando...</p>
        <div v-else-if="contactsQuery.isError.value && !contactsQuery.data.value" class="mk-load-error" role="alert">
          <p>{{ getApiErrorMessage(contactsQuery.error.value, 'Não foi possível carregar os contatos.') }}</p>
          <button type="button" class="mk-btn" @click="contactsQuery.refetch()">Tentar de novo</button>
        </div>
        <p v-else-if="!contacts.length" class="mk-hint">Nenhum contato registrado.</p>
        <ul v-else class="pp__list">
          <li v-for="c in contacts" :key="c.id" class="pp__contact">
            <div class="pp__contact-main">
              <div class="pp__contact-meta">
                <span class="mk-chip">{{ CONTACT_CHANNEL_LABEL[c.channel] }}</span>
                <span>{{ formatDay(c.at) }}</span>
                <span v-if="c.by" class="pp__by">
                  <PersonAvatar :id="c.by.id" :name="c.by.name" :size="16" decorative />
                  {{ c.by.name }}
                </span>
              </div>
              <p class="pp__contact-note">{{ c.note }}</p>
            </div>
            <button
              v-if="canDeleteContact(c.by)"
              type="button"
              class="mk-icon-btn"
              aria-label="Apagar este contato"
              @click="contactRemove = c.id"
            >
              <Trash2 :size="14" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>

      <!-- Ativações -->
      <section class="pp__sec" aria-labelledby="pp-acts">
        <h3 id="pp-acts" class="pp__h">
          Ativações com este parceiro
          <span v-if="activations.length" class="pp__count">{{ activations.length }}</span>
        </h3>
        <p v-if="activationsQuery.isLoading.value" class="mk-hint">Carregando...</p>
        <div v-else-if="activationsQuery.isError.value && !activationsQuery.data.value" class="mk-load-error" role="alert">
          <p>{{ getApiErrorMessage(activationsQuery.error.value, 'Não foi possível carregar as ativações.') }}</p>
          <button type="button" class="mk-btn" @click="activationsQuery.refetch()">Tentar de novo</button>
        </div>
        <p v-else-if="!activations.length" class="mk-hint">Nenhuma ativação ligada.</p>
        <ul v-else class="pp__list">
          <li v-for="a in activations" :key="a.id" class="pp__act">
            <RouterLink class="pp__act-link" :to="{ name: 'marketing-activations', query: { ativacao: a.id } }">
              {{ a.title }}
            </RouterLink>
            <span class="pp__act-when">{{ formatWhen(a) }}</span>
            <span class="mk-chip" data-tone :style="toneStyle(ACTIVATION_STATUS_TONE[a.status])">
              {{ ACTIVATION_STATUS_LABEL[a.status] }}
            </span>
          </li>
        </ul>
      </section>

      <!-- Orçamentos -->
      <section class="pp__sec">
        <QuotesPanel :group-id="groupId" :company-id="p.companyId" :partner-id="p.id" />
      </section>

      <section v-if="canDelete" class="pp__sec pp__danger">
        <button type="button" class="mk-btn mk-btn--danger" @click="deleteOpen = true">
          <Trash2 :size="14" aria-hidden="true" />
          Apagar parceiro
        </button>
      </section>
    </div>

    <PartnerFormDialog v-model="editOpen" :group-id="groupId" :partner="p" />

    <FormDialog
      v-model="contactOpen"
      title="Registrar contato"
      submit-label="Registrar"
      :loading="contactMutation.isPending.value"
      :disabled="!contact.note.trim() || !contact.date"
      @submit="submitContact"
    >
      <div class="pp__form-row">
        <div class="mk-field">
          <label class="mk-label" for="pp-c-channel">Como foi</label>
          <select id="pp-c-channel" v-model="contact.channel" class="mk-select">
            <option v-for="c in CONTACT_CHANNELS" :key="c" :value="c">{{ CONTACT_CHANNEL_LABEL[c] }}</option>
          </select>
        </div>
        <div class="mk-field">
          <label class="mk-label" for="pp-c-date">Dia</label>
          <input id="pp-c-date" v-model="contact.date" type="date" class="mk-input" :max="todaySp()" />
        </div>
      </div>
      <div class="mk-field">
        <label class="mk-label" for="pp-c-note">O que foi conversado</label>
        <textarea id="pp-c-note" v-model="contact.note" class="mk-textarea" rows="4" maxlength="2000" />
      </div>
    </FormDialog>

    <ConfirmDialog
      v-model="contactRemoveOpen"
      title="Apagar este contato?"
      message="O registro sai do histórico e o último contato do parceiro é recalculado."
      confirm-label="Apagar"
      danger
      :loading="contactRemoveMutation.isPending.value"
      @confirm="contactRemoveMutation.mutate()"
    />
    <ConfirmDialog
      v-model="deleteOpen"
      title="Apagar este parceiro?"
      :message="deleteMessage"
      confirm-label="Apagar"
      danger
      :loading="deleteMutation.isPending.value"
      @confirm="deleteMutation.mutate()"
    />
  </aside>
</template>

<style scoped>
.pp {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.pp__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.pp__back {
  display: none;
}

.pp__heading {
  flex: 1;
  min-width: 0;
}

.pp__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.pp__sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.pp__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}

.pp__body {
  display: flex;
  flex-direction: column;
}

.pp__sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.pp__sec:last-child {
  border-bottom: 0;
}

.pp__sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pp__h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.pp__count {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.pp__flag {
  font-size: 12px;
}

.pp__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.pp__fact {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}

.pp__k {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.pp__v {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.pp__status {
  width: auto;
  min-height: 28px;
  padding: 2px 8px;
  color: var(--mk-tone);
  font-weight: 600;
  border-color: color-mix(in srgb, var(--mk-tone) 40%, var(--border));
}

.pp__links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.pp__wa {
  text-decoration: none;
  border-color: color-mix(in srgb, var(--success) 45%, var(--border));
  color: var(--text);
}

.pp__wa svg {
  color: var(--success);
}

.pp__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
  overflow-wrap: anywhere;
  text-decoration: none;
}

.pp__chip--link:hover {
  color: var(--accent-ink);
  border-color: var(--border-strong);
}

.pp__notes {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.pp__row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pp__step {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: 8px;
}

.pp__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp__contact {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.pp__contact:last-child {
  border-bottom: 0;
}

.pp__contact-main {
  min-width: 0;
}

.pp__contact-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-3);
  font-size: 12px;
}

.pp__by {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  font-weight: 600;
}

.pp__contact-note {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pp__act {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.pp__act:last-child {
  border-bottom: 0;
}

.pp__act-link {
  color: var(--accent-ink);
  font-weight: 600;
  text-decoration: none;
}

.pp__act-link:hover {
  text-decoration: underline;
}

.pp__act-when {
  color: var(--text-3);
  font-size: 12px;
}

.pp__form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.pp__danger {
  align-items: flex-start;
}

@media (max-width: 1100px) {
  .pp__back {
    display: inline-flex;
    flex-shrink: 0;
  }

  .pp__x {
    display: none;
  }
}

@media (max-width: 640px) {
  .pp__facts {
    grid-template-columns: 1fr;
  }

  .pp__step,
  .pp__form-row {
    grid-template-columns: 1fr;
  }

  .pp__status {
    min-height: 44px;
  }

  .pp__chip {
    min-height: 44px;
  }

  .pp__act-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }

  .pp__wa {
    min-height: 44px;
  }

  .pp__act {
    min-height: 44px;
  }
}
</style>
