<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import { Check, FileText, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FileViewer, { type ViewerFile } from '@/components/ui/FileViewer.vue'
import { useToast } from '@/composables/useToast'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { hasSession } from '@/composables/useSession'
import { getApiErrorMessage } from '@/service/api'
import {
  chooseQuote,
  createQuote,
  deleteQuote,
  deleteQuoteFile,
  listQuotes,
  updateQuote,
  uploadQuoteFile,
  type Quote,
  type QuoteInput,
  type QuoteStatus,
} from '@/service/marketing/marketing-quotes'
import { useMarketing } from '../composables/useMarketing'
import { formatBytes, formatCents, parseMoneyToCents } from '../marketing-labels'
import { todaySp } from '../calendar/calendar-time'
import FormDialog from '../events/FormDialog.vue'
import { usePartnersList } from '../partners/usePartners'

/**
 * Orçamentos de fornecedores, reutilizável: na ativação, no parceiro e, na
 * junção, na Gráfica (M2). Não depende de nada da M2: a peça impressa entra
 * pelo `cardId`. Valor e arquivos só aparecem para quem vê o financeiro (a API
 * devolve `null`); Escolher é do Admin e do Dono.
 */
const props = defineProps<{
  groupId: string
  /** Marca do contexto. Sem ela (e sem card nem ativação), o formulário pergunta. */
  companyId?: string | null
  partnerId?: string | null
  cardId?: string | null
  activationId?: string | null
  title?: string
}>()

const mk = useMarketing()
const qc = useQueryClient()
const { success, error: toastError } = useToast()
const { me } = useCurrentUser()

const filters = computed(() => ({
  partnerId: props.partnerId ?? null,
  cardId: props.cardId ?? null,
  activationId: props.activationId ?? null,
}))

const quotesQuery = useQuery({
  queryKey: computed(() => ['marketing', props.groupId, 'quotes', filters.value] as const),
  queryFn: () => listQuotes(props.groupId, filters.value),
  enabled: hasSession,
  staleTime: 15_000,
})
const quotes = computed(() => quotesQuery.data.value ?? [])

const canEdit = computed(() => mk.can('EDITOR'))
const canChoose = computed(() => mk.can('ADMIN'))
const seesFinance = computed(() => mk.permissions.value?.seeFinance ?? false)

function canDeleteQuote(q: Quote) {
  if (mk.can('ADMIN')) return true
  if (!mk.can('EDITOR')) return false
  return !!mk.settings.value?.editorCanDelete || q.createdById === me.value?.id
}

function refresh() {
  void qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
}

function fail(error: unknown, fallback: string) {
  toastError(getApiErrorMessage(error, fallback))
}

// ── Formulário (novo e editar) ─────────────────────────────────────────────

const needsBrand = computed(() => !props.companyId && !props.cardId && !props.activationId)
const form = reactive({
  id: '' as string,
  description: '',
  amount: '',
  companyId: '',
  partnerId: '',
  supplierName: '',
  validUntil: '',
  notes: '',
})
const formOpen = ref(false)
const formError = ref('')

const formBrand = computed(() => props.companyId || form.companyId || null)
const partnersQuery = usePartnersList(
  () => props.groupId,
  () => ({ companyId: formBrand.value }),
)
const partnerOptions = computed(() => partnersQuery.data.value ?? [])

function openNew() {
  Object.assign(form, {
    id: '',
    description: '',
    amount: '',
    companyId: mk.brandFilter.value ?? mk.brands.value[0]?.companyId ?? '',
    partnerId: props.partnerId ?? '',
    supplierName: '',
    validUntil: '',
    notes: '',
  })
  formError.value = ''
  formOpen.value = true
}

function openEdit(q: Quote) {
  Object.assign(form, {
    id: q.id,
    description: q.description,
    amount: q.amountCents === null ? '' : (q.amountCents / 100).toFixed(2).replace('.', ','),
    companyId: q.companyId ?? '',
    partnerId: q.partnerId ?? '',
    supplierName: q.supplierName ?? '',
    validUntil: q.validUntil ?? '',
    notes: q.notes ?? '',
  })
  formError.value = ''
  formOpen.value = true
}

const saveMutation = useMutation({
  mutationFn: async () => {
    const cents = parseMoneyToCents(form.amount)
    if (!form.description.trim()) throw new Error('Descreva o orçamento.')
    if (cents === null || cents <= 0) throw new Error('Informe o valor do orçamento.')
    const fixedPartner = props.partnerId || null
    const partnerId = fixedPartner ?? (form.partnerId || null)
    if (!partnerId && !form.supplierName.trim()) throw new Error('Escolha o parceiro ou digite o nome do fornecedor.')
    const base: QuoteInput = {
      description: form.description.trim(),
      amountCents: cents,
      partnerId,
      supplierName: partnerId ? null : form.supplierName.trim(),
      validUntil: form.validUntil || null,
      notes: form.notes.trim() || null,
    }
    if (form.id) return updateQuote(props.groupId, form.id, base)
    return createQuote(props.groupId, {
      ...base,
      companyId: props.companyId || (needsBrand.value ? form.companyId : null) || null,
      cardId: props.cardId ?? null,
      activationId: props.activationId ?? null,
    })
  },
  onSuccess: () => {
    formOpen.value = false
    success(form.id ? 'Orçamento atualizado.' : 'Orçamento registrado.')
    refresh()
  },
  onError: (error) => {
    formError.value =
      error instanceof Error && !axios.isAxiosError(error)
        ? error.message
        : getApiErrorMessage(error, 'Não foi possível salvar o orçamento.')
  },
})

// ── Escolher ───────────────────────────────────────────────────────────────

const chooseOpen = ref(false)
const chooseTarget = ref<Quote | null>(null)
const choose = reactive({ createExpense: true, date: '', category: '' })
const chooseError = ref('')

/** Hoje em Brasília (o financeiro e a API contam o dia assim). */
const todayYmd = () => todaySp()

function openChoose(q: Quote) {
  const categories = mk.settings.value?.expenseCategories ?? []
  const guess = q.cardId ? 'Gráfica' : q.activationId ? 'Eventos e ativações' : ''
  chooseTarget.value = q
  choose.createExpense = true
  choose.date = todayYmd()
  choose.category = categories.includes(guess) ? guess : (categories[0] ?? '')
  chooseError.value = ''
  chooseOpen.value = true
}

const chooseMutation = useMutation({
  mutationFn: () =>
    chooseQuote(
      props.groupId,
      chooseTarget.value!.id,
      choose.createExpense ? { date: choose.date, category: choose.category } : undefined,
    ),
  onSuccess: (res) => {
    chooseOpen.value = false
    const declined = res.declinedIds.length
    success(
      `Orçamento escolhido${declined ? `, ${declined} recusado${declined > 1 ? 's' : ''}` : ''}${
        res.expenseId ? '. Lançamento previsto criado.' : '.'
      }`,
    )
    refresh()
  },
  onError: (error) => {
    // 409: já há um escolhido para o mesmo card ou ativação (ou este acabou de
    // ser escolhido por outra pessoa). A frase da API diz o que fazer; a lista
    // atualiza para mostrar quem está escolhido agora.
    chooseError.value = getApiErrorMessage(error, 'Não foi possível escolher o orçamento.')
    if (axios.isAxiosError(error) && error.response?.status === 409) refresh()
  },
})

/**
 * Só concorrem entre si os orçamentos do mesmo card (peça) ou da mesma
 * ativação: o de parceiro solto não recusa ninguém (a API não mexe nos outros).
 */
const chooseText = computed(() => {
  const t = chooseTarget.value
  if (!t) return ''
  if (t.cardId) return 'vira o escolhido, e os outros orçamentos da mesma peça ficam como recusados.'
  if (t.activationId) return 'vira o escolhido, e os outros orçamentos da mesma ativação ficam como recusados.'
  return 'vira o escolhido. Ele não está ligado a uma peça nem a uma ativação, então os outros orçamentos continuam como estão.'
})

// ── Excluir orçamento e arquivos ───────────────────────────────────────────

const removeTarget = ref<Quote | null>(null)
const removeOpen = computed({
  get: () => !!removeTarget.value,
  set: (v) => {
    if (!v) removeTarget.value = null
  },
})
const removeMutation = useMutation({
  mutationFn: () => deleteQuote(props.groupId, removeTarget.value!.id),
  onSuccess: () => {
    removeTarget.value = null
    success('Orçamento apagado.')
    refresh()
  },
  onError: (error) => fail(error, 'Não foi possível apagar o orçamento.'),
})

const removeMessage = computed(
  () =>
    `O orçamento "${removeTarget.value?.description ?? ''}" e os arquivos dele saem do sistema. Lançamentos já criados no financeiro continuam lá.`,
)

const fileRemove = ref<{ quote: Quote; assetId: string; name: string } | null>(null)
const fileRemoveOpen = computed({
  get: () => !!fileRemove.value,
  set: (v) => {
    if (!v) fileRemove.value = null
  },
})
const fileRemoveMessage = computed(
  () => `"${fileRemove.value?.name ?? ''}" sai do orçamento e do armazenamento.`,
)
const fileRemoveMutation = useMutation({
  mutationFn: () => deleteQuoteFile(props.groupId, fileRemove.value!.quote.id, fileRemove.value!.assetId),
  onSuccess: () => {
    fileRemove.value = null
    refresh()
  },
  onError: (error) => fail(error, 'Não foi possível apagar o arquivo.'),
})

// ── Arquivos ───────────────────────────────────────────────────────────────

const fileInput = ref<HTMLInputElement | null>(null)
const uploadFor = ref<string | null>(null)
const uploading = ref<Record<string, number>>({})

function pickFiles(q: Quote) {
  uploadFor.value = q.id
  fileInput.value?.click()
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  const quoteId = uploadFor.value
  input.value = ''
  if (!quoteId || !files.length) return
  for (const file of files) {
    const key = `${quoteId}:${file.name}`
    uploading.value = { ...uploading.value, [key]: 0 }
    try {
      await uploadQuoteFile(props.groupId, quoteId, file, (p) => {
        uploading.value = { ...uploading.value, [key]: p }
      })
    } catch (error) {
      fail(error, `Não foi possível enviar "${file.name}".`)
    } finally {
      const { [key]: _done, ...rest } = uploading.value
      uploading.value = rest
    }
  }
  refresh()
}

function uploadingFor(q: Quote) {
  return Object.entries(uploading.value).filter(([k]) => k.startsWith(`${q.id}:`))
}

const viewer = ref<{ items: ViewerFile[]; start: number } | null>(null)
function openFile(q: Quote, index: number) {
  viewer.value = {
    start: index,
    items: q.files.map((f) => ({
      filename: f.name,
      mimeType: f.mimeType,
      size: f.size,
      url: f.previewUrl ?? f.url ?? null,
    })),
  }
}

// ── Apresentação ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<QuoteStatus, string> = { RECEIVED: 'Recebido', CHOSEN: 'Escolhido', DECLINED: 'Recusado' }
const STATUS_TONE: Record<QuoteStatus, string> = { RECEIVED: 'amber', CHOSEN: 'green', DECLINED: 'slate' }

function supplierOf(q: Quote) {
  return q.partner?.name ?? q.supplierName ?? 'Sem fornecedor'
}

function validityOf(q: Quote): { text: string; late: boolean } | null {
  if (!q.validUntil) return null
  const [y, m, d] = q.validUntil.split('-')
  const late = q.status === 'RECEIVED' && q.validUntil < todayYmd()
  return { text: `${late ? 'venceu em' : 'válido até'} ${d}/${m}/${y}`, late }
}

/** Quando o orçamento é de outro contexto (ex.: lista do parceiro), diz a que ele se liga. */
function linkOf(q: Quote) {
  const parts: string[] = []
  if (q.activation && !props.activationId) parts.push(`Ativação: ${q.activation.title}`)
  if (q.card && !props.cardId) parts.push(`Peça: ${q.card.title}`)
  return parts.join(' · ')
}
</script>

<template>
  <section class="qp" aria-label="Orçamentos">
    <header class="qp__head">
      <h3 class="qp__title">
        {{ title ?? 'Orçamentos' }}
        <span v-if="quotes.length" class="qp__count">{{ quotes.length }}</span>
      </h3>
      <button v-if="canEdit" type="button" class="mk-btn" @click="openNew">
        <Plus :size="14" aria-hidden="true" />
        Novo orçamento
      </button>
    </header>

    <p v-if="quotesQuery.isLoading.value" class="mk-hint">Carregando orçamentos...</p>
    <div v-else-if="quotesQuery.isError.value && !quotesQuery.data.value" class="mk-load-error" role="alert">
      <p>{{ getApiErrorMessage(quotesQuery.error.value, 'Não foi possível carregar os orçamentos.') }}</p>
      <button type="button" class="mk-btn" @click="quotesQuery.refetch()">Tentar de novo</button>
    </div>
    <p v-else-if="!quotes.length" class="qp__empty">
      Nenhum orçamento ainda.
      <template v-if="canEdit">Registre o que cada fornecedor passou para comparar e escolher.</template>
    </p>

    <ul v-else class="qp__list">
      <li v-for="q in quotes" :key="q.id" class="qp__item" :class="`is-${q.status.toLowerCase()}`">
        <div class="qp__main">
          <div class="qp__line">
            <strong class="qp__desc">{{ q.description }}</strong>
            <span class="mk-chip" data-tone :style="{ '--mk-tone': `var(--tag-${STATUS_TONE[q.status]})` }">
              {{ STATUS_LABEL[q.status] }}
            </span>
          </div>
          <div class="qp__meta">
            <span>{{ supplierOf(q) }}</span>
            <span v-if="validityOf(q)" :class="{ 'mk-late': validityOf(q)!.late }">{{ validityOf(q)!.text }}</span>
            <span v-if="linkOf(q)">{{ linkOf(q) }}</span>
          </div>
          <p v-if="q.notes" class="qp__notes">{{ q.notes }}</p>

          <div v-if="q.files.length || uploadingFor(q).length" class="qp__files">
            <span v-for="(f, i) in q.files" :key="f.id" class="qp__file">
              <button type="button" class="qp__file-open" :title="`${f.name} (${formatBytes(f.size)})`" @click="openFile(q, i)">
                <FileText :size="13" aria-hidden="true" />
                <span class="qp__file-name">{{ f.name }}</span>
              </button>
              <button
                v-if="canEdit"
                type="button"
                class="qp__file-x"
                :aria-label="`Apagar o arquivo ${f.name}`"
                @click="fileRemove = { quote: q, assetId: f.id, name: f.name }"
              >
                <X :size="12" aria-hidden="true" />
              </button>
            </span>
            <span v-for="[key, pct] in uploadingFor(q)" :key="key" class="qp__file qp__file--busy">
              Enviando {{ key.split(':').slice(1).join(':') }} ({{ pct }}%)
            </span>
          </div>
        </div>

        <div class="qp__side">
          <span v-if="q.amountCents !== null" class="qp__amount mk-num">{{ formatCents(q.amountCents) }}</span>
          <div class="qp__actions">
            <button
              v-if="canChoose && q.status !== 'CHOSEN'"
              type="button"
              class="mk-btn mk-btn--success qp__choose"
              @click="openChoose(q)"
            >
              <Check :size="14" aria-hidden="true" />
              Escolher
            </button>
            <button
              v-if="canEdit && seesFinance"
              type="button"
              class="mk-icon-btn"
              aria-label="Anexar arquivo"
              title="Anexar arquivo"
              @click="pickFiles(q)"
            >
              <Paperclip :size="15" aria-hidden="true" />
            </button>
            <button v-if="canEdit" type="button" class="mk-icon-btn" aria-label="Editar orçamento" title="Editar" @click="openEdit(q)">
              <Pencil :size="15" aria-hidden="true" />
            </button>
            <button
              v-if="canDeleteQuote(q)"
              type="button"
              class="mk-icon-btn"
              aria-label="Apagar orçamento"
              title="Apagar"
              @click="removeTarget = q"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </div>
        </div>
      </li>
    </ul>

    <input ref="fileInput" type="file" multiple class="qp__input" tabindex="-1" aria-hidden="true" @change="onFiles" />

    <FormDialog
      v-model="formOpen"
      :title="form.id ? 'Editar orçamento' : 'Novo orçamento'"
      :loading="saveMutation.isPending.value"
      @submit="saveMutation.mutate()"
    >
      <div class="mk-field">
        <label class="mk-label" for="qp-desc">O que foi orçado</label>
        <input id="qp-desc" v-model="form.description" class="mk-input" maxlength="300" placeholder="Ex.: 500 folders A5 em couchê" autocomplete="off" />
      </div>
      <div class="qp__row">
        <div class="mk-field">
          <label class="mk-label" for="qp-amount">Valor (R$)</label>
          <input id="qp-amount" v-model="form.amount" class="mk-input" inputmode="decimal" placeholder="0,00" autocomplete="off" />
        </div>
        <div class="mk-field">
          <label class="mk-label" for="qp-valid">Válido até</label>
          <input id="qp-valid" v-model="form.validUntil" type="date" class="mk-input" />
        </div>
      </div>
      <div v-if="needsBrand && !form.id" class="mk-field">
        <label class="mk-label" for="qp-brand">Marca</label>
        <select id="qp-brand" v-model="form.companyId" class="mk-select">
          <option v-for="b in mk.brands.value" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
        </select>
      </div>
      <template v-if="!partnerId">
        <div class="mk-field">
          <label class="mk-label" for="qp-partner">Fornecedor</label>
          <select id="qp-partner" v-model="form.partnerId" class="mk-select">
            <option value="">Sem cadastro (digitar o nome)</option>
            <option v-for="p in partnerOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div v-if="!form.partnerId" class="mk-field">
          <label class="mk-label" for="qp-supplier">Nome do fornecedor</label>
          <input id="qp-supplier" v-model="form.supplierName" class="mk-input" maxlength="200" autocomplete="off" />
        </div>
      </template>
      <div class="mk-field">
        <label class="mk-label" for="qp-notes">Observações</label>
        <textarea id="qp-notes" v-model="form.notes" class="mk-textarea" rows="3" maxlength="5000" />
      </div>
      <p v-if="!form.id" class="mk-hint">Depois de salvar, use o clipe para anexar o PDF ou a imagem do orçamento.</p>
      <p v-if="formError" class="mk-error" role="alert">{{ formError }}</p>
    </FormDialog>

    <FormDialog
      v-model="chooseOpen"
      title="Escolher este orçamento"
      submit-label="Escolher"
      :loading="chooseMutation.isPending.value"
      :disabled="choose.createExpense && (!choose.date || !choose.category)"
      @submit="chooseMutation.mutate()"
    >
      <p class="qp__choose-text">
        <strong>{{ chooseTarget?.description }}</strong>
        <span v-if="chooseTarget?.amountCents !== null && chooseTarget"> por {{ formatCents(chooseTarget.amountCents) }}</span>
        {{ chooseText }}
      </p>
      <label class="qp__check">
        <input v-model="choose.createExpense" type="checkbox" />
        Lançar no financeiro como previsto
      </label>
      <div v-if="choose.createExpense" class="qp__row">
        <div class="mk-field">
          <label class="mk-label" for="qp-exp-date">Data do lançamento</label>
          <input id="qp-exp-date" v-model="choose.date" type="date" class="mk-input" />
        </div>
        <div class="mk-field">
          <label class="mk-label" for="qp-exp-cat">Categoria</label>
          <select id="qp-exp-cat" v-model="choose.category" class="mk-select">
            <option v-for="c in mk.settings.value?.expenseCategories ?? []" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>
      <p v-if="chooseError" class="mk-error" role="alert">{{ chooseError }}</p>
    </FormDialog>

    <ConfirmDialog
      v-model="removeOpen"
      title="Apagar este orçamento?"
      :message="removeMessage"
      confirm-label="Apagar"
      danger
      :loading="removeMutation.isPending.value"
      @confirm="removeMutation.mutate()"
    />
    <ConfirmDialog
      v-model="fileRemoveOpen"
      title="Apagar este arquivo?"
      :message="fileRemoveMessage"
      confirm-label="Apagar"
      danger
      :loading="fileRemoveMutation.isPending.value"
      @confirm="fileRemoveMutation.mutate()"
    />

    <FileViewer v-if="viewer" :items="viewer.items" :start-index="viewer.start" @close="viewer = null" />
  </section>
</template>

<style scoped>
.qp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.qp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.qp__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.qp__count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.qp__empty {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
}

.qp__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.qp__item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.qp__item:last-child {
  border-bottom: 0;
}

.qp__item.is-chosen {
  background: color-mix(in srgb, var(--success) 7%, transparent);
}

.qp__item.is-declined .qp__desc,
.qp__item.is-declined .qp__amount {
  color: var(--text-3);
  text-decoration: line-through;
}

.qp__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.qp__line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.qp__desc {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.qp__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  color: var(--text-3);
  font-size: 12px;
}

.qp__notes {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
  white-space: pre-wrap;
}

.qp__files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qp__file {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  font-size: 12px;
}

.qp__file--busy {
  padding: 3px 8px;
  color: var(--text-3);
}

.qp__file-open {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 3px 6px 3px 8px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.qp__file-open:hover {
  color: var(--accent-ink);
}

.qp__file-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qp__file-x {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-left: 1px solid var(--border);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.qp__file-x:hover {
  color: var(--err);
}

.qp__side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.qp__amount {
  font-size: 14px;
  font-weight: 700;
}

.qp__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 2px;
}

.qp__choose {
  min-height: 28px;
  padding: 3px 10px;
  margin-right: 4px;
}

.qp__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.qp__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.qp__check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.qp__choose-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

@media (max-width: 640px) {
  .qp__item {
    flex-direction: column;
  }

  .qp__side {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .qp__choose {
    min-height: 44px;
  }

  .qp__row {
    grid-template-columns: 1fr;
  }

  .qp__file-open {
    min-height: 44px;
  }

  .qp__file-x {
    width: 44px;
    height: 44px;
  }
}
</style>
