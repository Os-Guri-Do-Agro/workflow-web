<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Check, Copy, Download, ExternalLink, ListChecks, Loader2, TriangleAlert, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { getAssetDownload } from '@/service/marketing/marketing-core'
import type { PrintCard, PrintFile } from '@/service/marketing/marketing-print'
import { CARD_STATUS_TONE, cardStatusLabel, formatBytes, toneStyle } from '../marketing-labels'
import PrintTrail from './PrintTrail.vue'
import QuotesPanel from '../quotes/QuotesPanel.vue'
import { printActions, usePrintMutations } from './usePrint'

/**
 * Painel da peça impressa: prévia, originais (com o sha256 para conferir),
 * especificação, checklist pré-gráfica e os botões da trilha. A aprovação em
 * si (Aprovar, Pedir ajuste, versões) mora no card, aqui só o link.
 */
const props = defineProps<{
  card: PrintCard
  groupId: string
  brandName: string
  canEdit: boolean
  canForce: boolean
  closable?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const toast = useToast()
const mut = usePrintMutations(() => props.groupId)

// ── Prévia e arquivos ────────────────────────────────────────────────────
const fileId = ref<string | null>(null)
watch(
  () => props.card.id,
  () => (fileId.value = null),
)
const file = computed<PrintFile | null>(
  () => props.card.files.find((f) => f.id === fileId.value) ?? props.card.files[0] ?? null,
)
function previewSrc(f: PrintFile | null): string | null {
  if (!f) return null
  if (f.previewUrl) return f.previewUrl
  return f.mimeType.startsWith('image/') ? f.url : null
}
const previewNote = computed(() => {
  const f = file.value
  if (!f?.previewUrl) return ''
  return f.colorSpace === 'cmyk'
    ? 'Prévia aproximada em RGB; o original em CMYK segue intacto.'
    : 'Prévia gerada para a tela; o original segue intacto.'
})
function shortHash(hash: string | null) {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : null
}

const downloading = ref<string | null>(null)
async function downloadOriginal(f: PrintFile) {
  downloading.value = f.id
  try {
    const res = await getAssetDownload(props.groupId, f.id)
    const a = document.createElement('a')
    a.href = res.url
    a.download = res.name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível baixar o original.'))
  } finally {
    downloading.value = null
  }
}
async function copyHash(hash: string) {
  try {
    await navigator.clipboard.writeText(hash)
    toast.success('SHA-256 copiado.')
  } catch {
    toast.error('Não foi possível copiar.')
  }
}

// ── Especificação ────────────────────────────────────────────────────────
const specs = reactive({ format: '', paper: '', finish: '', quantity: '', bleedMm: '', colors: '', printer: '', notes: '' })
function loadSpecs() {
  const s = props.card.printSpecs ?? {}
  specs.format = s.format ?? ''
  specs.paper = s.paper ?? ''
  specs.finish = s.finish ?? ''
  specs.quantity = s.quantity != null ? String(s.quantity) : ''
  specs.bleedMm = s.bleedMm != null ? String(s.bleedMm) : ''
  specs.colors = s.colors ?? ''
  specs.printer = s.printer ?? ''
  specs.notes = s.notes ?? ''
}
watch(() => [props.card.id, JSON.stringify(props.card.printSpecs)], loadSpecs, { immediate: true })

const specsDirty = computed(() => {
  const s = props.card.printSpecs ?? {}
  return (
    specs.format !== (s.format ?? '') ||
    specs.paper !== (s.paper ?? '') ||
    specs.finish !== (s.finish ?? '') ||
    specs.quantity !== (s.quantity != null ? String(s.quantity) : '') ||
    specs.bleedMm !== (s.bleedMm != null ? String(s.bleedMm) : '') ||
    specs.colors !== (s.colors ?? '') ||
    specs.printer !== (s.printer ?? '') ||
    specs.notes !== (s.notes ?? '')
  )
})

async function saveSpecs() {
  const qty = specs.quantity.trim()
  const bleed = specs.bleedMm.trim().replace(',', '.')
  if (qty && !/^\d+$/.test(qty)) return void toast.error('Quantidade: use só números inteiros.')
  if (bleed && !Number.isFinite(Number(bleed))) return void toast.error('Sangria: use um número em milímetros.')
  try {
    await mut.specs.mutateAsync({
      id: props.card.id,
      specs: {
        format: specs.format.trim() || null,
        paper: specs.paper.trim() || null,
        finish: specs.finish.trim() || null,
        quantity: qty ? Number(qty) : null,
        bleedMm: bleed ? Number(bleed) : null,
        colors: specs.colors.trim() || null,
        printer: specs.printer.trim() || null,
        notes: specs.notes.trim() || null,
      },
    })
    toast.success('Especificação salva.')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível salvar a especificação.'))
  }
}

// ── Pré-gráfica ──────────────────────────────────────────────────────────
async function openChecklist() {
  try {
    await mut.openPrepress.mutateAsync(props.card.id)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível abrir o checklist.'))
  }
}
async function toggle(itemId: string, done: boolean) {
  try {
    await mut.toggle.mutateAsync({ id: props.card.id, itemId, done })
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível marcar o item.'))
  }
}
const prepressPct = computed(() =>
  props.card.prepress.total ? Math.round((props.card.prepress.done / props.card.prepress.total) * 100) : 0,
)
const prepressOpen = computed(() => props.card.prepress.total - props.card.prepress.done)

// ── Trilha ───────────────────────────────────────────────────────────────
const actions = computed(() => printActions(props.card.status))
const statusError = ref('')
const canForceSend = ref(false)
const confirmForce = ref(false)
watch(
  () => [props.card.id, props.card.status],
  () => {
    statusError.value = ''
    canForceSend.value = false
  },
)

async function go(to: (typeof actions.value)[number]['to'], force = false) {
  statusError.value = ''
  canForceSend.value = false
  try {
    await mut.status.mutateAsync({ id: props.card.id, to, force })
    confirmForce.value = false
    toast.success('Status da peça atualizado.')
  } catch (e) {
    confirmForce.value = false
    statusError.value = getApiErrorMessage(e, 'Não foi possível mudar o status.')
    // Só o bloqueio do pré-gráfica pode ser forçado (e só por Admin).
    canForceSend.value = to === 'SENT_TO_PRINTER' && props.canForce && /pré-gráfica/.test(statusError.value)
  }
}

const dueLate = computed(() => !!props.card.dueAt && new Date(props.card.dueAt) < new Date() && props.card.status !== 'DELIVERED')
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : null
}
</script>

