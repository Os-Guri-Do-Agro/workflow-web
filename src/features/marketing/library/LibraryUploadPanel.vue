<script setup lang="ts">
/**
 * Envios do Acervo deste grupo, em faixa no topo do conteúdo. SÓ LEITURA: é
 * um retrato dos itens `kind: 'library'` da fila global (`upload-queue.ts`);
 * cancelar, tentar de novo e responder ao "repetido" ficam na bandeja
 * "Envios", que é a mesma em qualquer tela da ala. Assim os dois lugares
 * nunca discordam.
 *
 * "Fechar" só esconde daqui o que já terminou (a bandeja segue com a lista).
 */
import { computed, ref } from 'vue'
import { ChevronDown, CircleAlert, CircleCheck, LoaderCircle, X } from 'lucide-vue-next'
import { formatBytes } from '../marketing-labels'
import { itemPercent } from '../uploads/upload-format'
import { isUploadPending, isUploadSettled, useUploadQueue, type UploadItem } from '../uploads/upload-queue'

const props = defineProps<{ groupId: string }>()

const queue = useUploadQueue()
const collapsed = ref(false)
/** Terminados antes deste instante não aparecem aqui (a pessoa fechou a faixa). */
const hiddenUntil = ref(0)

const tasks = computed(() =>
  queue.items.value.filter(
    (i) =>
      i.groupId === props.groupId &&
      i.target.kind === 'library' &&
      !(isUploadSettled(i) && (i.finishedAt ?? 0) <= hiddenUntil.value),
  ),
)
const active = computed(() => tasks.value.filter(isUploadPending))
const done = computed(() => tasks.value.filter((t) => t.status === 'done').length)
const failed = computed(() => tasks.value.filter((t) => t.status === 'error').length)
const skipped = computed(() => tasks.value.filter((t) => t.status === 'skipped').length)
const canceled = computed(() => tasks.value.filter((t) => t.status === 'canceled').length)
const asking = computed(() => tasks.value.filter((t) => !!t.prompt).length)
const counted = computed(() => tasks.value.filter((t) => t.status !== 'skipped' && t.status !== 'canceled'))
const overall = computed(() => {
  const list = counted.value
  if (!list.length) return 100
  return Math.round(list.reduce((s, t) => s + itemPercent(t), 0) / list.length)
})

const title = computed(() => {
  if (active.value.length) return `Enviando: ${done.value} de ${counted.value.length} prontos`
  if (failed.value) return failed.value === 1 ? '1 arquivo não subiu' : `${failed.value} arquivos não subiram`
  if (!done.value && canceled.value) return canceled.value === 1 ? '1 envio cancelado' : `${canceled.value} envios cancelados`
  return done.value === 1 ? '1 arquivo enviado' : `${done.value} arquivos enviados`
})

const extras = computed(() => {
  const out: string[] = []
  if (asking.value) out.push(asking.value === 1 ? '1 esperando resposta na bandeja' : `${asking.value} esperando resposta na bandeja`)
  if (skipped.value) out.push(skipped.value === 1 ? '1 pulado' : `${skipped.value} pulados`)
  if (canceled.value && (done.value || active.value.length || failed.value)) {
    out.push(canceled.value === 1 ? '1 cancelado' : `${canceled.value} cancelados`)
  }
  return out.join(' · ')
})

/** Estado de cada arquivo, curto. Cancelado e pulado têm texto próprio (não são falha). */
function statusLabel(t: UploadItem) {
  if (t.prompt) return 'Esperando resposta'
  switch (t.status) {
    case 'queued':
      return 'Na fila'
    case 'hashing':
      return 'Conferindo'
    case 'uploading':
      return `${itemPercent(t)}%`
    case 'confirming':
      return 'Salvando'
    case 'done':
      return 'Enviado'
    case 'skipped':
      return 'Pulado'
    case 'canceled':
      return 'Cancelado'
    case 'error':
      return 'Falhou'
  }
}

function hideFinished() {
  hiddenUntil.value = Date.now()
}
</script>

<template>
  <section v-if="tasks.length" class="lup" :class="{ 'is-collapsed': collapsed }" aria-label="Envios do Acervo" data-panel="uploads">
    <header class="lup__head">
      <LoaderCircle v-if="active.length" :size="15" class="lup__spin" aria-hidden="true" />
      <CircleAlert v-else-if="failed" :size="15" class="lup__err-icon" aria-hidden="true" />
      <CircleCheck v-else :size="15" class="lup__ok-icon" aria-hidden="true" />
      <span class="lup__title">{{ title }}</span>
      <span v-if="extras" class="lup__sub">{{ extras }}</span>
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
        aria-label="Fechar o resumo dos envios"
        title="Fechar (a bandeja Envios continua com a lista)"
        @click="hideFinished"
      >
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="lup__bar" role="progressbar" aria-label="Envios do Acervo" :aria-valuenow="overall" aria-valuemin="0" aria-valuemax="100">
      <span :style="{ width: `${overall}%` }" />
    </div>
    <ul v-if="!collapsed" class="lup__list">
      <li v-for="t in tasks" :key="t.id" class="lup__row" :data-upload="t.prompt ? 'asking' : t.status" :data-name="t.name">
        <div class="lup__row-main">
          <span class="lup__name" :title="t.relativePath ?? t.name">{{ t.relativePath ?? t.name }}</span>
          <span class="lup__meta">{{ formatBytes(t.size) }}</span>
          <span class="lup__status" :class="`is-${t.prompt ? 'asking' : t.status}`">{{ statusLabel(t) }}</span>
        </div>
        <div v-if="t.status === 'hashing' || t.status === 'uploading' || t.status === 'confirming'" class="lup__file-bar">
          <span :style="{ width: `${t.status === 'confirming' ? 100 : itemPercent(t)}%` }" />
        </div>
        <p v-if="t.status === 'error' && t.error" class="lup__error">{{ t.error }}</p>
        <p v-else-if="t.prompt" class="lup__note">{{ t.prompt.message }} Responda na bandeja Envios.</p>
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
  min-width: 0;
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
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
  padding: 4px 12px;
}

.lup__row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
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
  white-space: nowrap;
}

.lup__status.is-done {
  color: var(--success);
}

.lup__status.is-error {
  color: var(--err);
}

.lup__status.is-asking {
  color: var(--text);
}

.lup__status.is-skipped,
.lup__status.is-canceled,
.lup__status.is-queued {
  color: var(--text-3);
}

.lup__error,
.lup__note {
  margin: 0;
  font-size: 11.5px;
}

.lup__error {
  color: var(--err);
}

.lup__note {
  color: var(--text-2);
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

  .lup__head :deep(.mk-icon-btn) {
    min-width: 44px;
    min-height: 44px;
  }

  .lup__sub {
    display: none;
  }
}
</style>
