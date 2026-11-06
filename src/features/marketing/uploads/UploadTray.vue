<script setup lang="ts">
/**
 * Bandeja "Envios" da ala (D4): embaixo à direita, em qualquer tela da ala.
 * Só desenha o estado da fila global (`upload-queue.ts`) e dos rascunhos de
 * versão (`version-drafts.ts`); fechar a bandeja não cancela nada.
 *
 * Compacta: uma barra com o resumo (quantos, %, tempo restante) que abre a
 * lista densa, um arquivo por linha (nome, tamanho, progresso, velocidade,
 * tempo, erro em pt-BR, cancelar e tentar de novo). No celular vira uma faixa
 * acima da barra de abas que expande para cima.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  FileText,
  Film,
  RotateCw,
  WifiOff,
  X,
} from 'lucide-vue-next'
import { useOnline } from '@vueuse/core'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import LibraryCheck from '../library/LibraryCheck.vue'
import { useMarketing } from '../composables/useMarketing'
import { useUploadQueue, type UploadItem } from './upload-queue'
import { formatBytes, formatEta, itemPercent, itemStatusText } from './upload-format'
import {
  closedVersions,
  draftProgress,
  dropDraftNotice,
  retryVersion,
  scheduledDrafts,
  unscheduleVersion,
  type VersionDraft,
} from './version-drafts'

const queue = useUploadQueue()
const isPhone = usePhoneViewport()
const online = useOnline()
const mk = useMarketing()

/** Quem está em mais de um grupo vê de que grupo é cada envio. */
const groupNames = computed(() => new Map(mk.groups.value.map((g) => [g.id, g.name])))
function groupOf(item: UploadItem): string | null {
  return mk.groups.value.length > 1 ? (groupNames.value.get(item.groupId) ?? null) : null
}

const items = computed(() => queue.items.value)
const drafts = computed(() => scheduledDrafts.value)

// A bandeja remonta quando a pessoa sai e volta para a ala: o que ainda está
// na fila aparece de novo, aberto no computador se houver envio pendente.
const hidden = ref(items.value.length === 0 && drafts.value.length === 0)
const open = ref(!isPhone.value && queue.hasPending())
const recentClosed = computed(() => closedVersions.filter((v) => Date.now() - v.at < 10 * 60 * 1000))

const counted = computed(() => items.value.filter((i) => i.status !== 'canceled' && i.status !== 'skipped'))
const doneCount = computed(() => counted.value.filter((i) => i.status === 'done').length)
const errorCount = computed(() => counted.value.filter((i) => i.status === 'error').length)
const pendingCount = computed(() => queue.pending.value.length)
const askingCount = computed(() => items.value.filter((i) => !!i.prompt).length)

const percent = computed(() => {
  const list = counted.value
  const total = list.reduce((s, i) => s + i.size, 0)
  if (!total) return 0
  const sent = list.reduce((s, i) => s + (i.status === 'done' ? i.size : i.sent), 0)
  return Math.min(100, Math.floor((sent / total) * 100))
})

const summary = computed(() => {
  const t = queue.totals.value
  if (askingCount.value && askingCount.value === pendingCount.value) {
    return askingCount.value === 1 ? '1 arquivo esperando a sua resposta' : `${askingCount.value} arquivos esperando a sua resposta`
  }
  if (pendingCount.value) {
    if (!online.value) return 'Sem internet. Continua quando a rede voltar.'
    const parts = [`${doneCount.value} de ${counted.value.length} enviados`, `${percent.value}%`]
    const eta = formatEta(t.etaSec)
    if (eta) parts.push(`falta ${eta}`)
    if (errorCount.value) parts.push(`${errorCount.value} com erro`)
    if (askingCount.value) parts.push(`${askingCount.value} esperando resposta`)
    return parts.join(' · ')
  }
  if (errorCount.value) {
    return errorCount.value === 1 ? '1 arquivo com erro' : `${errorCount.value} arquivos com erro`
  }
  if (drafts.value.some((d) => d.state === 'creating')) return 'Fechando a versão'
  if (doneCount.value) return doneCount.value === 1 ? '1 arquivo enviado' : `${doneCount.value} arquivos enviados`
  if (recentClosed.value.length) return recentClosed.value[0]!.text
  return 'Nada enviando'
})

