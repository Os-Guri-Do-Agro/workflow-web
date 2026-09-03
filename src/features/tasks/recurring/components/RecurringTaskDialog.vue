<script setup lang="ts">
/**
 * Formulário de tarefa do protótipo — avulsa E recorrente no mesmo lugar.
 *
 * Três decisões que respondem direto às dores do board de hoje:
 *
 * 1. **Status inicial é campo do formulário.** Tarefa nem sempre nasce em "A
 *    fazer": às vezes ela já está em andamento quando é escrita, e as fixas do
 *    mês vivem em "Em teste" desde o primeiro dia. Sem este campo, criar
 *    significa criar e depois arrastar — duas ações para uma decisão que a
 *    pessoa já tinha tomado.
 *
 * 2. **Não existe seletor de mês.** O mês é derivado do prazo (ver
 *    `RecurrenceRuleEditor`). Escolher mês E data é a chance de os dois
 *    discordarem, e é o que hoje obriga a recriar o quadro na virada.
 *
 * 3. **A recorrência é um campo da tarefa, não outro tipo de tarefa.** Título,
 *    prioridade, responsáveis, tags e subtarefas são os mesmos da tarefa
 *    comum: uma recorrente é uma tarefa que também sabe se repetir.
 */
import { computed, ref, watch } from 'vue'
import {
  AlignLeft,
  Check,
  Flag,
  ListChecks,
  Plus,
  Repeat,
  Trash2,
  Type,
  Users,
  X,
} from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import TagChip from '@/components/ui/TagChip.vue'
import { avatarTone, initials as personInitials } from '@/utils/avatar'
import { ACTIVITY_STATUSES } from '../../task-meta'
import type { RecurrenceRule, RecurringTag, RecurringTemplate } from '../recurrence-types'
import { emptyRule } from '../recurrence-engine'
import { MOCK_MEMBERS, MOCK_TAGS } from '../recurring-mock'
import RecurrenceRuleEditor from './RecurrenceRuleEditor.vue'

const props = defineProps<{
  modelValue: boolean
  /** Modelo em edição. `null` = criação. */
  editing: RecurringTemplate | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [value: Omit<RecurringTemplate, 'id' | 'createdAt'>]
}>()

type Draft = Omit<RecurringTemplate, 'id' | 'createdAt'>

const blank = (): Draft => ({
  title: '',
  description: '',
  priorityNumber: 1,
  initialStatus: 'TODO',
  assignees: [],
  tags: [],
  subtasks: [],
  rule: emptyRule(),
  active: true,
})

const draft = ref<Draft>(blank())

// Reabrir o dialog sempre parte do zero (ou do modelo em edição): rascunho
// vazando de uma abertura para a outra é a forma mais rápida de alguém salvar
// a recorrência errada sem perceber.
watch(
  () => [props.modelValue, props.editing] as const,
  ([open, editing]) => {
    if (!open) return
    draft.value = editing
      ? (JSON.parse(JSON.stringify({ ...editing })) as Draft)
      : blank()
  },
  { immediate: true },
)

const priorities = [
  { value: 0, label: 'P0', tone: 'var(--err)' },
  { value: 1, label: 'P1', tone: 'var(--warn)' },
  { value: 2, label: 'P2', tone: 'var(--info)' },
  { value: 3, label: 'P3', tone: 'var(--text-3)' },
]

const isEdit = computed(() => props.editing !== null)
const valid = computed(() => draft.value.title.trim().length > 0)

function setRule(rule: RecurrenceRule): void {
  draft.value = { ...draft.value, rule }
}

function toggleAssignee(name: string): void {
  const list = draft.value.assignees.includes(name)
    ? draft.value.assignees.filter((a) => a !== name)
    : [...draft.value.assignees, name]
  draft.value = { ...draft.value, assignees: list }
}

function toggleTag(tag: RecurringTag): void {
  const list = draft.value.tags.some((t) => t.id === tag.id)
    ? draft.value.tags.filter((t) => t.id !== tag.id)
    : [...draft.value.tags, tag]
  draft.value = { ...draft.value, tags: list }
}

function addSubtask(): void {
  draft.value = {
    ...draft.value,
    subtasks: [...draft.value.subtasks, { title: '', description: '' }],
  }
}

function updateSubtask(index: number, title: string): void {
  draft.value = {
    ...draft.value,
    subtasks: draft.value.subtasks.map((s, i) => (i === index ? { ...s, title } : s)),
  }
}

function removeSubtask(index: number): void {
  draft.value = {
    ...draft.value,
    subtasks: draft.value.subtasks.filter((_, i) => i !== index),
  }
}

