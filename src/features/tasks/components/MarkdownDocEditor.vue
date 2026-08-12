<script setup lang="ts">
/**
 * Editor de documento markdown: textarea monoespaçada + preview.
 *
 * **Por que não TipTap**, tendo TipTap no projeto: o valor deste campo é ser
 * markdown FIEL. O fluxo é escrever a spec aqui e levar o texto cru ao agente.
 * TipTap converteria para HTML e a volta para markdown seria lossy: tabela,
 * front-matter, HTML embutido e indentação de bloco de código não sobrevivem ao
 * round-trip. Textarea preserva byte a byte, que é exatamente o requisito.
 *
 * O preview usa `renderMarkdown`, que sanitiza com DOMPurify. Markdown aceita
 * HTML cru embutido, e o conteúdo é escrito por qualquer WORKER da empresa:
 * sem a sanitização isto seria XSS armazenado.
 */
import { computed, ref } from 'vue'
import { Columns2, Eye, PencilLine } from 'lucide-vue-next'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import SaveStatus from '@/components/ui/SaveStatus.vue'
import type { SaveState } from '@/components/ui/save-state'
import '@/styles/markdown-doc.css'

const props = withDefaults(
  defineProps<{
    modelValue: string
    state: SaveState
    savedAt?: number | null
    errorMessage?: string
    readonly?: boolean
    /** Teto do servidor, para o contador avisar antes de o salvamento falhar. */
    maxLength?: number
  }>(),
  { savedAt: null, errorMessage: '', readonly: false, maxLength: 512_000 },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  blur: []
  retry: []
}>()

type Mode = 'edit' | 'split' | 'preview'
const MODE_KEY = 'tasks.docs.mode'
const mode = ref<Mode>((localStorage.getItem(MODE_KEY) as Mode | null) ?? 'split')

function setMode(next: Mode): void {
  mode.value = next
  localStorage.setItem(MODE_KEY, next)
}

// ─── Rolagem casada entre os dois painéis ────────────────────────────────────
//
// No modo dividido, rolar o markdown e ver o preview parado quebra a única
// razão de existir do modo: comparar fonte e resultado na mesma altura. A
// sincronia é proporcional (fração do percurso), não linha a linha: mapear
// linha de origem para nó renderizado exigiria source map do marked, e o ganho
// não paga a complexidade num documento que já é lido de cima para baixo.

const inputRef = ref<HTMLTextAreaElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
/** Trava de um quadro: sem ela, A rola B, que rola A, e a rolagem "gruda". */
let syncing = false

function syncScroll(origem: 'input' | 'preview'): void {
  if (syncing || mode.value !== 'split') return
  const de = origem === 'input' ? inputRef.value : previewRef.value
  const para = origem === 'input' ? previewRef.value : inputRef.value
  if (!de || !para) return

  const percursoDe = de.scrollHeight - de.clientHeight
  const percursoPara = para.scrollHeight - para.clientHeight
  if (percursoDe <= 0 || percursoPara <= 0) return

  syncing = true
  para.scrollTop = (de.scrollTop / percursoDe) * percursoPara
  requestAnimationFrame(() => {
    syncing = false
  })
}

const html = computed(() => renderMarkdown(props.modelValue))
const charCount = computed(() => props.modelValue.length)
/** Avisa a partir de 80% do teto, antes de o servidor recusar. */
const nearLimit = computed(() => charCount.value > props.maxLength * 0.8)

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

/**
 * Tab dentro do editor indenta, não pula de campo. Num editor de markdown a
 * indentação é sintaxe (lista aninhada, bloco de código), e perder o campo a
 * cada Tab tornaria o editor inutilizável para o que ele existe.
 * Escape devolve a navegação por teclado para quem precisa sair sem mouse.
 */
const escaped = ref(false)

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    escaped.value = true
    return
  }
  if (event.key !== 'Tab' || escaped.value) {
    escaped.value = false
    return
  }
  event.preventDefault()
  const el = event.target as HTMLTextAreaElement
  const { selectionStart, selectionEnd, value } = el
  const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
  emit('update:modelValue', next)
  void Promise.resolve().then(() => {
    el.selectionStart = el.selectionEnd = selectionStart + 2
  })
}
</script>