const tone = computed(() => {
  if (pendingCount.value && !online.value) return 'offline'
  if (errorCount.value || askingCount.value || drafts.value.some((d) => d.state === 'failed')) return 'error'
  if (pendingCount.value || drafts.value.some((d) => d.state === 'creating')) return 'busy'
  return 'done'
})

// Abre sozinha quando entra arquivo novo (no celular só aparece a faixa).
let lastCount = items.value.length
watch(
  () => items.value.length,
  (n) => {
    if (n > lastCount) {
      hidden.value = false
      if (!isPhone.value) open.value = true
    }
    lastCount = n
  },
)
watch(
  () => drafts.value.length,
  (n) => {
    if (n) hidden.value = false
  },
)
// Pergunta nova (repetido no Acervo): a bandeja aparece aberta para a resposta.
watch(askingCount, (n, old) => {
  if (n > (old ?? 0)) {
    hidden.value = false
    open.value = true
    announce('Um arquivo repetido espera a sua resposta na bandeja de envios.')
  }
})

/** "Fazer o mesmo para os outros deste envio", por pergunta aberta. */
const applyAll = ref(new Set<string>())
function toggleApplyAll(id: string) {
  const next = new Set(applyAll.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  applyAll.value = next
}
function answer(item: UploadItem, choice: string) {
  const all = applyAll.value.has(item.id)
  queue.answer(item.id, choice, { all })
  if (all) applyAll.value = new Set()
}

/*
 * Leitor de tela: a região escondida fala só o começo, cada arquivo pronto, o
 * erro, a pergunta e o fim. O resumo visível muda a cada progresso e, com
 * `aria-live`, falaria sem parar.
 */
const announcement = ref('')
let announceTimer: ReturnType<typeof setTimeout> | undefined
function announce(text: string) {
  clearTimeout(announceTimer)
  // limpa antes: a mesma frase duas vezes seguidas também é lida
  announcement.value = ''
  announceTimer = setTimeout(() => (announcement.value = text), 60)
}
let wasBusy = queue.hasPending()
const unsubscribe = queue.subscribe(({ type, item }) => {
  if (type === 'queued' && !wasBusy) {
    wasBusy = true
    const n = queue.pending.value.length
    announce(n === 1 ? `Enviando ${item.name}.` : `Enviando ${n} arquivos.`)
    return
  }
  if (type === 'done') announce(`${item.name} enviado.`)
  else if (type === 'error') announce(`${item.name}: ${item.error ?? 'não deu para enviar.'}`)
  const settledNow = type === 'done' || type === 'error' || type === 'canceled' || type === 'skipped'
  if (settledNow && wasBusy && !queue.hasPending()) {
    wasBusy = false
    const done = items.value.filter((i) => i.status === 'done').length
    const errors = items.value.filter((i) => i.status === 'error').length
    const tail = errors ? `, ${errors} com erro` : ''
    setTimeout(() => announce(`Envios terminados: ${done} ${done === 1 ? 'enviado' : 'enviados'}${tail}.`), 700)
  }
})

// Tudo pronto e sem erro: recolhe depois de 4 s (a barra fica com o resumo).
let collapseTimer: ReturnType<typeof setTimeout> | undefined
watch(tone, (t) => {
  clearTimeout(collapseTimer)
  if (t === 'done') collapseTimer = setTimeout(() => (open.value = false), 4000)
  if (t === 'error') {
    hidden.value = false
    if (!isPhone.value) open.value = true
  }
})

const canClose = computed(() => !pendingCount.value && !drafts.value.some((d) => d.state === 'creating' || d.scheduled))

function close() {
  if (!canClose.value) return
  queue.clearFinished()
  closedVersions.splice(0)
  for (const d of drafts.value) dropDraftNotice(d)
  open.value = false
  hidden.value = true
}

const visible = computed(
  () => !hidden.value && (items.value.length > 0 || drafts.value.length > 0 || recentClosed.value.length > 0),
)

/*
 * Barra fixa embaixo (a de ações do card no celular, por exemplo): a bandeja
 * sobe para ficar acima dela, em vez de cobrir o botão. Mede o que está por
 * baixo da borda inferior da bandeja; overlay de tela cheia (diálogo,
 * visualizador) não conta. Confere de novo na troca de rota e a cada 1,5 s
 * enquanto aparece (barra que surge depois).
 */
const root = ref<HTMLElement | null>(null)
const lift = ref(0)
const route = useRoute()

function fixedAncestor(node: Element | null): HTMLElement | null {
  for (let n = node as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === 'fixed') return n
  }
  return null
}

