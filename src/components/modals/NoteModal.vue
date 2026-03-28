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
  note?: any
  folders?: any[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save': [note: any]
  'delete': [id: string]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isEditing = computed(() => !!props.note?.id)

const title = ref('')
const content = ref('')
const selectedFolder = ref('')
const tags = ref<string[]>([])
const newTag = ref('')
const isPinned = ref(false)

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: 'Comece a escrever...' }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Underline,
  ],
  onUpdate: ({ editor }) => {
    content.value = editor.getHTML()
  },
})

function resetForm() {
  title.value = ''
  content.value = ''
  selectedFolder.value = ''
  tags.value = []
  newTag.value = ''
  isPinned.value = false
  editor.value?.commands.setContent('')
}

function close() {
  isOpen.value = false
  resetForm()
}

function save() {
  const noteData = {
    id: props.note?.id,
    title: title.value,
    content: content.value,
    folderId: selectedFolder.value || null,
    tags: tags.value,
    isPinned: isPinned.value,
  }
  emit('save', noteData)
  close()
}

function deleteNote() {
  if (props.note?.id && confirm('Tem certeza que deseja excluir esta nota?')) {
    emit('delete', props.note.id)
    close()
  }
}

function addTag() {
  const tag = newTag.value.trim().toLowerCase()
  if (tag && !tags.value.includes(tag)) {
    tags.value.push(tag)
    newTag.value = ''
  }
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

// Pre-fill when editing
watch(() => props.note, (note) => {
  if (note) {
    title.value = note.title || ''
    content.value = note.content || ''
    selectedFolder.value = note.folderId || ''
    tags.value = note.tags || []
    isPinned.value = note.isPinned || false
    editor.value?.commands.setContent(note.content || '')
  }
}, { immediate: true })

const noteColors = [
  { bg: 'rgba(255, 245, 157, 0.3)', border: '#FCD34D' },  // Yellow
  { bg: 'rgba(167, 243, 208, 0.3)', border: '#34D399' },  // Green
  { bg: 'rgba(191, 219, 254, 0.3)', border: '#60A5FA' },  // Blue
  { bg: 'rgba(216, 180, 254, 0.3)', border: '#A78BFA' },  // Purple
  { bg: 'rgba(254, 202, 202, 0.3)', border: '#F87171' },  // Red
  { bg: 'rgba(254, 215, 170, 0.3)', border: '#FB923C' },  // Orange
]

const selectedColor = ref(0)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="close">
        <div class="modal-container">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-content">
              <div class="header-icon" :class="{ pinned: isPinned }">
                <v-icon size="24" :color="isPinned ? '#F59E0B' : 'white'">
                  {{ isPinned ? 'mdi-pin' : 'mdi-note-text' }}
                </v-icon>
              </div>
              <div>
                <h2 class="modal-title">{{ isEditing ? 'Editar Nota' : 'Nova Nota' }}</h2>
                <p class="modal-subtitle">{{ isEditing ? 'Atualize sua nota' : 'Capture suas ideias' }}</p>
              </div>
            </div>
            <div class="header-actions">
              <button 
                class="pin-btn"
                :class="{ active: isPinned }"
                @click="isPinned = !isPinned"
                title="Fixar nota"
              >
                <v-icon size="18">{{ isPinned ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon>
              </button>
              <button class="close-btn" @click="close">
                <v-icon size="20">mdi-close</v-icon>
              </button>
            </div>
          </div>

          <!-- Color Selection -->
          <div class="color-bar">
            <button
              v-for="(color, index) in noteColors"
              :key="index"
              class="color-dot"
              :class="{ active: selectedColor === index }"
              :style="{ backgroundColor: color.border }"
              @click="selectedColor = index"
            />
          </div>

          <!-- Body -->
          <div class="modal-body" :style="{ backgroundColor: noteColors[selectedColor]?.bg }">
            <!-- Title -->
            <input 
              v-model="title" 
              type="text" 
              class="note-title-input"
              placeholder="Título da nota..."
              autofocus
            />

            <!-- Editor Toolbar -->
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
                  { icon: 'mdi-format-header-1', cmd: 'toggleHeading', arg: { level: 1 } },
                  { icon: 'mdi-format-list-bulleted', cmd: 'toggleBulletList' },
                  { icon: 'mdi-format-list-numbered', cmd: 'toggleOrderedList' },
                ]"
                :key="action.icon"
                class="toolbar-btn"
                :class="{ active: action.arg ? editor?.isActive('heading', action.arg) : editor?.isActive(action.cmd.replace('toggle', '').toLowerCase()) }"
                @click="(editor?.chain().focus() as any)[action.cmd](action.arg).run()"
              >
                <v-icon size="14">{{ action.icon }}</v-icon>
              </button>
            </div>

            <!-- Editor -->
            <div class="editor-container">
              <EditorContent :editor="editor" class="tiptap-editor" />
            </div>

            <!-- Tags -->
            <div class="tags-section">
              <div class="tags-list">
                <span v-for="tag in tags" :key="tag" class="tag">
                  #{{ tag }}
                  <button class="tag-remove" @click="removeTag(tag)">
                    <v-icon size="10">mdi-close</v-icon>
                  </button>
                </span>
              </div>
              <div class="tag-input-wrapper">
                <v-icon size="14" color="rgba(var(--v-theme-secondary), 0.4)">mdi-pound</v-icon>
                <input
                  v-model="newTag"
                  type="text"
                  class="tag-input"
                  placeholder="Adicionar tag..."
                  @keydown.enter.prevent="addTag"
                  @blur="addTag"
                />
              </div>
            </div>

            <!-- Folder -->
            <div class="folder-section">
              <v-icon size="16" color="rgba(var(--v-theme-secondary), 0.5)">mdi-folder</v-icon>
              <select v-model="selectedFolder" class="folder-select">
                <option value="">Sem pasta</option>
                <option v-for="folder in folders" :key="folder.id" :value="folder.id">
                  {{ folder.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <div class="footer-left">
              <button v-if="isEditing" class="btn btn-danger" @click="deleteNote">
                <v-icon size="16">mdi-delete</v-icon>
              </button>
            </div>
            <div class="footer-right">
              <span class="char-count">{{ content?.length || 0 }} caracteres</span>
              <button class="btn btn-secondary" @click="close">Cancelar</button>
              <button 
                class="btn btn-primary" 
                :disabled="!title"
                @click="save"
              >
                <v-icon size="16">{{ isEditing ? 'mdi-content-save' : 'mdi-plus' }}</v-icon>
                {{ isEditing ? 'Salvar' : 'Criar Nota' }}
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
  max-width: 720px;
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
  padding: 20px 24px;
  background: rgb(var(--v-theme-primary));
}

.header-content {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.header-icon.pinned {
  background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0;
}

.modal-subtitle {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.5);
  margin: 2px 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pin-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  background: transparent;
  color: rgba(var(--v-theme-secondary), 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.pin-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgb(var(--v-theme-secondary));
}

.pin-btn.active {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.3);
  color: #F59E0B;
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

/* Color Bar */
.color-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px 16px;
  background: rgb(var(--v-theme-primary));
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.06);
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.color-dot:hover {
  transform: scale(1.1);
}

.color-dot.active {
  border-color: rgb(var(--v-theme-secondary));
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary)), 0 0 0 4px currentColor;
}

/* Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  min-height: 300px;
}

.note-title-input {
  width: 100%;
  font-size: 24px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  background: transparent;
  border: none;
  outline: none;
  margin-bottom: 16px;
  font-family: inherit;
}

.note-title-input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.3);
}

/* Editor Toolbar */
.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 10px;
  margin-bottom: 12px;
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

/* Editor */
.editor-container {
  min-height: 200px;
}

.tiptap-editor :deep(.ProseMirror) {
  outline: none;
  font-size: 15px;
  line-height: 1.7;
  color: rgb(var(--v-theme-secondary));
}

.tiptap-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: rgba(var(--v-theme-secondary), 0.35);
  float: left;
  pointer-events: none;
}

.tiptap-editor :deep(.ProseMirror h1) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0.5em 0;
}

/* Tags */
.tags-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px dashed rgba(var(--v-theme-secondary), 0.15);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(var(--v-theme-secondary), 0.08);
  border-radius: 20px;
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.7);
}

.tag-remove {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(var(--v-theme-secondary), 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.15s ease;
}

.tag-remove:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.tag-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 10px;
}

.tag-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  outline: none;
}

.tag-input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.4);
}

/* Folder */
.folder-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed rgba(var(--v-theme-secondary), 0.15);
}

.folder-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  cursor: pointer;
  outline: none;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgb(var(--v-theme-primary));
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.06);
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.char-count {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.4);
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
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
  color: white;
  border-color: transparent;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  width: 36px;
  height: 36px;
  padding: 0;
  justify-content: center;
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