/**
 * Aviso quando a recorrente nasce em "Concluído".
 *
 * Não é bloqueio: talvez a pessoa queira registrar algo que já é feito. Mas uma
 * tarefa que se recria toda semana já concluída não pede nada de ninguém, e vale
 * dizer isso antes de ela descobrir sozinha daqui a três semanas.
 */
const doneWarning = computed(
  () => draft.value.initialStatus === 'DONE' && draft.value.rule.frequency !== 'once',
)

function submit(): void {
  if (!valid.value) return
  const subtasks = draft.value.subtasks.filter((s) => s.title.trim())
  emit('save', { ...draft.value, title: draft.value.title.trim(), subtasks })
  emit('update:modelValue', false)
}

const close = () => emit('update:modelValue', false)
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    size="xl"
    persistent
    :label="isEdit ? 'Editar tarefa recorrente' : 'Nova tarefa recorrente'"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="head">
      <div class="head-main">
        <span class="head-icon">
          <component :is="isEdit ? Repeat : Plus" :size="17" />
        </span>
        <div>
          <h2 class="head-title">{{ isEdit ? 'Editar tarefa' : 'Nova tarefa' }}</h2>
          <p class="head-sub">Avulsa ou recorrente — a repetição é só mais um campo</p>
        </div>
      </div>
      <button class="close-btn press" aria-label="Fechar" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div class="body">
      <!-- Título -->
      <label class="field">
        <span class="label"><Type :size="12" /> Título</span>
        <textarea
          v-model="draft.title"
          class="input input--title"
          rows="2"
          placeholder="O que precisa ser feito?"
          @keydown.ctrl.enter.prevent="submit"
          @keydown.meta.enter.prevent="submit"
        />
      </label>

      <!-- Descrição -->
      <label class="field">
        <span class="label"><AlignLeft :size="12" /> Descrição</span>
        <textarea
          v-model="draft.description"
          class="input input--area"
          rows="3"
          placeholder="Detalhes, critérios de aceitação, links úteis..."
        />
      </label>

      <!-- Status inicial: o campo que evita criar e depois arrastar -->
      <div class="field">
        <span class="label"><Check :size="12" /> Começa em qual coluna</span>
        <div class="status-row">
          <button
            v-for="status in ACTIVITY_STATUSES"
            :key="status.value"
            type="button"
            class="status-chip press"
            :class="{ 'status-chip--active': draft.initialStatus === status.value }"
            :style="{ '--st-c': status.token } as Record<string, string>"
            :aria-pressed="draft.initialStatus === status.value"
            @click="draft = { ...draft, initialStatus: status.value }"
          >
            <component :is="status.icon" :size="13" />
            {{ status.label }}
          </button>
        </div>
        <p v-if="doneWarning" class="warn-line">
          Uma tarefa que se repete já concluída nunca vai pedir nada. Confere se é isso mesmo.
        </p>
      </div>

      <!-- Prioridade -->
      <div class="field">
        <span class="label"><Flag :size="12" /> Prioridade</span>
        <div class="prio-row">
          <button
            v-for="p in priorities"
            :key="p.value"
            type="button"
            class="prio-chip press"
            :class="{ 'prio-chip--active': draft.priorityNumber === p.value }"
            :style="{ '--prio-c': p.tone } as Record<string, string>"
            @click="draft = { ...draft, priorityNumber: p.value }"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- Regra de repetição -->
      <div class="rule-block">
        <RecurrenceRuleEditor :model-value="draft.rule" @update:model-value="setRule" />
      </div>

      <!-- Responsáveis -->
      <div class="field">
        <span class="label">
          <Users :size="12" /> Responsáveis
          <span v-if="draft.assignees.length" class="label-count">{{ draft.assignees.length }}</span>
        </span>
        <div class="members-row">
          <button
            v-for="name in MOCK_MEMBERS"
            :key="name"
            type="button"
            class="member-chip press"
            :class="{ 'member-chip--active': draft.assignees.includes(name) }"
            :aria-pressed="draft.assignees.includes(name)"
            @click="toggleAssignee(name)"
          >
            <span
              class="avatar"
              aria-hidden="true"
              :style="{
                background: `color-mix(in srgb, ${avatarTone(name)} 20%, var(--surface-3))`,
                color: `color-mix(in srgb, ${avatarTone(name)} 64%, var(--text))`,
              }"
            >
              {{ personInitials(name) }}
            </span>
            <span class="member-name">{{ name }}</span>
            <Check v-if="draft.assignees.includes(name)" :size="12" />
          </button>
        </div>
      </div>

      <!-- Tags -->
      <div class="field">
        <span class="label">Tags</span>
        <div class="tags-row">
          <TagChip
            v-for="tag in MOCK_TAGS"
            :key="tag.id"
            :tag="tag"
            size="md"
            interactive
            :active="draft.tags.some((t) => t.id === tag.id)"
            @select="toggleTag(tag)"
          />
        </div>
      </div>

      <!-- Subtarefas -->
      <div class="field">
        <span class="label">
          <ListChecks :size="12" /> Subtarefas
          <span v-if="draft.subtasks.length" class="label-count">{{ draft.subtasks.length }}</span>
        </span>
        <p class="hint">
          Cada repetição nasce com esta lista zerada — o roteiro é do modelo, o progresso é do dia.
        </p>
        <ul v-if="draft.subtasks.length" class="sub-list">
          <li v-for="(step, i) in draft.subtasks" :key="i" class="sub-item">
            <span class="sub-index">{{ i + 1 }}</span>
            <input
              class="input sub-input"
              :value="step.title"
              :aria-label="`Subtarefa ${i + 1}`"
              placeholder="Passo..."
              @input="updateSubtask(i, ($event.target as HTMLInputElement).value)"
            />
            <button
              type="button"
              class="sub-del press"
              :aria-label="`Remover subtarefa ${i + 1}`"
              @click="removeSubtask(i)"
            >
              <Trash2 :size="13" />
            </button>
          </li>
        </ul>
        <button type="button" class="add-sub press" @click="addSubtask">
          <Plus :size="13" /> Adicionar passo
        </button>
      </div>
    </div>

    <footer class="foot">
      <button type="button" class="btn-ghost press" @click="close">Cancelar</button>
      <button type="button" class="btn-primary press" :disabled="!valid" @click="submit">
        {{ isEdit ? 'Salvar alterações' : 'Criar tarefa' }}
      </button>
    </footer>
  </AppDialog>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 11px;
}