function measureLift() {
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const bottom = r.bottom + lift.value
  let extra = 0
  for (const x of [r.left + 12, r.left + r.width / 2, r.right - 12]) {
    for (const node of document.elementsFromPoint(x, bottom - 2)) {
      if (el.contains(node)) continue
      const fixed = fixedAncestor(node)
      if (!fixed) continue
      const fr = fixed.getBoundingClientRect()
      const isBar = fr.height < 160 && fr.width >= r.width * 0.5 && fr.top < bottom && fr.bottom >= bottom - 4
      if (isBar) extra = Math.max(extra, Math.ceil(bottom - fr.top + 8))
      break
    }
  }
  if (extra !== lift.value) lift.value = extra
}

let liftTimer: ReturnType<typeof setInterval> | undefined
watch(
  () => [visible.value, route.fullPath, isPhone.value, open.value] as const,
  ([v]) => {
    clearInterval(liftTimer)
    if (!v) return
    // mede a partir da posição de base (sem zerar antes: zerar fazia a bandeja piscar)
    void nextTick(measureLift)
    liftTimer = setInterval(measureLift, 1500)
  },
)
onMounted(() => {
  if (visible.value) {
    void nextTick(measureLift)
    liftTimer = setInterval(measureLift, 1500)
  }
})
/*
 * Reserva o espaço da bandeja no fim da página (`--mkt-tray-space`, lido pelo
 * `MarketingLayout` e pelo painel de detalhes do Acervo): a última fileira e o
 * "Carregar mais" rolam para cima dela em vez de ficar por baixo. Com a
 * bandeja fora, a reserva some.
 */
let spaceObserver: ResizeObserver | null = null
function setSpace() {
  const el = root.value
  if (!el || !visible.value) {
    document.documentElement.style.removeProperty('--mkt-tray-space')
    return
  }
  const r = el.getBoundingClientRect()
  const space = Math.max(0, Math.ceil(window.innerHeight - r.top + 8))
  document.documentElement.style.setProperty('--mkt-tray-space', `${space}px`)
}
watch(
  () => [visible.value, open.value, lift.value, isPhone.value] as const,
  () => void nextTick(setSpace),
)
watch(root, (el, old) => {
  if (old) spaceObserver?.unobserve(old)
  if (el) spaceObserver?.observe(el)
  void nextTick(setSpace)
})
onMounted(() => {
  spaceObserver = new ResizeObserver(() => setSpace())
  if (root.value) spaceObserver.observe(root.value)
  window.addEventListener('resize', setSpace)
  void nextTick(setSpace)
})

onBeforeUnmount(() => {
  clearInterval(liftTimer)
  clearTimeout(announceTimer)
  unsubscribe()
  spaceObserver?.disconnect()
  window.removeEventListener('resize', setSpace)
  document.documentElement.style.removeProperty('--mkt-tray-space')
  // Saiu da ala: ninguém mais vê a pergunta. O repetido que esperava resposta
  // é pulado, para a fila não ficar presa (o resto continua subindo).
  queue.answerPending('skip')
})

