<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  AlertTriangle,
  Upload,
  Video,
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

const ALLOWED_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
const MAX_BYTES = 18 * 1024 * 1024
const RECORD_MAX_SECONDS = 60

const fileSizeMB = computed(() =>
  file.value ? (file.value.size / (1024 * 1024)).toFixed(1) : '',
)

const canSubmit = computed(
  () => !!file.value || descriptionText.value.trim().length > 0,
)

const statusUrl = computed(() =>
  submittedId.value ? `${window.location.origin}/r/${submittedId.value}` : '',
)
const copied = ref(false)
async function copyStatusLink() {
  if (!statusUrl.value) return
  try {
    await navigator.clipboard.writeText(statusUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* ignora */
  }
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
  if (!ALLOWED_MIME.includes(f.type)) {
    return 'Esse arquivo não parece um vídeo. Tenta um arquivo de vídeo (MP4, MOV ou WebM).'
  }
  if (f.size > MAX_BYTES) {
    return 'Esse vídeo é longo demais. Tenta gravar algo mais curto, de até 1 minuto.'
  }
  return null
}

function setFile(f: File | null) {
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
}

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
          o andamento sempre que quiser — sem precisar de login.
        </p>

        <a
          class="status-link"
          :href="statusUrl"
          target="_blank"
          rel="noopener"
        >
          <span class="status-link-text">{{ statusUrl }}</span>
          <span class="status-link-action">Abrir</span>
        </a>

        <div class="status-actions">
          <button class="btn-copy-link" @click="copyStatusLink">
            <Check v-if="copied" :size="13" />
            <Copy v-else :size="13" />
            <span>{{ copied ? 'Copiado' : 'Copiar link' }}</span>
          </button>
          <button class="btn-secondary" @click="reset">Reportar outro</button>
        </div>
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
        Conta o que aconteceu — pode mostrar pela tela ou só escrever. A gente
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
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
            @change="onPick"
          />

          <template v-if="!file">
            <div class="dropzone-icon">
              <Upload :size="20" />
            </div>
            <p class="dropzone-title">Anexar um vídeo</p>
            <p class="dropzone-hint">Vídeo curto (até 1 minuto)</p>
          </template>

          <template v-else>
            <div class="file-preview">
              <Video :size="20" />
              <div class="file-info">
                <p class="file-name">{{ file.name }}</p>
                <p class="file-size">{{ fileSizeMB }} MB · vídeo pronto pra enviar</p>
              </div>
              <button
                type="button"
                class="file-remove"
                aria-label="Remover vídeo"
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
  height: 36px;
  padding: 0 16px;
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
  background: color-mix(in srgb, #10b981 16%, var(--surface-2));
  border: 1px solid color-mix(in srgb, #10b981 30%, var(--border));
  color: #10b981;
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
