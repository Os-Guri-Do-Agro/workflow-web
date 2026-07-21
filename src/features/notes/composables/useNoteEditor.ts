import { reactive } from 'vue'
import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import CharacterCount from '@tiptap/extension-character-count'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { common, createLowlight } from 'lowlight'
import { createSlashState, SlashCommand, type SlashState } from '../extensions/slash-command'

const lowlight = createLowlight(common)

interface NoteEditorOptions {
  placeholder?: string
  editable?: boolean
  /** Recebe o HTML a cada alteração feita pelo usuário. */
  onUpdate?: (html: string) => void
}

/**
 * Configuração única do editor de notas.
 *
 * Todo mundo que precisa de um editor de nota passa por aqui: é o ponto onde a
 * P3 pluga `Collaboration` (e desliga o `undoRedo` do StarterKit, que a
 * extensão de colaboração substitui) e a P4 registra o bloco de desenho, sem
 * mexer em nenhum componente visual.
 */
export function useNoteEditor(options: NoteEditorOptions = {}) {
  const slash = reactive<SlashState>(createSlashState())

  const editor = useEditor({
    content: '',
    editable: options.editable ?? true,
    extensions: [
      StarterKit.configure({
        // Substituído pelo CodeBlockLowlight, que tem destaque de sintaxe.
        codeBlock: false,
        // Link e Underline vêm dentro do StarterKit no TipTap 3; declarar de
        // novo por fora derruba o editor com "duplicate extension names".
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'editor-link' },
        },
      }),
      Placeholder.configure({
        placeholder: options.placeholder ?? 'Escreva ou digite "/" para inserir um bloco...',
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: true }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Superscript,
      Subscript,
      CharacterCount,
      TextStyle,
      Color,
      CodeBlockLowlight.configure({ lowlight }),
      Details.configure({ persist: true, HTMLAttributes: { class: 'note-details' } }),
      DetailsSummary,
      DetailsContent,
      SlashCommand(slash),
    ],
    onUpdate: ({ editor: instance }) => options.onUpdate?.(instance.getHTML()),
  })

  return { editor, slash }
}
