<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  AlertTriangle,
  Upload,
  Video,
  Image as ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-vue-next'
import bugReportService from '@/service/bug-report/bug-report-service'

const route = useRoute()
const companyId = computed(() => String(route.params.companyId ?? ''))

const company = ref<{ id: string; name: string } | null>(null)
const loadingCompany = ref(true)
const companyError = ref<string | null>(null)

const reporterName = ref('')
const reporterContact = ref('')
const rawTitle = ref('')
const descriptionText = ref('')
const file = ref<File | null>(null)
const isDragging = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const uploading = ref(false)
const progress = ref(0)
const submittedId = ref<string | null>(null)
const submitError = ref<string | null>(null)

const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_VIDEO_BYTES = 18 * 1024 * 1024
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const RECORD_MAX_SECONDS = 60

const previewUrl = ref<string | null>(null)
const isImageFile = computed(() => !!file.value && file.value.type.startsWith('image/'))

const fileSizeMB = computed(() =>
  file.value ? (file.value.size / (1024 * 1024)).toFixed(1) : '',
)

const canSubmit = computed(
  () => !!file.value || descriptionText.value.trim().length > 0,
)

const statusUrl = computed(() =>
  submittedId.value ? `${window.location.origin}/r/${submittedId.value}` : '',
)

type CopyState = 'idle' | 'copied' | 'failed'
const copyState = ref<CopyState>('idle')
const statusLinkTextRef = ref<HTMLElement | null>(null)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

const COPY_FEEDBACK_MS = 2600

const copyLabel = computed(() => {
  if (copyState.value === 'copied') return 'Link copiado'
  if (copyState.value === 'failed') return 'Copie com Ctrl+C'
  return 'Copiar link'
})

// O nome acessível precisa começar pelo rótulo visível (WCAG 2.5.3): quem usa
// comando de voz ativa o botão falando exatamente o que está escrito nele.
const copyAriaLabel = computed(() => {
  if (copyState.value === 'copied') return 'Link copiado para a área de transferência'
  if (copyState.value === 'failed') return 'Copie com Ctrl+C: o link já está selecionado'
  return 'Copiar link de acompanhamento do report'
})

const copyFeedback = computed(() => {
  if (copyState.value === 'copied') return 'Link copiado para a área de transferência.'
  if (copyState.value === 'failed')
    return 'Não conseguimos copiar sozinhos. O link já está selecionado: use Ctrl+C (ou Cmd+C).'
  return ''
})

function scheduleCopyReset() {
  if (copyResetTimer) clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle'
    copyResetTimer = null
  }, COPY_FEEDBACK_MS)
}

// Fallback pra navegador antigo ou contexto sem permissão de clipboard (http, iframe).
function copyViaTempInput(text: string): boolean {
  const previousFocus = document.activeElement as HTMLElement | null
  const temp = document.createElement('textarea')
  temp.value = text
  temp.setAttribute('readonly', '')
  temp.setAttribute('aria-hidden', 'true')
  temp.style.position = 'fixed'
  temp.style.top = '0'
  temp.style.left = '-9999px'
  document.body.appendChild(temp)

  let ok = false
  try {
    temp.select()
    temp.setSelectionRange(0, text.length)
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    temp.remove()
    // Devolve o foco pro botão pra navegação por teclado não se perder.
    previousFocus?.focus?.()
  }
  return ok
}

// Último recurso: deixa o link já selecionado na tela pro usuário só copiar.
function selectStatusLinkText() {
  const el = statusLinkTextRef.value
  if (!el) return
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function copyStatusLink() {
  if (!statusUrl.value) return

  let ok = false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(statusUrl.value)
      ok = true
    }
  } catch {
    ok = false
  }

  if (!ok) ok = copyViaTempInput(statusUrl.value)

  copyState.value = ok ? 'copied' : 'failed'
  if (!ok) selectStatusLinkText()
  scheduleCopyReset()
}

onMounted(async () => {
  if (!companyId.value) {
    companyError.value = 'Link incompleto. Pede pra te mandarem o link novamente.'
    loadingCompany.value = false
    return
  }
  try {
    company.value = await bugReportService.getPublicCompany(companyId.value)
  } catch (e: any) {
    companyError.value =
      e?.response?.status === 404
        ? 'Não achamos essa empresa. Confere se o link está completo.'
        : 'Não foi possível carregar. Confere o link e tenta de novo.'
  } finally {
    loadingCompany.value = false
  }
})

