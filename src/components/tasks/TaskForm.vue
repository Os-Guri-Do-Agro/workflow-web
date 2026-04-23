<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  X,
  Plus,
  Type,
  FileText,
  CalendarDays,
  Flag,
  Users,
  Paperclip,
  Check,
  Loader2,
} from 'lucide-vue-next'

const emit = defineEmits<{
  close: []
  submit: []
  'update:modelValue': [value: any]
}>()

const props = defineProps<{
  members: any[]
  modelValue: any
  loading?: boolean
}>()

const form = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const attachmentError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const priorities = [
  { value: 0, label: 'P0', tone: 'var(--text-3)' },
  { value: 1, label: 'P1', tone: 'var(--info)' },
  { value: 2, label: 'P2', tone: 'var(--info)' },
  { value: 3, label: 'P3', tone: 'var(--warn)' },
  { value: 4, label: 'P4', tone: 'var(--err)' },
  { value: 5, label: 'P5', tone: 'var(--err)' },
]

const onFileChange = (e: Event) => {
  attachmentError.value = ''
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  if (file && file.size > 10 * 1024 * 1024) {
    attachmentError.value = 'O arquivo deve ter menos de 10MB'
    emit('update:modelValue', { ...props.modelValue, attachment: null })
    return
  }
  emit('update:modelValue', { ...props.modelValue, attachment: file })
}

const clearFile = () => {
  if (fileInputRef.value) fileInputRef.value.value = ''
  attachmentError.value = ''
  emit('update:modelValue', { ...props.modelValue, attachment: null })
}

const toggleAssignee = (userId: string) => {
  const list: string[] = Array.isArray(form.value?.assignees) ? [...form.value.assignees] : []
  const idx = list.indexOf(userId)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(userId)
  emit('update:modelValue', { ...props.modelValue, assignees: list })
}

const isSelected = (userId: string) =>
  Array.isArray(form.value?.assignees) && form.value.assignees.includes(userId)

const initials = (name?: string) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('')

const valid = computed(() => !!form.value?.title?.trim())

const submit = () => {
  if (!valid.value) return
  if (form.value.dueDate && typeof form.value.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(form.value.dueDate)) {
    const [y, m, d] = form.value.dueDate.split('-').map(Number)
    const date = new Date(y, m - 1, d, 12, 0, 0)
    emit('update:modelValue', { ...form.value, dueDate: date.toISOString() })
  }
  emit('submit')
}
</script>

