<script setup lang="ts">
/**
 * Campo de tags no modelo do Azure Boards: chips dentro da caixa, texto livre,
 * Enter cria a que não existe.
 *
 * **Por que não reka Combobox:** o `ActivitySelect` documenta duas armadilhas da
 * v2 (o `search-term` sumiu do root e o `display-value` escreve o valor cru no
 * campo). As duas mordem mais forte no modo múltiplo, onde o valor é um array e
 * o campo precisa continuar servindo de entrada de texto com chips ao lado. Um
 * combobox de verdade aqui é ~40 linhas de ARIA que a gente controla, contra
 * lutar com o comportamento interno de um componente feito para escolher um
 * item. A acessibilidade está declarada à mão: `role="combobox"`,
 * `aria-expanded`, `aria-activedescendant` e `role="listbox"`/`option`.
 *
 * Criar tag é idempotente na API (nome normalizado), então "Bug" e "bug " nunca
 * viram duas. A checagem local de slug existe só para o rótulo do item de
 * criação não mentir.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Loader2, Plus, Tag as TagIcon } from 'lucide-vue-next'
import TagChip from './TagChip.vue'
import { useTags } from '@/composables/useTags'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { normalizeTagSlug } from '@/utils/slug'
import type { ActivityTag } from '@/features/tasks/activity-types'

const props = withDefaults(
  defineProps<{
    modelValue: ActivityTag[]
    companyId: string | null | undefined
    disabled?: boolean
    placeholder?: string
    /** Sem moldura: para usar embutido num painel que já tem a sua. */
    bare?: boolean
  }>(),
  { disabled: false, placeholder: 'Adicionar tag...', bare: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: ActivityTag[]] }>()

const companyIdRef = computed(() => props.companyId)
const { tags: catalog, isFetching, term, createTag } = useTags(companyIdRef)
const { error: showError } = useToast()

const open = ref(false)
const creating = ref(false)
const highlighted = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const listboxId = `tag-listbox-${Math.random().toString(36).slice(2, 9)}`

const selectedIds = computed(() => new Set(props.modelValue.map((t) => t.id)))
const trimmed = computed(() => term.value.trim())
const typedSlug = computed(() => normalizeTagSlug(term.value))

/** O catálogo sem o que já está na tarefa: reoferecer o que já foi escolhido é ruído. */
const suggestions = computed(() =>
  catalog.value.filter((tag) => !selectedIds.value.has(tag.id)),
)

/**
 * Só oferece criar quando o texto não casa com nenhuma tag conhecida, nem com
 * uma já escolhida. Sem a segunda checagem, digitar o nome de uma tag que já
 * está na tarefa ofereceria "Criar" para algo que a API devolveria de volta.
 */
const canCreate = computed(() => {
  if (!typedSlug.value) return false
  const known =
    catalog.value.some((t) => t.slug === typedSlug.value) ||
    props.modelValue.some((t) => t.slug === typedSlug.value)
  return !known
})

const optionCount = computed(() => suggestions.value.length + (canCreate.value ? 1 : 0))

watch([suggestions, canCreate], () => {
  highlighted.value = 0
})

function openList(): void {
  if (props.disabled) return
  open.value = true
}

function closeList(): void {
  open.value = false
  term.value = ''
}

function attach(tag: ActivityTag): void {
  if (selectedIds.value.has(tag.id)) return
  emit('update:modelValue', [...props.modelValue, tag])
  term.value = ''
  highlighted.value = 0
  // Mantém o foco no campo: quem está marcando tags costuma marcar mais de uma.
  void nextTick(() => inputRef.value?.focus())
}

function detach(tagId: string): void {
  // Desvincular, não excluir: a tag continua no catálogo da empresa.
  emit(
    'update:modelValue',
    props.modelValue.filter((t) => t.id !== tagId),
  )
}

async function createAndAttach(): Promise<void> {
  const name = trimmed.value
  if (!name || creating.value) return
  creating.value = true
  try {
    const tag = await createTag(name)
    attach(tag)
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível criar a tag'))
  } finally {
    creating.value = false
  }
}

