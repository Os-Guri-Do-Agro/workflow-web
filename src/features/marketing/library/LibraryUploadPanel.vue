<script setup lang="ts">
/**
 * Envios do Acervo desta janela, em faixa no topo do conteúdo (não flutua:
 * o canto de baixo é dos avisos e, depois, da bandeja global da ala):
 * progresso de cada arquivo, tentar de novo o que falhou e tirar da fila o que
 * ainda não começou. A fila vive no módulo (`library-upload.ts`), então sair
 * da tela e voltar mostra o mesmo estado. Sai quando a bandeja "Envios" do
 * R1-B assumir os envios.
 */
import { computed, ref } from 'vue'
import { ChevronDown, CircleAlert, CircleCheck, LoaderCircle, RotateCcw, X } from 'lucide-vue-next'
import { formatBytes } from '../marketing-labels'
import {
  cancelQueuedLibraryUpload,
  clearFinishedLibraryUploads,
  libraryUploads,
  retryLibraryUpload,
  type LibraryUploadTask,
} from './library-upload'

const props = defineProps<{ groupId: string }>()

const collapsed = ref(false)
const tasks = computed(() => libraryUploads.tasks.filter((t) => t.groupId === props.groupId))
const active = computed(() => tasks.value.filter((t) => ['queued', 'uploading', 'saving'].includes(t.status)))
const done = computed(() => tasks.value.filter((t) => t.status === 'done').length)
const failed = computed(() => tasks.value.filter((t) => t.status === 'error').length)
const skipped = computed(() => tasks.value.filter((t) => t.status === 'skipped').length)
const overall = computed(() => {
  const list = tasks.value.filter((t) => t.status !== 'skipped')
  if (!list.length) return 100
  return Math.round(list.reduce((s, t) => s + (t.status === 'done' ? 100 : t.progress), 0) / list.length)
})

const title = computed(() => {
  if (active.value.length) {
    const total = tasks.value.filter((t) => t.status !== 'skipped').length
    return `Enviando: ${done.value} de ${total} prontos`
  }
  if (failed.value) return failed.value === 1 ? '1 arquivo não subiu' : `${failed.value} arquivos não subiram`
  return done.value === 1 ? '1 arquivo enviado' : `${done.value} arquivos enviados`
})

function statusLabel(t: LibraryUploadTask) {
  if (t.status === 'queued') return 'Na fila'
  if (t.status === 'uploading') return `${t.progress}%`
  if (t.status === 'saving') return 'Salvando'
  if (t.status === 'done') return 'Enviado'
  if (t.status === 'skipped') return 'Pulado'
  return 'Falhou'
}
</script>

<template>
  <section v-if="tasks.length" class="lup" :class="{ 'is-collapsed': collapsed }" aria-label="Envios do Acervo" data-panel="uploads">
    <header class="lup__head">
      <LoaderCircle v-if="active.length" :size="15" class="lup__spin" aria-hidden="true" />
      <CircleAlert v-else-if="failed" :size="15" class="lup__err-icon" aria-hidden="true" />
      <CircleCheck v-else :size="15" class="lup__ok-icon" aria-hidden="true" />
      <span class="lup__title" aria-live="polite">{{ title }}</span>
      <span v-if="skipped" class="lup__sub">{{ skipped === 1 ? '1 pulado' : `${skipped} pulados` }}</span>
      <button
        type="button"
        class="mk-icon-btn lup__toggle"
        :aria-label="collapsed ? 'Mostrar envios' : 'Recolher envios'"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <ChevronDown :size="15" aria-hidden="true" />
      </button>
      <button
        v-if="!active.length"
        type="button"
        class="mk-icon-btn"
        aria-label="Fechar envios concluídos"
        @click="clearFinishedLibraryUploads"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="lup__bar" role="progressbar" :aria-valuenow="overall" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${overall}%` }" />
    </div>
    <ul v-if="!collapsed" class="lup__list">
      <li v-for="t in tasks" :key="t.key" class="lup__row" :data-upload="t.status">
        <div class="lup__row-main">
          <span class="lup__name" :title="t.relativePath ?? t.name">{{ t.relativePath ?? t.name }}</span>
          <span class="lup__meta">{{ formatBytes(t.size) }}</span>
          <span class="lup__status" :class="`is-${t.status}`">{{ statusLabel(t) }}</span>
          <button
            v-if="t.status === 'error'"
            type="button"
            class="mk-icon-btn"
            :aria-label="`Tentar de novo ${t.name}`"
            @click="retryLibraryUpload(t.key)"
          >
            <RotateCcw :size="14" aria-hidden="true" />
          </button>
          <button
            v-else-if="t.status === 'queued'"
            type="button"
            class="mk-icon-btn"
            :aria-label="`Tirar ${t.name} da fila`"
            @click="cancelQueuedLibraryUpload(t.key)"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </div>
        <div v-if="t.status === 'uploading' || t.status === 'saving'" class="lup__file-bar">
          <span :style="{ width: `${t.status === 'saving' ? 100 : t.progress}%` }" />
        </div>
        <p v-if="t.error" class="lup__error">{{ t.error }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.lup {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.lup__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 12px;
}

.lup__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lup__sub {
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
}

.lup__spin {
  flex: none;
  color: var(--accent-ink);
  animation: lup-spin 1s linear infinite;
}

.lup__ok-icon {
  flex: none;
  color: var(--success);
}

.lup__err-icon {
  flex: none;
  color: var(--err);
}

.lup__toggle :deep(svg) {
  transition: transform var(--motion-fast) var(--motion-ease);
}

.lup.is-collapsed .lup__toggle :deep(svg) {
  transform: rotate(180deg);
}

.lup__bar,
.lup__file-bar {
  height: 3px;
  background: var(--surface-2);
}

.lup__bar span,
.lup__file-bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-fast) linear;
}

.lup__list {
  max-height: 188px;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
  list-style: none;
}

.lup__row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 6px 4px 12px;
}

.lup__row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.lup__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lup__meta {
  color: var(--text-3);
  font-size: 11.5px;
  white-space: nowrap;
}

.lup__status {
  min-width: 56px;
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.lup__status.is-done {
  color: var(--success);
}

.lup__status.is-error {
  color: var(--err);
}

.lup__status.is-skipped,
.lup__status.is-queued {
  color: var(--text-3);
}

.lup__error {
  margin: 0;
  color: var(--err);
  font-size: 11.5px;
}

@keyframes lup-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lup__spin {
    animation: none;
  }
}

@media (max-width: 640px) {
  .lup__list {
    max-height: 160px;
  }
}
</style>
