<script setup lang="ts">
import { computed } from 'vue'
import { Eye, Loader2, RotateCw, X } from 'lucide-vue-next'
import { useQrMetrics } from '@/composables/useQrCodes'

/**
 * Painel de métricas de um QR: total de leituras (número grande), série de scans
 * por dia (barras em CSS puro com tokens) e lista dos scans recentes. Datas são
 * instantes reais → toLocaleString/toLocaleDateString pt-BR.
 */
const props = defineProps<{ id: string; label: string }>()
const emit = defineEmits<{ close: [] }>()

const metrics = useQrMetrics(computed(() => props.id))

// Barras normalizadas pelo maior dia (mínimo 3% pra ficar visível quando > 0).
const bars = computed(() => {
  const days = metrics.data.value?.byDay ?? []
  const max = Math.max(1, ...days.map((d) => d.count))
  return days.map((d) => ({
    day: d.day,
    count: d.count,
    label: new Date(`${d.day}T00:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }),
    pct: d.count === 0 ? 0 : Math.max(3, Math.round((d.count / max) * 100)),
  }))
})

const scanCount = computed(() => metrics.data.value?.scanCount ?? 0)

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR')
}

// Resumo curto do userAgent (ex.: "Chrome no Android").
function deviceLabel(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido'
  const browser = /Edg/i.test(ua)
    ? 'Edge'
    : /Chrome/i.test(ua)
      ? 'Chrome'
      : /Firefox/i.test(ua)
        ? 'Firefox'
        : /Safari/i.test(ua)
          ? 'Safari'
          : 'Navegador'
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua)
      ? 'iOS'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}
</script>

<template>
  <Teleport to="body">
    <div class="qmd-overlay" @mousedown.self="emit('close')">
      <section class="qmd" role="dialog" aria-modal="true" aria-label="Métricas do QR">
        <header class="qmd-head">
          <div>
            <p class="qmd-eyebrow">Métricas</p>
            <h2 class="qmd-title">{{ label || 'QR Code' }}</h2>
          </div>
          <button class="qmd-icon-btn" type="button" aria-label="Fechar" @click="emit('close')">
            <X :size="16" />
          </button>
        </header>

        <div class="qmd-body">
          <!-- Loading -->
          <div v-if="metrics.isLoading.value" class="qmd-center">
            <Loader2 :size="22" class="spin" />
            <span>Carregando métricas…</span>
          </div>

          <!-- Erro -->
          <div v-else-if="metrics.isError.value" class="qmd-center">
            <p class="qmd-err">Não foi possível carregar as métricas.</p>
            <button class="qmd-btn" type="button" @click="() => metrics.refetch()">
              <RotateCw :size="14" />
              <span>Tentar de novo</span>
            </button>
          </div>

          <template v-else>
            <!-- Número grande -->
            <div class="qmd-hero">
              <Eye :size="20" class="qmd-hero-icon" />
              <span class="qmd-hero-num">{{ scanCount }}</span>
              <span class="qmd-hero-label">{{ scanCount === 1 ? 'leitura' : 'leituras' }}</span>
            </div>

            <!-- Série por dia -->
            <div class="qmd-section">
              <h3 class="qmd-section-title">Leituras por dia</h3>
              <div v-if="bars.length" class="qmd-chart">
                <div v-for="b in bars" :key="b.day" class="qmd-col" :title="`${b.label}: ${b.count}`">
                  <div class="qmd-bar-track">
                    <div class="qmd-bar" :style="{ height: b.pct + '%' }" />
                  </div>
                  <span class="qmd-bar-val">{{ b.count }}</span>
                  <span class="qmd-bar-day">{{ b.label }}</span>
                </div>
              </div>
              <p v-else class="qmd-muted">Sem leituras ainda.</p>
            </div>

            <!-- Scans recentes -->
            <div class="qmd-section">
              <h3 class="qmd-section-title">Leituras recentes</h3>
              <ul v-if="metrics.data.value?.recent?.length" class="qmd-recent">
                <li v-for="(s, i) in metrics.data.value.recent" :key="i" class="qmd-recent-row">
                  <span class="qmd-recent-when">{{ fmtDateTime(s.at) }}</span>
                  <span class="qmd-recent-dev">{{ deviceLabel(s.userAgent) }}</span>
                </li>
              </ul>
              <p v-else class="qmd-muted">Nenhuma leitura registrada.</p>
            </div>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.qmd-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--text) 55%, transparent);
  backdrop-filter: blur(10px);
}

.qmd {
  width: min(560px, 100%);
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
}

.qmd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}

.qmd-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.qmd-title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--text);
}

.qmd-icon-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.qmd-icon-btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.qmd-body {
  padding: 18px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.qmd-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 0;
  color: var(--text-3);
  font-size: 13px;
}

.qmd-err {
  margin: 0;
  color: var(--err);
  font-size: 13px;
}

.qmd-hero {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.qmd-hero-icon {
  color: var(--accent);
  align-self: center;
}

.qmd-hero-num {
  font-size: 44px;
  font-weight: 800;
  line-height: 1;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.qmd-hero-label {
  font-size: 14px;
  color: var(--text-3);
}

.qmd-section-title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.qmd-chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 140px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.qmd-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 30px;
  flex: 1;
  height: 100%;
}

.qmd-bar-track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.qmd-bar {
  width: 60%;
  min-height: 2px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--accent);
  transition: height var(--motion-fast) var(--motion-ease);
}

.qmd-bar-val {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.qmd-bar-day {
  font-size: 10px;
  color: var(--text-4);
  white-space: nowrap;
}

.qmd-recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.qmd-recent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}

.qmd-recent-row:last-child {
  border-bottom: 0;
}

.qmd-recent-when {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.qmd-recent-dev {
  color: var(--text-3);
}

.qmd-muted {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.qmd-btn {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}

.qmd-btn:hover {
  border-color: var(--border-strong);
}

.spin {
  animation: spin 0.8s linear infinite;
  color: var(--accent);
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
