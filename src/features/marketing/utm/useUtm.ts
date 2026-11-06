import { useMediaQuery } from '@vueuse/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  createUtm,
  createUtmQr,
  deleteUtm,
  getUtmMetrics,
  getUtmOptions,
  listUtms,
  setUtmActive,
  updateUtm,
  type UtmFilters,
  type UtmInput,
  type UtmPatch,
} from '@/service/marketing/marketing-utm'

/**
 * Chaves SEMPRE `['marketing', groupId, 'utm', ...]`: o socket
 * `marketing:changed` invalida o grupo inteiro e a tela atualiza sozinha.
 */
export const utmKeys = {
  all: (g: string) => ['marketing', g, 'utm'] as const,
  list: (g: string, f: UtmFilters) => ['marketing', g, 'utm', 'list', f] as const,
  options: (g: string) => ['marketing', g, 'utm', 'options'] as const,
  metrics: (g: string, id: string) => ['marketing', g, 'utm', 'metrics', id] as const,
}

/** Largura em que a lista e o painel cabem lado a lado (a moldura do app já tira 248px). */
export const useWideViewport = () => useMediaQuery('(min-width: 1280px)')

export function useUtmList(groupId: MaybeRefOrGetter<string | null>, filters: MaybeRefOrGetter<UtmFilters>) {
  return useQuery({
    queryKey: computed(() => utmKeys.list(toValue(groupId) ?? '-', toValue(filters))),
    queryFn: () => listUtms(toValue(groupId)!, toValue(filters)),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

export function useUtmOptions(groupId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => utmKeys.options(toValue(groupId) ?? '-')),
    queryFn: () => getUtmOptions(toValue(groupId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 60_000,
  })
}

export function useUtmMetrics(groupId: MaybeRefOrGetter<string | null>, utmId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => utmKeys.metrics(toValue(groupId) ?? '-', toValue(utmId) ?? '-')),
    queryFn: () => getUtmMetrics(toValue(groupId)!, toValue(utmId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(utmId)),
    staleTime: 15_000,
  })
}

export function useUtmMutations(groupId: MaybeRefOrGetter<string | null>) {
  const qc = useQueryClient()
  const g = () => toValue(groupId)!
  const refresh = () => qc.invalidateQueries({ queryKey: utmKeys.all(g()) })
  return {
    create: useMutation({ mutationFn: (input: UtmInput) => createUtm(g(), input), onSuccess: refresh }),
    update: useMutation({
      mutationFn: (v: { id: string; patch: UtmPatch }) => updateUtm(g(), v.id, v.patch),
      onSuccess: refresh,
    }),
    setActive: useMutation({
      mutationFn: (v: { id: string; active: boolean }) => setUtmActive(g(), v.id, v.active),
      onSuccess: refresh,
    }),
    createQr: useMutation({
      mutationFn: (v: { id: string; style?: Record<string, string> }) => createUtmQr(g(), v.id, v.style),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => deleteUtm(g(), id), onSuccess: refresh }),
  }
}
