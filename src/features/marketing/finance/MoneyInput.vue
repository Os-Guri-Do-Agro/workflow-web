<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseMoneyToCents } from '../marketing-labels'
import { centsPlain } from './finance-format'

/**
 * Campo de dinheiro: a pessoa digita "1234,5" ou "1.234,50" e o v-model é
 * CENTAVOS inteiros (null vazio). Ao sair do campo o texto vira "1.234,50".
 */
const props = withDefaults(
  defineProps<{
    modelValue: number | null
    label?: string
    placeholder?: string
    disabled?: boolean
    id?: string
    /** Sem o prefixo R$ (célula da tabela de orçamento) */
    bare?: boolean
  }>(),
  { label: 'Valor', placeholder: '0,00', disabled: false, id: undefined, bare: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  enter: []
  escape: []
  blur: []
}>()

const input = ref<HTMLInputElement | null>(null)
const text = ref(props.modelValue === null ? '' : centsPlain(props.modelValue))
let editing = false

watch(
  () => props.modelValue,
  (value) => {
    if (editing) return
    text.value = value === null ? '' : centsPlain(value)
  },
)

function parsed(): number | null {
  const cents = parseMoneyToCents(text.value)
  return cents === null || cents < 0 ? null : cents
}

function onInput(event: Event) {
  editing = true
  text.value = (event.target as HTMLInputElement).value
  emit('update:modelValue', parsed())
}

/**
 * Enter grava antes do blur: manda de novo o valor lido do texto ATUAL antes
 * do `enter`, para quem grava (e o Enter que sobe até a linha de lançamento
 * rápido) nunca usar um valor de uma tecla atrás.
 */
function onEnter() {
  if (input.value) text.value = input.value.value
  emit('update:modelValue', parsed())
  emit('enter')
}

function onBlur() {
  editing = false
  text.value = props.modelValue === null ? '' : centsPlain(props.modelValue)
  emit('blur')
}

defineExpose({
  focus: () => input.value?.focus(),
  select: () => input.value?.select(),
})
</script>

<template>
  <span class="money" :class="{ 'money--bare': bare }">
    <span v-if="!bare" class="money__prefix" aria-hidden="true">R$</span>
    <input
      :id="id"
      ref="input"
      class="mk-input money__input mk-num"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :aria-label="label"
      :placeholder="placeholder"
      :disabled="disabled"
      :value="text"
      @input="onInput"
      @blur="onBlur"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="emit('escape')"
    />
  </span>
</template>

<style scoped>
.money {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.money__prefix {
  position: absolute;
  left: 9px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}

.money__input {
  padding-left: 30px;
  text-align: right;
}

.money--bare .money__input {
  padding-left: 8px;
}
</style>
