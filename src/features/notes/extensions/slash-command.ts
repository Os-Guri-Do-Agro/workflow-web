import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import {
  AlignLeft,
  ChevronRight,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Table as TableIcon,
} from 'lucide-vue-next'
import type { Component } from 'vue'

export interface SlashItem {
  id: string
  title: string
  description: string
  icon: Component
  /** Termos extras de busca, para "titulo" achar "Título 1". */
  keywords: string[]
  run: (editor: Editor, range: Range) => void
}

/**
 * Estado compartilhado entre a extensão (que vive no ProseMirror) e o
 * componente Vue que desenha o menu. A extensão só escreve aqui; a renderização
 * inteira é do componente, o que evita montar Vue dentro de um plugin.
 */
export interface SlashState {
  open: boolean
  items: SlashItem[]
  index: number
  rect: DOMRect | null
  select: (item: SlashItem) => void
}

export function createSlashState(): SlashState {
  return {
    open: false,
    items: [],
    index: 0,
    rect: null,
    select: () => {},
  } as SlashState
}

/** Substitui o "/" digitado antes de aplicar o comando. */
const replaceRange = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'paragraph',
    title: 'Texto',
    description: 'Parágrafo simples',
    icon: AlignLeft,
    keywords: ['texto', 'paragrafo', 'p'],
    run: (editor, range) => replaceRange(editor, range).setParagraph().run(),
  },
  {
    id: 'h1',
    title: 'Título 1',
    description: 'Cabeçalho grande',
    icon: Heading1,
    keywords: ['titulo', 'h1', 'cabecalho'],
    run: (editor, range) => replaceRange(editor, range).setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'h2',
    title: 'Título 2',
    description: 'Cabeçalho médio',
    icon: Heading2,
    keywords: ['titulo', 'h2', 'cabecalho'],
    run: (editor, range) => replaceRange(editor, range).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'h3',
    title: 'Título 3',
    description: 'Cabeçalho pequeno',
    icon: Heading3,
    keywords: ['titulo', 'h3', 'cabecalho'],
    run: (editor, range) => replaceRange(editor, range).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bulletList',
    title: 'Lista',
    description: 'Lista com marcadores',
    icon: List,
    keywords: ['lista', 'bullet', 'ul'],
    run: (editor, range) => replaceRange(editor, range).toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    title: 'Lista numerada',
    description: 'Lista ordenada',
    icon: ListOrdered,
    keywords: ['lista', 'numerada', 'ol'],
    run: (editor, range) => replaceRange(editor, range).toggleOrderedList().run(),
  },
  {
    id: 'taskList',
    title: 'Lista de tarefas',
    description: 'Caixas de seleção',
    icon: ListChecks,
    keywords: ['tarefa', 'todo', 'checkbox', 'check'],
    run: (editor, range) => replaceRange(editor, range).toggleTaskList().run(),
  },
  {
    id: 'blockquote',
    title: 'Citação',
    description: 'Bloco de citação',
    icon: Quote,
    keywords: ['citacao', 'quote'],
    run: (editor, range) => replaceRange(editor, range).toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    title: 'Código',
    description: 'Bloco de código com destaque',
    icon: Code2,
    keywords: ['codigo', 'code', 'snippet'],
    run: (editor, range) => replaceRange(editor, range).toggleCodeBlock().run(),
  },
  {
    id: 'details',
    title: 'Bloco recolhível',
    description: 'Conteúdo que abre e fecha',
    icon: ChevronRight,
    keywords: ['recolhivel', 'details', 'toggle', 'acordeao'],
    run: (editor, range) => replaceRange(editor, range).setDetails().run(),
  },
  {
    id: 'table',
    title: 'Tabela',
    description: 'Tabela 3x3 com cabeçalho',
    icon: TableIcon,
    keywords: ['tabela', 'table', 'grade'],
    run: (editor, range) =>
      replaceRange(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'image',
    title: 'Imagem',
    description: 'Inserir imagem por URL',
    icon: ImageIcon,
    keywords: ['imagem', 'image', 'foto'],
    run: (editor, range) => {
      const url = window.prompt('URL da imagem:')
      const chain = replaceRange(editor, range)
      if (url) chain.setImage({ src: url }).run()
      else chain.run()
    },
  },
  {
    id: 'horizontalRule',
    title: 'Divisória',
    description: 'Linha horizontal',
    icon: Minus,
    keywords: ['divisoria', 'linha', 'hr', 'separador'],
    run: (editor, range) => replaceRange(editor, range).setHorizontalRule().run(),
  },
]

/** Busca sem acento, para "codigo" achar "Código". */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function filterSlashItems(query: string): SlashItem[] {
  const term = normalize(query.trim())
  if (!term) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) =>
    [item.title, ...item.keywords].some((candidate) => normalize(candidate).includes(term)),
  )
}

/**
 * Menu de blocos acionado por "/". A navegação por teclado é resolvida aqui
 * (`onKeyDown` roda antes do ProseMirror), e o desenho fica no componente.
 */
export function SlashCommand(state: SlashState) {
  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: '/',
          // Só dispara em início de bloco ou após espaço, para não abrir o menu
          // no meio de uma URL ou de uma data.
          allowSpaces: false,
          startOfLine: false,
          items: ({ query }) => filterSlashItems(query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => ({
            onStart: (props) => {
              state.items = props.items
              state.index = 0
              state.rect = props.clientRect?.() ?? null
              state.select = (item) => props.command(item)
              state.open = props.items.length > 0
            },
            onUpdate: (props) => {
              state.items = props.items
              state.index = 0
              state.rect = props.clientRect?.() ?? null
              state.select = (item) => props.command(item)
              state.open = props.items.length > 0
            },
            onKeyDown: (props) => {
              if (!state.open) return false
              const { event } = props

              if (event.key === 'Escape') {
                state.open = false
                return true
              }
              if (event.key === 'ArrowDown') {
                state.index = (state.index + 1) % state.items.length
                return true
              }
              if (event.key === 'ArrowUp') {
                state.index = (state.index + state.items.length - 1) % state.items.length
                return true
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                const item = state.items[state.index]
                if (!item) return false
                state.select(item)
                return true
              }
              return false
            },
            onExit: () => {
              state.open = false
              state.items = []
            },
          }),
        }),
      ]
    },
  })
}
