import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import notesService from '@/service/notes/notes-service'
import type {
  NoteFilters,
  NoteFolder,
  NoteFolderInput,
  NoteFolderNode,
  NoteListItem,
} from '../types'

export const noteKeys = {
  all: ['notes'] as const,
  lists: ['notes', 'list'] as const,
  list: (filters: NoteFilters) => ['notes', 'list', filters] as const,
  detail: (id: string) => ['notes', 'detail', id] as const,
  folders: ['notes', 'folders'] as const,
}

export function useNotesList(filters: MaybeRefOrGetter<NoteFilters>) {
  const current = computed(() => toValue(filters))

  return useQuery({
    queryKey: computed(() => noteKeys.list(current.value)),
    queryFn: () => notesService.getNotes(current.value),
    staleTime: 1000 * 30,
    // Mantém a lista anterior visível enquanto a busca nova carrega, em vez de
    // piscar skeleton a cada tecla.
    placeholderData: (previous) => previous,
  })
}

export function useNoteFolders() {
  return useQuery({
    queryKey: noteKeys.folders,
    queryFn: () => notesService.getFolders(),
    staleTime: 1000 * 60 * 2,
  })
}

/**
 * Monta a árvore a partir da lista plana e soma o total de cada subárvore.
 * Pasta cujo `parentId` aponta para uma pasta inexistente é tratada como raiz,
 * para nunca sumir da UI por causa de dado inconsistente.
 */
export function buildFolderTree(folders: NoteFolder[]): NoteFolderNode[] {
  const byId = new Map<string, NoteFolderNode>()
  for (const folder of folders) {
    byId.set(folder.id, { ...folder, children: [], totalNotes: folder._count?.notes ?? 0, depth: 0 })
  }

  const roots: NoteFolderNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  }

  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

  // Profundidade e soma acumulada, com proteção contra ciclo (o backend não
  // valida ciclo em `parentId`, então uma pasta pode ser ancestral de si mesma).
  const visited = new Set<string>()
  const resolve = (node: NoteFolderNode, depth: number): number => {
    if (visited.has(node.id)) {
      node.children = []
      return node.totalNotes
    }
    visited.add(node.id)
    node.depth = depth
    node.children.sort((a, b) => collator.compare(a.name, b.name))
    for (const child of node.children) node.totalNotes += resolve(child, depth + 1)
    return node.totalNotes
  }

  roots.sort((a, b) => collator.compare(a.name, b.name))
  for (const root of roots) resolve(root, 0)
  return roots
}

export function useNoteMutations() {
  const queryClient = useQueryClient()

  const invalidateLists = () => queryClient.invalidateQueries({ queryKey: noteKeys.lists })
  const invalidateFolders = () => queryClient.invalidateQueries({ queryKey: noteKeys.folders })

  /** Atualiza um item em todas as listas em cache, sem esperar refetch. */
  const patchInLists = (id: string, patch: Partial<NoteListItem>) => {
    queryClient.setQueriesData<NoteListItem[]>({ queryKey: noteKeys.lists }, (old) =>
      old?.map((note) => (note.id === id ? { ...note, ...patch } : note)),
    )
  }

  const togglePin = useMutation({
    mutationFn: (note: NoteListItem) => notesService.togglePin(note.id),
    onMutate: async (note) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists })
      const previous = !!note.isPinned
      patchInLists(note.id, { isPinned: !previous })
      return { id: note.id, previous }
    },
    onError: (_err, _note, context) => {
      if (context) patchInLists(context.id, { isPinned: context.previous })
    },
    // A ordenação de fixadas é do servidor, então revalida ao terminar.
    onSettled: invalidateLists,
  })

  const moveToFolder = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      notesService.updateNote(id, { folderId }),
    onMutate: async ({ id, folderId }) => {
      await queryClient.cancelQueries({ queryKey: noteKeys.lists })
      const snapshot = queryClient.getQueriesData<NoteListItem[]>({ queryKey: noteKeys.lists })
      patchInLists(id, { folderId })
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => Promise.all([invalidateLists(), invalidateFolders()]),
  })

  const removeNote = useMutation({
    mutationFn: (id: string) => notesService.deleteNote(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) })
      return Promise.all([invalidateLists(), invalidateFolders()])
    },
  })

  const createFolder = useMutation({
    mutationFn: (input: NoteFolderInput) => notesService.createFolder(input),
    onSuccess: invalidateFolders,
  })

  const updateFolder = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<NoteFolderInput> }) =>
      notesService.updateFolder(id, input),
    onSuccess: invalidateFolders,
  })

  const removeFolder = useMutation({
    mutationFn: (id: string) => notesService.deleteFolder(id),
    // Excluir pasta solta as notas dela, então a listagem também muda.
    onSuccess: () => Promise.all([invalidateFolders(), invalidateLists()]),
  })

  return {
    togglePin,
    moveToFolder,
    removeNote,
    createFolder,
    updateFolder,
    removeFolder,
  }
}
