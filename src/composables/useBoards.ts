import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import boardsService, {
  type CreateBoardInput,
  type UpdateBoardInput,
} from '@/service/boards/boards-service'

export const boardKeys = {
  all: ['boards'] as const,
  list: ['boards', 'list'] as const,
  detail: (id: string) => ['boards', 'detail', id] as const,
}

export function useBoards() {
  return useQuery({
    queryKey: boardKeys.list,
    queryFn: () => boardsService.list(),
    staleTime: 1000 * 60,
  })
}

export function useBoard(id: MaybeRefOrGetter<string | undefined>) {
  const boardId = computed(() => toValue(id))

  return useQuery({
    queryKey: computed(() => boardKeys.detail(boardId.value ?? '')),
    queryFn: () => boardsService.get(boardId.value ?? ''),
    enabled: computed(() => !!boardId.value),
    staleTime: 1000 * 60,
  })
}

export function useBoardMutations() {
  const queryClient = useQueryClient()

  const invalidateBoards = () => queryClient.invalidateQueries({ queryKey: boardKeys.all })

  const createBoard = useMutation({
    mutationFn: (input: CreateBoardInput) => boardsService.create(input),
    onSuccess: invalidateBoards,
  })

  const updateBoard = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBoardInput }) =>
      boardsService.update(id, input),
    onSuccess: (board) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: boardKeys.list }),
        queryClient.invalidateQueries({ queryKey: boardKeys.detail(board.id) }),
      ]),
  })

  const duplicateBoard = useMutation({
    mutationFn: (id: string) => boardsService.duplicate(id),
    onSuccess: invalidateBoards,
  })

  const removeBoard = useMutation({
    mutationFn: (id: string) => boardsService.remove(id),
    onSuccess: invalidateBoards,
  })

  return {
    createBoard,
    updateBoard,
    duplicateBoard,
    removeBoard,
  }
}
