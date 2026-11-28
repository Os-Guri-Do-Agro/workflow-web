<script setup lang="ts">
/**
 * "Criar" inline do board (spec board-tarefas-redesign, D5), no lugar do botão
 * do rodapé da coluna (ou numa célula do "Agrupar: Pessoa"). Como no Jira:
 *
 * - Enter cria e o campo CONTINUA aberto, vazio, para a próxima;
 * - Shift+Enter quebra a linha enquanto se escreve (o título é uma linha só no
 *   banco, como no painel: a quebra vira espaço ao gravar);
 * - Esc cancela; sair do campo vazio também fecha. Com texto, sair NÃO fecha
 *   nem cria: o que foi digitado não se perde por um clique fora.
 *
 * Quem cria de verdade (card otimista, POST, rollback) é quem escuta o
 * `submit`; aqui só se escreve.
 */
import { nextTick, onMounted, ref, useId, watch } from 'vue'

const props = defineProps<{
  /** Nome da coluna (e da pessoa, agrupado), para o rótulo acessível. */
  label: string
  /**
   * Título devolvido quando a criação falhou. Volta para o campo só se ele
   * estiver vazio: não atropela o que a pessoa já começou a escrever.
   */
  restore?: { title: string; nonce: number } | null
}>()

const emit = defineEmits<{
  submit: [title: string]
  cancel: [reason: 'escape' | 'blur']
}>()

const root = ref<HTMLElement | null>(null)
const field = ref<HTMLTextAreaElement | null>(null)
const value = ref('')
const hintId = useId()

function autosize() {
  const el = field.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

async function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.isComposing) return
  event.preventDefault()
  const title = value.value.replace(/\s*[\r\n]+\s*/g, ' ').trim()
  if (!title) return
  emit('submit', title)
  value.value = ''
  await nextTick()
  autosize()
  // O card novo entrou logo acima: o campo (e a dica) continua à vista.
  root.value?.scrollIntoView({ block: 'nearest' })
}

function onEscape(event: KeyboardEvent) {
  // Não sobe: aqui o Esc é "desistir de criar", não "tirar o foco" do board.
  event.stopPropagation()
  event.preventDefault()
  emit('cancel', 'escape')
}

function onBlur() {
  if (!value.value.trim()) emit('cancel', 'blur')
}

watch(
  () => props.restore?.nonce,
  () => {
    if (!props.restore || value.value.trim()) return
    value.value = props.restore.title
    void nextTick(autosize)
  },
)

function focusField() {
  field.value?.focus({ preventScroll: true })
  autosize()
  root.value?.scrollIntoView({ block: 'nearest' })
}

onMounted(() => {
  focusField()
  // Vindo de outra vista (C na Lista), o board ainda está com `display: none`
  // quando o campo monta: o `v-show` do pai só volta no fim do ciclo, e o
  // foco acima se perde. Depois do ciclo, tenta de novo.
  void nextTick(() => {
    if (document.activeElement !== field.value) focusField()
  })
})

defineExpose({ focus: () => field.value?.focus() })
</script>

<template>
  <div ref="root" class="quick no-drag">
    <textarea
      ref="field"
      v-model="value"
      class="quick__field"
      rows="2"
      placeholder="O que precisa ser feito?"
      enterkeyhint="done"
      :aria-label="`Título da nova tarefa em ${label}`"
      :aria-describedby="hintId"
      @keydown.enter="onEnter"
      @keydown.esc="onEscape"
      @input="autosize"
      @blur="onBlur"
    />
    <p :id="hintId" class="quick__hint">Enter cria, Esc cancela</p>
  </div>
</template>

<style scoped>
.quick {
  display: grid;
  gap: 4px;
  /* Ao rolar até o campo, sobra o mesmo respiro do fundo da coluna. */
  scroll-margin-bottom: 6px;
}

.quick__field {
  display: block;
  width: 100%;
  min-height: 56px;
  max-height: 160px;
  resize: none;
  padding: 8px 10px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  outline: none;
  box-shadow: var(--shadow-raised);
}

.quick__field::placeholder {
  color: var(--text-3);
  font-weight: 400;
}

.quick__hint {
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}
</style>
