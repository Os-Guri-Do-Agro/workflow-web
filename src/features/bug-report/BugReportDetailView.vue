<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Bug,
  Loader2,
  Send,
  Sparkles,
  User,
  AlertCircle,
  ExternalLink,
  Cpu,
  CheckCircle2,
  Clock,
} from 'lucide-vue-next'
import bugReportService from '@/service/bug-report/bug-report-service'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const { error: showError } = useToast()

const reportId = computed(() => String(route.params.id ?? ''))

const report = ref<any | null>(null)
const messages = ref<any[]>([])
const loading = ref(true)
const messagesLoading = ref(false)
const sending = ref(false)
const draft = ref('')
const errorMessage = ref<string | null>(null)
const messagesEndRef = ref<HTMLElement | null>(null)

const statusMeta: Record<string, { label: string; color: string; icon: any }> = {
  RECEIVED: { label: 'Recebido', color: '#6B7280', icon: Clock },
  PROCESSING: { label: 'Processando', color: '#F59E0B', icon: Cpu },
  READY: { label: 'Pronto', color: '#10B981', icon: CheckCircle2 },
  FAILED: { label: 'Erro', color: '#EF4444', icon: AlertCircle },
}

const formatDate = (date: string) =>
  new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const loadReport = async () => {
  if (!reportId.value) return
  loading.value = true
  errorMessage.value = null
  try {
    report.value = await bugReportService.getStatus(reportId.value)
  } catch (e: any) {
    errorMessage.value =
      e?.response?.data?.message || 'Não foi possível carregar este report.'
  } finally {
    loading.value = false
  }
}

const loadMessages = async () => {
  if (!reportId.value) return
  messagesLoading.value = true
  try {
    const res = await bugReportService.listMessages(reportId.value)
    messages.value = Array.isArray(res) ? res : res?.data || []
    await nextTick()
    scrollToBottom()
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao carregar mensagens')
  } finally {
    messagesLoading.value = false
  }
}

const scrollToBottom = () => {
  messagesEndRef.value?.scrollIntoView({ behavior: 'smooth', block: 'end' })
}

const send = async () => {
  const content = draft.value.trim()
  if (!content || sending.value) return
  sending.value = true
  // Otimista: adiciona a msg do user ao chat antes da resposta vir
  messages.value.push({
    id: `tmp-${Date.now()}`,
    role: 'USER',
    content,
    createdAt: new Date().toISOString(),
    pending: true,
  })
  draft.value = ''
  await nextTick()
  scrollToBottom()
  try {
    const res = await bugReportService.postMessage(reportId.value, content)
    // Recarrega tudo pra ter o estado canônico (USER + ASSISTANT)
    await loadMessages()
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao enviar mensagem')
    // Remove a optimistic
    messages.value = messages.value.filter((m) => !m.pending)
  } finally {
    sending.value = false
  }
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

onMounted(async () => {
  await loadReport()
  if (report.value) await loadMessages()
})

watch(reportId, async (newId) => {
  if (newId) {
    await loadReport()
    if (report.value) await loadMessages()
  }
})
</script>

<template>
  <div class="detail-root">
    <header class="detail-head">
      <button class="back-btn" @click="router.push('/bug-reports')">
        <ArrowLeft :size="14" />
        <span>Voltar</span>
      </button>
    </header>

    <!-- ESTADO loading -->
    <div v-if="loading" class="centered">
      <Loader2 :size="24" class="spin" />
    </div>

    <!-- ESTADO erro -->
    <div v-else-if="errorMessage" class="centered">
      <div class="error-box">
        <AlertCircle :size="32" />
        <p>{{ errorMessage }}</p>
      </div>
    </div>

    <!-- CONTEÚDO -->
    <div v-else-if="report" class="detail-grid">
      <!-- COLUNA ESQUERDA: dados do bug -->
      <section class="left-col">
        <div class="title-block">
          <div class="title-row">
            <Bug :size="18" class="title-icon" />
            <h1 class="title-text">
              {{ report.extractedTitle || report.spec?.title || report.rawTitle || 'Bug sem título' }}
            </h1>
          </div>
          <div class="title-meta">
            <span class="status-pill" :style="{ color: statusMeta[report.status]?.color }">
              <component :is="statusMeta[report.status]?.icon" :size="11" />
              {{ statusMeta[report.status]?.label || report.status }}
            </span>
            <span class="meta-sep">·</span>
            <span>{{ formatDate(report.createdAt) }}</span>
            <template v-if="report.reporterName">
              <span class="meta-sep">·</span>
              <span>{{ report.reporterName }}</span>
            </template>
            <template v-if="report.reporterContact">
              <span class="meta-sep">·</span>
              <a :href="`mailto:${report.reporterContact}`" class="contact-link">
                {{ report.reporterContact }}
              </a>
            </template>
          </div>
        </div>

        <div v-if="report.errorMessage" class="alert alert-error">
          <AlertCircle :size="14" />
          <span>{{ report.errorMessage }}</span>
        </div>

        <!-- Vídeo -->
        <div v-if="report.videoUrl" class="video-wrap">
          <video :src="report.videoUrl" controls class="video-el" />
        </div>

        <!-- Spec ou descrição -->
        <div v-if="report.spec" class="block">
          <div class="block-head">
            <Sparkles :size="13" />
            <h2 class="block-title">Spec gerada por IA</h2>
          </div>
          <pre class="markdown-pre">{{ report.spec.content }}</pre>
        </div>

        <div v-else-if="report.extractedDescription || report.descriptionText" class="block">
          <div class="block-head">
            <h2 class="block-title">Descrição</h2>
          </div>
          <pre class="markdown-pre">{{ report.extractedDescription || report.descriptionText }}</pre>
        </div>

        <!-- Activity link -->
        <div v-if="report.activity" class="block activity-block">
          <div class="block-head">
            <h2 class="block-title">Tarefa criada</h2>
          </div>
          <button
            class="activity-row"
            @click="router.push(`/tasks/${report.activity.monthId}/${report.activity.id}`)"
          >
            <div class="activity-info">
              <span class="activity-title">{{ report.activity.title }}</span>
              <span class="activity-status">{{ report.activity.status }}</span>
            </div>
            <ExternalLink :size="14" />
          </button>
        </div>
      </section>

      <!-- COLUNA DIREITA: chat -->
      <section class="right-col">
        <div class="chat-head">
          <Sparkles :size="14" />
          <h2 class="chat-title">Investigar com Claude</h2>
        </div>

        <div class="messages">
          <div v-if="messagesLoading && !messages.length" class="empty-msgs">
            <Loader2 :size="18" class="spin" />
            <span>Carregando…</span>
          </div>

          <div v-else-if="!messages.length" class="empty-msgs">
            <Sparkles :size="20" />
            <p>
              Pergunte algo sobre esse bug — eu li a spec e o transcript do vídeo (se tiver).
            </p>
            <p class="empty-hint">
              Sugestões: <em>"qual a causa provável?"</em>, <em>"gera o fix em React"</em>,
              <em>"que arquivo do nosso código pode estar quebrando?"</em>
            </p>
          </div>

          <div
            v-for="m in messages"
            :key="m.id"
            class="message"
            :class="m.role === 'USER' ? 'message--user' : 'message--ai'"
          >
            <div class="msg-avatar">
              <User v-if="m.role === 'USER'" :size="14" />
              <Sparkles v-else :size="14" />
            </div>
            <div class="msg-body">
              <pre class="msg-content">{{ m.content }}</pre>
              <span v-if="!m.pending" class="msg-time">{{ formatDate(m.createdAt) }}</span>
              <span v-else class="msg-time pending">enviando…</span>
            </div>
          </div>

          <div ref="messagesEndRef" />
        </div>

        <form class="composer" @submit.prevent="send">
          <textarea
            v-model="draft"
            class="composer-input"
            placeholder="Pergunta, peça código, descreva o que achou…"
            rows="2"
            :disabled="sending"
            @keydown="onKey"
          />
          <button
            type="submit"
            class="composer-send"
            :disabled="!draft.trim() || sending"
          >
            <Loader2 v-if="sending" :size="14" class="spin" />
            <Send v-else :size="14" />
          </button>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.detail-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 28px;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
}

