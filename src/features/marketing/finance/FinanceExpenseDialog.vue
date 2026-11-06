<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Download, FileText, Paperclip, RotateCw, Repeat, Trash2, Upload, Wallet, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FileViewer, { type ViewerFile } from '@/components/ui/FileViewer.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { getAssetDownload, type MarketingBrand } from '@/service/marketing/marketing-core'
import {
  createExpense,
  deleteExpense,
  removeInvoice,
  updateExpense,
  type ExpenseInput,
  type ExpenseStatus,
  type FinanceOptions,
  type MarketingExpense,
} from '@/service/marketing/marketing-finance'
import { formatBytes } from '../marketing-labels'
import { asText, selectItems } from '../select-items'
import { filesFromInput, useFileDrop, usePasteFiles } from '../uploads/file-sources'
import UploadSourceButtons from '../uploads/UploadSourceButtons.vue'
import { isUploadPending, useUploadQueue, type UploadEntry } from '../uploads/upload-queue'
import { expenseInvoiceTarget } from '../uploads/upload-targets'
import { itemStatusText } from '../uploads/upload-format'
import MoneyInput from './MoneyInput.vue'
import { defaultDateFor } from './finance-format'

/**
 * Lançamento completo: criar (com notas na fila, sobem depois de salvar),
 * editar, ver (Visualizador) e as notas fiscais (ver, baixar o original, tirar).
 *
 * As notas sobem pela fila global da ala (bandeja "Envios"). No lançamento
 * novo, a janela espera as notas subirem antes de fechar (como antes), mas
 * pode ser fechada no meio: o envio continua na bandeja. Entradas: "Anexar
 * nota", soltar na janela, Ctrl+V de imagem e, no celular, "Fotografar nota".
 */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  /** null = novo lançamento */
  expense: MarketingExpense | null
  brands: MarketingBrand[]
  defaultBrand: string | null
  month: string
  options: FinanceOptions | undefined
  canEdit: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
}>()

const toast = useToast()
const PAYMENT_METHODS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Boleto', 'Transferência', 'Dinheiro']

const form = reactive({
  companyId: '',
  date: '',
  description: '',
  amountCents: null as number | null,
  category: '',
  status: 'PAID' as ExpenseStatus,
  paymentMethod: '',
  supplier: '',
  partnerId: '',
  campaignId: '',
  activationId: '',
  cardId: '',
  invoiceNumber: '',
  noInvoiceNeeded: false,
  notes: '',
})
const error = ref('')
const saving = ref(false)
const queued = ref<File[]>([])
/** Lançamento novo salvo nesta janela: as notas dele aparecem subindo aqui. */
const savedId = ref<string | null>(null)
/** Esperando as notas do lançamento novo subirem para fechar a janela. */
const waitingUploads = ref(false)
/** Muda a cada abertura: a espera de um envio antigo não fecha a janela reaberta. */
let session = 0
const queue = useUploadQueue()
const confirmDelete = ref(false)
const confirmRemove = ref<{ id: string; name: string } | null>(null)
const removing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const viewerIndex = ref<number | null>(null)

const isNew = computed(() => !props.expense)
const readOnly = computed(() => !props.canEdit)
const title = computed(() =>
  isNew.value ? 'Novo lançamento' : readOnly.value ? 'Lançamento' : 'Editar lançamento',
)

function reset() {
  const e = props.expense
  form.companyId = e?.companyId ?? props.defaultBrand ?? props.brands[0]?.companyId ?? ''
  form.date = e?.date ?? defaultDateFor(props.month)
  form.description = e?.description ?? ''
  form.amountCents = e?.amountCents ?? null
  form.category = e?.category ?? props.options?.categories[0] ?? ''
  form.status = e?.status ?? 'PAID'
  form.paymentMethod = e?.paymentMethod ?? ''
  form.supplier = e?.supplier ?? ''
  form.partnerId = e?.partnerId ?? ''
  form.campaignId = e?.campaignId ?? ''
  form.activationId = e?.activationId ?? ''
  form.cardId = e?.cardId ?? ''
  form.invoiceNumber = e?.invoiceNumber ?? ''
  form.noInvoiceNeeded = e?.noInvoiceNeeded ?? false
  form.notes = e?.notes ?? ''
  error.value = ''
  queued.value = []
  savedId.value = null
  waitingUploads.value = false
  session++
  openedBrand = form.companyId
}