<template>
  <div class="mde" :class="`mde--${mode}`">
    <header class="mde__bar">
      <div class="mde__modes" role="group" aria-label="Modo do editor">
        <button
          type="button"
          class="mde__mode"
          :class="{ 'mde__mode--on': mode === 'edit' }"
          :aria-pressed="mode === 'edit'"
          title="Só edição"
          @click="setMode('edit')"
        >
          <PencilLine :size="13" />
        </button>
        <button
          type="button"
          class="mde__mode"
          :class="{ 'mde__mode--on': mode === 'split' }"
          :aria-pressed="mode === 'split'"
          title="Edição e leitura"
          @click="setMode('split')"
        >
          <Columns2 :size="13" />
        </button>
        <button
          type="button"
          class="mde__mode"
          :class="{ 'mde__mode--on': mode === 'preview' }"
          :aria-pressed="mode === 'preview'"
          title="Só leitura"
          @click="setMode('preview')"
        >
          <Eye :size="13" />
        </button>
      </div>

      <div class="mde__status">
        <span class="mde__count" :class="{ 'mde__count--warn': nearLimit }">
          {{ charCount.toLocaleString('pt-BR') }}
          <template v-if="nearLimit">
            / {{ maxLength.toLocaleString('pt-BR') }}
          </template>
          caracteres
        </span>
        <SaveStatus
          v-if="!readonly"
          :state="state"
          :saved-at="savedAt"
          :message="errorMessage"
          compact
          @retry="emit('retry')"
        />
      </div>
    </header>

    <div class="mde__panes">
      <textarea
        v-if="mode !== 'preview' && !readonly"
        ref="inputRef"
        class="mde__input"
        :value="modelValue"
        spellcheck="false"
        aria-label="Conteúdo do documento em markdown"
        placeholder="# Título&#10;&#10;Escreva em markdown. O que estiver aqui é o que vai para o agente."
        @input="onInput"
        @keydown="onKeydown"
        @scroll="syncScroll('input')"
        @focus="emit('focus')"
        @blur="emit('blur')"
      />

      <!--
        eslint-disable-next-line vue/no-v-html
        Passou por `renderMarkdown`, que é marked + DOMPurify. É o único caminho
        de render de markdown do app; nunca chamar `marked.parse` direto aqui.
      -->
      <div
        v-if="mode !== 'edit' || readonly"
        ref="previewRef"
        class="mde__preview md-doc"
        v-html="html"
        @scroll="syncScroll('preview')"
      />
    </div>
  </div>
</template>

<style scoped>
.mde {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* Altura própria, e não "cresce com o documento": sem um teto, o painel do
     markdown rolava por dentro e o preview esticava até o fim, então os dois
     nunca ficavam na mesma altura e a rolagem casada não tinha o que casar.
     Com o teto, cada painel tem a sua barra e o par anda junto. */
  height: clamp(340px, 62vh, 820px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
  /* O que decide se cabem dois painéis lado a lado é a largura DESTE editor,
     não a da janela: ele vive tanto na página cheia quanto no painel lateral
     do board. Container query responde a pergunta certa. */
  container-type: inline-size;
}

.mde__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.mde__modes {
  display: inline-flex;
  gap: 2px;
}

.mde__mode {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.mde__mode--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.mde__mode:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mde__status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mde__count {
  color: var(--text-4);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.mde__count--warn {
  color: var(--warn);
}

.mde__panes {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  flex: 1;
  min-height: 0;
}

.mde--split .mde__panes {
  grid-template-columns: 1fr 1fr;
}

.mde__input {
  width: 100%;
  min-height: 0;
  padding: 14px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  tab-size: 2;
}

.mde__input::placeholder {
  color: var(--text-4);
}

.mde--split .mde__input {
  border-right: 1px solid var(--border);
}

.mde__preview {
  padding: 14px 16px;
  overflow-y: auto;
  min-height: 0;
  /* Cap de leitura que só age quando o painel é grande: no modo dividido cada
     lado fica abaixo disto e nada muda; no modo só-preview, que ocupa a
     largura toda da página, o texto vira uma coluna centrada em vez de linhas
     de ponta a ponta. */
  width: 100%;
  max-width: 94ch;
  margin-inline: auto;
}

/* Dois painéis lado a lado num editor estreito deixam os dois inúteis: com
   ~380px cada, o markdown cru quebra toda linha e o bloco de código vira
   escada. O corte é 840px porque abaixo disso cada painel ficaria com menos de
   ~420px, que é o piso de conforto para ~60 caracteres na mono de 12,5px.
   Empilhado, cada painel usa a largura inteira do editor. */
@container (max-width: 840px) {
  .mde--split .mde__panes {
    grid-template-columns: 1fr;
    /* Empilhado, os dois dividem a altura em partes iguais e cada um rola por
       dentro: linha `auto` deixaria um esticar e o outro encolher. */
    grid-template-rows: 1fr 1fr;
  }
  .mde--split .mde__preview {
    border-top: 1px solid var(--border);
    max-width: none;
  }
  .mde--split .mde__input {
    border-right: none;
  }
}
</style>