.head-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  color: var(--accent);
}

.head-title {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

.head-sub {
  margin: 1px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.close-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.close-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 16px 18px;
  overflow-y: auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--text-3);
}

.label-count {
  padding: 0 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--accent-fg);
  background: var(--accent);
  border-radius: 999px;
}

.hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

.warn-line {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--warn);
}

.input {
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  resize: vertical;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.input:focus {
  border-color: var(--accent);
}

.input--title {
  font-size: 14.5px;
  font-weight: 600;
}

.input--area {
  line-height: 1.5;
}

/* ─── Status inicial ─── */
.status-row,
.prio-row,
.tags-row,
.members-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.status-chip:hover {
  color: var(--text-2);
  border-color: var(--border-strong);
}

.status-chip--active {
  color: var(--text);
  background: color-mix(in srgb, var(--st-c) 16%, var(--surface));
  border-color: var(--st-c);
}

.status-chip--active svg {
  color: var(--st-c);
}

/* ─── Prioridade ─── */
.prio-chip {
  min-width: 42px;
  height: 30px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast);
}

.prio-chip--active {
  color: var(--prio-c);
  border-color: var(--prio-c);
  background: color-mix(in srgb, var(--prio-c) 12%, var(--surface));
}

/* ─── Bloco da regra ─── */
.rule-block {
  padding: 13px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

/* ─── Membros ─── */
.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px 0 5px;
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast);
}

.member-chip--active {
  color: var(--text);
  border-color: var(--accent);
}

.avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 9.5px;
  font-weight: 700;
  border-radius: 50%;
}

.member-name {
  white-space: nowrap;
}

/* ─── Subtarefas ─── */
.sub-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
}

.sub-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-index {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  background: var(--surface-3);
  border-radius: 50%;
}

.sub-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
}

.sub-del {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.sub-del:hover {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

.add-sub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  height: 30px;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  background: transparent;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), border-color var(--motion-fast);
}

.add-sub:hover {
  color: var(--text);
  border-color: var(--accent);
}

/* ─── Footer ─── */
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.btn-ghost,
.btn-primary {
  height: 34px;
  padding: 0 15px;
  font-size: 12.5px;
  font-weight: 650;
  border-radius: 9px;
  cursor: pointer;
  transition: filter var(--motion-fast), border-color var(--motion-fast);
}

.btn-ghost {
  color: var(--text-2);
  background: transparent;
  border: 1px solid var(--border);
}

.btn-ghost:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.btn-primary {
  color: var(--accent-fg);
  background: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 78%, black);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