/** Marca de quando abriu: o watch abaixo não solta vínculo que veio do servidor. */
let openedBrand = ''

// Só ao ABRIR: com a janela aberta, o lançamento que chega atualizado (nota
// anexada, tempo real) não pode apagar o que a pessoa está digitando.
watch(
  () => props.modelValue,
  (open) => {
    if (open) reset()
  },
  { immediate: true },
)

const categories = computed(() => {
  const list = props.options?.categories ?? []
  return form.category && !list.includes(form.category) ? [...list, form.category] : list
})

const sameBrand = <T extends { companyId: string | null }>(list: T[] | undefined, allowGroup = false) =>
  (list ?? []).filter((x) => x.companyId === form.companyId || (allowGroup && x.companyId === null))

const campaigns = computed(() => sameBrand(props.options?.campaigns))
const activations = computed(() => sameBrand(props.options?.activations))
const cards = computed(() => sameBrand(props.options?.cards))
const partners = computed(() => sameBrand(props.options?.partners, true))

const brandItems = computed(() => selectItems(props.brands, (b) => b.companyId, (b) => b.name))
const statusItems = [
  { label: 'Pago', value: 'PAID' },
  { label: 'Previsto', value: 'PLANNED' },
]
const categoryItems = computed(() => selectItems(categories.value, (c) => c, (c) => c))
const partnerItems = computed(() => selectItems(partners.value, (p) => p.id, (p) => p.name, 'Nenhum'))
const campaignItems = computed(() => selectItems(campaigns.value, (c) => c.id, (c) => c.name, 'Nenhuma'))
const activationItems = computed(() => selectItems(activations.value, (a) => a.id, (a) => a.title, 'Nenhuma'))
const cardItems = computed(() => selectItems(cards.value, (c) => c.id, (c) => c.title, 'Nenhum'))

// Trocar a marca solta os vínculos que eram da outra. Na marca de quando abriu
// não mexe: o card arquivado (fora das opções) continua ligado ao lançamento.
watch(
  () => form.companyId,
  (companyId) => {
    if (companyId === openedBrand) return
    if (form.campaignId && !campaigns.value.some((c) => c.id === form.campaignId)) form.campaignId = ''
    if (form.activationId && !activations.value.some((a) => a.id === form.activationId)) form.activationId = ''
    if (form.cardId && !cards.value.some((c) => c.id === form.cardId)) form.cardId = ''
    if (form.partnerId && !partners.value.some((p) => p.id === form.partnerId)) form.partnerId = ''
  },
)

const invoices = computed(() => props.expense?.invoices ?? [])
const viewerItems = computed<ViewerFile[]>(() =>
  invoices.value.map((a) => ({ filename: a.name, mimeType: a.mimeType, size: a.size, url: a.url ?? a.previewUrl ?? null })),
)

/** Notas deste lançamento na fila, subindo ou com erro (as prontas já vêm em `invoices`). */
const liveUploads = computed(() => {
  const id = props.expense?.id ?? savedId.value
  if (!id) return []
  return queue.items.value.filter(
    (i) => i.groupId === props.groupId && i.target.key === `expense:${id}` && (isUploadPending(i) || i.status === 'error'),
  )
})
const uploadingCount = computed(() => liveUploads.value.filter(isUploadPending).length)

const missing = computed(
  () =>
    form.status === 'PAID' &&
    !form.noInvoiceNeeded &&
    invoices.value.length + queued.value.length + liveUploads.value.length === 0,
)

function close() {
  if (saving.value) return
  emit('update:modelValue', false)
}

/** O filtro da nota (PDF, XML ou imagem), o mesmo da API. */
const invoiceFilter = expenseInvoiceTarget('-', '-').accept!

