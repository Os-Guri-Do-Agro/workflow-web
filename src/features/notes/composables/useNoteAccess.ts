import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import notesService from '@/service/notes/notes-service'
import shareService from '@/service/share/share-service'
import type { NoteAccessLevel } from '../types'
import { noteKeys } from './useNotes'

export const accessKeys = {
  people: (noteId: string) => ['notes', 'access', noteId] as const,
  links: (noteId: string) => ['notes', 'share-links', noteId] as const,
}

/** Acesso (pessoas + links) de uma nota. Só faz sentido para o dono. */
export function useNoteAccess(noteId: MaybeRefOrGetter<string | null>, enabled: MaybeRefOrGetter<boolean>) {
  const id = computed(() => toValue(noteId))
  const on = computed(() => !!id.value && !!toValue(enabled))
  const queryClient = useQueryClient()

  const people = useQuery({
    queryKey: computed(() => accessKeys.people(id.value ?? '')),
    queryFn: () => notesService.getAccess(id.value as string),
    enabled: on,
    staleTime: 1000 * 15,
  })

  const links = useQuery({
    queryKey: computed(() => accessKeys.links(id.value ?? '')),
    queryFn: () => notesService.getShareLinks(id.value as string),
    enabled: on,
    staleTime: 1000 * 15,
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accessKeys.people(id.value ?? '') }),
      queryClient.invalidateQueries({ queryKey: accessKeys.links(id.value ?? '') }),
      queryClient.invalidateQueries({ queryKey: noteKeys.lists }),
    ])

  const grant = useMutation({
    mutationFn: ({ userId, level }: { userId: string; level: NoteAccessLevel }) =>
      notesService.grantAccess(id.value as string, userId, level),
    onSuccess: invalidate,
  })

  const changeLevel = useMutation({
    mutationFn: ({ userId, level }: { userId: string; level: NoteAccessLevel }) =>
      notesService.updateAccess(id.value as string, userId, level),
    onSuccess: invalidate,
  })

  const revoke = useMutation({
    mutationFn: (userId: string) => notesService.revokeAccess(id.value as string, userId),
    onSuccess: invalidate,
  })

  const createLink = useMutation({
    mutationFn: (accessLevel: NoteAccessLevel) =>
      notesService.createShareLink(id.value as string, accessLevel),
    onSuccess: invalidate,
  })

  const revokeLink = useMutation({
    mutationFn: (token: string) => shareService.revokeNoteLink(token),
    onSuccess: invalidate,
  })

  return { people, links, grant, changeLevel, revoke, createLink, revokeLink }
}
