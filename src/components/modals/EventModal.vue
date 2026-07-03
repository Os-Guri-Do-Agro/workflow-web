<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import {
  X,
  Save,
  Plus,
  Trash2,
  CalendarRange,
  CalendarClock,
  Repeat,
  Video,
  Flag,
  Bell,
  Zap,
  RotateCcw,
  CheckSquare,
  User as UserIcon,
  Bold,
  Italic,
  UnderlineIcon,
  List,
  ListOrdered,
  Loader2,
  AlertCircle,
  type LucideIcon,
} from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'

type EventType =
  | 'MEETING'
  | 'DEADLINE'
  | 'REMINDER'
  | 'SPRINT'
  | 'RETROSPECTIVE'
  | 'TASK'
  | 'PERSONAL'

const props = defineProps<{
  modelValue: boolean
  event?: any
  // Controlado pelo pai: mantém o modal aberto (com loading no botão) até a API confirmar.
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [event: any]
  delete: [id: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isEditing = computed(() => !!props.event?.id)

// Ocorrência virtual de recorrência: read-only (edita a série via evento base).
const isOccurrence = computed(() => !!props.event?.isOccurrence)

// Link do Meet (backend já gera). Exibido no modo edição/view.
const meetLink = computed<string | null>(() => props.event?.meetLink ?? null)

const title = ref('')
const description = ref('')
const startDate = ref('') // YYYY-MM-DD (input type=date)
const startTime = ref('09:00') // HH:MM (input type=time)
const endDate = ref('')
const endTime = ref('')
const eventType = ref<EventType>('MEETING')
const recurrence = ref('')

// Erros de validação inline.
const titleError = ref('')
const dateError = ref('')

const recurrenceOptions = [
  { value: '', label: 'Não se repete' },
  { value: 'FREQ=DAILY', label: 'Todo dia' },
  { value: 'FREQ=WEEKLY', label: 'Toda semana' },
  { value: 'FREQ=MONTHLY', label: 'Todo mês' },
  { value: 'FREQ=YEARLY', label: 'Todo ano' },
]

type TypeMeta = { value: EventType; label: string; token: string; icon: LucideIcon }

const DEFAULT_TYPE: TypeMeta = { value: 'MEETING', label: 'Reunião', token: 'var(--info)', icon: Video }

const eventTypes: TypeMeta[] = [
  DEFAULT_TYPE,
  { value: 'DEADLINE', label: 'Prazo', token: 'var(--err)', icon: Flag },
  { value: 'REMINDER', label: 'Lembrete', token: 'var(--warn)', icon: Bell },
  { value: 'SPRINT', label: 'Sprint', token: 'var(--success)', icon: Zap },
  { value: 'RETROSPECTIVE', label: 'Retrospectiva', token: 'var(--status-test)', icon: RotateCcw },
  { value: 'TASK', label: 'Tarefa', token: 'var(--accent)', icon: CheckSquare },
  { value: 'PERSONAL', label: 'Pessoal', token: 'var(--status-todo)', icon: UserIcon },
]

const currentType = computed<TypeMeta>(
  () => eventTypes.find((t) => t.value === eventType.value) ?? DEFAULT_TYPE,
)

// One editor instance per component lifetime (avoids re-instantiation on every open,
// which was accumulating listeners and causing the freeze on repeated create actions).
const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: 'Adicione uma descrição detalhada...' }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Underline,
  ],
  onUpdate: ({ editor: ed }) => {
    description.value = ed.getHTML()
  },
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

const resetForm = () => {
  title.value = ''
  description.value = ''
  startDate.value = ''
  startTime.value = '09:00'
  endDate.value = ''
  endTime.value = ''
  eventType.value = 'MEETING'
  recurrence.value = ''
  titleError.value = ''
  dateError.value = ''
}

const close = () => {
  // Não fecha enquanto o pai está salvando (evita perder o form no meio do request).
  if (props.saving) return
  isOpen.value = false
}

