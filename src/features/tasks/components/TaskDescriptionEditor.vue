<script setup lang="ts">
/**
 * Campo de descrição da atividade: uma superfície só, com formatação inline.
 *
 * Substitui o `<textarea>` que existia antes. O contrato com quem consome é
 * DELIBERADAMENTE o mesmo do `InlineEditText`, para que o painel de detalhe
 * possa trocar um pelo outro sem mexer no fechamento:
 *
 * - prop `modelValue` + evento `save`
 * - `defineExpose({ flush, reset, dirty })`
 *
 * ## As três regras que fazem o autosave ser confiável
 *
 * 1. **Digitar agenda, sair grava.** Debounce de 800ms (o mesmo do
 *    `InlineEditText`), e o blur grava na hora sem esperar.
 * 2. **O editor nunca reage à própria resposta.** Sem essa guarda o autosave
 *    entra em laço: `onUpdate` grava, a resposta entra no cache, o watcher
 *    reescreve o conteúdo, o `setContent` dispara `onUpdate` de novo. O watcher
 *    só aplica quando o campo está sem foco, sem rascunho pendente, e o HTML de
 *    fora é realmente diferente do que está na tela.
 * 3. **Falha de rede não descarta texto.** Quem grava é o `useActivityDetail`,
 *    que faz rollback do cache quando o servidor recusa. Esse rollback devolve o
 *    valor ANTIGO pelo `modelValue`, e sem a guarda de `state` ele sobrescrevia o
 *    que a pessoa acabou de digitar: o texto sumia da tela justamente na hora em
 *    que a rede falhou, que é o pior momento possível. Enquanto o estado é
 *    `saving` ou `error`, nada de fora entra.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import { useTaskDescriptionEditor } from '../composables/useTaskDescriptionEditor'
import TaskDescriptionBubbleMenu from './TaskDescriptionBubbleMenu.vue'
import { normalizeHtml, plainTextLength, toEditorHtml } from '../description-html'
import type { SaveState } from '@/components/ui/save-state'
import '../styles/task-content.css'

const props = withDefaults(
  defineProps<{
    /** Valor do servidor. Pode ser HTML novo ou texto plano legado. */
    modelValue: string
    /** Rótulo acessível do campo. */
    fieldLabel: string
    placeholder?: string
    debounceMs?: number
    disabled?: boolean
    /**
     * Estado da gravação deste campo, vindo de `useActivityDetail`.
     *
     * Não é decoração: enquanto é `saving` ou `error`, o watcher ignora o que
     * chega de fora. É o que impede o rollback de um save recusado de apagar o
     * texto que a pessoa acabou de digitar.
     */
    state?: SaveState
    /** Esconde o contador (usado no formulário de criação, que é mais compacto). */
    hideCount?: boolean
    minHeight?: string
    /**
     * `inline` (padrão): fundo transparente que só aparece no hover. É o certo no
     * painel de detalhe, onde a descrição é conteúdo e não formulário.
     *
     * `field`: caixa visível igual aos outros campos. É o certo num formulário,
     * onde um campo sem caixa no meio de campos com caixa parece desalinhado.
     */
    variant?: 'inline' | 'field'
  }>(),
  {
    placeholder: 'Descreva o trabalho, critérios de aceitação, links...',
    debounceMs: 800,
    disabled: false,
    hideCount: false,
    minHeight: '96px',
    variant: 'inline',
    state: 'idle',
  },
)

const emit = defineEmits<{ save: [value: string] }>()

/** HTML aplicado no editor por último, para o watcher não reescrever à toa. */
const applied = ref(toEditorHtml(props.modelValue))
const dirty = ref(false)
const focused = ref(false)
const bubble = ref<InstanceType<typeof TaskDescriptionBubbleMenu> | null>(null)
let timer: number | null = null

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

const { editor } = useTaskDescriptionEditor({
  placeholder: props.placeholder,
  editable: !props.disabled,
  onUpdate: (html) => {
    applied.value = html
    dirty.value = true
    clearTimer()
    timer = window.setTimeout(flush, props.debounceMs)
  },
  onBlur: () => {
    focused.value = false
    flush()
  },
})