function sendInvoices(expense: { id: string; description: string }, files: File[]) {
  return queue.enqueue(
    props.groupId,
    files.map((file) => ({ file })),
    expenseInvoiceTarget(expense.id, expense.description),
    { onItemDone: () => emit('changed') },
  )
}

/** Arquivo escolhido, solto ou colado: na fila local (lançamento novo) ou direto para a bandeja. */
function addFiles(entries: UploadEntry[]) {
  if (readOnly.value || !entries.length) return
  const files = entries.map((e) => e.file)
  const ok = files.filter((f) => !invoiceFilter(f))
  if (ok.length < files.length) toast.error('Nota fiscal: envie PDF, XML ou imagem.')
  if (!ok.length) return
  if (isNew.value && !savedId.value) {
    queued.value = [...queued.value, ...ok]
    return
  }
  const id = props.expense?.id ?? savedId.value!
  sendInvoices({ id, description: props.expense?.description ?? form.description }, ok)
}

const drop = useFileDrop({ enabled: () => props.modelValue && !readOnly.value && !saving.value, onFiles: addFiles })
usePasteFiles({ enabled: () => props.modelValue && !readOnly.value && !saving.value, onFiles: addFiles, priority: 10 })

function payload(): ExpenseInput {
  const opt = (v: string) => (v.trim() ? v.trim() : null)
  return {
    companyId: form.companyId,
    date: form.date,
    description: form.description.trim(),
    amountCents: form.amountCents ?? 0,
    category: form.category,
    status: form.status,
    paymentMethod: opt(form.paymentMethod),
    supplier: opt(form.supplier),
    partnerId: opt(form.partnerId),
    campaignId: opt(form.campaignId),
    activationId: opt(form.activationId),
    cardId: opt(form.cardId),
    invoiceNumber: opt(form.invoiceNumber),
    noInvoiceNeeded: form.noInvoiceNeeded,
    notes: opt(form.notes),
  }
}

async function save() {
  if (readOnly.value || waitingUploads.value) return
  error.value = ''
  if (!form.description.trim()) return void (error.value = 'Descreva o lançamento.')
  if (!form.amountCents || form.amountCents <= 0) return void (error.value = 'Informe um valor maior que zero.')
  if (!form.date) return void (error.value = 'Escolha a data.')
  saving.value = true
  const mine = session
  let saved: MarketingExpense
  try {
    saved = props.expense
      ? await updateExpense(props.groupId, props.expense.id, payload())
      : await createExpense(props.groupId, payload())
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Não foi possível salvar o lançamento.')
    saving.value = false
    return
  }
  saving.value = false
  if (!queued.value.length) {
    toast.success(props.expense ? 'Lançamento atualizado.' : 'Lançamento criado.')
    emit('changed')
    emit('update:modelValue', false)
    return
  }
  // As notas da fila local vão para a bandeja. A janela mostra o progresso e
  // fecha quando terminarem; fechar antes não cancela nada.
  const batch = sendInvoices(saved, queued.value)
  queued.value = []
  savedId.value = saved.id
  waitingUploads.value = true
  const items = await batch.settled
  if (mine !== session) return
  waitingUploads.value = false
  const ok = items.filter((i) => i.status === 'done').length
  const failed = items.filter((i) => i.status === 'error').length
  if (failed) {
    toast.error(
      failed === 1
        ? 'Lançamento salvo, mas uma nota não subiu. Tente de novo em Envios.'
        : `Lançamento salvo, mas ${failed} notas não subiram. Tente de novo em Envios.`,
    )
  } else {
    toast.success(ok === 1 ? 'Lançamento salvo com a nota.' : ok ? `Lançamento salvo com ${ok} notas.` : 'Lançamento salvo.')
  }
  emit('changed')
  if (props.modelValue) emit('update:modelValue', false)
}

function onPick(event: Event) {
  addFiles(filesFromInput(event))
}