/** Valida o form e retorna os Date de início/fim, ou null se inválido (marca erros inline). */
function validate(): { start: Date; end: Date | null } | null {
  titleError.value = ''
  dateError.value = ''
  let ok = true

  if (!title.value.trim()) {
    titleError.value = 'Informe um título para o evento.'
    ok = false
  }

  const start = combineDateTime(startDate.value, startTime.value)
  if (!start) {
    dateError.value = 'Informe uma data e hora de início válidas.'
    ok = false
  }

  let end: Date | null = null
  if (endDate.value) {
    end = combineDateTime(endDate.value, endTime.value || startTime.value)
    if (!end) {
      dateError.value = 'Término inválido.'
      ok = false
    } else if (start && end <= start) {
      dateError.value = 'O término deve ser depois do início.'
      ok = false
    }
  }

  if (!ok || !start) return null
  return { start, end }
}

const save = () => {
  if (props.saving || isOccurrence.value) return
  const valid = validate()
  if (!valid) return

  // Emite e NÃO fecha: o pai fecha via v-model só no sucesso (mantém o form em caso de erro).
  emit('save', {
    id: props.event?.id,
    title: title.value.trim(),
    description: description.value,
    startDate: valid.start.toISOString(),
    endDate: valid.end ? valid.end.toISOString() : null,
    type: eventType.value,
    recurrence: recurrence.value || undefined,
  })
}

const confirmDelete = ref(false)
const askDelete = () => {
  confirmDelete.value = true
}
const doDelete = () => {
  if (props.event?.id) emit('delete', props.event.id)
  confirmDelete.value = false
  close()
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      const ev = props.event
      if (ev) {
        title.value = ev.title || ''
        description.value = ev.description || ''
        startDate.value = formatDateField(ev.startDate)
        startTime.value = formatTimeField(ev.startDate) || '09:00'
        endDate.value = formatDateField(ev.endDate)
        endTime.value = formatTimeField(ev.endDate) || ''
        eventType.value = (ev.type as EventType) || 'MEETING'
        recurrence.value = ev.recurrence || ''
        titleError.value = ''
        dateError.value = ''
      } else {
        resetForm()
      }
      await nextTick()
      editor.value?.commands.setContent(description.value || '')
    } else {
      confirmDelete.value = false
      resetForm()
      editor.value?.commands.clearContent()
    }
  },
)

const cmd = (fn: 'toggleBold' | 'toggleItalic' | 'toggleUnderline' | 'toggleBulletList' | 'toggleOrderedList') => {
  const chain: any = editor.value?.chain().focus()
  chain?.[fn]().run()
}

