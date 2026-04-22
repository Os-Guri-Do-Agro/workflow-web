<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'

const props = defineProps<{
  modelValue: boolean
  event?: any
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save': [event: any]
  'delete': [id: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isEditing = computed(() => !!props.event?.id)

const title = ref('')
const description = ref('')
const startDate = ref('')
const endDate = ref('')
const eventType = ref('MEETING')
const selectedActivity = ref('')
const recurrence = ref('')

const recurrenceOptions = [
  { value: '', label: 'Não se repete' },
  { value: 'FREQ=DAILY', label: 'Todo dia' },
  { value: 'FREQ=WEEKLY', label: 'Toda semana' },
  { value: 'FREQ=MONTHLY', label: 'Todo mês' },
  { value: 'FREQ=YEARLY', label: 'Todo ano' },
]

const eventTypes = [
  { value: 'MEETING', label: 'Reunião', color: '#3B82F6', icon: 'mdi-video' },
  { value: 'DEADLINE', label: 'Prazo', color: '#EF4444', icon: 'mdi-clock-alert' },
  { value: 'REMINDER', label: 'Lembrete', color: '#F59E0B', icon: 'mdi-bell' },
  { value: 'SPRINT', label: 'Sprint', color: '#10B981', icon: 'mdi-run' },
  { value: 'RETROSPECTIVE', label: 'Retrospectiva', color: '#8B5CF6', icon: 'mdi-clipboard-text' },
]

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: 'Adicione uma descrição detalhada...' }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Underline,
  ],
  onUpdate: ({ editor }) => {
    description.value = editor.getHTML()
  },
})

function resetForm() {
  title.value = ''
  description.value = ''
  startDate.value = ''
  endDate.value = ''
  eventType.value = 'MEETING'
  selectedActivity.value = ''
  recurrence.value = ''
  editor.value?.commands.setContent('')
}

function close() {
  isOpen.value = false
}

function save() {
  const eventData = {
    id: props.event?.id,
    title: title.value,
    description: description.value,
    startDate: new Date(startDate.value).toISOString(),
    endDate: endDate.value ? new Date(endDate.value).toISOString() : null,
    type: eventType.value,
    activityId: selectedActivity.value || null,
    recurrence: recurrence.value || undefined,
  }
  emit('save', eventData)
  close()
}

function deleteEvent() {
  if (props.event?.id && confirm('Tem certeza que deseja excluir este evento?')) {
    emit('delete', props.event.id)
    close()
  }
}

