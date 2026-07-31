<script setup lang="ts">
/**
 * OCR Digital: superfície de gestão da ferramenta (spec docs/specs/ocr-digital.md).
 *
 * A ferramenta está SEMPRE ativa (v0.6): sem modelo, a leitura é inteligente
 * (chaves universais + outrosCampos) e serve para qualquer formato de
 * contrato. O modelo é um refinamento opcional: quem anexa um documento-modelo
 * passa a receber exatamente as próprias chaves na resposta. A gestão
 * (teste de leitura, webhook, acervo) não depende de modelo nenhum.
 *
 * O integrador não usa esta tela: consome POST /api/v1/ocr/read com o token
 * da empresa; as docs dele vivem em /ocr-docs (link no header).
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  BadgeCheck,
  BookOpen,
  Braces,
  Check,
  Copy,
  ExternalLink,
  FileUp,
  FlaskConical,
  Loader2,
  RefreshCw,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Webhook,
  X,
} from 'lucide-vue-next'
import Pill from '@/components/ui/Pill.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { apiBaseUrl } from '@/service/api'
import { useToast } from '@/composables/useToast'
import {
  useOcrDocuments,
  useOcrMutations,
  useOcrTemplate,
  useOcrWebhook,
  ocrService,
} from './composables/useOcr'
import type { OcrField, OcrReadResult } from '@/service/ocr/ocr-service'

const workspace = useWorkspaceStore()
const { success, error: showError } = useToast()

const companyId = computed(() => workspace.activeCompanyId)
const isAdmin = computed(() => workspace.activeRole === 'ADMIN')

const template = useOcrTemplate(companyId)
const documents = useOcrDocuments(companyId)
const webhook = useOcrWebhook(companyId, isAdmin)
const { uploadTemplate, updateFields, readTest, setWebhook, deleteWebhook } =
  useOcrMutations(companyId)

const integratorDocsUrl = `${apiBaseUrl()}/ocr-docs`

// ─── Apresentação (onboarding: some quando o acervo tem documentos) ──────────
const steps = [
  {
    icon: ScanText,
    title: 'Leitura para qualquer contrato',
    text: 'Nenhuma configuração: o documento chega e é lido sozinho, seja qual for o formato. Os campos saem estruturados e vinculados à empresa correspondente.',
  },
  {
    icon: BadgeCheck,
    title: 'Assinatura como critério',
    text: 'Por se tratar de contratos, o que define "válido para efetivar" é a assinatura: certificado ICP-Brasil ou assinatura gov.br.',
  },
  {
    icon: Braces,
    title: 'Resposta pronta para preencher',
    text: 'A resposta traz o documento lido, o veredito da assinatura e os dados extraídos como parâmetros, prontos para preencher as lacunas do seu fluxo.',
  },
  {
    icon: FileUp,
    title: 'Modelo próprio (opcional)',
    text: 'Se quiser a resposta com exatamente as suas chaves, anexe um documento-modelo uma única vez e revise os campos derivados. Sem ele, valem as chaves universais.',
  },
]

const showSteps = computed(
  () =>
    !template.data.value &&
    !documents.isLoading.value &&
    !(documents.data.value ?? []).length,
)

// ─── Upload do modelo ─────────────────────────────────────────────────────────
const templateInput = ref<HTMLInputElement | null>(null)

function pickTemplate() {
  templateInput.value?.click()
}

async function onTemplateFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  await uploadTemplate.mutateAsync(file).catch(() => {})
}

// ─── Campos revisáveis ────────────────────────────────────────────────────────
// Cópia local editável; "sujo" habilita o salvar. `key` é imutável na UI
// (renomear a key mudaria o contrato de resposta do integrador sem aviso).
const draftFields = reactive<OcrField[]>([])
const fieldsDirty = ref(false)

watch(
  () => template.data.value?.fields,
  (fields) => {
    draftFields.splice(0, draftFields.length, ...(fields ?? []).map((f) => ({ ...f })))
    fieldsDirty.value = false
  },
  { immediate: true, deep: false },
)

function markDirty() {
  fieldsDirty.value = true
}

function removeField(index: number) {
  draftFields.splice(index, 1)
  fieldsDirty.value = true
}

async function saveFields() {
  if (!draftFields.length) {
    showError('O template precisa de ao menos um campo')
    return
  }
  await updateFields.mutateAsync(draftFields.map((f) => ({ ...f }))).catch(() => {})
  fieldsDirty.value = false
}

// ─── Teste de leitura ─────────────────────────────────────────────────────────
const testInput = ref<HTMLInputElement | null>(null)
const testResult = ref<OcrReadResult | null>(null)

function pickTest() {
  testInput.value?.click()
}

async function onTestFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  testResult.value = null
  testResult.value = await readTest.mutateAsync(file).catch(() => null)
}

// ─── Webhook ──────────────────────────────────────────────────────────────────
const webhookUrl = ref('')
const webhookSecret = ref<string | null>(null)
const secretCopied = ref(false)
const removingWebhook = ref(false)

watch(
  () => webhook.data.value,
  (hook) => {
    if (hook) webhookUrl.value = hook.url
  },
  { immediate: true },
)

async function saveWebhook() {
  const url = webhookUrl.value.trim()
  if (!url) return
  const saved = await setWebhook.mutateAsync(url).catch(() => null)
  if (saved) {
    // O segredo só existe nesta resposta; some ao navegar. Igual token do QR.
    webhookSecret.value = saved.secret
    secretCopied.value = false
    success('Webhook salvo. Copie o segredo agora: ele não aparece de novo.')
  }
}

async function copySecret() {
  if (!webhookSecret.value) return
  try {
    await navigator.clipboard.writeText(webhookSecret.value)
    secretCopied.value = true
    setTimeout(() => (secretCopied.value = false), 1600)
  } catch {
    showError('Não foi possível copiar')
  }
}

async function confirmRemoveWebhook() {
  await deleteWebhook.mutateAsync().catch(() => {})
  webhookSecret.value = null
  webhookUrl.value = ''
  removingWebhook.value = false
}

// ─── Acervo ───────────────────────────────────────────────────────────────────
const openingDoc = ref<string | null>(null)

async function openDocument(documentId: string) {
  if (!companyId.value) return
  openingDoc.value = documentId
  try {
    const url = await ocrService.documentUrl(companyId.value, documentId)
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    showError('Não foi possível abrir o documento')
  } finally {
    openingDoc.value = null
  }
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resumoDados(dados: Record<string, unknown>): string {
  // Só escalares no resumo: a leitura inteligente traz arrays (partes,
  // valores, outrosCampos) que virariam "[object Object]" aqui.
  const partes = Object.entries(dados)
    .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v)}`)
  if (partes.length) return partes.join(' · ')
  const preenchidos = Object.values(dados).filter(
    (v) => v !== null && v !== '' && (!Array.isArray(v) || v.length),
  ).length
  return preenchidos ? `${preenchidos} campos preenchidos` : 'sem campos preenchidos'
}
</script>

<template>
  <div class="ocr-view">
    <!-- Header -->
    <header class="ocr-head">
      <div>
        <p class="ocr-eyebrow">Ferramentas</p>
        <div class="ocr-title-row">
          <h1 class="ocr-title">OCR Digital</h1>
          <Pill v-if="template.data.value" :icon="ShieldCheck" color="var(--success)" variant="soft">
            Ativo · modelo v{{ template.data.value.version }}
          </Pill>
          <Pill v-else :icon="ShieldCheck" color="var(--success)" variant="soft">
            Ativo · leitura inteligente
          </Pill>
        </div>
        <p class="ocr-sub">
          Leitura automática de documentos assinados: o contrato chega, os campos saem
          preenchidos e a assinatura é verificada.
        </p>
      </div>
      <div class="ocr-head-actions">
        <a class="ocr-secondary" :href="integratorDocsUrl" target="_blank" rel="noopener noreferrer">
          <BookOpen :size="15" />
          <span>Docs da API</span>
        </a>
        <button
          v-if="isAdmin"
          class="ocr-secondary"
          type="button"
          :disabled="uploadTemplate.isPending.value"
          @click="pickTemplate"
        >
          <Loader2 v-if="uploadTemplate.isPending.value" :size="15" class="spin" />
          <FileUp v-else :size="15" />
          <span>{{ template.data.value ? 'Trocar modelo' : 'Modelo próprio (opcional)' }}</span>
        </button>
        <button
          v-if="isAdmin"
          class="ocr-primary"
          type="button"
          :disabled="readTest.isPending.value"
          @click="pickTest"
        >
          <Loader2 v-if="readTest.isPending.value" :size="15" class="spin" />
          <FlaskConical v-else :size="15" />
          <span>Testar leitura</span>
        </button>
      </div>
    </header>

    <input ref="templateInput" type="file" accept="application/pdf" class="ocr-hidden" @change="onTemplateFile" />
    <input ref="testInput" type="file" accept="application/pdf" class="ocr-hidden" @change="onTestFile" />

    <!-- Sem empresa ativa -->
    <EmptyState
      v-if="!companyId"
      :icon="ScanText"
      title="Escolha uma empresa"
      description="O OCR Digital é por empresa: cada uma tem seu template e seu acervo. Selecione uma empresa no topo."
    />

    <!-- Carregando -->
    <div v-else-if="template.isLoading.value" class="ocr-loading">
      <Skeleton type="card" />
      <Skeleton type="text" :lines="3" />
    </div>

    <!-- Ferramenta sempre ativa: onboarding + gestão -->
    <template v-else>
      <section v-if="showSteps" class="ocr-steps" aria-label="Como funciona">
        <article v-for="(step, i) in steps" :key="step.title" class="ocr-step">
          <div class="ocr-step-head">
            <span class="ocr-step-n">{{ i + 1 }}</span>
            <component :is="step.icon" :size="17" class="ocr-step-icon" />
          </div>
          <h2 class="ocr-step-title">{{ step.title }}</h2>
          <p class="ocr-step-text">{{ step.text }}</p>
        </article>
      </section>

      <div class="ocr-grid-2">
        <!-- Campos: do modelo quando existe; universais quando não -->
        <section v-if="template.data.value" class="ocr-card">
          <header class="ocr-card-head">
            <h2 class="ocr-card-title"><ScanText :size="15" /> Campos extraídos</h2>
            <span class="ocr-card-meta">{{ template.data.value.fileName }} · v{{ template.data.value.version }}</span>
          </header>
          <p class="ocr-card-hint">
            Derivados do modelo pelo leitor. Ajuste o rótulo e a descrição ou remova o que
            não interessa; a chave é o nome do campo na resposta da API e não muda.
          </p>
          <div class="ocr-fields">
            <div v-for="(field, i) in draftFields" :key="field.key" class="ocr-field">
              <code class="ocr-field-key">{{ field.key }}</code>
              <input v-model="field.label" class="ocr-field-input" aria-label="Rótulo do campo" @input="markDirty" />
              <span class="ocr-field-type">{{ field.type }}</span>
              <button
                v-if="isAdmin"
                type="button"
                class="ocr-field-del"
                :aria-label="`Remover campo ${field.key}`"
                @click="removeField(i)"
              >
                <X :size="13" />
              </button>
            </div>
          </div>
          <footer v-if="isAdmin" class="ocr-card-foot">
            <button
              class="ocr-primary ocr-primary--sm"
              type="button"
              :disabled="!fieldsDirty || updateFields.isPending.value"
              @click="saveFields"
            >
              <Loader2 v-if="updateFields.isPending.value" :size="14" class="spin" />
              <Check v-else :size="14" />
              <span>Salvar campos</span>
            </button>
          </footer>
        </section>

        <section v-else class="ocr-card">
          <header class="ocr-card-head">
            <h2 class="ocr-card-title"><ScanText :size="15" /> Campos extraídos</h2>
            <span class="ocr-card-meta">leitura inteligente</span>
          </header>
          <p class="ocr-card-hint">
            Sem modelo configurado, todo contrato é lido com chaves universais:
            tipo do documento, objeto, partes (nome, papel, CPF/CNPJ), data de
            assinatura, vigência e valores. O que variar entre formatos chega em
            <code class="ocr-inline-code">outrosCampos</code>. Serve para quantos
            formatos de contrato a empresa tiver.
          </p>
          <p class="ocr-card-hint">
            {{
              isAdmin
                ? 'Quer a resposta com exatamente as suas chaves? Anexe um documento-modelo: o leitor deriva os campos e você revisa antes de liberar.'
                : 'Um ADMIN pode anexar um documento-modelo para customizar as chaves da resposta.'
            }}
          </p>
          <footer v-if="isAdmin" class="ocr-card-foot">
            <button
              class="ocr-secondary ocr-secondary--sm"
              type="button"
              :disabled="uploadTemplate.isPending.value"
              @click="pickTemplate"
            >
              <Loader2 v-if="uploadTemplate.isPending.value" :size="14" class="spin" />
              <FileUp v-else :size="14" />
              <span>{{ uploadTemplate.isPending.value ? 'Absorvendo o modelo...' : 'Enviar modelo (opcional)' }}</span>
            </button>
          </footer>
        </section>

        <!-- Webhook -->
        <section class="ocr-card">
          <header class="ocr-card-head">
            <h2 class="ocr-card-title"><Webhook :size="15" /> Webhook de resultado</h2>
            <Pill v-if="webhook.data.value?.active" color="var(--success)" variant="soft">Ativo</Pill>
          </header>
          <p class="ocr-card-hint">
            Opcional: cada leitura também é entregue por POST na sua URL, assinada com
            HMAC no header X-Ocr-Signature. A resposta da API nunca depende dele.
          </p>
          <template v-if="isAdmin">
            <div class="ocr-webhook-row">
              <input
                v-model="webhookUrl"
                class="ocr-input"
                type="url"
                placeholder="https://seu-sistema.com/webhooks/ocr"
                aria-label="URL do webhook"
              />
              <button
                class="ocr-primary ocr-primary--sm"
                type="button"
                :disabled="!webhookUrl.trim() || setWebhook.isPending.value"
                @click="saveWebhook"
              >
                <Loader2 v-if="setWebhook.isPending.value" :size="14" class="spin" />
                <span v-else>Salvar</span>
              </button>
              <button
                v-if="webhook.data.value"
                class="ocr-icon-btn"
                type="button"
                aria-label="Remover webhook"
                @click="removingWebhook = true"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <div v-if="webhookSecret" class="ocr-secret">
              <p class="ocr-secret-warn">
                Segredo do webhook. Copie AGORA: ele não aparece de novo.
              </p>
              <div class="ocr-secret-row">
                <code class="ocr-secret-value">{{ webhookSecret }}</code>
                <button class="ocr-icon-btn" type="button" :aria-label="secretCopied ? 'Copiado' : 'Copiar segredo'" @click="copySecret">
                  <Check v-if="secretCopied" :size="14" />
                  <Copy v-else :size="14" />
                </button>
              </div>
            </div>
          </template>
          <p v-else class="ocr-card-hint">Somente ADMIN configura o webhook.</p>
        </section>
      </div>

      <!-- Resultado do teste -->
      <section v-if="testResult" class="ocr-card ocr-test">
        <header class="ocr-card-head">
          <h2 class="ocr-card-title"><FlaskConical :size="15" /> Resultado do teste</h2>
          <Pill
            :icon="testResult.assinatura.valida ? ShieldCheck : ShieldAlert"
            :color="testResult.assinatura.valida ? 'var(--success)' : 'var(--warn)'"
            variant="soft"
          >
            {{
              testResult.assinatura.valida
                ? `Assinatura válida (${testResult.assinatura.tipo})`
                : 'Assinatura inválida ou ausente'
            }}
          </Pill>
        </header>
        <p v-if="!testResult.assinatura.valida && testResult.assinatura.detalhes[0]?.motivo" class="ocr-test-motivo">
          {{ testResult.assinatura.detalhes[0].motivo }}
        </p>
        <pre class="ocr-json">{{ JSON.stringify(testResult.dados, null, 2) }}</pre>
      </section>

      <!-- Acervo -->
      <section class="ocr-card">
        <header class="ocr-card-head">
          <h2 class="ocr-card-title"><Braces :size="15" /> Documentos lidos</h2>
          <button
            class="ocr-icon-btn"
            type="button"
            aria-label="Atualizar lista"
            @click="() => documents.refetch()"
          >
            <RefreshCw :size="14" />
          </button>
        </header>

        <EmptyState
          v-if="!documents.isLoading.value && !(documents.data.value ?? []).length"
          :icon="ScanText"
          title="Nenhum documento lido ainda"
          description="Cada leitura pela API entra aqui, com o PDF original guardado no acervo. Use Testar leitura para ver o fluxo inteiro."
        />

        <div v-else class="ocr-docs">
          <article v-for="doc in documents.data.value ?? []" :key="doc.id" class="ocr-doc">
            <div class="ocr-doc-main">
              <div class="ocr-doc-title-row">
                <button
                  class="ocr-doc-name"
                  type="button"
                  :disabled="openingDoc === doc.id"
                  :title="'Abrir o PDF original'"
                  @click="openDocument(doc.id)"
                >
                  <span>{{ doc.fileName }}</span>
                  <Loader2 v-if="openingDoc === doc.id" :size="12" class="spin" />
                  <ExternalLink v-else :size="12" />
                </button>
                <Pill
                  :icon="doc.signatureValid ? ShieldCheck : ShieldAlert"
                  :color="doc.signatureValid ? 'var(--success)' : 'var(--warn)'"
                  variant="soft"
                >
                  {{ doc.signatureValid ? (doc.signatureType ?? 'Válida') : 'Sem assinatura válida' }}
                </Pill>
              </div>
              <p class="ocr-doc-resumo">{{ resumoDados(doc.dados) }}</p>
            </div>
            <div class="ocr-doc-meta">
              <span>{{ fmtWhen(doc.createdAt) }}</span>
              <span class="ocr-doc-sep">·</span>
              <span>{{ doc.templateVersion ? `modelo v${doc.templateVersion}` : 'leitura inteligente' }}</span>
              <span class="ocr-doc-sep">·</span>
              <span :title="`Modelo ${doc.model}`">{{ doc.tokensIn + doc.tokensOut }} tokens</span>
              <template v-if="doc.webhookStatus !== 'NONE'">
                <span class="ocr-doc-sep">·</span>
                <span :class="doc.webhookStatus === 'SENT' ? 'ocr-wh-ok' : 'ocr-wh-fail'">
                  webhook {{ doc.webhookStatus === 'SENT' ? 'entregue' : 'falhou' }}
                </span>
              </template>
            </div>
          </article>
        </div>
      </section>
    </template>

    <ConfirmDialog
      :model-value="removingWebhook"
      title="Remover o webhook?"
      message="As leituras continuam funcionando pela resposta da API; apenas os disparos por POST param."
      confirm-label="Remover"
      cancel-label="Voltar"
      :loading="deleteWebhook.isPending.value"
      @update:model-value="(v) => { if (!v) removingWebhook = false }"
      @confirm="confirmRemoveWebhook"
    />
  </div>
</template>

<style scoped>
.ocr-view {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.ocr-hidden {
  display: none;
}

.spin {
  animation: ocr-spin 0.9s linear infinite;
}

@keyframes ocr-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Header ────────────────────────────────────────────────────────────── */
.ocr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ocr-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ocr-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ocr-title {
  margin: 0;
  font-size: var(--text-title-large, 24px);
  font-weight: 780;
  letter-spacing: -0.02em;
  color: var(--text);
}