function validateFile(f: File): string | null {
  const isVideo = ALLOWED_VIDEO_MIME.includes(f.type)
  const isImage = ALLOWED_IMAGE_MIME.includes(f.type)
  if (!isVideo && !isImage) {
    return 'Tipo não suportado. Anexa um vídeo (MP4, MOV, WebM) ou uma imagem (JPG, PNG, WebP, GIF).'
  }
  if (isVideo && f.size > MAX_VIDEO_BYTES) {
    return 'Esse vídeo é longo demais. Tenta gravar algo mais curto, de até 1 minuto.'
  }
  if (isImage && f.size > MAX_IMAGE_BYTES) {
    return 'Essa imagem é grande demais. Tenta uma imagem de até 10 MB.'
  }
  return null
}

function clearPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = null
  }
}

function setFile(f: File | null) {
  clearPreview()
  if (!f) {
    file.value = null
    submitError.value = null
    return
  }
  const err = validateFile(f)
  if (err) {
    submitError.value = err
    file.value = null
    return
  }
  submitError.value = null
  file.value = f
  if (f.type.startsWith('image/')) previewUrl.value = URL.createObjectURL(f)
}

onBeforeUnmount(() => {
  clearPreview()
  if (copyResetTimer) clearTimeout(copyResetTimer)
})

function onDrop(ev: DragEvent) {
  ev.preventDefault()
  isDragging.value = false
  const f = ev.dataTransfer?.files?.[0]
  if (f) setFile(f)
}

function onPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  setFile(input.files?.[0] ?? null)
}

async function submit() {
  if (!company.value) return
  if (!canSubmit.value) {
    submitError.value =
      'Pra gente conseguir te ajudar, anexa um vídeo, grava a tela ou descreve em texto.'
    return
  }
  uploading.value = true
  progress.value = 0
  submitError.value = null
  try {
    const form = new FormData()
    if (file.value) form.append('file', file.value)
    form.append('companyId', company.value.id)
    if (reporterName.value.trim()) form.append('reporterName', reporterName.value.trim())
    if (reporterContact.value.trim())
      form.append('reporterContact', reporterContact.value.trim())
    if (rawTitle.value.trim()) form.append('rawTitle', rawTitle.value.trim())
    if (descriptionText.value.trim())
      form.append('descriptionText', descriptionText.value.trim())

    const res = await bugReportService.uploadBugReport(form, (p) => (progress.value = p))
    submittedId.value = res.id
  } catch (e: any) {
    submitError.value =
      e?.response?.data?.message ||
      'Não conseguimos enviar agora. Tenta de novo daqui a pouco.'
  } finally {
    uploading.value = false
  }
}

function reset() {
  submittedId.value = null
  copyState.value = 'idle'
  if (copyResetTimer) {
    clearTimeout(copyResetTimer)
    copyResetTimer = null
  }
  file.value = null
  reporterName.value = ''
  reporterContact.value = ''
  rawTitle.value = ''
  descriptionText.value = ''
  progress.value = 0
  submitError.value = null
}
</script>

