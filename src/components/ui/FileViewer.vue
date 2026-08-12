<script setup lang="ts">
/**
 * Visualizador de arquivo em tela cheia — primitivo do design system,
 * promovido do `AttachmentViewer` das tarefas (spec drive-p1).
 *
 * `Teleport to="body"` não é preferência: o conteúdo de rota renderiza dentro
 * do `main` do shell, que cria contexto de empilhamento próprio, então nenhum
 * `z-index` de dentro passa por cima do chrome. Teleportar é o que faz o viewer
 * funcionar igual nas três variantes de shell sem a feature conhecê-las.
 *
 * Dois modos de obter a URL:
 * - `item.url` presente (anexos de tarefa: URL pública persistida) — usa direto.
 * - `resolveUrl` fornecido (Drive: bucket privado) — pede uma URL assinada
 *   FRESCA ao navegar para o item; expirar com o viewer aberto vira um retry,
 *   nunca um preview quebrado silencioso.
 *
 * Imagem, PDF e markdown renderizam; o resto cai no cartão de download. PDF que
 * o navegador recusa embutir também cai, pelo fallback NATIVO do `<object>`.
 *
 * Markdown tem leitura aqui porque `.md` virou anexo possível na tarefa: sem
 * isso, quem escolhe "anexo" recebe um link opaco, que é exatamente o que a
 * regra antiga (recusar `.md` no anexo) queria evitar. O texto é baixado da URL
 * de exibição e passa por `renderMarkdown`, único caminho de render do app.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LoaderCircle,
  X,
} from 'lucide-vue-next'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.css'
import {
  formatBytes,
  iconOf,
  isImage,
  kindOf,
  labelOf,
  type AttachmentKind,
} from '@/utils/file-kind'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
// Prosa do markdown. Follow-up: promover este CSS junto com o viewer (hoje ele
// ainda mora em `features/tasks/styles/`, de quando o leitor era só da tarefa).
import '@/styles/markdown-doc.css'

export interface ViewerFile {
  filename: string
  mimeType?: string | null
  size?: number | null
  /** URL pronta (bucket público). Ausente = usar `resolveUrl`. */
  url?: string | null
  uploadedBy?: { name: string } | null
}

/** URL de exibição e, opcionalmente, uma variante que força download. */
export interface ResolvedFileUrl {
  url: string
  downloadUrl?: string
}

const props = defineProps<{
  items: ViewerFile[]
  /** Índice inicial. Trocar reabre no arquivo escolhido. */
  startIndex: number
  /** Bucket privado: devolve URL assinada fresca para o item. */
  resolveUrl?: (item: ViewerFile) => Promise<ResolvedFileUrl>
}>()

const emit = defineEmits<{ close: [] }>()

const index = ref(props.startIndex)
const dialogRef = ref<HTMLElement | null>(null)
/** Quem tinha o foco antes de abrir, para devolver ao fechar. */
const opener = ref<HTMLElement | null>(null)

const current = computed<ViewerFile | undefined>(() => props.items[index.value])
const kind = computed(() => (current.value ? kindOf(current.value) : 'other'))
const counter = computed(() => `${index.value + 1} de ${props.items.length}`)

// ─── URL do item atual ────────────────────────────────────────────────────────

const resolved = ref<ResolvedFileUrl | null>(null)
const resolving = ref(false)
const resolveError = ref(false)

const displayUrl = computed(() => current.value?.url ?? resolved.value?.url ?? null)
const downloadUrl = computed(
  () => resolved.value?.downloadUrl ?? displayUrl.value,
)

async function loadUrl(): Promise<void> {
  resolved.value = null
  resolveError.value = false
  const item = current.value
  if (!item || item.url || !props.resolveUrl) return
  resolving.value = true
  try {
    const value = await props.resolveUrl(item)
    // Navegação mudou o item enquanto resolvia: descarta a resposta velha.
    if (current.value === item) resolved.value = value
  } catch {
    if (current.value === item) resolveError.value = true
  } finally {
    if (current.value === item) resolving.value = false
  }
}

watch(current, () => void loadUrl(), { immediate: true })

// ─── Markdown: baixa o texto e renderiza ─────────────────────────────────────

const markdownHtml = ref('')
const markdownLoading = ref(false)
const markdownFailed = ref(false)
/** Ignora resposta de arquivo que já não é o da tela (troca rápida de seta). */
let markdownToken = 0