<template>
  <div class="form-card">
    <!-- Head -->
    <header class="head">
      <div class="head-main">
        <span class="head-icon">
          <Plus :size="17" />
        </span>
        <div>
          <h2 class="head-title">Nova atividade</h2>
          <p class="head-sub">Crie uma tarefa com responsáveis e prioridade</p>
        </div>
      </div>
      <button class="close-btn" aria-label="Fechar" :disabled="props.loading" @click="emit('close')">
        <X :size="16" />
      </button>
    </header>

    <!-- Body -->
    <div class="body">
      <!-- Title -->
      <label class="field">
        <span class="label">
          <Type :size="12" />
          Título
        </span>
        <textarea
          v-model="form.title"
          class="input input--title"
          rows="2"
          placeholder="O que precisa ser feito?"
          @keydown.meta.enter.prevent="submit"
          @keydown.ctrl.enter.prevent="submit"
        />
      </label>

      <!-- Description -->
      <label class="field">
        <span class="label">
          <FileText :size="12" />
          Descrição
        </span>
        <textarea
          v-model="form.description"
          class="input"
          rows="3"
          placeholder="Detalhes, critérios de aceitação, links úteis…"
        />
      </label>

      <!-- Priority + Due date row -->
      <div class="row">
        <div class="field flex-1">
          <span class="label">
            <Flag :size="12" />
            Prioridade
          </span>
          <div class="prio-row">
            <button
              v-for="p in priorities"
              :key="p.value"
              type="button"
              class="prio-chip"
              :class="{ 'prio-chip--active': Number(form.priorityNumber) === p.value }"
              :style="{ '--prio-c': p.tone } as Record<string, string>"
              @click="emit('update:modelValue', { ...form, priorityNumber: p.value })"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <label class="field flex-1">
          <span class="label">
            <CalendarDays :size="12" />
            Entrega
          </span>
          <input v-model="form.dueDate" type="date" class="input" />
        </label>
      </div>

      <!-- Assignees -->
      <div class="field">
        <span class="label">
          <Users :size="12" />
          Responsáveis
          <span v-if="form.assignees?.length" class="label-count">
            {{ form.assignees.length }} selecionado{{ form.assignees.length > 1 ? 's' : '' }}
          </span>
        </span>
        <div v-if="!props.members.length" class="empty-line">
          Nenhum membro disponível nesta empresa.
        </div>
        <div v-else class="members-row">
          <button
            v-for="m in props.members"
            :key="m.user?.id || m.id"
            type="button"
            class="member-chip"
            :class="{ 'member-chip--active': isSelected(m.user?.id || m.id) }"
            @click="toggleAssignee(m.user?.id || m.id)"
          >
            <span class="avatar">{{ initials(m.user?.name || m.name) }}</span>
            <span class="member-name">{{ m.user?.name || m.name }}</span>
            <Check v-if="isSelected(m.user?.id || m.id)" :size="12" class="member-check" />
          </button>
        </div>
      </div>

      <!-- Attachment -->
      <div class="field">
        <span class="label">
          <Paperclip :size="12" />
          Anexo
        </span>
        <div class="file-row">
          <button
            type="button"
            class="file-btn"
            @click="fileInputRef?.click()"
          >
            <Paperclip :size="13" />
            <span v-if="!form.attachment">Selecionar arquivo…</span>
            <span v-else class="file-name">{{ form.attachment.name }}</span>
          </button>
          <button
            v-if="form.attachment"
            type="button"
            class="file-clear"
            aria-label="Remover anexo"
            @click="clearFile"
          >
            <X :size="13" />
          </button>
          <input
            ref="fileInputRef"
            type="file"
            class="file-input"
            @change="onFileChange"
          />
        </div>
        <p v-if="attachmentError" class="field-err">{{ attachmentError }}</p>
        <p v-else-if="form.attachment" class="field-hint">
          {{ (form.attachment.size / 1024 / 1024).toFixed(2) }} MB · máx 10 MB
        </p>
      </div>
    </div>

    <!-- Footer -->
    <footer class="foot">
      <span class="foot-hint">⌘ + Enter para criar</span>
      <div class="foot-actions">
        <button
          class="btn btn-ghost"
          type="button"
          :disabled="props.loading"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="!valid || props.loading"
          @click="submit"
        >
          <Loader2 v-if="props.loading" :size="13" class="spin" />
          <Plus v-else :size="13" />
          {{ props.loading ? 'Criando…' : 'Criar atividade' }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.form-card {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  box-shadow: var(--shadow-overlay);
}

/* Head */
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.head-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.head-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.01em;
}

.head-sub {
  font-size: 12px;
  color: var(--text-3);
  margin: 2px 0 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--motion-ease);
}

.close-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Body */
.body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
  min-width: 0;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.label-count {
  font-size: 9.5px;
  color: var(--text-4);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: none;
  margin-left: auto;
}

.input {
  width: 100%;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  resize: vertical;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.input:focus {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.input--title {
  font-size: 14px;
  font-weight: 500;
  min-height: 52px;
}

/* Priority */
.prio-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.prio-chip {
  flex: 1;
  min-width: 40px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.prio-chip:hover {
  background: var(--surface-3);
  color: var(--text);
}

.prio-chip--active {
  background: color-mix(in srgb, var(--prio-c) 14%, transparent);
  border-color: var(--prio-c);
  color: var(--prio-c);
}

/* Members */
.members-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.empty-line {
  padding: 12px;
  text-align: center;
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  font-size: 12px;
}

.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px 5px 5px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.member-chip:hover {
  background: var(--surface-3);
  color: var(--text);
}

.member-chip--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.member-chip--active .avatar {
  background: var(--accent);
  color: var(--accent-fg);
}

.member-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-check {
  color: var(--accent);
  flex-shrink: 0;
}

/* File */
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px dashed var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.file-btn:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.file-clear {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--motion-ease);
}

.file-clear:hover {
  background: var(--surface-3);
  color: var(--text);
}

.file-input {
  display: none;
}

.field-err {
  margin: 0;
  font-size: 11.5px;
  color: var(--err);
}

.field-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-4);
}

/* Footer */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  gap: 10px;
}

.foot-hint {
  font-size: 11px;
  color: var(--text-4);
}

.foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.btn-ghost {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: color-mix(in srgb, var(--accent) 80%, black);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
