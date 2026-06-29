<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Bug,
  Loader2,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Cpu,
  CheckCircle2,
  Clock,
} from 'lucide-vue-next'
import bugReportService from '@/service/bug-report/bug-report-service'
import CommentsPanel from '@/components/collaboration/CommentsPanel.vue'

const route = useRoute()
const router = useRouter()

const reportId = computed(() => String(route.params.id ?? ''))

const report = ref<any | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

const statusMeta: Record<string, { label: string; color: string; icon: any }> = {
  RECEIVED: { label: 'Recebido', color: 'var(--text-3)', icon: Clock },
  PROCESSING: { label: 'Processando', color: 'var(--warn)', icon: Cpu },
  READY: { label: 'Pronto', color: 'var(--success)', icon: CheckCircle2 },
  FAILED: { label: 'Erro', color: 'var(--err)', icon: AlertCircle },
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
    // Detalhe protegido (WORKER+, escopo de empresa) — inclui a spec gerada.
    report.value = await bugReportService.getDetail(reportId.value)
  } catch (e: any) {
    errorMessage.value =
      e?.response?.data?.message || 'Não foi possível carregar este report.'
  } finally {
    loading.value = false
  }
}

onMounted(loadReport)
watch(reportId, (newId) => {
  if (newId) loadReport()
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
    <section v-else-if="report" class="detail-body">
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

      <!-- Anexo (vídeo ou imagem) -->
      <div v-if="report.videoUrl" class="media-wrap">
        <img
          v-if="report.videoMimetype?.startsWith('image/')"
          :src="report.videoUrl"
          alt="Anexo do report"
          class="media-el"
        />
        <video v-else :src="report.videoUrl" controls class="media-el" />
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

      <CommentsPanel entity-type="BUG_REPORT" :entity-id="reportId" title="Comentários internos" />
    </section>
  </div>
</template>

<style scoped>
.detail-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 28px;
  max-width: 900px;
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
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
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

.detail-body {
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
  background: color-mix(in srgb, var(--err) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--err) 30%, var(--border));
  color: color-mix(in srgb, var(--err) 80%, var(--text));
}

.media-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: #000;
}

.media-el {
  width: 100%;
  display: block;
  max-height: 480px;
  object-fit: contain;
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
  transition: border-color var(--motion-fast) var(--motion-ease);
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

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