/** ISO → 'YYYY-MM-DD' local (para <input type="date">). */
function formatDateField(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** ISO → 'HH:MM' local (para <input type="time">). */
function formatTimeField(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Combina 'YYYY-MM-DD' + 'HH:MM' (hora local) num Date; null se inválido. */
function combineDateTime(dateValue: string, timeValue: string): Date | null {
  if (!dateValue) return null
  const time = timeValue || '00:00'
  const date = new Date(`${dateValue}T${time}`)
  return Number.isNaN(date.getTime()) ? null : date
}

const canSave = computed(
  () => !isOccurrence.value && !!title.value.trim() && !!combineDateTime(startDate.value, startTime.value),
)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="overlay" @click.self="close">
        <div class="modal" role="dialog" aria-modal="true">
          <!-- Header -->
          <header class="head">
            <div class="head-main">
              <span
                class="head-icon"
                :style="{
                  color: currentType.token,
                  background: `color-mix(in srgb, ${currentType.token} 14%, transparent)`,
                }"
              >
                <component :is="currentType.icon" :size="18" />
              </span>
              <div class="head-txt">
                <h2 class="head-title">{{ isEditing ? 'Editar evento' : 'Novo evento' }}</h2>
                <p class="head-sub">
                  {{ isEditing ? 'Atualize os detalhes' : 'Adicione um evento à sua agenda' }}
                </p>
              </div>
            </div>
            <button class="close-btn" aria-label="Fechar" @click="close">
              <X :size="16" />
            </button>
          </header>

          <!-- Body -->
          <div class="body">
            <!-- Aviso de ocorrência de série (read-only) -->
            <div v-if="isOccurrence" class="occurrence-note">
              <Repeat :size="13" />
              Esta é uma ocorrência de um evento recorrente. Para alterá-la, edite a série no evento base.
            </div>

            <!-- Meet -->
            <a
              v-if="meetLink"
              class="meet-link"
              :href="meetLink"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video :size="14" />
              Entrar no Meet
            </a>

            <!-- Title -->
            <label class="field">
              <span class="label">Título</span>
              <input
                v-model="title"
                type="text"
                class="input input--title"
                :class="{ 'input--error': titleError }"
                placeholder="Ex: Daily stand-up, review da sprint…"
                @input="titleError = ''"
              />
              <span v-if="titleError" class="field-error">
                <AlertCircle :size="12" />
                {{ titleError }}
              </span>
            </label>

            <!-- Type -->
            <div class="field">
              <span class="label">Tipo</span>
              <div class="type-grid">
                <button
                  v-for="t in eventTypes"
                  :key="t.value"
                  class="type-btn"
                  :class="{ 'type-btn--active': eventType === t.value }"
                  :style="{
                    '--type-c': t.token,
                  } as Record<string, string>"
                  @click="eventType = t.value"
                >
                  <component :is="t.icon" :size="13" class="type-icon" />
                  <span>{{ t.label }}</span>
                </button>
              </div>
            </div>

            <!-- Dates -->
            <div class="row">
              <label class="field flex-1">
                <span class="label">
                  <CalendarRange :size="12" />
                  Início
                </span>
                <div class="datetime-control">
                  <input
                    v-model="startDate"
                    type="date"
                    class="input date-input"
                    :class="{ 'input--error': dateError }"
                    aria-label="Data de início"
                    @change="dateError = ''"
                  />
                  <input
                    v-model="startTime"
                    type="time"
                    class="input time-input"
                    :class="{ 'input--error': dateError }"
                    aria-label="Hora de início"
                    @change="dateError = ''"
                  />
                </div>
              </label>
              <label class="field flex-1">
                <span class="label">
                  <CalendarClock :size="12" />
                  Término (opcional)
                </span>
                <div class="datetime-control">
                  <input
                    v-model="endDate"
                    type="date"
                    class="input date-input"
                    :class="{ 'input--error': dateError }"
                    :min="startDate || undefined"
                    aria-label="Data de término"
                    @change="dateError = ''"
                  />
                  <input
                    v-model="endTime"
                    type="time"
                    class="input time-input"
                    :class="{ 'input--error': dateError }"
                    aria-label="Hora de término"
                    @change="dateError = ''"
                  />
                </div>
              </label>
            </div>
            <span v-if="dateError" class="field-error field-error--dates">
              <AlertCircle :size="12" />
              {{ dateError }}
            </span>

            <!-- Recurrence -->
            <div class="field">
              <span class="label">
                <Repeat :size="12" />
                Recorrência
              </span>
              <AppSelect
                v-model="recurrence"
                :items="recurrenceOptions"
                label="Recorrência"
                placeholder="Não se repete"
              />
            </div>

            <!-- Description editor -->
            <div class="field">
              <span class="label">Descrição</span>
              <div class="editor-wrap">
                <div class="editor-tools">
                  <button
                    class="tool-btn"
                    :class="{ active: editor?.isActive('bold') }"
                    title="Negrito"
                    @click="cmd('toggleBold')"
                  >
                    <Bold :size="13" />
                  </button>
                  <button
                    class="tool-btn"
                    :class="{ active: editor?.isActive('italic') }"
                    title="Itálico"
                    @click="cmd('toggleItalic')"
                  >
                    <Italic :size="13" />
                  </button>
                  <button
                    class="tool-btn"
                    :class="{ active: editor?.isActive('underline') }"
                    title="Sublinhado"
                    @click="cmd('toggleUnderline')"
                  >
                    <UnderlineIcon :size="13" />
                  </button>
                  <span class="tool-sep" />
                  <button
                    class="tool-btn"
                    :class="{ active: editor?.isActive('bulletList') }"
                    title="Lista"
                    @click="cmd('toggleBulletList')"
                  >
                    <List :size="13" />
                  </button>
                  <button
                    class="tool-btn"
                    :class="{ active: editor?.isActive('orderedList') }"
                    title="Lista numerada"
                    @click="cmd('toggleOrderedList')"
                  >
                    <ListOrdered :size="13" />
                  </button>
                </div>
                <EditorContent v-if="editor" :editor="editor" class="editor-surface" />
              </div>
            </div>
          </div>

          <!-- Footer -->
          <footer class="foot">
            <div class="foot-left">
              <button v-if="isEditing" class="btn btn-danger" @click="askDelete">
                <Trash2 :size="13" />
                Excluir
              </button>
            </div>
            <div class="foot-right">
              <button class="btn btn-ghost" :disabled="saving" @click="close">Cancelar</button>
              <button
                v-if="!isOccurrence"
                class="btn btn-primary"
                :disabled="!canSave || saving"
                @click="save"
              >
                <Loader2 v-if="saving" :size="13" class="spin" />
                <component :is="isEditing ? Save : Plus" v-else :size="13" />
                {{ saving ? 'Salvando…' : isEditing ? 'Salvar' : 'Criar evento' }}
              </button>
            </div>
          </footer>

          <!-- Inline delete confirm -->
          <div v-if="confirmDelete" class="confirm">
            <div class="confirm-box">
              <p class="confirm-text">Excluir este evento? Essa ação não pode ser desfeita.</p>
              <div class="confirm-actions">
                <button class="btn btn-ghost" @click="confirmDelete = false">Cancelar</button>
                <button class="btn btn-danger" @click="doDelete">
                  <Trash2 :size="13" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, black 62%, transparent);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal {
  position: relative;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-overlay);
}