async function loadMarkdown(url: string): Promise<void> {
  const token = ++markdownToken
  markdownHtml.value = ''
  markdownFailed.value = false
  markdownLoading.value = true
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    const text = await response.text()
    if (token !== markdownToken) return
    markdownHtml.value = renderMarkdown(text)
  } catch {
    if (token !== markdownToken) return
    // Sem drama: o cartão de download continua ali como saída.
    markdownFailed.value = true
  } finally {
    if (token === markdownToken) markdownLoading.value = false
  }
}

// Depende da URL, não só do item: no Drive ela chega depois, assinada.
watch(
  [current, displayUrl],
  ([item, url]) => {
    if (item && url && kindOf(item) === 'markdown') {
      void loadMarkdown(url)
      return
    }
    markdownToken++
    markdownHtml.value = ''
    markdownLoading.value = false
    markdownFailed.value = false
  },
  { immediate: true },
)

// ─── Texto, código e JSON: lê e mostra formatado ─────────────────────────────

/**
 * Antes, tudo que não fosse imagem, PDF ou markdown caía no cartão de download.
 * Na prática isso significava que abrir um `.json`, um `.sql` ou um `.txt` do
 * Drive respondia "baixe para ver" — o visualizador não visualizava.
 *
 * Aqui o conteúdo é lido e exibido com realce (highlight.js, o mesmo do
 * navegador de repositórios). JSON ainda passa por um `JSON.parse` +
 * `stringify` indentado antes: arquivo de API vem numa linha só, e uma linha
 * de 40 mil caracteres não é leitura, é rolagem horizontal.
 */
const TEXT_KINDS = new Set<AttachmentKind>(['text', 'code', 'sheet'])
const TEXT_VIEW_MAX_BYTES = 2 * 1024 * 1024

const textHtml = ref('')
const textLoading = ref(false)
const textFailed = ref(false)
let textToken = 0

function isTextViewable(item: ViewerFile): boolean {
  if (!TEXT_KINDS.has(kindOf(item))) return false
  // Planilha de verdade (xlsx) é binária; só o CSV cai aqui como texto.
  if (kindOf(item) === 'sheet' && !/\.csv$/i.test(item.filename)) return false
  return (item.size ?? 0) <= TEXT_VIEW_MAX_BYTES
}

async function loadText(url: string, item: ViewerFile): Promise<void> {
  const token = ++textToken
  textHtml.value = ''
  textFailed.value = false
  textLoading.value = true
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(String(response.status))
    let raw = await response.text()
    if (token !== textToken) return

    const extension = item.filename.split('.').pop()?.toLowerCase() ?? ''
    if (extension === 'json') {
      try {
        raw = JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        // JSON inválido continua legível como texto puro.
      }
    }

    const language = hljs.getLanguage(extension) ? extension : ''
    textHtml.value = language
      ? hljs.highlight(raw, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(raw).value
  } catch {
    if (token !== textToken) return
    textFailed.value = true
  } finally {
    if (token === textToken) textLoading.value = false
  }
}

watch(
  [current, displayUrl],
  ([item, url]) => {
    if (item && url && isTextViewable(item)) {
      void loadText(url, item)
      return
    }
    textToken++
    textHtml.value = ''
    textLoading.value = false
    textFailed.value = false
  },
  { immediate: true },
)

watch(
  () => props.startIndex,
  (value) => {
    index.value = value
  },
)