watch(() => props.modelValue, (open) => {
  if (open && props.event) {
    title.value = props.event.title || ''
    description.value = props.event.description || ''
    startDate.value = props.event.startDate ? new Date(props.event.startDate).toISOString().slice(0, 16) : ''
    endDate.value = props.event.endDate ? new Date(props.event.endDate).toISOString().slice(0, 16) : ''
    eventType.value = props.event.type || 'MEETING'
    selectedActivity.value = props.event.activityId || ''
    recurrence.value = props.event.recurrence || ''
    editor.value?.commands.setContent(props.event.description || '')
  } else if (!open) {
    resetForm()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-container">
          <!-- Header -->
          <div class="modal-header" :style="{ borderColor: eventTypes.find(t => t.value === eventType)?.color }">
            <div class="header-content">
              <div 
                class="header-icon"
                :style="{ backgroundColor: eventTypes.find(t => t.value === eventType)?.color + '20' }"
              >
                <v-icon 
                  size="24" 
                  :color="eventTypes.find(t => t.value === eventType)?.color"
                >
                  {{ eventTypes.find(t => t.value === eventType)?.icon }}
                </v-icon>
              </div>
              <div>
                <h2 class="modal-title">{{ isEditing ? 'Editar Evento' : 'Novo Evento' }}</h2>
                <p class="modal-subtitle">{{ isEditing ? 'Atualize os detalhes do evento' : 'Crie um novo evento para sua agenda' }}</p>
              </div>
            </div>
            <button class="close-btn" @click="close">
              <v-icon size="20">mdi-close</v-icon>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Title Input -->
            <div class="form-group">
              <label class="form-label">Título do Evento</label>
              <input 
                v-model="title" 
                type="text" 
                class="form-input title-input"
                placeholder="Ex: Daily Standup, Review de Sprint..."
                autofocus
              />
            </div>

            <!-- Event Type Selection -->
            <div class="form-group">
              <label class="form-label">Tipo de Evento</label>
              <div class="type-grid">
                <button
                  v-for="type in eventTypes"
                  :key="type.value"
                  class="type-btn"
                  :class="{ active: eventType === type.value }"
                  :style="{ 
                    '--type-color': type.color,
                    backgroundColor: eventType === type.value ? type.color + '15' : 'transparent',
                    borderColor: eventType === type.value ? type.color : undefined
                  }"
                  @click="eventType = type.value"
                >
                  <v-icon size="18" :color="type.color">{{ type.icon }}</v-icon>
                  <span :style="{ color: type.color }">{{ type.label }}</span>
                </button>
              </div>
            </div>

            <!-- Date & Time -->
            <div class="form-row">
              <div class="form-group flex-1">
                <label class="form-label">
                  <v-icon size="14" class="label-icon">mdi-calendar-start</v-icon>
                  Início
                </label>
                <input
                  v-model="startDate"
                  type="datetime-local"
                  class="form-input"
                />
              </div>
              <div class="form-group flex-1">
                <label class="form-label">
                  <v-icon size="14" class="label-icon">mdi-calendar-end</v-icon>
                  Término (opcional)
                </label>
                <input
                  v-model="endDate"
                  type="datetime-local"
                  class="form-input"
                />
              </div>
            </div>

            <!-- Recurrence -->
            <div class="form-group">
              <label class="form-label">
                <v-icon size="14" class="label-icon">mdi-repeat</v-icon>
                Recorrência
              </label>
              <div class="custom-select-wrapper">
                <select v-model="recurrence" class="custom-select">
                  <option
                    v-for="opt in recurrenceOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
                <v-icon size="16" class="select-arrow">mdi-chevron-down</v-icon>
              </div>
            </div>

            <!-- Description Editor -->
            <div class="form-group">
              <label class="form-label">Descrição</label>
              <div class="editor-toolbar">
                <button 
                  v-for="action in [
                    { icon: 'mdi-format-bold', cmd: 'toggleBold', active: 'bold' },
                    { icon: 'mdi-format-italic', cmd: 'toggleItalic', active: 'italic' },
                    { icon: 'mdi-format-underline', cmd: 'toggleUnderline', active: 'underline' },
                  ]"
                  :key="action.cmd"
                  class="toolbar-btn"
                  :class="{ active: editor?.isActive(action.active) }"
                  @click="(editor?.chain().focus() as any)[action.cmd]().run()"
                >
                  <v-icon size="14">{{ action.icon }}</v-icon>
                </button>
                <div class="toolbar-divider" />
                <button 
                  v-for="action in [
                    { icon: 'mdi-format-list-bulleted', cmd: 'toggleBulletList', active: 'bulletList' },
                    { icon: 'mdi-format-list-numbered', cmd: 'toggleOrderedList', active: 'orderedList' },
                  ]"
                  :key="action.cmd"
                  class="toolbar-btn"
                  :class="{ active: editor?.isActive(action.active) }"
                  @click="(editor?.chain().focus() as any)[action.cmd]().run()"
                >
                  <v-icon size="14">{{ action.icon }}</v-icon>
                </button>
              </div>
              <div class="editor-container">
                <EditorContent :editor="editor" class="tiptap-editor" />
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <div class="footer-left">
              <button v-if="isEditing" class="btn btn-danger" @click="deleteEvent">
                <v-icon size="16">mdi-delete</v-icon>
                Excluir
              </button>
            </div>
            <div class="footer-right">
              <button class="btn btn-secondary" @click="close">Cancelar</button>
              <button 
                class="btn btn-primary" 
                :disabled="!title || !startDate"
                :style="{ 
                  backgroundColor: eventTypes.find(t => t.value === eventType)?.color,
                  borderColor: eventTypes.find(t => t.value === eventType)?.color
                }"
                @click="save"
              >
                <v-icon size="16">{{ isEditing ? 'mdi-content-save' : 'mdi-plus' }}</v-icon>
                {{ isEditing ? 'Salvar Alterações' : 'Criar Evento' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-container {
  background: rgb(var(--v-theme-primary));
  border-radius: 20px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 20px;
  border-bottom: 2px solid;
  border-color: transparent;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0;
}

.modal-subtitle {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.5);
  margin: 4px 0 0;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgba(var(--v-theme-secondary), 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

/* Body */
.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.flex-1 {
  flex: 1;
  margin-bottom: 0;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.7);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.label-icon {
  color: rgba(var(--v-theme-secondary), 0.4);
}

.form-input,
.form-select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.12);
  border-radius: 12px;
  background: rgba(var(--v-theme-secondary), 0.02);
  font-size: 14px;
  color: rgb(var(--v-theme-secondary));
  outline: none;
  transition: all 0.2s ease;
  font-family: inherit;
}

.form-input:focus,
.form-select:focus {
  border-color: #3B82F6;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Custom Select Premium */
.custom-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.custom-select {
  width: 100%;
  padding: 12px 40px 12px 14px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.12);
  border-radius: 12px;
  background: rgba(var(--v-theme-secondary), 0.02);
  font-size: 14px;
  color: rgb(var(--v-theme-secondary));
  outline: none;
  transition: all 0.2s ease;
  font-family: inherit;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.custom-select:hover {
  border-color: rgba(var(--v-theme-secondary), 0.2);
  background: rgba(var(--v-theme-secondary), 0.04);
}

.custom-select:focus {
  border-color: #3B82F6;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select-arrow {
  position: absolute;
  right: 14px;
  color: rgba(var(--v-theme-secondary), 0.5);
  pointer-events: none;
}

.title-input {
  font-size: 16px;
  font-weight: 500;
}

/* Event Type Grid */
.type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.type-btn:hover {
  border-color: var(--type-color);
  background: var(--type-color) + '10';
}

.type-btn.active {
  border-width: 2px;
  font-weight: 600;
}

.type-btn span {
  font-size: 12px;
}

/* Editor */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: rgba(var(--v-theme-secondary), 0.03);
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-secondary), 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-btn.active {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: rgba(var(--v-theme-secondary), 0.1);
  margin: 0 4px;
}

.editor-container {
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 0 0 12px 12px;
  min-height: 120px;
}

.tiptap-editor :deep(.ProseMirror) {
  padding: 14px;
  min-height: 120px;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: rgb(var(--v-theme-secondary));
}

.tiptap-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: rgba(var(--v-theme-secondary), 0.35);
  float: left;
  pointer-events: none;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px 24px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.08);
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  font-family: inherit;
}

.btn-secondary {
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgba(var(--v-theme-secondary), 0.7);
  border-color: rgba(var(--v-theme-secondary), 0.1);
}

.btn-secondary:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.btn-primary {
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
  border-color: rgba(239, 68, 68, 0.2);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.modal-enter-to,
.modal-leave-from {
  opacity: 1;
  transform: scale(1);
}
</style>
