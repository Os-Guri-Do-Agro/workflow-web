<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Download, FileText, Paperclip, Repeat, Trash2, Wallet, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FileViewer, { type ViewerFile } from '@/components/ui/FileViewer.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { getAssetDownload, uploadMarketingFile, type MarketingBrand } from '@/service/marketing/marketing-core'
import {
  createExpense,
  deleteExpense,
  invoiceTicket,
  removeInvoice,
  updateExpense,
  type ExpenseInput,
  type ExpenseStatus,
  type FinanceOptions,
  type MarketingExpense,
} from '@/service/marketing/marketing-finance'
import { formatBytes } from '../marketing-labels'
import MoneyInput from './MoneyInput.vue'
import { defaultDateFor } from './finance-format'

/**
 * Lançamento completo: criar (com notas na fila, sobem depois de salvar),
 * editar, ver (Visualizador) e as notas fiscais (ver, baixar o original, tirar).
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
const uploading = ref<{ name: string; percent: number } | null>(null)
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
  uploading.value = null
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

const missing = computed(
  () => form.status === 'PAID' && !form.noInvoiceNeeded && invoices.value.length + queued.value.length === 0,
)

function close() {
  if (saving.value || uploading.value) return
  emit('update:modelValue', false)
}

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

async function uploadFiles(expenseId: string, files: File[]) {
  let ok = 0
  for (const file of files) {
    uploading.value = { name: file.name, percent: 0 }
    try {
      await uploadMarketingFile(props.groupId, file, invoiceTicket(props.groupId, expenseId), (p) => {
        uploading.value = { name: file.name, percent: p }
      })
      ok++
    } catch (e) {
      toast.error(getApiErrorMessage(e, `Não foi possível anexar ${file.name}.`))
    }
  }
  uploading.value = null
  return ok
}

async function save() {
  if (readOnly.value) return
  error.value = ''
  if (!form.description.trim()) return void (error.value = 'Descreva o lançamento.')
  if (!form.amountCents || form.amountCents <= 0) return void (error.value = 'Informe um valor maior que zero.')
  if (!form.date) return void (error.value = 'Escolha a data.')
  saving.value = true
  try {
    const saved = props.expense
      ? await updateExpense(props.groupId, props.expense.id, payload())
      : await createExpense(props.groupId, payload())
    if (queued.value.length) {
      const n = await uploadFiles(saved.id, queued.value)
      queued.value = []
      if (n) toast.success(n === 1 ? 'Lançamento salvo com a nota.' : `Lançamento salvo com ${n} notas.`)
    } else {
      toast.success(props.expense ? 'Lançamento atualizado.' : 'Lançamento criado.')
    }
    emit('changed')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Não foi possível salvar o lançamento.')
  } finally {
    saving.value = false
  }
}

async function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  if (isNew.value) {
    queued.value = [...queued.value, ...files]
    return
  }
  const n = await uploadFiles(props.expense!.id, files)
  if (n) {
    toast.success(n === 1 ? 'Nota anexada.' : `${n} notas anexadas.`)
    emit('changed')
  }
}

async function onDrop(event: DragEvent) {
  if (readOnly.value) return
  const files = [...(event.dataTransfer?.files ?? [])]
  if (!files.length) return
  if (isNew.value) {
    queued.value = [...queued.value, ...files]
    return
  }
  const n = await uploadFiles(props.expense!.id, files)
  if (n) emit('changed')
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
    :loading="saving || !!uploading"
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

    <form class="fx-body" novalidate @submit.prevent="save" @dragover.prevent @drop.prevent="onDrop">
      <div class="fx-grid">
        <label v-if="brands.length > 1" class="mk-field">
          <span class="mk-label">Marca</span>
          <select v-model="form.companyId" class="mk-select" :disabled="readOnly">
            <option v-for="b in brands" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
          </select>
        </label>
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
        <label class="mk-field">
          <span class="mk-label">Situação</span>
          <select v-model="form.status" class="mk-select" :disabled="readOnly">
            <option value="PAID">Pago</option>
            <option value="PLANNED">Previsto</option>
          </select>
        </label>
        <label class="mk-field">
          <span class="mk-label">Categoria</span>
          <select v-model="form.category" class="mk-select" :disabled="readOnly">
            <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
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
          <datalist id="fx-payment">
            <option v-for="p in PAYMENT_METHODS" :key="p" :value="p" />
          </datalist>
        </label>
        <label class="mk-field">
          <span class="mk-label">Fornecedor</span>
          <input v-model="form.supplier" class="mk-input" maxlength="120" :disabled="readOnly" />
        </label>
        <label class="mk-field">
          <span class="mk-label">Parceiro</span>
          <select v-model="form.partnerId" class="mk-select" :disabled="readOnly">
            <option value="">Nenhum</option>
            <option v-for="p in partners" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="mk-field">
          <span class="mk-label">Campanha</span>
          <select v-model="form.campaignId" class="mk-select" :disabled="readOnly">
            <option value="">Nenhuma</option>
            <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="mk-field">
          <span class="mk-label">Ativação</span>
          <select v-model="form.activationId" class="mk-select" :disabled="readOnly">
            <option value="">Nenhuma</option>
            <option v-for="a in activations" :key="a.id" :value="a.id">{{ a.title }}</option>
          </select>
        </label>
        <label class="mk-field">
          <span class="mk-label">Card (peça)</span>
          <select v-model="form.cardId" class="mk-select" :disabled="readOnly">
            <option value="">Nenhum</option>
            <option v-for="c in cards" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
        </label>
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

        <ul v-if="invoices.length || queued.length" class="fx-files">
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
        </ul>
        <p v-else class="mk-hint">Nenhuma nota anexada.</p>

        <div v-if="uploading" class="fx-progress" role="status">
          Enviando {{ uploading.name }}: {{ uploading.percent }}%
        </div>

        <div v-if="canEdit" class="fx-drop">
          <button type="button" class="mk-btn" :disabled="!!uploading" @click="fileInput?.click()">
            <Paperclip :size="15" aria-hidden="true" /> Anexar nota
          </button>
          <span class="mk-hint">PDF, XML ou imagem. Pode soltar o arquivo aqui.</span>
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
        <button v-if="!readOnly" type="submit" class="mk-btn mk-btn--primary" :disabled="saving || !!uploading">
          {{ saving ? 'Salvando...' : isNew ? 'Lançar' : 'Salvar' }}
        </button>
      </footer>
    </form>
  </AppDialog>

  <ConfirmDialog
    v-model="confirmDelete"
    title="Apagar lançamento?"
    message="As notas fiscais anexadas saem do storage junto. Não dá para desfazer."
    confirm-label="Apagar"
    danger
    :loading="removing"
    @confirm="doDelete"
  />
  <ConfirmDialog
    :model-value="!!confirmRemove"
    title="Tirar a nota fiscal?"
    :message="`${confirmRemove?.name ?? ''} sai do lançamento e do storage.`"
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