function step(delta: number): void {
  if (props.items.length < 2) return
  // Circula: chegar no fim e apertar seta volta ao começo, sem beco sem saída.
  index.value = (index.value + delta + props.items.length) % props.items.length
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
    return
  }
  if (event.key !== 'Tab') return

  // Armadilha de foco: sem isso o Tab passeia pela página atrás do overlay.
  const focusables = dialogRef.value?.querySelectorAll<HTMLElement>(
    'button, [href], input, [tabindex]:not([tabindex="-1"])',
  )
  if (!focusables?.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  opener.value = document.activeElement as HTMLElement | null
  document.addEventListener('keydown', onKeydown)
  // Trava o scroll do fundo: rolar a página atrás de um overlay de tela cheia
  // é o tipo de coisa que faz o usuário achar que fechou sem ter fechado.
  document.body.style.overflow = 'hidden'
  void Promise.resolve().then(() => dialogRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  opener.value?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="viewer-root" role="presentation">
      <div class="viewer__scrim" @click="emit('close')" />

      <div
        ref="dialogRef"
        class="viewer"
        role="dialog"
        aria-modal="true"
        :aria-label="current ? `Visualizando ${current.filename}` : 'Visualizador'"
        tabindex="-1"
      >
        <header class="viewer__bar">
          <div class="viewer__id">
            <component :is="current ? iconOf(current) : undefined" :size="16" />
            <span class="viewer__name">{{ current?.filename }}</span>
            <span class="viewer__meta">
              {{ current ? labelOf(current) : '' }}
              <template v-if="current && formatBytes(current.size)">
                · {{ formatBytes(current.size) }}
              </template>
              <template v-if="current?.uploadedBy">
                · {{ current.uploadedBy.name }}
              </template>
            </span>
          </div>

          <div class="viewer__actions">
            <span v-if="items.length > 1" class="viewer__counter">{{ counter }}</span>
            <a
              v-if="displayUrl"
              class="viewer__btn"
              :href="displayUrl"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir em nova aba"
              title="Abrir em nova aba"
            >
              <ExternalLink :size="15" />
            </a>
            <a
              v-if="downloadUrl && current"
              class="viewer__btn"
              :href="downloadUrl"
              :download="current.filename"
              aria-label="Baixar arquivo"
              title="Baixar"
            >
              <Download :size="15" />
            </a>
            <button
              type="button"
              class="viewer__btn press"
              aria-label="Fechar visualizador"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </div>
        </header>

        <div class="viewer__stage">
          <button
            v-if="items.length > 1"
            type="button"
            class="viewer__nav viewer__nav--prev press"
            aria-label="Arquivo anterior"
            @click="step(-1)"
          >
            <ChevronLeft :size="20" />
          </button>

          <div v-if="resolving" class="viewer__fallback" aria-live="polite">
            <LoaderCircle :size="28" class="viewer__spinner" />
            <p class="viewer__fallback-hint">Preparando visualização segura…</p>
          </div>

          <div v-else-if="resolveError && current" class="viewer__fallback">
            <component :is="iconOf(current)" :size="34" />
            <p class="viewer__fallback-name">{{ current.filename }}</p>
            <p class="viewer__fallback-hint">
              Não foi possível preparar o arquivo agora.
            </p>
            <button type="button" class="viewer__download press" @click="loadUrl()">
              Tentar de novo
            </button>
          </div>

          <img
            v-else-if="current && displayUrl && isImage(current)"
            :src="displayUrl"
            :alt="current.filename"
            class="viewer__image"
          />

          <!--
            Vídeo e áudio tocam AQUI: mandar quem clicou num .mp4 baixar 40 MB
            para conferir se é o take certo é o mesmo que não ter visualizador.
            `key` no src força o elemento a recarregar ao trocar de item, senão
            o player mantém o buffer do arquivo anterior.
          -->
          <!--
            Sem `autoplay`: a política dos navegadores bloqueia mídia com som
            iniciada sem gesto do usuário, então o atributo só produzia um
            player parado fingindo que ia tocar. Quem abriu o arquivo dá o play.
          -->
          <video
            v-else-if="current && displayUrl && kind === 'video'"
            :key="displayUrl"
            class="viewer__media"
            :src="displayUrl"
            controls
            playsinline
          />

          <div
            v-else-if="current && displayUrl && kind === 'audio'"
            class="viewer__audio"
          >
            <component :is="iconOf(current)" :size="42" class="viewer__audio-icon" />
            <p class="viewer__audio-name">{{ current.filename }}</p>
            <audio :key="displayUrl" class="viewer__audio-player" :src="displayUrl" controls />
          </div>

          <object
            v-else-if="current && displayUrl && kind === 'pdf'"
            class="viewer__pdf"
            :data="displayUrl"
            type="application/pdf"
          >
            <!-- Fallback nativo do <object>: aparece quando o navegador recusa
                 embutir o PDF, sem depender do nosso prazo de 3s. -->
            <div class="viewer__fallback">
              <component :is="iconOf(current)" :size="34" />
              <p class="viewer__fallback-name">{{ current.filename }}</p>
              <p class="viewer__fallback-hint">
                Este arquivo não abre aqui dentro. Baixe para visualizar.
              </p>
              <a
                v-if="downloadUrl"
                class="viewer__download"
                :href="downloadUrl"
                :download="current.filename"
              >
                <Download :size="15" />
                Baixar
              </a>
            </div>
          </object>

          <div
            v-else-if="current && displayUrl && kind === 'markdown' && !markdownFailed"
            class="viewer__md"
          >
            <div v-if="markdownLoading" class="viewer__md-load">
              <LoaderCircle :size="16" class="viewer__spinner" />
              Carregando o texto…
            </div>
            <!--
              eslint-disable-next-line vue/no-v-html
              Passou por `renderMarkdown`, que é marked + DOMPurify. É o único
              caminho de render de markdown do app.
            -->
            <article v-else class="viewer__md-doc md-doc" v-html="markdownHtml" />
          </div>

          <div
            v-else-if="current && displayUrl && isTextViewable(current) && !textFailed"
            class="viewer__text"
          >
            <div v-if="textLoading" class="viewer__md-load">
              <LoaderCircle :size="16" class="viewer__spinner" />
              Carregando o conteúdo…
            </div>
            <!--
              eslint-disable-next-line vue/no-v-html
              O HTML vem do highlight.js, que ESCAPA o texto de entrada e só
              emite `<span class="hljs-*">` — não repassa marcação do arquivo.
            -->
            <pre v-else class="viewer__code"><code v-html="textHtml" /></pre>
          </div>

          <div v-else-if="current" class="viewer__fallback">
            <component :is="iconOf(current)" :size="34" />
            <p class="viewer__fallback-name">{{ current.filename }}</p>
            <p class="viewer__fallback-hint">
              {{ labelOf(current) }}
              <template v-if="formatBytes(current.size)">
                · {{ formatBytes(current.size) }}
              </template>
            </p>
            <a
              v-if="downloadUrl"
              class="viewer__download"
              :href="downloadUrl"
              :download="current.filename"
            >
              <Download :size="15" />
              Baixar
            </a>
          </div>

          <button
            v-if="items.length > 1"
            type="button"
            class="viewer__nav viewer__nav--next press"
            aria-label="Próximo arquivo"
            @click="step(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.viewer-root {
  position: fixed;
  inset: 0;
  /* Acima do painel de tarefa (2400), que é o overlay mais alto do app. */
  z-index: 2600;
}

.viewer__scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim, rgb(0 0 0 / 0.72));
  backdrop-filter: blur(4px);
}

