<script setup lang="ts">
/**
 * Revisão do Admin: Aprovar (comentário opcional) ou Pedir ajuste (comentário
 * obrigatório e as linhas do checklist). No pedido de ajuste as linhas já vêm
 * com os comentários com ponto ainda abertos da versão; sem linha nenhuma, o
 * servidor faz de cada linha do comentário um item.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Loader2, Plus, Trash2, Undo2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { getApiErrorMessage } from '@/service/api'
import { approveCard, requestChanges, type MarketingCardDetail } from '@/service/marketing/marketing-cards'

const props = defineProps<{
  modelValue: boolean
  mode: 'approve' | 'changes'
  groupId: string
  cardId: string
  versionNumber: number
  /** Linhas iniciais do checklist (comentários com ponto abertos da versão). */
  prefill?: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  done: [card: MarketingCardDetail]
}>()

const body = ref('')
const lines = ref<string[]>([])
const saving = ref(false)
const error = ref('')
const bodyRef = ref<HTMLTextAreaElement | null>(null)

const isChanges = computed(() => props.mode === 'changes')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    body.value = ''
    error.value = ''
    lines.value = isChanges.value ? [...(props.prefill ?? [])] : []
  },
)

// O aviso de comentário obrigatório some assim que a pessoa começa a escrever.
watch(body, (text) => {
  if (text.trim() && error.value) error.value = ''
})

function addLine() {
  lines.value = [...lines.value, '']
  void nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('.mkrv__line input')
    inputs[inputs.length - 1]?.focus()
  })
}

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function submit() {
  const text = body.value.trim()
  if (isChanges.value && !text) {
    error.value = 'Pedir ajuste exige um comentário: escreva o que precisa mudar.'
    bodyRef.value?.focus()
    return
  }
  saving.value = true
  error.value = ''
  try {
    const items = lines.value.map((l) => l.trim()).filter(Boolean)
    const card = isChanges.value
      ? await requestChanges(props.groupId, props.cardId, text, items.length ? items : undefined)
      : await approveCard(props.groupId, props.cardId, text || null)
    emit('done', card)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, isChanges.value ? 'Não deu para pedir o ajuste.' : 'Não deu para aprovar.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="isChanges ? 'Pedir ajuste' : `Aprovar a V${versionNumber}`"
    :size="isChanges ? 'md' : 'sm'"
    :loading="saving"
    persistent
    @update:model-value="close"
  >
    <form class="mkrv" @submit.prevent="submit">
      <header class="mkrv__head">
        <span class="mkrv__icon" :class="isChanges ? 'is-changes' : 'is-approve'" aria-hidden="true">
          <Undo2 v-if="isChanges" :size="16" />
          <Check v-else :size="16" />
        </span>
        <h2 class="mkrv__title">{{ isChanges ? `Pedir ajuste na V${versionNumber}` : `Aprovar a V${versionNumber}` }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close"><X :size="16" /></button>
      </header>

      <div class="mkrv__body">
        <label class="mk-field">
          <span class="mk-label">{{ isChanges ? 'O que precisa mudar' : 'Comentário (opcional)' }}</span>
          <textarea
            ref="bodyRef"
            v-model="body"
            class="mk-textarea"
            :rows="isChanges ? 4 : 2"
            name="body"
            maxlength="5000"
            :placeholder="isChanges ? 'Uma linha por ajuste, se quiser' : 'Ex.: pode publicar'"
            autofocus
          />
        </label>

        <div v-if="isChanges" class="mk-field">
          <span class="mk-label">Itens do checklist</span>
          <ul v-if="lines.length" class="mkrv__lines">
            <li v-for="(_, i) in lines" :key="i" class="mkrv__line">
              <input v-model="lines[i]" class="mk-input" maxlength="500" :aria-label="`Item ${i + 1}`" />
              <button type="button" class="mk-icon-btn" :aria-label="`Tirar o item ${i + 1}`" @click="lines.splice(i, 1)">
                <Trash2 :size="14" />
              </button>
            </li>
          </ul>
          <span v-else class="mk-hint">Sem itens, cada linha do comentário vira um item do checklist.</span>
          <button type="button" class="mk-btn mk-btn--ghost mkrv__add" @click="addLine">
            <Plus :size="14" aria-hidden="true" /> Incluir item
          </button>
        </div>

        <p v-if="error" class="mk-error" role="alert" data-testid="review-error">{{ error }}</p>
      </div>

      <footer class="mkrv__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
        <button
          type="submit"
          class="mk-btn"
          :class="isChanges ? 'mk-btn--danger mkrv__danger' : 'mk-btn--success'"
          :disabled="saving"
          :data-action="isChanges ? 'confirm-changes' : 'confirm-approve'"
        >
          <Loader2 v-if="saving" :size="14" class="mkrv__spin" aria-hidden="true" />
          {{ isChanges ? 'Pedir ajuste' : `Aprovar a V${versionNumber}` }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.mkrv {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mkrv__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
}

.mkrv__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
}

.mkrv__icon.is-approve {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

.mkrv__icon.is-changes {
  background: color-mix(in srgb, var(--due-late) 14%, transparent);
  color: var(--due-late);
}

.mkrv__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.mkrv__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
  overflow-y: auto;
}

.mkrv__lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mkrv__line {
  display: flex;
  gap: 4px;
}

.mkrv__add {
  align-self: flex-start;
}

.mkrv__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.mkrv__danger {
  border-color: color-mix(in srgb, var(--err) 50%, var(--border));
}

.mkrv__spin {
  animation: mkrv-spin 0.8s linear infinite;
}

@keyframes mkrv-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