function chooseHighlighted(): void {
  const index = highlighted.value
  if (canCreate.value && index === suggestions.value.length) {
    void createAndAttach()
    return
  }
  const tag = suggestions.value[index]
  if (tag) attach(tag)
  // Nada destacado e nada a criar: Enter num campo vazio não faz nada.
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openList()
    if (optionCount.value) highlighted.value = (highlighted.value + 1) % optionCount.value
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (optionCount.value) {
      highlighted.value = (highlighted.value - 1 + optionCount.value) % optionCount.value
    }
    return
  }
  if (event.key === 'Enter') {
    // Impede o Enter de submeter o formulário que envolve o campo.
    event.preventDefault()
    if (!open.value) openList()
    chooseHighlighted()
    return
  }
  if (event.key === 'Escape') {
    if (open.value) {
      event.stopPropagation()
      closeList()
    }
    return
  }
  if (event.key === 'Backspace' && !term.value) {
    // Backspace no campo vazio tira o último chip, como em todo campo de tags.
    const last = props.modelValue[props.modelValue.length - 1]
    if (last) detach(last.id)
  }
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  // Clique num item da lista tira o foco do input; fechar aí engoliria a escolha.
  if (next && rootRef.value?.contains(next)) return
  closeList()
}
</script>

<template>
  <div
    ref="rootRef"
    class="taginput"
    :class="{ 'taginput--bare': bare, 'taginput--disabled': disabled }"
    @focusout="onFocusOut"
  >
    <div class="taginput__box" @click="inputRef?.focus()">
      <TagChip
        v-for="tag in modelValue"
        :key="tag.id"
        :tag="tag"
        :removable="!disabled"
        @remove="detach(tag.id)"
      />

      <input
        ref="inputRef"
        v-model="term"
        type="text"
        class="taginput__field"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="listboxId"
        aria-autocomplete="list"
        :aria-activedescendant="
          open && optionCount ? `${listboxId}-opt-${highlighted}` : undefined
        "
        :placeholder="modelValue.length ? '' : placeholder"
        :disabled="disabled"
        @focus="openList"
        @input="openList"
        @keydown="onKeydown"
      />
    </div>

    <div v-if="open" :id="listboxId" class="taginput__list" role="listbox">
      <div v-if="isFetching && !catalog.length" class="taginput__state">
        <Loader2 :size="14" class="spin" />
        <span>Carregando tags...</span>
      </div>

      <button
        v-for="(tag, index) in suggestions"
        :id="`${listboxId}-opt-${index}`"
        :key="tag.id"
        type="button"
        role="option"
        :aria-selected="highlighted === index"
        class="taginput__opt"
        :class="{ 'taginput__opt--on': highlighted === index }"
        @mouseenter="highlighted = index"
        @click="attach(tag)"
      >
        <TagChip :tag="tag" />
        <span class="taginput__usage">
          {{ tag.usageCount === 1 ? '1 tarefa' : `${tag.usageCount} tarefas` }}
        </span>
      </button>

      <button
        v-if="canCreate"
        :id="`${listboxId}-opt-${suggestions.length}`"
        type="button"
        role="option"
        :aria-selected="highlighted === suggestions.length"
        class="taginput__opt taginput__opt--create"
        :class="{ 'taginput__opt--on': highlighted === suggestions.length }"
        :disabled="creating"
        @mouseenter="highlighted = suggestions.length"
        @click="createAndAttach"
      >
        <Loader2 v-if="creating" :size="14" class="spin" />
        <Plus v-else :size="14" />
        <span>Criar tag "{{ trimmed }}"</span>
      </button>

      <div
        v-if="!suggestions.length && !canCreate && !isFetching"
        class="taginput__state"
      >
        <TagIcon :size="14" />
        <span>{{
          term ? 'Nenhuma tag encontrada' : 'Digite para criar a primeira tag'
        }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.taginput {
  position: relative;
  width: 100%;
}

.taginput__box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: text;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.taginput--bare .taginput__box {
  background: transparent;
  border-color: transparent;
  padding: 2px 0;
}

.taginput__box:focus-within {
  border-color: var(--accent);
}

.taginput--disabled .taginput__box {
  opacity: 0.6;
  cursor: not-allowed;
}

.taginput__field {
  flex: 1 1 90px;
  min-width: 90px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.4;
}

.taginput__field::placeholder {
  color: var(--text-4);
}

.taginput__list {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-overlay);
}

.taginput__opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.taginput__opt--on {
  background: var(--surface-3);
}

.taginput__opt--create {
  justify-content: flex-start;
  color: var(--accent);
  font-weight: 600;
}

.taginput__opt:disabled {
  opacity: 0.6;
  cursor: progress;
}

.taginput__usage {
  color: var(--text-4);
  font-size: 11px;
  white-space: nowrap;
}

.taginput__state {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  color: var(--text-3);
  font-size: 12px;
}

.spin {
  animation: taginput-spin 0.9s linear infinite;
}

@keyframes taginput-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
  .taginput__box {
    transition: none;
  }
}
</style>
