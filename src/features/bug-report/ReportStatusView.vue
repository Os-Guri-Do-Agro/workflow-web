<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  AlertCircle,
  Loader2,
  CheckCircle2,
  Cpu,
  Clock,
  Sparkles,
  Bug,
  ExternalLink,
} from 'lucide-vue-next'
import bugReportService from '@/service/bug-report/bug-report-service'

const route = useRoute()
const reportId = computed(() => String(route.params.id ?? ''))

const report = ref<any | null>(null)
const loading = ref(true)
const errorMessage = ref<string | null>(null)

type StatusMeta = { label: string; sub: string; color: string; icon: any }

const STATUS_META: Record<string, StatusMeta> = {
  RECEIVED: {
    label: 'Recebido',
    sub: 'Acabamos de receber seu report. Vamos olhar agora.',
    color: '#6B7280',
    icon: Clock,
  },
  PROCESSING: {
    label: 'Em análise',
    sub: 'Analisando os detalhes pra entender o problema.',
    color: '#F59E0B',
    icon: Cpu,
  },
  READY: {
    label: 'Em andamento',
    sub: 'Já abrimos uma tarefa pra resolver. Em breve damos retorno.',
    color: '#10B981',
    icon: CheckCircle2,
  },
  FAILED: {
    label: 'Precisamos de mais detalhes',
    sub: 'Algo não bateu no processamento. Vamos olhar manualmente — fica tranquilo.',
    color: '#EF4444',
    icon: AlertCircle,
  },
}

const FALLBACK: StatusMeta = STATUS_META.RECEIVED as StatusMeta

const status = computed<StatusMeta>(() => {
  const k = report.value?.status
  if (k && k in STATUS_META) return STATUS_META[k] as StatusMeta
  return FALLBACK
})

const formatDate = (date: string) =>
  new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const load = async () => {
  if (!reportId.value) {
    errorMessage.value = 'Link incompleto.'
    loading.value = false
    return
  }
  try {
    report.value = await bugReportService.getStatus(reportId.value)
  } catch (e: any) {
    errorMessage.value =
      e?.response?.status === 404
        ? 'Não encontramos esse report. Confere o link.'
        : 'Não foi possível carregar agora. Tenta de novo daqui a pouco.'
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <div class="page">
    <header class="head">
      <div class="logo-wrap"><Bug :size="18" /></div>
      <span class="brand">Nevo</span>
    </header>

    <main class="main">
      <div v-if="loading" class="centered">
        <Loader2 :size="28" class="spin" />
      </div>

      <div v-else-if="errorMessage" class="centered">
        <div class="card error">
          <AlertCircle :size="40" class="icon-err" />
          <h1 class="card-title">Não conseguimos abrir</h1>
          <p class="card-sub">{{ errorMessage }}</p>
        </div>
      </div>

      <div v-else-if="report" class="centered">
        <div class="card">
          <div
            class="status-icon"
            :style="{
              background: `color-mix(in srgb, ${status.color} 12%, var(--surface-2))`,
              borderColor: `color-mix(in srgb, ${status.color} 30%, var(--border))`,
              color: status.color,
            }"
          >
            <component :is="status.icon" :size="28" />
          </div>

          <div class="status-pill" :style="{ color: status.color }">
            {{ status.label }}
          </div>

          <h1 class="card-title">
            {{ report.extractedTitle || report.spec?.title || report.rawTitle || 'Seu report' }}
          </h1>

          <p class="card-sub">{{ status.sub }}</p>

          <div v-if="report.extractedDescription || report.spec?.content" class="summary">
            <div class="summary-head">
              <Sparkles :size="12" />
              <span>Resumo do que entendemos</span>
            </div>
            <p class="summary-body">
              {{
                report.extractedDescription ||
                  (report.spec?.content || '').substring(0, 280)
              }}
            </p>
          </div>

          <div class="meta">
            <span class="meta-row">
              <span class="meta-label">Recebido</span>
              <strong>{{ formatDate(report.createdAt) }}</strong>
            </span>
            <span v-if="report.activity" class="meta-row">
              <span class="meta-label">Tarefa</span>
              <strong>#{{ report.activity.id.slice(-6) }} · {{ report.activity.status }}</strong>
            </span>
          </div>

          <p class="footer-hint">
            <ExternalLink :size="11" />
            <span>Salve este link pra acompanhar o andamento. Se passou contato, entramos em contato quando houver atualização.</span>
          </p>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background:
    radial-gradient(60rem 36rem at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
    var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 28px;
}
.logo-wrap {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--accent);
}
.brand {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: -0.01em;
}
.main {
  flex: 1;
  display: flex;
}
.centered {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}
.card {
  width: 100%;
  max-width: 480px;
  padding: 36px 28px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg, 16px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-shadow: var(--shadow-overlay);
}
.error {
  border-color: color-mix(in srgb, #ef4444 30%, var(--border));
}
.icon-err {
  color: #ef4444;
  margin-bottom: 4px;
}
.status-icon {
  width: 72px;
  height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--border);
  margin-bottom: 4px;
}
.status-pill {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
  max-width: 360px;
}
.summary {
  width: 100%;
  margin-top: 8px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
}
.summary-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 6px;
}
.summary-body {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.55;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  width: 100%;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-3);
}
.meta-label {
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}
.footer-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-4);
  line-height: 1.5;
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
