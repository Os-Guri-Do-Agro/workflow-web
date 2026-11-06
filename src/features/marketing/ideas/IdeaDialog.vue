<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { IdeaInput, IdeaKind, MarketingIdea } from '@/service/marketing/marketing-ideas'
import { CARD_NETWORK_LABEL } from '../marketing-labels'
import { IDEA_KIND_HINT, IDEA_KIND_LABEL } from './idea-labels'

/**
 * Criar, editar ou ler uma ideia. `readonly` é para quem pode ver e não editar
 * (Visualizador, ou Editor numa ideia de outra pessoa): os campos ficam
 * desabilitados e o rodapé só fecha.
 */
const props = defineProps<{
  modelValue: boolean
  idea: MarketingIdea | null
  brands: MarketingBrand[]
  /** Marca sugerida ao criar (a do filtro do layout) */
  defaultBrandId?: string | null
  saving?: boolean
  readonly?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [input: IdeaInput]
}>()

const kind = ref<IdeaKind>('IDEA')
const title = ref('')
const description = ref('')
const referenceUrl = ref('')
const network = ref('')
const companyId = ref('')
const tags = ref<string[]>([])
const tagDraft = ref('')
const submitted = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    submitted.value = false
    tagDraft.value = ''
    const idea = props.idea
    kind.value = idea?.kind ?? 'IDEA'
    title.value = idea?.title ?? ''
    description.value = idea?.description ?? ''
    referenceUrl.value = idea?.referenceUrl ?? ''
    network.value = idea?.network ?? ''
    companyId.value = idea ? (idea.companyId ?? '') : (props.defaultBrandId ?? '')
    tags.value = [...(idea?.tags ?? [])]
  },
  { immediate: true },
)

const titleError = computed(() => (submitted.value && !title.value.trim() ? 'Dê um título para a ideia.' : ''))
const heading = computed(() => {
  if (props.readonly) return props.idea ? props.idea.title : 'Ideia'
  return props.idea ? 'Editar ideia' : 'Nova ideia'
})

function addTag() {
  const text = tagDraft.value.trim().replace(/^#+/, '').toLowerCase()
  tagDraft.value = ''
  if (text && !tags.value.includes(text) && tags.value.length < 12) tags.value.push(text)
}

function onTagKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addTag()
  } else if (event.key === 'Backspace' && !tagDraft.value && tags.value.length) {
    tags.value.pop()
  }
}

function submit() {
  submitted.value = true
  addTag()
  if (!title.value.trim() || props.saving) return
  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || null,
    referenceUrl: referenceUrl.value.trim() || null,
    network: network.value || null,
    kind: kind.value,
    tags: tags.value,
    companyId: companyId.value || null,
  })
}

const kinds: IdeaKind[] = ['IDEA', 'TREND', 'REFERENCE']
const networks = Object.entries(CARD_NETWORK_LABEL)
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="heading"
    size="md"
    :loading="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="idd" novalidate @submit.prevent="submit">
      <header class="idd__head">
        <h2>{{ heading }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </header>

      <div class="idd__body">
        <div class="mk-field">
          <span class="mk-label" id="idd-kind">Tipo</span>
          <div class="idd__kinds" role="radiogroup" aria-labelledby="idd-kind">
            <button
              v-for="k in kinds"
              :key="k"
              type="button"
              role="radio"
              class="idd__kind"
              :class="{ 'is-on': kind === k }"
              :aria-checked="kind === k"
              :disabled="readonly"
              @click="kind = k"
            >
              {{ IDEA_KIND_LABEL[k] }}
            </button>
          </div>
          <span class="mk-hint">{{ IDEA_KIND_HINT[kind] }}</span>
        </div>

        <label class="mk-field">
          <span class="mk-label">Título</span>
          <input
            v-model="title"
            class="mk-input"
            maxlength="300"
            autocomplete="off"
            autofocus
            :disabled="readonly"
            :aria-invalid="!!titleError"
            placeholder="Ex.: Reel de pet fantasiado no Halloween"
          />
          <span v-if="titleError" class="mk-error" role="alert">{{ titleError }}</span>
        </label>

        <label class="mk-field">
          <span class="mk-label">Descrição</span>
          <textarea
            v-model="description"
            class="mk-textarea"
            rows="3"
            maxlength="10000"
            :disabled="readonly"
            placeholder="O que chamou atenção, como adaptar para a marca"
          />
        </label>

        <label class="mk-field">
          <span class="mk-label">Link de referência</span>
          <input
            v-model="referenceUrl"
            class="mk-input"
            inputmode="url"
            autocomplete="off"
            :disabled="readonly"
            placeholder="https://www.tiktok.com/..."
          />
        </label>

        <div class="idd__row">
          <label class="mk-field">
            <span class="mk-label">Rede</span>
            <select v-model="network" class="mk-select" :disabled="readonly">
              <option value="">Qualquer</option>
              <option v-for="[value, label] in networks" :key="value" :value="value">{{ label }}</option>
            </select>
          </label>
          <label class="mk-field">
            <span class="mk-label">Marca</span>
            <select v-model="companyId" class="mk-select" :disabled="readonly">
              <option value="">Todas as marcas</option>
              <option v-for="b in brands" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
            </select>
          </label>
        </div>

        <div class="mk-field">
          <span class="mk-label">Tags</span>
          <div class="idd__tags" :class="{ 'is-disabled': readonly }">
            <span v-for="t in tags" :key="t" class="idd__tag">
              #{{ t }}
              <button v-if="!readonly" type="button" :aria-label="`Remover a tag ${t}`" @click="tags = tags.filter((x) => x !== t)">
                <X :size="12" />
              </button>
            </span>
            <input
              v-if="!readonly"
              v-model="tagDraft"
              class="idd__tag-input"
              maxlength="30"
              autocomplete="off"
              placeholder="Digite e tecle Enter"
              aria-label="Nova tag"
              @keydown="onTagKey"
              @blur="addTag"
            />
          </div>
        </div>
      </div>

      <footer class="idd__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="emit('update:modelValue', false)">
          {{ readonly ? 'Fechar' : 'Cancelar' }}
        </button>
        <button v-if="!readonly" type="submit" class="mk-btn mk-btn--primary" :disabled="saving">
          <Loader2 v-if="saving" :size="14" class="idd__spin" />
          {{ idea ? 'Salvar' : 'Guardar ideia' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.idd {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 40px);
}

.idd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
}

.idd__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.idd__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
  overflow-y: auto;
}

.idd__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.idd__kinds {
  display: inline-flex;
  align-self: flex-start;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.idd__kind {
  padding: 5px 12px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.idd__kind.is-on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.idd__kind:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.idd__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 34px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.idd__tags:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.idd__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}

.idd__tag button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.idd__tag-input {
  flex: 1;
  min-width: 120px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.idd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.idd__spin {
  animation: idd-spin 0.8s linear infinite;
}

@keyframes idd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .idd__row {
    grid-template-columns: 1fr;
  }

  .idd__kind {
    min-height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .idd__spin {
    animation: none;
  }
}
</style>