<template>
  <div class="report-root">
    <!-- ── ESTADO: empresa inválida ─────────────────────────────────── -->
    <section v-if="!loadingCompany && companyError" class="centered">
      <div class="card error-card">
        <AlertCircle :size="40" class="error-icon" />
        <h1 class="card-title">Link inválido</h1>
        <p class="card-sub">{{ companyError }}</p>
      </div>
    </section>

    <!-- ── ESTADO: carregando empresa ───────────────────────────────── -->
    <section v-else-if="loadingCompany" class="centered">
      <Loader2 :size="28" class="spin" />
    </section>

    <!-- ── ESTADO: enviado com sucesso ──────────────────────────────── -->
    <section v-else-if="submittedId" class="centered">
      <div class="card success-card">
        <div class="success-icon-wrap">
          <CheckCircle2 :size="48" />
        </div>
        <h1 class="card-title">Recebemos! Obrigado.</h1>
        <p class="card-sub">
          Vamos dar uma olhada nisso agora. Salve o link abaixo pra acompanhar
          o andamento sempre que quiser, sem precisar de login.
        </p>

        <div class="status-link" :class="{ 'status-link--failed': copyState === 'failed' }">
          <span ref="statusLinkTextRef" class="status-link-text">{{ statusUrl }}</span>
          <a
            class="status-link-action"
            :href="statusUrl"
            target="_blank"
            rel="noopener"
            aria-label="Abrir o link de acompanhamento em uma nova aba"
          >
            Abrir
          </a>
        </div>

        <div class="status-actions">
          <button
            type="button"
            class="btn-copy-link"
            :class="{ 'btn-copy-link--done': copyState === 'copied' }"
            :aria-label="copyAriaLabel"
            @click="copyStatusLink"
          >
            <Check v-if="copyState === 'copied'" :size="15" aria-hidden="true" />
            <AlertCircle v-else-if="copyState === 'failed'" :size="15" aria-hidden="true" />
            <Copy v-else :size="15" aria-hidden="true" />
            <span>{{ copyLabel }}</span>
          </button>
          <button type="button" class="btn-secondary" @click="reset">Reportar outro</button>
        </div>

        <p
          class="copy-feedback"
          :class="{ 'copy-feedback--failed': copyState === 'failed' }"
          role="status"
          aria-live="polite"
        >
          {{ copyFeedback }}
        </p>
      </div>
    </section>

    <!-- ── ESTADO: form principal ───────────────────────────────────── -->
    <section v-else class="form-layout">
      <header class="page-head">
        <div class="logo-wrap">
          <AlertTriangle :size="18" />
        </div>
        <div class="head-text">
          <h1 class="page-title">Reportar um problema</h1>
          <p class="page-sub">
            Para
            <strong>{{ company?.name }}</strong>
          </p>
        </div>
      </header>

      <p class="intro">
        Conta o que aconteceu: pode mostrar pela tela ou só escrever. A gente
        cuida do resto.
      </p>

      <form class="form" @submit.prevent="submit" novalidate>
        <!-- Drop zone (anexar vídeo já existente) -->
        <div
          class="dropzone"
          :class="{
            'dropzone--dragging': isDragging,
            'dropzone--has-file': !!file,
          }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop="onDrop"
          @click="!file && inputRef?.click()"
        >
          <input
            ref="inputRef"
            type="file"
            class="dropzone-input"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,image/jpeg,image/png,image/webp,image/gif"
            @change="onPick"
          />

          <template v-if="!file">
            <div class="dropzone-icon">
              <Upload :size="20" />
            </div>
            <p class="dropzone-title">Anexar vídeo ou imagem</p>
            <p class="dropzone-hint">Vídeo curto (até 1 min) ou imagem (até 10 MB)</p>
          </template>

          <template v-else>
            <div class="file-preview">
              <img v-if="isImageFile && previewUrl" :src="previewUrl" alt="" class="file-thumb" />
              <ImageIcon v-else-if="isImageFile" :size="20" />
              <Video v-else :size="20" />
              <div class="file-info">
                <p class="file-name">{{ file.name }}</p>
                <p class="file-size">
                  {{ fileSizeMB }} MB · {{ isImageFile ? 'imagem' : 'vídeo' }} pronto pra enviar
                </p>
              </div>
              <button
                type="button"
                class="file-remove"
                :aria-label="isImageFile ? 'Remover imagem' : 'Remover vídeo'"
                @click.stop="setFile(null)"
              >
                <X :size="14" />
              </button>
            </div>
          </template>
        </div>

        <!-- OU separator -->
        <div class="or-divider">
          <span class="or-line" />
          <span class="or-text">ou descrever por escrito</span>
          <span class="or-line" />
        </div>

        <!-- Texto -->
        <div class="field">
          <textarea
            v-model="descriptionText"
            class="textarea"
            rows="5"
            placeholder="Conta o que aconteceu, com suas palavras. Não precisa ser técnico."
            maxlength="4000"
          />
        </div>

        <!-- Campos opcionais -->
        <div class="fields">
          <div class="field">
            <label class="field-label">Resumo curto (opcional)</label>
            <input
              v-model="rawTitle"
              type="text"
              class="input"
              placeholder='ex: "A página não abre"'
              maxlength="120"
            />
          </div>

          <div class="field-row">
            <div class="field">
              <label class="field-label">Seu nome (opcional)</label>
              <input
                v-model="reporterName"
                type="text"
                class="input"
                placeholder="Como te chamar"
                maxlength="80"
              />
            </div>
            <div class="field">
              <label class="field-label">Como falar com você (opcional)</label>
              <input
                v-model="reporterContact"
                type="text"
                class="input"
                placeholder="email ou WhatsApp"
                maxlength="120"
              />
            </div>
          </div>
        </div>

        <!-- Erro / progresso -->
        <div v-if="submitError" class="alert alert-error">
          <AlertCircle :size="14" />
          <span>{{ submitError }}</span>
        </div>

        <div v-if="uploading" class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }" />
          </div>
          <span class="progress-text">Enviando… {{ progress }}%</span>
        </div>

        <!-- Submit -->
        <button
          type="submit"
          class="btn-primary"
          :disabled="!canSubmit || uploading"
        >
          <Loader2 v-if="uploading" :size="15" class="spin" />
          <template v-else>
            <span>Enviar</span>
            <ArrowRight :size="15" />
          </template>
        </button>

        <p class="form-foot">
          <Sparkles :size="12" />
          <span>Quanto mais detalhe, melhor. Pode ser vídeo, texto, ou os dois.</span>
        </p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.report-root {
  min-height: 100vh;
  background:
    radial-gradient(60rem 36rem at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
    var(--bg);
  color: var(--text);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 56px 24px;
}

.centered {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.form-layout {
  width: 100%;
  max-width: 540px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo-wrap {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--accent);
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

.page-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
}

.intro {
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.5;
  margin: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Dropzone */
.dropzone {
  position: relative;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-lg, 14px);
  background: var(--surface);
  padding: 28px 20px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.dropzone:hover {
  border-color: var(--accent);
  background: var(--surface-2);
}

.dropzone--dragging {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.dropzone--has-file {
  padding: 16px;
  text-align: left;
  cursor: default;
}

.dropzone--has-file:hover {
  background: var(--surface);
}

.dropzone-input {
  display: none;
}

.dropzone-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.dropzone-title {
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
}

.dropzone-hint {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
}

.file-preview {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
}

.file-remove {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast);
}

.file-remove:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

/* Fields */
.fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 480px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}

.input,
.textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition:
    border-color var(--motion-fast),
    box-shadow var(--motion-fast);
}

.textarea {
  resize: vertical;
  line-height: 1.5;
}

.input:hover,
.textarea:hover {
  border-color: var(--border-strong);
}

.input:focus,
.textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.input::placeholder,
.textarea::placeholder {
  color: var(--text-4);
}

.or-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0;
}

