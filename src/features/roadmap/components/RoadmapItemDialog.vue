<script setup lang="ts">
/**
 * Criar e editar o que mora no roadmap: item da agenda (com tipo, Teste
 * incluso) ou marco/review (com a janela de teste opcional). Um formulário só,
 * para a pessoa não ter que lembrar onde cada coisa se cria.
 *
 * Ao editar, o tipo do registro não troca (item não vira marco): são tabelas
 * diferentes na API, e trocar seria excluir e criar sem a pessoa saber.
 */
import { computed, ref, watch } from 'vue'
import { CalendarCheck, Flag, Loader2, Trash2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { RoadmapCategory, RoadmapEntry } from '@/service/roadmap/roadmap-monthly-service'
import type { RoadmapMilestoneDto, RoadmapMilestoneType } from '@/service/roadmap/roadmap-milestones-service'
import { ROADMAP_CATEGORIES, addDays, formatDayMonth, formatRange, testWindow } from '../roadmap-meta'
import type { EntryInput, MilestoneInput } from '../composables/useRoadmap'

export type ItemDialogTarget =
  | { kind: 'new'; date: string; tab: 'entry' | 'milestone'; category?: RoadmapCategory }
  | { kind: 'entry'; entry: RoadmapEntry; monthKey: string }
  | { kind: 'milestone'; milestone: RoadmapMilestoneDto }

const props = defineProps<{
  modelValue: boolean
  target: ItemDialogTarget | null
  canEdit: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save-entry': [input: EntryInput, done: (ok: boolean) => void]
  'save-milestone': [input: MilestoneInput, done: (ok: boolean) => void]
  remove: [done: (ok: boolean) => void]
}>()

const tab = ref<'entry' | 'milestone'>('entry')
const title = ref('')
const date = ref('')
const description = ref('')
const category = ref<RoadmapCategory>('delivery')
const milestoneType = ref<RoadmapMilestoneType>('MILESTONE')
const hasTestWindow = ref(false)
const testStart = ref('')
const saving = ref(false)
const confirmRemove = ref(false)
const tried = ref(false)

const isNew = computed(() => props.target?.kind === 'new')
/**
 * "Marco" como tipo de item da agenda é legado: marco novo nasce na aba "Marco
 * ou review" (aparece no ano e pode ter janela de teste). Item antigo do tipo
 * Marco continua editável com o tipo dele.
 */
const categories = computed(() =>
  ROADMAP_CATEGORIES.filter(
    (c) => c.value !== 'milestone' || (props.target?.kind === 'entry' && props.target.entry.category === 'milestone'),
  ),
)
const readonly = computed(() => !props.canEdit)

watch(
  () => [props.modelValue, props.target] as const,
  ([open, target]) => {
    if (!open || !target) return
    saving.value = false
    confirmRemove.value = false
    tried.value = false
    if (target.kind === 'new') {
      tab.value = target.tab
      title.value = ''
      description.value = ''
      date.value = target.date
      category.value = target.category ?? 'delivery'
      milestoneType.value = 'MILESTONE'
      hasTestWindow.value = false
      testStart.value = addDays(target.date, -7)
    } else if (target.kind === 'entry') {
      tab.value = 'entry'
      title.value = target.entry.title
      description.value = target.entry.description ?? ''
      date.value = target.entry.date
      category.value = target.entry.category
    } else {
      tab.value = 'milestone'
      const m = target.milestone
      title.value = m.title
      description.value = m.description ?? ''
      date.value = m.date
      milestoneType.value = m.type
      hasTestWindow.value = Boolean(m.testStart)
      testStart.value = m.testStart ?? addDays(m.date, -7)
    }
  },
  { immediate: true },
)

const heading = computed(() => {
  if (!props.target) return ''
  if (props.target.kind === 'new') return 'Adicionar ao roadmap'
  if (props.target.kind === 'entry') return readonly.value ? 'Item da agenda' : 'Editar item'
  return readonly.value ? 'Marco' : props.target.milestone.type === 'REVIEW' ? 'Editar review' : 'Editar marco'
})

const titleError = computed(() => (tried.value && !title.value.trim() ? 'Dê um título' : ''))
const dateError = computed(() => (tried.value && !/^\d{4}-\d{2}-\d{2}$/.test(date.value) ? 'Escolha a data' : ''))
const testError = computed(() => {
  if (tab.value !== 'milestone' || !hasTestWindow.value) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testStart.value)) return 'Escolha quando o teste começa'
  if (date.value && testStart.value > date.value) return 'O teste precisa começar até a data do marco'
  return ''
})
const testSummary = computed(() => {
  if (!hasTestWindow.value || testError.value || !date.value) return ''
  const w = testWindow(testStart.value, date.value)
  return `${w.days} ${w.days === 1 ? 'dia' : 'dias'} de teste (${formatRange(w.start, w.end)}), e o marco no dia ${formatDayMonth(date.value)}`
})