<template>
  <div class="pp" data-testid="print-panel">
    <header class="pp-head">
      <div class="pp-title">
        <h2>{{ card.title }}</h2>
        <div class="pp-meta">
          <span class="mk-chip">{{ brandName }}</span>
          <span class="mk-chip" data-tone :style="toneStyle(CARD_STATUS_TONE[card.status])">{{ cardStatusLabel(card.status, 'PRINT') }}</span>
          <span v-if="card.versionNumber" class="pp-sub">versão V{{ card.versionNumber }}</span>
          <span v-if="card.dueAt" class="pp-sub" :class="{ 'mk-late': dueLate }">prazo {{ fmtDate(card.dueAt) }}</span>
        </div>
      </div>
      <button v-if="closable" type="button" class="mk-icon-btn" aria-label="Fechar" @click="emit('close')"><X :size="16" /></button>
    </header>

    <PrintTrail :status="card.status" />

    <div class="pp-flow">
      <div v-if="actions.length && canEdit" class="pp-actions">
        <button
          v-for="a in actions"
          :key="a.to"
          type="button"
          class="mk-btn"
          :class="{ 'mk-btn--primary': a.primary }"
          :disabled="mut.status.isPending.value"
          @click="go(a.to)"
        >
          <Loader2 v-if="mut.status.isPending.value && a.primary" :size="14" class="pp-spin" />
          {{ a.label }}
        </button>
      </div>
      <p v-if="card.status === 'APPROVED' && card.prepress.total === 0" class="mk-hint">
        Antes de enviar, abra o checklist pré-gráfica e confira os itens.
      </p>
      <p v-else-if="card.status === 'APPROVED' && prepressOpen > 0" class="mk-hint">
        Faltam {{ prepressOpen }} {{ prepressOpen === 1 ? 'item' : 'itens' }} do pré-gráfica para enviar.
      </p>
      <p v-if="!['APPROVED', 'SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED'].includes(card.status)" class="mk-hint">
        A peça segue para a gráfica depois de aprovada. A aprovação é feita no card.
      </p>
      <p v-if="!card.approvalValid && ['SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED'].includes(card.status)" class="mk-hint">
        A aprovação não vale para a versão atual do arquivo.
      </p>
      <div v-if="statusError" class="pp-err" role="alert" data-testid="print-error">
        <TriangleAlert :size="15" aria-hidden="true" />
        <div class="pp-err__body">
          <span>{{ statusError }}</span>
          <button v-if="canForceSend" type="button" class="mk-btn" @click="confirmForce = true">Enviar mesmo assim</button>
        </div>
      </div>
      <RouterLink :to="{ name: 'marketing-card', params: { cardId: card.id } }" class="pp-link">
        Abrir aprovação<ExternalLink :size="12" aria-hidden="true" />
      </RouterLink>
    </div>

    <section class="pp-sec">
      <h3>Arquivo para a gráfica</h3>
      <p v-if="!card.files.length" class="mk-hint">Nenhum arquivo na versão atual. A arte é enviada no card, na aprovação.</p>
      <template v-else>
        <div v-if="previewSrc(file)" class="pp-preview">
          <img :src="previewSrc(file)!" :alt="`Prévia de ${file!.name}`" loading="lazy" />
        </div>
        <p v-if="previewNote" class="mk-hint" data-testid="print-preview-note">{{ previewNote }}</p>
        <ul class="pp-files">
          <li v-for="f in card.files" :key="f.id" class="pp-file" :class="{ 'is-active': f.id === file?.id }">
            <button type="button" class="pp-file__pick" @click="fileId = f.id">
              <span class="pp-file__name">{{ f.name }}</span>
              <span class="pp-file__meta">
                {{ formatBytes(f.size) }}
                <span v-if="f.colorSpace === 'cmyk'" class="pp-tag" data-testid="print-cmyk">CMYK</span>
                <span v-else-if="f.colorSpace === 'srgb'" class="pp-tag">RGB</span>
                <span v-if="f.width && f.height">{{ f.width }} x {{ f.height }} px</span>
              </span>
            </button>
            <div class="pp-file__side">
              <button v-if="f.sha256" type="button" class="pp-hash" :title="`SHA-256 completo: ${f.sha256}. Clique para copiar.`" @click="copyHash(f.sha256)">
                SHA-256 {{ shortHash(f.sha256) }}<Copy :size="12" aria-hidden="true" />
              </button>
              <button type="button" class="mk-btn" :disabled="downloading === f.id" @click="downloadOriginal(f)">
                <Download :size="14" />Baixar original
              </button>
            </div>
          </li>
        </ul>
        <p class="mk-hint">O original nunca é alterado: o que você baixa tem o mesmo SHA-256 do que foi enviado.</p>
      </template>
    </section>

    <section class="pp-sec">
      <div class="pp-sec__head">
        <h3>Pré-gráfica</h3>
        <span v-if="card.prepress.total" class="pp-count">{{ card.prepress.done }} de {{ card.prepress.total }}</span>
      </div>
      <template v-if="card.prepress.total">
        <div class="pp-bar" role="progressbar" :aria-valuenow="prepressPct" aria-valuemin="0" aria-valuemax="100" aria-label="Pré-gráfica">
          <span :style="{ width: prepressPct + '%' }" />
        </div>
        <ul class="pp-check">
          <li v-for="i in card.prepress.items" :key="i.id">
            <label class="pp-check__row" :class="{ 'is-disabled': !canEdit }">
              <input
                type="checkbox"
                data-testid="prepress-item"
                :checked="i.done"
                :disabled="!canEdit || mut.toggle.isPending.value"
                @change="toggle(i.id, ($event.target as HTMLInputElement).checked)"
              />
              <span :class="{ 'is-done': i.done }">{{ i.text }}</span>
            </label>
          </li>
        </ul>
      </template>
      <div v-else class="pp-empty">
        <p class="mk-hint">O checklist cobre sangria, cor, resolução, fontes e o QR. Ele precisa estar todo marcado para enviar.</p>
        <button v-if="canEdit" type="button" class="mk-btn" :disabled="mut.openPrepress.isPending.value" @click="openChecklist">
          <ListChecks :size="14" />Abrir checklist
        </button>
      </div>
    </section>

    <section class="pp-sec">
      <div class="pp-sec__head">
        <h3>Especificação</h3>
        <button v-if="canEdit" type="button" class="mk-btn mk-btn--primary" :disabled="!specsDirty || mut.specs.isPending.value" @click="saveSpecs">
          <Check :size="14" />Salvar especificação
        </button>
      </div>
      <div class="pp-grid">
        <label class="mk-field"><span class="mk-label">Formato</span><input v-model="specs.format" class="mk-input" :readonly="!canEdit" placeholder="A5, 15 x 21 cm" autocomplete="off" /></label>
        <label class="mk-field"><span class="mk-label">Papel</span><input v-model="specs.paper" class="mk-input" :readonly="!canEdit" placeholder="Couchê 300 g" autocomplete="off" /></label>
        <label class="mk-field"><span class="mk-label">Acabamento</span><input v-model="specs.finish" class="mk-input" :readonly="!canEdit" placeholder="Verniz localizado" autocomplete="off" /></label>
        <label class="mk-field"><span class="mk-label">Cores</span><input v-model="specs.colors" class="mk-input" :readonly="!canEdit" placeholder="4x4 (CMYK)" autocomplete="off" /></label>
        <label class="mk-field"><span class="mk-label">Quantidade</span><input v-model="specs.quantity" class="mk-input" :readonly="!canEdit" inputmode="numeric" placeholder="500" autocomplete="off" /></label>
        <label class="mk-field"><span class="mk-label">Sangria (mm)</span><input v-model="specs.bleedMm" class="mk-input" :readonly="!canEdit" inputmode="decimal" placeholder="3" autocomplete="off" /></label>
        <label class="mk-field pp-wide"><span class="mk-label">Gráfica</span><input v-model="specs.printer" class="mk-input" :readonly="!canEdit" placeholder="Nome da gráfica" autocomplete="off" /></label>
        <label class="mk-field pp-wide"><span class="mk-label">Observações</span><textarea v-model="specs.notes" class="mk-textarea" :readonly="!canEdit" rows="3" /></label>
      </div>
    </section>

    <!-- Orçamentos da gráfica (painel da M3-B, ligado na junção): quem não vê
         o financeiro recebe a lista sem valores, a regra é da API. -->
    <section class="pp-sec">
      <QuotesPanel :group-id="groupId" :company-id="card.companyId" :card-id="card.id" title="Orçamentos da gráfica" />
    </section>

    <ConfirmDialog
      v-model="confirmForce"
      title="Enviar com o pré-gráfica aberto?"
      message="Há itens do checklist sem marcar. Enviar assim fica registrado no histórico da peça como enviado com itens em aberto."
      confirm-label="Enviar mesmo assim"
      danger
      :loading="mut.status.isPending.value"
      @confirm="go('SENT_TO_PRINTER', true)"
    />
  </div>