.or-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}

.or-text {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* Alerts */
.alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  border-radius: var(--radius-sm);
}

.alert-error {
  background: color-mix(in srgb, #ef4444 12%, var(--surface));
  border: 1px solid color-mix(in srgb, #ef4444 30%, var(--border));
  color: color-mix(in srgb, #ef4444 80%, var(--text));
}

/* Progress */
.progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-bar {
  height: 6px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease-out;
}

.progress-text {
  font-size: 12px;
  color: var(--text-3);
}

/* Buttons */
.btn-primary {
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--motion-fast), transform var(--motion-fast);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.07);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 42px;
  padding: 0 18px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--motion-fast), color var(--motion-fast);
}

.btn-secondary:hover {
  border-color: var(--border-strong);
}

.btn-secondary:focus-visible,
.btn-copy-link:focus-visible,
.status-link-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Caixa do link de acompanhamento: texto selecionável + atalho pra abrir. */
.status-link {
  width: 100%;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.status-link--failed {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
}

.status-link-text {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.45;
  word-break: break-all;
  user-select: all;
}

.status-link-action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.status-link-action:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.status-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}

/* Ação principal do card de sucesso (espelha .btn-secondary, mas em accent). */
.btn-copy-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 42px;
  padding: 0 18px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    filter var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.btn-copy-link:hover {
  filter: brightness(1.08);
}

.btn-copy-link:active {
  transform: scale(0.97);
}

.btn-copy-link--done {
  background: var(--success);
  border-color: var(--success);
  color: var(--accent-fg);
}

/* Região viva: anuncia o resultado da cópia pra leitor de tela. */
.copy-feedback {
  margin: 0;
  min-height: 17px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-3);
  max-width: 340px;
}

.copy-feedback--failed {
  color: var(--text-2);
}

@media (prefers-reduced-motion: reduce) {
  .btn-copy-link:active {
    transform: none;
  }
}

.file-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

/* Form footer */
.form-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
}

/* Cards (success / error) */
.card {
  width: 100%;
  max-width: 420px;
  padding: 36px 28px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow-overlay);
}

.card-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

.card-sub {
  font-size: 13.5px;
  color: var(--text-3);
  line-height: 1.55;
  margin: 0;
  max-width: 340px;
}

.success-icon-wrap {
  width: 72px;
  height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 16%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--success) 30%, var(--border));
  color: var(--success);
  margin-bottom: 6px;
}

.error-icon {
  color: #ef4444;
  margin-bottom: 6px;
}

.error-card {
  border-color: color-mix(in srgb, #ef4444 26%, var(--border));
}

/* Animations */
.spin {
  animation: spin 0.85s linear infinite;
  color: var(--text-3);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