function close() {
  if (saving.value) return
  emit('update:modelValue', false)
}

function submit() {
  if (readonly.value || saving.value) return
  tried.value = true
  if (titleError.value || dateError.value || testError.value) return
  saving.value = true
  const done = (ok: boolean) => {
    saving.value = false
    if (ok) emit('update:modelValue', false)
  }
  if (tab.value === 'entry') {
    emit(
      'save-entry',
      { title: title.value.trim(), date: date.value, description: description.value.trim() || null, category: category.value },
      done,
    )
  } else {
    emit(
      'save-milestone',
      {
        title: title.value.trim(),
        date: date.value,
        type: milestoneType.value,
        description: description.value.trim() || null,
        testStart: hasTestWindow.value ? testStart.value : null,
      },
      done,
    )
  }
}

function remove() {
  if (!confirmRemove.value) {
    confirmRemove.value = true
    return
  }
  saving.value = true
  emit('remove', (ok) => {
    saving.value = false
    if (ok) emit('update:modelValue', false)
  })
}
</script>

<template>
  <AppDialog :model-value="modelValue" :label="heading" size="md" :loading="saving" @update:model-value="close">
    <form class="rid" @submit.prevent="submit">
      <header class="rid-head">
        <h2>{{ heading }}</h2>
        <button class="rid-close" type="button" aria-label="Fechar" :disabled="saving" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div v-if="isNew" class="rid-tabs" role="tablist" aria-label="O que adicionar">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'entry'"
          class="rid-tab"
          :class="{ 'rid-tab--on': tab === 'entry' }"
          @click="tab = 'entry'"
        >
          Item da agenda
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'milestone'"
          class="rid-tab"
          :class="{ 'rid-tab--on': tab === 'milestone' }"
          @click="tab = 'milestone'"
        >
          Marco ou review
        </button>
      </div>

      <div class="rid-body">
        <fieldset v-if="tab === 'entry'" class="rid-field" :disabled="readonly">
          <legend>Tipo</legend>
          <div class="rid-cats">
            <button
              v-for="cat in categories"
              :key="cat.value"
              type="button"
              class="rid-cat"
              :class="{ 'rid-cat--on': category === cat.value }"
              :style="{ '--cat': cat.tone }"
              :aria-pressed="category === cat.value"
              @click="category = cat.value"
            >
              <component :is="cat.icon" :size="14" aria-hidden="true" />
              {{ cat.label }}
            </button>
          </div>
        </fieldset>

        <fieldset v-else class="rid-field" :disabled="readonly">
          <legend>Tipo</legend>
          <div class="rid-cats">
            <button
              type="button"
              class="rid-cat"
              :class="{ 'rid-cat--on': milestoneType === 'MILESTONE' }"
              style="--cat: var(--accent)"
              :aria-pressed="milestoneType === 'MILESTONE'"
              @click="milestoneType = 'MILESTONE'"
            >
              <Flag :size="14" aria-hidden="true" />
              Marco
            </button>
            <button
              type="button"
              class="rid-cat"
              :class="{ 'rid-cat--on': milestoneType === 'REVIEW' }"
              style="--cat: var(--info)"
              :aria-pressed="milestoneType === 'REVIEW'"
              @click="milestoneType = 'REVIEW'"
            >
              <CalendarCheck :size="14" aria-hidden="true" />
              Review
            </button>
          </div>
        </fieldset>

        <label class="rid-field">
          <span>Título</span>
          <input
            v-model="title"
            class="rid-input"
            type="text"
            maxlength="200"
            :readonly="readonly"
            :placeholder="tab === 'entry' ? 'Ex.: rodada de teste no iOS' : 'Ex.: App 1.5 nas lojas'"
            :aria-invalid="Boolean(titleError)"
            autofocus
          />
          <small v-if="titleError" class="rid-err">{{ titleError }}</small>
        </label>

        <label class="rid-field rid-field--date">
          <span>{{ tab === 'milestone' ? 'Data do marco' : 'Data' }}</span>
          <input v-model="date" class="rid-input" type="date" :readonly="readonly" :aria-invalid="Boolean(dateError)" />
          <small v-if="dateError" class="rid-err">{{ dateError }}</small>
        </label>

        <div v-if="tab === 'milestone'" class="rid-test">
          <label class="rid-check">
            <input v-model="hasTestWindow" type="checkbox" :disabled="readonly" />
            <span>
              <strong>Tem rodada de teste antes</strong>
              <small>Aparece como faixa de teste até a data do marco, no mês e no ano.</small>
            </span>
          </label>
          <label v-if="hasTestWindow" class="rid-field rid-field--date">
            <span>Teste começa em</span>
            <input
              v-model="testStart"
              class="rid-input"
              type="date"
              :max="date || undefined"
              :readonly="readonly"
              :aria-invalid="Boolean(testError)"
            />
            <small v-if="testError" class="rid-err">{{ testError }}</small>
            <small v-else-if="testSummary" class="rid-hint">{{ testSummary }}</small>
          </label>
        </div>

        <label class="rid-field">
          <span>Descrição <em>(opcional)</em></span>
          <textarea v-model="description" class="rid-input rid-textarea" rows="3" maxlength="2000" :readonly="readonly" />
        </label>
      </div>

      <footer class="rid-foot">
        <button
          v-if="!isNew && canEdit"
          class="rid-btn rid-btn--danger"
          :class="{ 'rid-btn--danger-on': confirmRemove }"
          type="button"
          :disabled="saving"
          @click="remove"
        >
          <Trash2 :size="14" aria-hidden="true" />
          {{ confirmRemove ? 'Confirmar exclusão' : 'Excluir' }}
        </button>
        <span class="rid-spacer" />
        <button class="rid-btn" type="button" :disabled="saving" @click="close">{{ canEdit ? 'Cancelar' : 'Fechar' }}</button>
        <button v-if="canEdit" class="rid-btn rid-btn--primary" type="submit" :disabled="saving">
          <Loader2 v-if="saving" :size="14" class="rid-spin" aria-hidden="true" />
          {{ isNew ? 'Adicionar' : 'Salvar' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.rid {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 40px);
}
.rid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
}
.rid-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.rid-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}
.rid-close:hover {
  color: var(--text);
}
.rid-tabs {
  display: flex;
  gap: 2px;
  margin: 0 16px 4px;
  padding: 3px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.rid-tab {
  flex: 1 1 0;
  min-height: 34px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.rid-tab--on {
  background: var(--surface);
  color: var(--accent-ink);
  box-shadow: var(--shadow-sm);
}
.rid-body {
  display: grid;
  gap: 14px;
  padding: 12px 16px 4px;
  overflow-y: auto;
}
.rid-field {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.rid-field > span,
.rid-field > legend {
  padding: 0;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-2);
}
.rid-field em {
  font-style: normal;
  font-weight: 500;
  color: var(--text-3);
}
.rid-field--date {
  max-width: 220px;
}
.rid-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rid-cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.rid-cat svg {
  color: var(--cat);
}
.rid-cat:hover {
  border-color: var(--border-strong);
}
.rid-cat--on {
  border-color: color-mix(in srgb, var(--cat) 55%, var(--border));
  background: color-mix(in srgb, var(--cat) 12%, var(--surface));
  color: var(--text);
}
.rid-input {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}
.rid-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 0;
  border-color: var(--accent);
}
.rid-input[aria-invalid='true'] {
  border-color: var(--err);
}
.rid-textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.45;
}
.rid-err {
  color: var(--err);
  font-size: 12px;
}
.rid-hint {
  color: var(--text-3);
  font-size: 12px;
}
.rid-test {
  display: grid;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--task-status-test) 30%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--task-status-test) 6%, var(--surface));
}
.rid-check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.rid-check input {
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: var(--accent);
}
.rid-check span {
  display: grid;
  gap: 2px;
}
.rid-check strong {
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}
.rid-check small {
  font-size: 12px;
  color: var(--text-3);
}
.rid-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px 16px;
}
.rid-spacer {
  flex: 1 1 auto;
}
.rid-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.rid-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
}
.rid-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.rid-btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
}
.rid-btn--primary:hover:not(:disabled) {
  border-color: var(--accent);
  filter: brightness(1.05);
}
.rid-btn--danger {
  color: var(--err);
}
.rid-btn--danger-on {
  border-color: var(--err);
  background: color-mix(in srgb, var(--err) 10%, var(--surface));
}
.rid-spin {
  animation: rid-spin 0.9s linear infinite;
}
@keyframes rid-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 640px) {
  .rid-field--date {
    max-width: none;
  }
  .rid-foot {
    flex-wrap: wrap;
  }
}
</style>
