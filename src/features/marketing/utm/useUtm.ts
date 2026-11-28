import { useMediaQuery } from '@vueuse/core'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import { qrKeys } from '@/composables/useQrCodes'
import {
  createUtm,
  createUtmQr,
  deleteUtm,
  findUtmById,
  getUtmMetrics,
  getUtmOptions,
  listUtmPage,
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
  lookup: (g: string, id: string) => ['marketing', g, 'utm', 'lookup', id] as const,
}

/** Largura em que a lista e o painel cabem lado a lado (a moldura do app já tira 248px). */
export const useWideViewport = () => useMediaQuery('(min-width: 1280px)')

/**
 * A lista da tela em páginas de 200 com "Carregar mais" (R2, C7: acima de
 * 500 a lista antiga cortava calada). O total com o filtro vem em toda página.
 */
export function useUtmPages(groupId: MaybeRefOrGetter<string | null>, filters: MaybeRefOrGetter<UtmFilters>) {
  return useInfiniteQuery({
    queryKey: computed(() => ['marketing', toValue(groupId) ?? '-', 'utm', 'page', toValue(filters)] as const),
    queryFn: ({ pageParam }) => listUtmPage(toValue(groupId)!, toValue(filters), pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

export function useUtmList(groupId: MaybeRefOrGetter<string | null>, filters: MaybeRefOrGetter<UtmFilters>) {
  return useQuery({
    queryKey: computed(() => utmKeys.list(toValue(groupId) ?? '-', toValue(filters))),
    queryFn: () => listUtms(toValue(groupId)!, toValue(filters)),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

/**
 * Abre a UTM de um `?utm=<id>` que a lista (filtrada e limitada a 500 pela
 * API) não trouxe, pelo `GET utm/:id`. Só roda quando `enabled` (a tela liga
 * depois que a lista carregou e não achou a UTM).
 */
export function useUtmLookup(
  groupId: MaybeRefOrGetter<string | null>,
  utmId: MaybeRefOrGetter<string | null>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    queryKey: computed(() => utmKeys.lookup(toValue(groupId) ?? '-', toValue(utmId) ?? '-')),
    queryFn: () => findUtmById(toValue(groupId)!, toValue(utmId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(utmId) && toValue(enabled)),
    staleTime: 15_000,
    retry: false,
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
  // A tela "QR Codes" do Nevo (fora da ala) lista os mesmos QR: criar, editar,
  // desativar ou apagar aqui muda o que ela mostra. Prefixo `['qr']`; só refaz
  // quem está montado, o resto fica velho e é buscado ao abrir.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: utmKeys.all(g()) }),
      qc.invalidateQueries({ queryKey: qrKeys.all }),
    ])
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