.viewer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  outline: none;
}

.viewer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(14px);
}

.viewer__id {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text);
}

.viewer__name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer__meta {
  color: var(--text-3);
  font-size: 11.5px;
  white-space: nowrap;
}

.viewer__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.viewer__counter {
  color: var(--text-3);
  font-size: 11.5px;
  margin-right: 4px;
}

.viewer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
}

.viewer__btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.viewer__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.viewer__stage {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 0;
}

.viewer__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius);
}

.viewer__pdf {
  width: min(1000px, 100%);
  height: 100%;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
}

.viewer__media {
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--radius);
  background: #000;
}

/* Texto e código: coluna larga (código tem linhas longas), mas com teto. */
.viewer__text {
  width: min(1100px, 100%);
  height: 100%;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.viewer__code {
  margin: 0;
  padding: 18px 20px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.6;
  tab-size: 2;
}

/* O tema do hljs pinta o próprio fundo; aqui quem manda é o token do app. */
.viewer__code :deep(.hljs),
.viewer__code code {
  background: transparent;
  color: var(--text);
}

.viewer__audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 32px 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  min-width: min(420px, 100%);
}

.viewer__audio-icon {
  color: var(--text-3);
}

.viewer__audio-name {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  word-break: break-word;
}

.viewer__audio-player {
  width: 100%;
}

/* Markdown: coluna de leitura, não largura total — texto corrido em 1400px é
   ilegível, e a prosa (.md-doc) é a mesma do documento da tarefa. */
.viewer__md {
  width: min(820px, 100%);
  height: 100%;
  overflow-y: auto;
  padding: 26px 30px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.viewer__md-load {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--text-3);
  font-size: 12.5px;
}

.viewer__md-doc {
  color: var(--text);
}

.viewer__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-3);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.viewer__fallback-name {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
  word-break: break-all;
}

.viewer__fallback-hint {
  margin: 0;
  font-size: 12px;
}

.viewer__spinner {
  animation: viewer-spin 0.9s linear infinite;
}

@keyframes viewer-spin {
  to {
    transform: rotate(360deg);
  }
}

.viewer__download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.viewer__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text-2);
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.viewer__nav:hover {
  color: var(--text);
}

.viewer__nav:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.viewer__nav--prev {
  left: 12px;
}

.viewer__nav--next {
  right: 12px;
}
</style>