async function download(assetId: string) {
  try {
    const { url } = await getAssetDownload(props.groupId, assetId)
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível baixar a nota.'))
  }
}

async function doRemove() {
  if (!props.expense || !confirmRemove.value) return
  removing.value = true
  try {
    await removeInvoice(props.groupId, props.expense.id, confirmRemove.value.id)
    toast.success('Nota fiscal tirada do lançamento.')
    confirmRemove.value = null
    emit('changed')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível tirar a nota.'))
  } finally {
    removing.value = false
  }
}

async function doDelete() {
  if (!props.expense) return
  removing.value = true
  try {
    await deleteExpense(props.groupId, props.expense.id)
    toast.success('Lançamento apagado.')
    confirmDelete.value = false
    emit('changed')
    emit('update:modelValue', false)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível apagar o lançamento.'))
  } finally {
    removing.value = false
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="title"
    size="lg"
    :loading="saving"
    persistent
    @update:model-value="close"
  >
    <header class="fx-head">
      <Wallet :size="18" aria-hidden="true" />
      <h2>{{ title }}</h2>
      <span v-if="expense?.recurringId" class="mk-chip" title="Lançado por uma regra recorrente">
        <Repeat :size="12" aria-hidden="true" /> Recorrente
      </span>
      <button type="button" class="mk-icon-btn fx-close" aria-label="Fechar" @click="close">
        <X :size="16" />
      </button>
    </header>

    <form class="fx-body" :class="{ 'is-over': drop.isOver.value }" novalidate @submit.prevent="save" v-on="drop.on">
      <div class="fx-grid">
        <div v-if="brands.length > 1" class="mk-field">
          <span class="mk-label">Marca</span>
          <AppSelect
            :model-value="form.companyId"
            :items="brandItems"
            label="Marca"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.companyId = asText($event)"
          />
        </div>
        <label class="mk-field">
          <span class="mk-label">Data</span>
          <input v-model="form.date" type="date" class="mk-input" :disabled="readOnly" required />
        </label>
        <label class="mk-field fx-span">
          <span class="mk-label">Descrição</span>
          <input
            v-model="form.description"
            class="mk-input"
            maxlength="200"
            placeholder="Ex.: Folders da Feira Pet (500 un.)"
            :disabled="readOnly"
            required
          />
        </label>
        <div class="mk-field">
          <label class="mk-label" for="fx-amount">Valor</label>
          <MoneyInput id="fx-amount" v-model="form.amountCents" :disabled="readOnly" />
        </div>
        <div class="mk-field">
          <span class="mk-label">Situação</span>
          <AppSelect
            :model-value="form.status"
            :items="statusItems"
            label="Situação"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.status = $event as ExpenseStatus"
          />
        </div>
        <div class="mk-field">
          <span class="mk-label">Categoria</span>
          <AppSelect
            :model-value="form.category"
            :items="categoryItems"
            label="Categoria"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.category = asText($event)"
          />
        </div>
        <label class="mk-field">
          <span class="mk-label">Forma de pagamento</span>
          <input
            v-model="form.paymentMethod"
            class="mk-input"
            list="fx-payment"
            maxlength="60"
            placeholder="Pix, cartão..."
            :disabled="readOnly"
          />
          <!-- Nativo de propósito: texto livre com sugestões (Pix, cartão...); o AppSelect só escolhe entre opções fixas. -->
          <datalist id="fx-payment">
            <option v-for="p in PAYMENT_METHODS" :key="p" :value="p" />
          </datalist>
        </label>
        <label class="mk-field">
          <span class="mk-label">Fornecedor</span>
          <input v-model="form.supplier" class="mk-input" maxlength="120" :disabled="readOnly" />
        </label>
        <div class="mk-field">
          <span class="mk-label">Parceiro</span>
          <AppSelect
            :model-value="form.partnerId"
            :items="partnerItems"
            label="Parceiro"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.partnerId = asText($event)"
          />
        </div>
        <div class="mk-field">
          <span class="mk-label">Campanha</span>
          <AppSelect
            :model-value="form.campaignId"
            :items="campaignItems"
            label="Campanha"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.campaignId = asText($event)"
          />
        </div>
        <div class="mk-field">
          <span class="mk-label">Ativação</span>
          <AppSelect
            :model-value="form.activationId"
            :items="activationItems"
            label="Ativação"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.activationId = asText($event)"
          />
        </div>
        <div class="mk-field">
          <span class="mk-label">Card (peça)</span>
          <AppSelect
            :model-value="form.cardId"
            :items="cardItems"
            label="Card (peça)"
            density="compact"
            :disabled="readOnly"
            @update:model-value="form.cardId = asText($event)"
          />
        </div>
        <label class="mk-field">
          <span class="mk-label">Nº da nota fiscal</span>
          <input v-model="form.invoiceNumber" class="mk-input" maxlength="60" :disabled="readOnly" />
        </label>
        <label class="mk-field fx-span">
          <span class="mk-label">Observações</span>
          <textarea v-model="form.notes" class="mk-textarea fx-notes" maxlength="2000" :disabled="readOnly" />
        </label>
      </div>

      <section class="fx-invoices" aria-label="Notas fiscais">
        <div class="fx-invoices__head">
          <span class="mk-label">Notas fiscais</span>
          <span v-if="missing" class="mk-chip" data-tone :style="{ '--mk-tone': 'var(--warn)' }">Sem nota</span>
          <span class="mk-toolbar__spacer" />
          <label class="fx-check">
            <input v-model="form.noInvoiceNeeded" type="checkbox" :disabled="readOnly" />
            Não precisa de nota
          </label>
        </div>

        <ul v-if="invoices.length || queued.length || liveUploads.length" class="fx-files">
          <li v-for="(a, i) in invoices" :key="a.id" class="fx-file">
            <FileText :size="15" aria-hidden="true" />
            <button type="button" class="fx-file__name" :title="a.name" @click="viewerIndex = i">{{ a.name }}</button>
            <span class="fin-muted mk-num">{{ formatBytes(a.size) }}</span>
            <button type="button" class="mk-icon-btn" :aria-label="`Baixar ${a.name}`" @click="download(a.id)">
              <Download :size="15" />
            </button>
            <button
              v-if="canEdit"
              type="button"
              class="mk-icon-btn"
              :aria-label="`Tirar ${a.name}`"
              @click="confirmRemove = { id: a.id, name: a.name }"
            >
              <Trash2 :size="15" />
            </button>
          </li>
          <li v-for="(f, i) in queued" :key="`q-${i}`" class="fx-file is-queued">
            <Paperclip :size="15" aria-hidden="true" />
            <span class="fx-file__name">{{ f.name }}</span>
            <span class="fin-muted">sobe ao salvar</span>
            <button type="button" class="mk-icon-btn" :aria-label="`Tirar ${f.name} da fila`" @click="queued.splice(i, 1)">
              <X :size="15" />
            </button>
          </li>
          <li
            v-for="u in liveUploads"
            :key="u.id"
            class="fx-up"
            :class="{ 'is-error': u.status === 'error' }"
            :data-upload="u.status"
          >
            <Upload :size="15" aria-hidden="true" />
            <span class="fx-file__name" :title="u.name">{{ u.name }}</span>
            <span class="fx-up__state" :role="u.status === 'error' ? 'alert' : 'status'">{{ itemStatusText(u) }}</span>
            <button
              v-if="u.status === 'error'"
              type="button"
              class="mk-icon-btn"
              :aria-label="`Tentar de novo ${u.name}`"
              @click="queue.retry(u.id)"
            >
              <RotateCw :size="15" />
            </button>
            <button v-else type="button" class="mk-icon-btn" :aria-label="`Cancelar o envio de ${u.name}`" @click="queue.cancel(u.id)">
              <X :size="15" />
            </button>
          </li>
        </ul>
        <p v-else class="mk-hint">Nenhuma nota anexada.</p>

        <div v-if="waitingUploads" class="fx-progress" role="status">
          Enviando {{ uploadingCount === 1 ? 'a nota' : `${uploadingCount} notas` }}. Pode fechar a janela: o envio continua em Envios.
        </div>

        <div v-if="canEdit" class="fx-drop">
          <button type="button" class="mk-btn" @click="fileInput?.click()">
            <Paperclip :size="15" aria-hidden="true" /> Anexar nota
          </button>
          <span class="mk-hint">PDF, XML ou imagem. Pode soltar aqui ou colar com Ctrl+V.</span>
          <UploadSourceButtons
            class="fx-sources"
            accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml"
            camera-label="Fotografar nota"
            @files="addFiles"
          />
          <input
            ref="fileInput"
            type="file"
            class="fx-hidden"
            multiple
            accept=".pdf,.xml,image/*,application/pdf,text/xml,application/xml"
            @change="onPick"
          />
        </div>
      </section>

      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      <p v-if="expense?.createdBy" class="mk-hint">Lançado por {{ expense.createdBy.name }}.</p>

      <footer class="fx-foot">
        <button
          v-if="expense && canEdit && expense.canDelete"
          type="button"
          class="mk-btn mk-btn--ghost mk-btn--danger"
          @click="confirmDelete = true"
        >
          <Trash2 :size="15" aria-hidden="true" /> Apagar
        </button>
        <span class="mk-toolbar__spacer" />
        <button type="button" class="mk-btn mk-btn--ghost" @click="close">{{ readOnly ? 'Fechar' : 'Cancelar' }}</button>
        <button v-if="!readOnly" type="submit" class="mk-btn mk-btn--primary" :disabled="saving || waitingUploads">
          {{ saving ? 'Salvando...' : waitingUploads ? 'Enviando as notas...' : isNew ? 'Lançar' : 'Salvar' }}
        </button>
      </footer>
    </form>
  </AppDialog>

  <ConfirmDialog
    v-model="confirmDelete"
    title="Apagar lançamento?"
    message="As notas fiscais anexadas são apagadas junto. Não dá para desfazer."
    confirm-label="Apagar"
    danger
    :loading="removing"
    @confirm="doDelete"
  />
  <ConfirmDialog
    :model-value="!!confirmRemove"
    title="Tirar a nota fiscal?"
    :message="`${confirmRemove?.name ?? ''} sai do lançamento e é apagada de vez.`"
    confirm-label="Tirar"
    danger
    :loading="removing"
    @update:model-value="(v: boolean) => !v && (confirmRemove = null)"
    @confirm="doRemove"
  />
  <FileViewer
    v-if="viewerIndex !== null && viewerItems.length"
    :items="viewerItems"
    :start-index="viewerIndex"
    @close="viewerIndex = null"
  />
</template>

<style scoped>
.fx-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-2);
}