function iconFor(item: UploadItem) {
  return item.mimeType.startsWith('video/') ? Film : FileText
}

function draftText(d: VersionDraft) {
  const p = draftProgress(d)
  if (d.state === 'creating') return `Fechando a versão de "${d.cardTitle}"`
  if (d.state === 'failed') return `"${d.cardTitle}": ${d.error ?? 'a versão não foi fechada.'}`
  if (d.error) return `"${d.cardTitle}": ${d.error}`
  return `A versão de "${d.cardTitle}" fecha quando ${p.waiting === 1 ? 'o último arquivo subir' : `os ${p.waiting} arquivos subirem`}`
}

function canCancel(item: UploadItem) {
  return item.status === 'queued' || item.status === 'hashing' || item.status === 'uploading' || item.status === 'confirming'
}

function canRetry(item: UploadItem) {
  return item.status === 'error' || item.status === 'canceled'
}
</script>

<template>
  <section
    v-if="visible"
    ref="root"
    class="mkt"
    :class="[`is-${tone}`, { 'is-open': open, 'is-phone': isPhone }]"
    :style="lift ? { '--mkt-lift': `${lift}px` } : undefined"
    aria-label="Envios"
    data-testid="upload-tray"
  >
    <div class="mkt__sr" aria-live="polite" aria-atomic="true" data-testid="upload-announce">{{ announcement }}</div>
    <header class="mkt__head">
      <button
        type="button"
        class="mkt__toggle"
        :aria-expanded="open"
        aria-controls="mkt-list"
        :aria-label="open ? 'Recolher envios' : 'Abrir envios'"
        @click="open = !open"
      >
        <span class="mkt__icon" aria-hidden="true">
          <WifiOff v-if="tone === 'offline'" :size="15" />
          <CircleAlert v-else-if="tone === 'error'" :size="15" />
          <CloudUpload v-else-if="tone === 'busy'" :size="15" />
          <CircleCheck v-else :size="15" />
        </span>
        <span class="mkt__title">Envios</span>
        <span class="mkt__sum" data-testid="upload-summary">{{ summary }}</span>
        <ChevronDown v-if="open" :size="15" class="mkt__chev" aria-hidden="true" />
        <ChevronUp v-else :size="15" class="mkt__chev" aria-hidden="true" />
      </button>
      <button
        v-if="canClose"
        type="button"
        class="mkt__x"
        aria-label="Fechar a bandeja de envios"
        title="Fechar (limpa os enviados)"
        @click="close"
      >
        <X :size="14" />
      </button>
      <span v-if="tone === 'busy' || tone === 'offline'" class="mkt__line" aria-hidden="true">
        <span :style="{ width: `${percent}%` }" />
      </span>
    </header>

    <div v-show="open" id="mkt-list" class="mkt__list" role="list">
      <div
        v-for="d in drafts"
        :key="d.key"
        class="mkt__draft"
        role="listitem"
        :data-draft="d.state"
      >
        <span class="mkt__draft-text">{{ draftText(d) }}</span>
        <span class="mkt__draft-acts">
          <button v-if="d.state === 'failed'" type="button" class="mkt__link" @click="retryVersion(d)">Tentar de novo</button>
          <button v-else-if="d.state === 'waiting'" type="button" class="mkt__link" @click="unscheduleVersion(d)">Não fechar</button>
        </span>
      </div>
      <div v-for="v in recentClosed" :key="v.id" class="mkt__draft is-closed" role="listitem">
        <CircleCheck :size="13" aria-hidden="true" />
        <span class="mkt__draft-text">{{ v.text }}</span>
      </div>

      <div
        v-for="item in items"
        :key="item.id"
        class="mkt__row"
        role="listitem"
        :data-status="item.status"
        :data-name="item.name"
      >
        <span class="mkt__thumb" aria-hidden="true">
          <img v-if="item.thumbUrl" :src="item.thumbUrl" alt="" />
          <component :is="iconFor(item)" v-else :size="15" />
        </span>
        <span class="mkt__main">
          <span class="mkt__name" :title="item.relativePath ?? item.name">{{ item.name }}</span>
          <span class="mkt__meta">
            <span class="mkt__size">{{ formatBytes(item.size) }}</span>
            <span class="mkt__dot" aria-hidden="true">·</span>
            <span class="mkt__target" :title="item.target.label">{{ item.target.label }}</span>
            <template v-if="groupOf(item)">
              <span class="mkt__dot" aria-hidden="true">·</span>
              <span class="mkt__group" :title="`Grupo ${groupOf(item)}`" data-testid="upload-group">{{ groupOf(item) }}</span>
            </template>
          </span>
          <span class="mkt__state" :class="{ 'is-error': item.status === 'error', 'is-asking': !!item.prompt }">
            {{ itemStatusText(item) }}
          </span>
          <span
            v-if="item.status === 'hashing' || item.status === 'uploading' || item.status === 'confirming'"
            class="mkt__bar"
            role="progressbar"
            :aria-valuenow="itemPercent(item)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`Enviando ${item.name}`"
          >
            <span :style="{ width: `${itemPercent(item)}%` }" />
          </span>
          <span v-if="item.prompt" class="mkt__ask" data-prompt>
            <span class="mkt__choices">
              <button
                v-for="c in item.prompt.choices"
                :key="c.value"
                type="button"
                class="mk-btn"
                :class="{ 'mk-btn--primary': c.primary }"
                :data-choice="c.value"
                @click="answer(item, c.value)"
              >
                {{ c.label }}
              </button>
            </span>
            <span v-if="item.prompt.batchLabel && queue.batchHasOthers(item)" class="mkt__all">
              <LibraryCheck
                :checked="applyAll.has(item.id)"
                :label="item.prompt.batchLabel"
                data-testid="upload-apply-all"
                @toggle="toggleApplyAll(item.id)"
              />
              <span aria-hidden="true" @click="toggleApplyAll(item.id)">{{ item.prompt.batchLabel }}</span>
            </span>
          </span>
        </span>
        <span class="mkt__acts">
          <button
            v-if="canRetry(item)"
            type="button"
            class="mk-icon-btn"
            :aria-label="`Tentar de novo ${item.name}`"
            title="Tentar de novo"
            data-action="retry"
            :disabled="item.running"
            @click="queue.retry(item.id)"
          >
            <RotateCw :size="14" />
          </button>
          <button
            v-if="canCancel(item)"
            type="button"
            class="mk-icon-btn"
            :aria-label="`Cancelar o envio de ${item.name}`"
            title="Cancelar"
            data-action="cancel"
            @click="queue.cancel(item.id)"
          >
            <X :size="14" />
          </button>
          <button
            v-else
            type="button"
            class="mk-icon-btn mkt__dismiss"
            :aria-label="`Tirar ${item.name} da lista`"
            title="Tirar da lista"
            data-action="dismiss"
            @click="queue.dismiss(item.id)"
          >
            <X :size="13" />
          </button>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/*
 * Canto inferior direito, À ESQUERDA do lançador do assistente (o mascote em
 * `right: 22px; bottom: 22px`, 52 px, components/assistant/AssistantLauncher):
 * por cima dele a bandeja cobria o botão de cancelar. Mesma base do mascote.
 * z-index 90: acima das barras fixas da ala (40) e abaixo dos recados do Nevo
 * (`.nevo-stack`, 95), dos diálogos e do assistente.
 */
