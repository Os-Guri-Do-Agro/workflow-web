<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { watch } from 'vue'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Escreva o relatório aqui...',
    }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Underline,
    Link.configure({
      openOnClick: false,
    }),
  ],
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
})

watch(() => props.modelValue, (value) => {
  if (editor.value && value !== editor.value.getHTML()) {
    editor.value.commands.setContent(value)
  }
})
</script>

<template>
  <div class="tiptap-editor">
    <div v-if="editor" class="toolbar">
      <v-btn-group density="compact" variant="outlined" divided>
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive('bold') }"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <v-icon size="22">mdi-format-bold</v-icon>
        </v-btn>
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive('italic') }"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <v-icon size="22">mdi-format-italic</v-icon>
        </v-btn>
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive('underline') }"
          @click="editor.chain().focus().toggleUnderline().run()"
        >
          <v-icon size="22">mdi-format-underline</v-icon>
        </v-btn>
      </v-btn-group>

      <v-btn-group density="compact" variant="outlined" divided class="ml-2">
        <v-btn
          size="default"
          style="font-size: 14px"
          :class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
        >
          H1
        </v-btn>
        <v-btn
          size="default"
          style="font-size: 14px"
          :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          H2
        </v-btn>
        <v-btn
          size="default"
          style="font-size: 14px"
          :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }"
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
        >
          H3
        </v-btn>
      </v-btn-group>

      <v-btn-group density="compact" variant="outlined" divided class="ml-2">
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive('bulletList') }"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          <v-icon size="22">mdi-format-list-bulleted</v-icon>
        </v-btn>
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive('orderedList') }"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          <v-icon size="22">mdi-format-list-numbered</v-icon>
        </v-btn>
      </v-btn-group>

      <v-btn-group density="compact" variant="outlined" divided class="ml-2">
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive({ textAlign: 'left' }) }"
          @click="editor.chain().focus().setTextAlign('left').run()"
        >
          <v-icon size="22">mdi-format-align-left</v-icon>
        </v-btn>
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive({ textAlign: 'center' }) }"
          @click="editor.chain().focus().setTextAlign('center').run()"
        >
          <v-icon size="22">mdi-format-align-center</v-icon>
        </v-btn>
        <v-btn
          size="default"
          :class="{ 'is-active': editor.isActive({ textAlign: 'right' }) }"
          @click="editor.chain().focus().setTextAlign('right').run()"
        >
          <v-icon size="22">mdi-format-align-right</v-icon>
        </v-btn>
      </v-btn-group>
    </div>

    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>

<style scoped>
.tiptap-editor {
  border: 1px solid rgba(var(--v-theme-secondary), 0.2);
  border-radius: 8px;
  overflow: hidden;
}

.toolbar {
  padding: 8px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.2);
  background: rgb(var(--v-theme-surface));
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.is-active {
  background: rgba(var(--v-theme-secondary), 0.1) !important;
}

.editor-content {
  min-height: calc(100vh - 250px);
  max-height: calc(100vh - 250px);
  overflow-y: auto;
}

:deep(.ProseMirror) {
  padding: 16px;
  outline: none;
  min-height: calc(100vh - 250px);
  font-size: 16px;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: rgb(var(--v-theme-primary-lighten));
  pointer-events: none;
  height: 0;
}

:deep(.ProseMirror h1) {
  font-size: 2.5em;
  font-weight: bold;
  margin: 0.5em 0;
}

:deep(.ProseMirror h2) {
  font-size: 2em;
  font-weight: bold;
  margin: 0.5em 0;
}

:deep(.ProseMirror h3) {
  font-size: 1.5em;
  font-weight: bold;
  margin: 0.5em 0;
}

:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

:deep(.ProseMirror p) {
  margin: 0.5em 0;
}
</style>