.fx-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
}

.fx-close {
  margin-left: auto;
}

.fx-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 14px 16px 16px;
  overflow-y: auto;
}

.fx-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
}

.fx-span {
  grid-column: 1 / -1;
}

.fx-notes {
  min-height: 56px;
}

.fx-invoices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.fx-invoices__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.fx-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
}

.fx-files {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fx-file {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 13px;
}

.fx-file:hover {
  background: var(--surface);
}

.fx-file__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.fx-file.is-queued .fx-file__name {
  cursor: default;
}

button.fx-file__name:hover {
  text-decoration: underline;
}

.fx-progress {
  color: var(--text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.fx-body.is-over {
  outline: 2px dashed var(--accent);
  outline-offset: -6px;
  background: color-mix(in srgb, var(--accent-soft) 45%, transparent);
}

.fx-up {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 2px 4px;
  color: var(--text-2);
  font-size: 13px;
}

.fx-up__state {
  flex: none;
  max-width: 55%;
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fx-up.is-error .fx-up__state {
  color: var(--err);
}

.fx-sources {
  flex-basis: 100%;
}

.fx-drop {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fx-hidden {
  display: none;
}

.fx-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

@media (max-width: 640px) {
  .fx-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .fx-check {
    min-height: 44px;
  }
}
</style>