.mkt {
  position: fixed;
  right: 86px;
  bottom: calc(22px + var(--shell-bottom-inset, 0px) + var(--mkt-lift, 0px));
  z-index: 90;
  display: flex;
  flex-direction: column;
  width: 380px;
  max-width: calc(100vw - 32px);
  /* cinco linhas e o cabeçalho; o resto rola (cobre menos o painel lateral) */
  max-height: min(48vh, 440px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  font-size: 12.5px;
  overflow: hidden;
}

/* Só para leitor de tela (a região que anuncia começo, pronto, erro e fim). */
.mkt__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Celular: não tem o mascote (o assistente abre pela folha "Mais"), a faixa usa a largura toda. */
.mkt.is-phone {
  left: 8px;
  right: 8px;
  bottom: calc(8px + var(--shell-bottom-inset, env(safe-area-inset-bottom, 0px)) + var(--mkt-lift, 0px));
  width: auto;
  max-width: none;
  max-height: 62vh;
}

.mkt__head {
  position: relative;
  display: flex;
  align-items: center;
  flex: none;
  border-bottom: 1px solid transparent;
}

.mkt.is-open .mkt__head {
  border-bottom-color: var(--border);
}

.mkt__toggle {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 6px 0 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.mkt.is-phone .mkt__toggle {
  min-height: 44px;
}

.mkt__toggle:focus-visible,
.mkt__x:focus-visible,
.mkt__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mkt__icon {
  display: grid;
  place-items: center;
  color: var(--accent);
}

.mkt.is-error .mkt__icon {
  color: var(--err);
}

.mkt.is-done .mkt__icon {
  color: var(--success);
}

.mkt.is-offline .mkt__icon {
  color: var(--text-3);
}

.mkt__title {
  font-weight: 700;
}

.mkt__sum {
  flex: 1;
  min-width: 0;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkt__chev {
  flex: none;
  color: var(--text-3);
}

.mkt__x {
  display: grid;
  place-items: center;
  width: 36px;
  height: 40px;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.mkt__x:hover {
  color: var(--text);
}

.mkt__line {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--surface-3);
}

.mkt__line span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-fast) linear;
}

.mkt__list {
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mkt__draft {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
}

.mkt__draft[data-draft='failed'] {
  color: var(--err);
}

.mkt__draft.is-closed {
  color: var(--success);
}

.mkt__draft-text {
  flex: 1;
  min-width: 0;
}

.mkt__link {
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.mkt__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 6px 7px 12px;
}

.mkt__row + .mkt__row {
  border-top: 1px solid var(--border);
}

.mkt__thumb {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-top: 1px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
}

.mkt__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mkt__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mkt__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkt__meta {
  display: flex;
  gap: 4px;
  min-width: 0;
  color: var(--text-3);
  font-size: 11.5px;
}

.mkt__size {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.mkt__target {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkt__state {
  color: var(--text-2);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.mkt__row[data-status='done'] .mkt__state {
  color: var(--success);
}

.mkt__row[data-status='canceled'] .mkt__state {
  color: var(--text-3);
}

.mkt__state.is-error {
  color: var(--err);
}

.mkt__bar {
  display: block;
  height: 3px;
  margin-top: 2px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.mkt__bar span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width var(--motion-fast) linear;
}

.mkt__row[data-status='hashing'] .mkt__bar span {
  background: color-mix(in srgb, var(--accent) 55%, var(--surface-3));
}

.mkt__ask {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.mkt__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mkt__all {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: -6px;
  color: var(--text-2);
  font-size: 11.5px;
  cursor: pointer;
}

.mkt__state.is-asking {
  color: var(--text);
  font-weight: 600;
}

.mkt__group {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  color: var(--text-2);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mkt__acts {
  flex: none;
  display: flex;
  gap: 2px;
}

.mkt__dismiss {
  color: var(--text-3);
}

/* Toque: todo alvo da bandeja com 44 px no celular. */
.mkt.is-phone .mkt__acts :deep(.mk-icon-btn) {
  min-width: 44px;
  min-height: 44px;
}

.mkt.is-phone .mkt__x {
  width: 44px;
  height: 44px;
}

.mkt.is-phone .mkt__link {
  min-height: 44px;
  padding: 0 10px;
}

.mkt.is-phone .mkt__choices :deep(.mk-btn) {
  min-height: 44px;
}
</style>
