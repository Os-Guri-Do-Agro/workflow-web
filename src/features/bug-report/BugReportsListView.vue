<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bug,
  Loader2,
  Video,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Cpu,
  ArrowRight,
} from 'lucide-vue-next'
import bugReportService from '@/service/bug-report/bug-report-service'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const { error: showError } = useToast()

const reports = ref<any[]>([])
const loading = ref(false)
const activeFilter = ref<string>('ALL')

const filterOptions = [
  { value: 'ALL', label: 'Todos' },
  { value: 'RECEIVED', label: 'Recebidos' },
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'READY', label: 'Prontos' },
  { value: 'FAILED', label: 'Com erro' },
]

const statusMeta: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  RECEIVED: { label: 'Recebido', color: '#6B7280', icon: Clock },
  PROCESSING: { label: 'Processando', color: '#F59E0B', icon: Cpu },
  READY: { label: 'Pronto', color: '#10B981', icon: CheckCircle2 },
  FAILED: { label: 'Erro', color: '#EF4444', icon: AlertCircle },
}

const filtered = computed(() => {
  if (activeFilter.value === 'ALL') return reports.value
  return reports.value.filter((r) => r.status === activeFilter.value)
})

const counts = computed(() => {
  const c: Record<string, number> = { ALL: reports.value.length }
  for (const k of Object.keys(statusMeta)) {
    c[k] = reports.value.filter((r) => r.status === k).length
  }
  return c
})

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

const load = async () => {
  loading.value = true
  try {
    const res = await bugReportService.listByCompany()
    reports.value = Array.isArray(res) ? res : res?.data || []
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao carregar reports')
  } finally {
    loading.value = false
  }
}

const open = (id: string) => router.push(`/bug-reports/${id}`)

onMounted(() => load())
</script>

<template>
  <div class="reports-root">
    <header class="page-head">
      <div class="head-left">
        <div class="logo-wrap">
          <Bug :size="18" />
        </div>
        <div>
          <h1 class="page-title">Bug reports</h1>
          <p class="page-sub">Vídeos e relatos enviados pelo time</p>
        </div>
      </div>
    </header>

    <div class="filter-bar">
      <button
        v-for="f in filterOptions"
        :key="f.value"
        type="button"
        class="filter-chip"
        :class="{ 'filter-chip--active': activeFilter === f.value }"
        @click="activeFilter = f.value"
      >
        <span>{{ f.label }}</span>
        <span class="filter-count">{{ counts[f.value] ?? 0 }}</span>
      </button>
    </div>

    <div v-if="loading" class="state-row">
      <Loader2 :size="20" class="spin" />
      <span>Carregando…</span>
    </div>

    <div v-else-if="!filtered.length" class="state-row">
      <Bug :size="20" />
      <span v-if="!reports.length">
        Nenhum report ainda. Quando alguém usar o link de
        <code>/reports/&lt;companyId&gt;</code>, aparece aqui.
      </span>
      <span v-else>Nenhum report nesse filtro.</span>
    </div>

    <ul v-else class="reports-list">
      <li
        v-for="r in filtered"
        :key="r.id"
        class="report-card"
        @click="open(r.id)"
      >
        <div class="card-icon">
          <Video v-if="r.videoUrl" :size="16" />
          <FileText v-else :size="16" />
        </div>
        <div class="card-body">
          <h3 class="card-title">
            {{ r.extractedTitle || r.spec?.title || r.rawTitle || '(sem título ainda)' }}
          </h3>
          <div class="card-meta">
            <span class="meta-status" :style="{ color: statusMeta[r.status]?.color }">
              <component :is="statusMeta[r.status]?.icon" :size="11" />
              {{ statusMeta[r.status]?.label || r.status }}
            </span>
            <span class="meta-sep">·</span>
            <span>{{ formatDate(r.createdAt) }}</span>
            <template v-if="r.reporterName">
              <span class="meta-sep">·</span>
              <span>{{ r.reporterName }}</span>
            </template>
            <template v-if="r.activity">
              <span class="meta-sep">·</span>
              <span class="meta-activity">→ {{ r.activity.title }}</span>
            </template>
          </div>
        </div>
        <ArrowRight :size="14" class="card-arrow" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.reports-root {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 28px;
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.logo-wrap {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--accent);
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}

.page-sub {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--motion-fast), color var(--motion-fast);
}

.filter-chip:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.filter-chip--active {
  background: var(--surface-2);
  border-color: var(--accent);
  color: var(--text);
}

.filter-count {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 600;
}

.filter-chip--active .filter-count {
  color: var(--accent);
}

.state-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 32px 0;
  color: var(--text-3);
  font-size: 13px;
  justify-content: center;
}

.state-row code {
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.reports-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.report-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    border-color var(--motion-fast),
    background var(--motion-fast);
}

.report-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.card-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-3);
  flex-shrink: 0;
}

.card-body {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 13.5px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
  flex-wrap: wrap;
}

.meta-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.meta-sep {
  opacity: 0.5;
}

.meta-activity {
  color: var(--text-2);
}

.card-arrow {
  color: var(--text-4);
  flex-shrink: 0;
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
