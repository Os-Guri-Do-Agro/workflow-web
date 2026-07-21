/**
 * Tipos da feature de Notas.
 *
 * O backend tem dois shapes diferentes para nota, e isso é intencional lá:
 * `GET /notes` devolve `preview` (derivado do HTML no servidor) e não devolve
 * `folder`; `GET /notes/:id` devolve o `folder` inteiro e não devolve `preview`.
 * Modelamos os dois separados em vez de fingir que é um só com tudo opcional.
 */

export interface NoteFolder {
  id: string
  name: string
  color: string | null
  userId: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  /** Só vem em `GET /notes/folders`. */
  _count?: { notes: number }
}

/** Pasta com os filhos resolvidos, montada no cliente a partir da lista plana. */
export interface NoteFolderNode extends NoteFolder {
  children: NoteFolderNode[]
  /** Total da pasta somado ao das descendentes. */
  totalNotes: number
  depth: number
}

/** Campos comuns aos dois shapes. */
interface NoteBase {
  id: string
  title: string
  tags: string[]
  isPinned: boolean
  coverImage: string | null
  noteColor: string | null
  emoji: string | null
  folderId: string | null
  createdAt: string
  updatedAt: string
}

/** Item de `GET /notes`. */
export interface NoteListItem extends NoteBase {
  preview: string
  /** A listagem ainda envia `content`; usamos só como fallback do preview. */
  content?: string
}

/** Resposta de `GET /notes/:id`. */
export interface Note extends NoteBase {
  content: string
  createdById: string
  folder?: NoteFolder | null
}

/**
 * Payload de escrita. `emoji`, `noteColor` e `coverImage` seguem a convenção do
 * contrato: string vazia limpa o campo, chave omitida mantém o valor atual.
 */
export interface NoteWriteInput {
  title?: string
  content?: string
  folderId?: string | null
  tags?: string[]
  emoji?: string
  noteColor?: string
  coverImage?: string
}

export interface NoteFolderInput {
  name: string
  parentId?: string | null
  color?: string
}

export type NoteViewMode = 'grid' | 'list'

export interface NoteFilters {
  folderId?: string
  search?: string
  tag?: string
}
