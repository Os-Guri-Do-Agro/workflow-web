import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'

interface TaskDescriptionEditorOptions {
  placeholder?: string
  editable?: boolean
  /** Recebe o HTML a cada alteração feita pelo usuário. */
  onUpdate?: (html: string) => void
  /** Chamado quando o campo perde o foco (grava na hora, sem esperar debounce). */
  onBlur?: () => void
}

/**
 * Configuração do editor de DESCRIÇÃO DE TAREFA.
 *
 * ## Por que não é o `useNoteEditor`
 *
 * O de notas é um editor de documento: blocos, tabela, imagem, `details`, menu
 * de "/", alça de arrastar. Este é um CAMPO DE FORMULÁRIO com formatação inline.
 * Um composable único com flags de desligar acumularia condicional para sempre e
 * vazaria para dentro da tarefa cada bloco novo que as notas ganhassem.
 *
 * ## Superfície única e fundida (decisão A2 da spec R1)
 *
 * O contrato visual é: **um campo só**. Não existe UI de bloco em lugar nenhum,
 * nem painel separado de personalização de texto. A formatação vem até o cursor
 * pelo menu flutuante da seleção, e mais nada.
 *
 * **Entra** (formatação inline e listas): negrito, itálico, sublinhado, riscado,
 * código inline, link, lista com marcador, lista numerada, checklist, citação.
 *
 * **Não entra**, e não é esquecimento: menu de "/", alça de arrastar, seletor de
 * tipo de bloco, título, tabela, imagem, alinhamento, cor, marca-texto, bloco de
 * código, `details`. Cada um desses é UI de bloco.
 *
 * A entrada por digitação do StarterKit (`- `, `1. `, `> `, `` ` ``) **fica**:
 * digitar não é UI.
 *
 * ## Ao mexer nesta lista
 *
 * A allowlist do sanitizador do servidor é derivada daqui
 * (`workflow-api/src/shared/security/rich-text.allowlist.ts`). Habilitar
 * extensão aqui sem liberar a tag lá faz o servidor calar a formatação na
 * gravação, e o usuário perde o que escreveu sem nenhuma mensagem de erro.
 */
export function useTaskDescriptionEditor(options: TaskDescriptionEditorOptions = {}) {
  const editor = useEditor({
    content: '',
    editable: options.editable ?? true,
    extensions: [
      StarterKit.configure({
        // Sem título: hierarquia de documento é UI de bloco.
        heading: false,
        // Sem bloco de código (código inline fica). Puxaria lowlight e uma casca
        // própria dentro de um campo que precisa ser uma superfície só.
        codeBlock: false,
        // Sem régua horizontal: é separador de seção, ou seja, estrutura.
        horizontalRule: false,
        // Link e Underline vêm DENTRO do StarterKit no TipTap 3. Declarar por
        // fora derruba o editor com "duplicate extension names".
        link: {
          openOnClick: false,
          HTMLAttributes: { class: 'editor-link' },
        },
      }),
      Placeholder.configure({
        placeholder:
          options.placeholder ?? 'Descreva o trabalho, critérios de aceitação, links...',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
    ],
    onUpdate: ({ editor: instance }) => options.onUpdate?.(instance.getHTML()),
    onBlur: () => options.onBlur?.(),
  })

  return { editor }
}