/* Head */
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  gap: 12px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.head-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.head-txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
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

.close-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

/* Body */
.body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  flex: 1;
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
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.input:focus {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.input--error,
.input--error:focus {
  border-color: var(--err);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--err) 20%, transparent);
}

.field-error {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--err);
  font-size: 11.5px;
  font-weight: 600;
}

.field-error--dates {
  margin-top: -4px;
}

.occurrence-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--info) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--info) 26%, transparent);
  color: var(--text-2);
  font-size: 12px;
}

.meet-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-start;
  padding: 8px 13px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--info) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--info) 32%, transparent);
  color: var(--info);
  font-size: 12.5px;
  font-weight: 700;
  text-decoration: none;
  transition: background var(--motion-fast) var(--motion-ease);
}

.meet-link:hover {
  background: color-mix(in srgb, var(--info) 22%, transparent);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.input--title {
  font-size: 14.5px;
  font-weight: 500;
}

.datetime-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 108px;
  gap: 8px;
}

.date-input,
.time-input {
  font-variant-numeric: tabular-nums;
}

.time-input {
  text-align: center;
}

/* Type grid */
.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

@media (max-width: 540px) {
  .type-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.type-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.type-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.type-btn--active {
  background: color-mix(in srgb, var(--type-c) 14%, transparent);
  border-color: var(--type-c);
  color: var(--type-c);
  font-weight: 600;
}

.type-icon {
  flex-shrink: 0;
}

/* Editor */
.editor-wrap {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-2);
}

.editor-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.tool-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-3);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background var(--motion-fast) var(--motion-ease);
}

.tool-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.tool-btn.active {
  background: var(--surface-2);
  color: var(--text);
}

.tool-sep {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 4px;
}

.editor-surface {
  min-height: 110px;
}

.editor-surface :deep(.ProseMirror) {
  padding: 12px 14px;
  min-height: 110px;
  outline: none;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text);
}

.editor-surface :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--text-4);
  float: left;
  pointer-events: none;
  height: 0;
}

/* Footer */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.foot-left,
.foot-right {
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
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
  border: 1px solid transparent;
}

.btn-ghost {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text);
}

.btn-ghost:hover {
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

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-danger {
  background: color-mix(in srgb, var(--err) 14%, transparent);
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 35%, transparent);
}

.btn-danger:hover {
  background: color-mix(in srgb, var(--err) 20%, transparent);
  border-color: var(--err);
}

/* Inline confirm */
.confirm {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, black 45%, transparent);
  backdrop-filter: blur(2px);
  padding: 20px;
}

.confirm-box {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 18px;
  max-width: 320px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--shadow-overlay);
}

.confirm-text {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.45;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--motion) var(--motion-ease);
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition:
    opacity var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
</style>