.ocr-sub {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 13.5px;
  max-width: 560px;
  line-height: 1.55;
}

.ocr-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ocr-primary {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.ocr-primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.ocr-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ocr-primary--sm {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12.5px;
}

.ocr-secondary {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  text-decoration: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.ocr-secondary:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.ocr-secondary--sm {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12.5px;
}

.ocr-inline-code {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
}

.ocr-icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.ocr-icon-btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.ocr-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ─── Apresentação ──────────────────────────────────────────────────────── */
.ocr-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 14px;
}

.ocr-step {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.ocr-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ocr-step-n {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
  font-size: 12px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.ocr-step-icon {
  color: var(--text-4);
}

.ocr-step-title {
  margin: 2px 0 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
}

.ocr-step-text {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.55;
}

/* ─── Cards de gestão ───────────────────────────────────────────────────── */
.ocr-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
  align-items: start;
}

.ocr-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.ocr-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ocr-card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 13.5px;
  font-weight: 720;
  color: var(--text);
}

.ocr-card-meta {
  color: var(--text-4);
  font-size: 11.5px;
}

.ocr-card-hint {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.ocr-card-foot {
  display: flex;
  justify-content: flex-end;
}

/* ─── Campos ────────────────────────────────────────────────────────────── */
.ocr-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ocr-field {
  display: grid;
  grid-template-columns: minmax(90px, auto) 1fr auto auto;
  align-items: center;
  gap: 8px;
}

.ocr-field-key {
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.ocr-field-input {
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}

.ocr-field-input:hover {
  border-color: var(--border);
}

.ocr-field-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--surface-2);
}

.ocr-field-type {
  color: var(--text-4);
  font-size: 11px;
  font-family: var(--font-mono);
}

.ocr-field-del {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.ocr-field-del:hover {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

/* ─── Webhook ───────────────────────────────────────────────────────────── */
.ocr-webhook-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ocr-input {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}

.ocr-input:focus {
  outline: none;
  border-color: var(--accent);
}

.ocr-secret {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 8%, var(--surface));
}

.ocr-secret-warn {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 650;
}

.ocr-secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ocr-secret-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text);
}

/* ─── Teste ─────────────────────────────────────────────────────────────── */
.ocr-test-motivo {
  margin: 0;
  color: var(--warn);
  font-size: 12.5px;
}

.ocr-json {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
}

/* ─── Acervo ────────────────────────────────────────────────────────────── */
.ocr-docs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ocr-doc {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.ocr-doc-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ocr-doc-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ocr-doc-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.ocr-doc-name:hover {
  color: var(--accent);
}

.ocr-doc-resumo {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 560px;
}

.ocr-doc-meta {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-4);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.ocr-doc-sep {
  opacity: 0.6;
}

.ocr-wh-ok {
  color: var(--success);
}

.ocr-wh-fail {
  color: var(--err);
}

@media (max-width: 700px) {
  .ocr-doc {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2s;
  }
}
</style>
