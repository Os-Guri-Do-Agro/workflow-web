<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
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
  Circle,
  Square,
  Monitor,
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

// Gravação no browser
const recording = ref(false)
const recordError = ref<string | null>(null)
const recordSeconds = ref(0)
let mediaRecorder: MediaRecorder | null = null
let recordedChunks: Blob[] = []
let displayStream: MediaStream | null = null
let micStream: MediaStream | null = null
let recordTimer: number | null = null

const ALLOWED_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
const MAX_BYTES = 18 * 1024 * 1024
const RECORD_MAX_SECONDS = 60

const fileSizeMB = computed(() =>
  file.value ? (file.value.size / (1024 * 1024)).toFixed(1) : '',
)

const recordTimeText = computed(() => {
  const s = recordSeconds.value
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

const canRecord = computed(() => {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function'
  )
})

const canSubmit = computed(
  () => !!file.value || descriptionText.value.trim().length > 0,
)

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

onBeforeUnmount(() => {
  cleanupRecording()
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

async function startRecording() {
  recordError.value = null
  submitError.value = null
  recordedChunks = []

  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
      audio: true,
    })

    // Tenta combinar com microfone — se o user negar, segue sem
    let combined: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      combined = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...displayStream.getAudioTracks(),
        ...micStream.getAudioTracks(),
      ])
    } catch {
      micStream = null
      combined = displayStream
    }

    const mr = pickRecorder(combined)
    if (!mr) {
      cleanupRecording()
      recordError.value =
        'Seu navegador não consegue gravar nesse formato. Tenta usar o Chrome ou Edge.'
      return
    }

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }

    mr.onstop = () => {
      const type = mr.mimeType || 'video/webm'
      const blob = new Blob(recordedChunks, { type })
      const ext = type.includes('mp4') ? 'mp4' : 'webm'
      const f = new File([blob], `gravacao-${Date.now()}.${ext}`, { type })

      if (f.size > MAX_BYTES) {
        submitError.value =
          'A gravação ficou muito grande. Tenta gravar algo mais curto.'
      } else {
        setFile(f)
      }
      cleanupRecording()
    }

    // Se o user clicar "parar de compartilhar" do navegador, parar
    displayStream.getVideoTracks()[0].onended = () => {
      if (recording.value) stopRecording()
    }

    mediaRecorder = mr
    mr.start(1000)
    recording.value = true
    recordSeconds.value = 0
    recordTimer = window.setInterval(() => {
      recordSeconds.value++
      if (recordSeconds.value >= RECORD_MAX_SECONDS) stopRecording()
    }, 1000)
  } catch (e: any) {
    cleanupRecording()
    if (e?.name === 'NotAllowedError') {
      recordError.value = 'Você cancelou a gravação.'
    } else {
      recordError.value =
        'Não consegui gravar a tela. Você pode anexar um vídeo ou descrever em texto.'
    }
  }
}

function pickRecorder(stream: MediaStream): MediaRecorder | null {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      try {
        return new MediaRecorder(stream, { mimeType })
      } catch {
        // tenta próximo
      }
    }
  }
  try {
    return new MediaRecorder(stream)
  } catch {
    return null
  }
}

function stopRecording() {
  if (recordTimer !== null) {
    clearInterval(recordTimer)
    recordTimer = null
  }
  try {
    mediaRecorder?.stop()
  } catch {
    /* ignora */
  }
}

function cleanupRecording() {
  if (recordTimer !== null) {
    clearInterval(recordTimer)
    recordTimer = null
  }
  displayStream?.getTracks().forEach((t) => t.stop())
  micStream?.getTracks().forEach((t) => t.stop())
  displayStream = null
  micStream = null
  mediaRecorder = null
  recording.value = false
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
  recordError.value = null
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
          Vamos dar uma olhada nisso agora. Se a gente precisar de mais detalhes,
          alguém entra em contato.
        </p>
        <button class="btn-secondary" @click="reset">
          <span>Reportar outro problema</span>
        </button>
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
        <!-- Botão grande: gravar tela direto no navegador -->
        <button
          v-if="!recording && !file && canRecord"
          type="button"
          class="record-cta"
          @click="startRecording"
        >
          <Monitor :size="18" />
          <div class="record-cta-text">
            <span class="record-cta-title">Gravar a tela agora</span>
            <span class="record-cta-sub">
              É só apertar — o navegador vai pedir qual aba ou janela mostrar.
            </span>
          </div>
        </button>

        <!-- Painel "GRAVANDO" -->
        <div v-if="recording" class="recording-panel">
          <div class="recording-row">
            <div class="rec-dot-wrap">
              <Circle :size="10" class="rec-dot" />
              <span class="rec-label">Gravando</span>
            </div>
            <span class="rec-time">{{ recordTimeText }} / 01:00</span>
            <button type="button" class="btn-stop" @click="stopRecording">
              <Square :size="13" />
              <span>Parar</span>
            </button>
          </div>
          <p class="rec-hint">
            Mostra pra gente onde tá o problema. A gravação para sozinha em 1 minuto.
          </p>
        </div>

        <!-- Erro de gravação -->
        <div v-if="recordError" class="alert alert-warn">
          <AlertCircle :size="14" />
          <span>{{ recordError }}</span>
        </div>

        <!-- Drop zone (anexar vídeo já existente) -->
        <div
          v-if="!recording"
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
            <p class="dropzone-title">
              {{ canRecord ? 'Ou anexar um vídeo do computador' : 'Anexar um vídeo' }}
            </p>
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
        <div v-if="!recording" class="or-divider">
          <span class="or-line" />
          <span class="or-text">ou descrever por escrito</span>
          <span class="or-line" />
        </div>

        <!-- Texto -->
        <div v-if="!recording" class="field">
          <textarea
            v-model="descriptionText"
            class="textarea"
            rows="5"
            placeholder="Conta o que aconteceu, com suas palavras. Não precisa ser técnico."
            maxlength="4000"
          />
        </div>

        <!-- Campos opcionais -->
        <div v-if="!recording" class="fields">
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
          :disabled="!canSubmit || uploading || recording"
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

/* CTA de gravação */
.record-cta {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: var(--radius-lg, 14px);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: filter var(--motion-fast), border-color var(--motion-fast);
}

.record-cta:hover {
  filter: brightness(1.05);
  border-color: var(--accent);
}

.record-cta-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.record-cta-title {
  font-size: 14px;
  font-weight: 600;
}

.record-cta-sub {
  font-size: 12.5px;
  color: var(--text-3);
}

/* Painel gravando */
.recording-panel {
  padding: 16px 18px;
  background: color-mix(in srgb, #ef4444 10%, var(--surface));
  border: 1px solid color-mix(in srgb, #ef4444 32%, var(--border));
  border-radius: var(--radius-lg, 14px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recording-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.rec-dot-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.rec-dot {
  fill: #ef4444;
  color: #ef4444;
  animation: pulse 1.2s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.45; }
  100% { opacity: 1; }
}

.rec-label {
  font-size: 13px;
  font-weight: 600;
  color: #ef4444;
  letter-spacing: 0.02em;
}

.rec-time {
  font-size: 13px;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.btn-stop {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--text);
  color: var(--bg);
  border: none;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.rec-hint {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
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

.alert-warn {
  background: color-mix(in srgb, #f59e0b 12%, var(--surface));
  border: 1px solid color-mix(in srgb, #f59e0b 30%, var(--border));
  color: color-mix(in srgb, #f59e0b 80%, var(--text));
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