/** Grava agora o que estiver pendente. Sem rascunho sujo, é no-op. */
function flush() {
  clearTimer()
  if (!dirty.value || props.disabled) return
  dirty.value = false
  const value = normalizeHtml(editor.value?.getHTML() ?? '')
  // O `<p></p>` que o ProseMirror emite para documento vazio já virou '' aqui.
  // Sem essa comparação, abrir e fechar sem editar geraria um PATCH inútil.
  if (value === normalizeHtml(toEditorHtml(props.modelValue))) return
  emit('save', value)
}

/** Descarta o rascunho e volta ao valor do servidor. */
function reset() {
  clearTimer()
  dirty.value = false
  const html = toEditorHtml(props.modelValue)
  applied.value = html
  editor.value?.commands.setContent(html, { emitUpdate: false })
}

const characterCount = computed(() => plainTextLength(applied.value))

// Conteúdo inicial: o `useEditor` monta com content vazio e o valor pode chegar
// depois (a query do painel resolve async).
watch(
  () => [editor.value, props.modelValue] as const,
  ([instance, value]) => {
    if (!instance) return
    // Guarda anti-laço (regra 2). Enquanto a pessoa está no campo, ou tem
    // rascunho não gravado, o que veio de fora espera: perder o que está sendo
    // digitado é o pior defeito possível num autosave.
    if (focused.value || dirty.value) return
    // Guarda anti-rollback (regra 3). Gravação no ar ou recusada: o valor que
    // chega é o estado ANTIGO restaurado pelo rollback, não novidade do servidor.
    // Aceitá-lo apagaria da tela exatamente o texto que falhou ao salvar.
    if (props.state === 'saving' || props.state === 'error') return
    const incoming = toEditorHtml(value)
    if (normalizeHtml(incoming) === normalizeHtml(instance.getHTML())) return
    applied.value = incoming
    instance.commands.setContent(incoming, { emitUpdate: false })
  },
  { immediate: true },
)

watch(
  () => props.disabled,
  (value) => editor.value?.setEditable(!value),
)

function onFocusIn() {
  focused.value = true
}

/**
 * `Ctrl+K` abre o modo link do menu flutuante. Fica aqui e não numa extensão de
 * atalho do TipTap porque quem tem a referência do menu é este componente.
 */
function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    void bubble.value?.openLink()
  }
}

// Rede de segurança: desmontar com rascunho pendente ainda grava. É o que cobre
// fechar o painel por caminho que não passou pelo `flush()` explícito.
onBeforeUnmount(() => {
  flush()
  clearTimer()
})

defineExpose({ flush, reset, dirty })
</script>

<template>
  <div
    class="task-desc"
    :class="[`task-desc--${variant}`, { 'task-desc--disabled': disabled }]"
    :style="{ '--task-desc-min-h': minHeight }"
  >
    <TaskDescriptionBubbleMenu v-if="!disabled" ref="bubble" :editor="editor" />

    <EditorContent
      class="task-prose task-desc__field"
      :editor="editor"
      :aria-label="fieldLabel"
      role="textbox"
      aria-multiline="true"
      @focusin="onFocusIn"
      @keydown="onKeydown"
    />

    <p v-if="!hideCount && !disabled" class="task-desc__count" aria-hidden="true">
      {{ characterCount }} {{ characterCount === 1 ? 'caractere' : 'caracteres' }}
    </p>
  </div>
</template>

<style scoped>
.task-desc {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-desc__field {
  padding: 8px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.task-desc__field :deep(.ProseMirror) {
  min-height: var(--task-desc-min-h);
}

/* Affordance: campo editável sem pista de que é editável parece quebrado. */
.task-desc--inline:not(.task-desc--disabled) .task-desc__field:hover {
  background: var(--surface-2);
  border-color: var(--border);
}

/* Variante de formulário: caixa desde o começo, igual aos campos vizinhos. */
.task-desc--field .task-desc__field {
  background: var(--surface-2);
  border-color: var(--border);
}

.task-desc--field:not(.task-desc--disabled) .task-desc__field:hover {
  border-color: var(--border-strong);
}

.task-desc--field .task-desc__field:focus-within {
  background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.task-desc__field:focus-within {
  background: var(--surface-2);
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.task-desc--disabled .task-desc__field {
  cursor: default;
}

.task-desc__count {
  margin: 0;
  padding-right: 2px;
  color: var(--text-4);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.task-desc:hover .task-desc__count,
.task-desc:focus-within .task-desc__count {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .task-desc__field,
  .task-desc__count {
    transition-duration: 1ms;
  }
}
</style>
