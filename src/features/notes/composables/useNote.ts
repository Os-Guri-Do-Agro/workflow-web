import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import notesService from '@/service/notes/notes-service'
import { noteKeys } from './useNotes'

/**
 * Detalhe de uma nota. Desabilitado para a rota `/notes/new`, que não tem id.
 *
 * `staleTime: Infinity` é deliberado: enquanto o editor está aberto, a fonte da
 * verdade é o que o usuário digitou, não o cache. Um refetch em background
 * (troca de aba, reconexão) sobrescreveria texto não salvo.
 */
export function useNote(id: MaybeRefOrGetter<string | undefined>) {
  const noteId = computed(() => {
    const value = toValue(id)
    return value && value !== 'new' ? value : undefined
  })

  return useQuery({
    queryKey: computed(() => noteKeys.detail(noteId.value ?? '')),
    queryFn: () => notesService.getNote(noteId.value as string),
    enabled: computed(() => !!noteId.value),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}