</template>

<style scoped>
.pp {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.pp-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.pp-title {
  flex: 1;
  min-width: 0;
}

.pp-title h2 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.pp-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pp-sub {
  font-size: 12px;
  color: var(--text-3);
}

.pp-flow {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.pp-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.pp-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-ink);
  text-decoration: none;
}

.pp-link:hover {
  text-decoration: underline;
}

.pp-err {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  align-self: stretch;
  padding: 8px 10px;
  border: 1px solid var(--err);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--err) 8%, transparent);
  color: var(--text);
  font-size: 13px;
}

.pp-err svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--err);
}

.pp-err__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.pp-sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.pp-sec h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.pp-sec__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.pp-count {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.pp-preview {
  display: grid;
  place-items: center;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.pp-preview img {
  display: block;
  max-width: 100%;
  max-height: 260px;
  object-fit: contain;
}

.pp-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.pp-file.is-active {
  border-color: var(--accent);
}

.pp-file__pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pp-file__name {
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.pp-file__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-3);
}

.pp-tag {
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
}

.pp-file__side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pp-hash {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
  cursor: pointer;
}

.pp-hash:hover {
  background: var(--surface-2);
  color: var(--text);
}

.pp-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}

.pp-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.pp-check {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-check__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 32px;
  padding: 5px 2px;
  font-size: 13px;
  cursor: pointer;
}

.pp-check__row.is-disabled {
  cursor: default;
}

.pp-check__row input {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  accent-color: var(--accent);
}

.pp-check__row .is-done {
  color: var(--text-3);
  text-decoration: line-through;
}

.pp-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.pp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.pp-wide {
  grid-column: 1 / -1;
}

.pp-spin {
  animation: pp-spin 0.9s linear infinite;
}

@keyframes pp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .pp-grid {
    grid-template-columns: 1fr;
  }

  .pp-check__row {
    min-height: 44px;
    align-items: center;
  }

  .pp-check__row input {
    width: 20px;
    height: 20px;
  }

  .pp-actions .mk-btn {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pp-spin {
    animation: none;
  }
}
</style>