.detail-head {
  display: flex;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--motion-fast), color var(--motion-fast);
}

.back-btn:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.centered {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
}

.error-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
  text-align: center;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

@media (max-width: 980px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.left-col,
.right-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  color: var(--accent);
}

.title-text {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  word-break: break-word;
}

.title-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-3);
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.meta-sep {
  opacity: 0.5;
}

.contact-link {
  color: var(--accent);
  text-decoration: none;
}

.contact-link:hover {
  text-decoration: underline;
}

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

.video-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: #000;
}

.video-el {
  width: 100%;
  display: block;
  max-height: 480px;
}

.block {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
}

.block-title {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin: 0;
}

.markdown-pre {
  margin: 0;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.activity-block {
  padding: 12px 14px;
}

.activity-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  text-align: left;
  transition: border-color var(--motion-fast);
}

.activity-row:hover {
  border-color: var(--accent);
}

.activity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.activity-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-status {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.03em;
}

/* Chat */
.right-col {
  position: sticky;
  top: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  max-height: calc(100vh - 60px);
}

@media (max-width: 980px) {
  .right-col {
    position: static;
    max-height: none;
  }
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}

.chat-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin: 0;
}

.messages {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 8px 4px;
  min-height: 220px;
  max-height: calc(100vh - 250px);
}

@media (max-width: 980px) {
  .messages {
    max-height: 540px;
  }
}

.empty-msgs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}

.empty-msgs p {
  margin: 0;
  max-width: 280px;
  line-height: 1.5;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-4);
}

.empty-hint em {
  color: var(--text-2);
  font-style: normal;
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11.5px;
}

.message {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.msg-avatar {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-3);
  flex-shrink: 0;
  border: 1px solid var(--border);
}

.message--ai .msg-avatar {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  border-color: color-mix(in srgb, var(--accent) 26%, var(--border));
}

.msg-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.msg-content {
  margin: 0;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  word-wrap: break-word;
}

.msg-time {
  font-size: 11px;
  color: var(--text-4);
}

.msg-time.pending {
  color: var(--accent);
}

.composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.composer-input {
  flex: 1;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13.5px;
  font-family: inherit;
  resize: none;
  outline: none;
  line-height: 1.45;
  transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
}

.composer-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.composer-send {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: filter var(--motion-fast);
}

.composer-send:hover:not(:disabled) {
  filter: brightness(1.1);
}

.composer-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
