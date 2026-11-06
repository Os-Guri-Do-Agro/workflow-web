import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasSession } from '@/composables/useSession'
import {
  archiveIdea,
  convertIdea,
  createIdea,
  deleteIdea,
  likeIdea,
  listIdeas,
  updateIdea,
  type ConvertIdeaInput,
  type IdeaFilters,
  type IdeaInput,
  type IdeaKind,
  type IdeaStatus,
  type MarketingIdea,
} from '@/service/marketing/marketing-ideas'

/**
 * Ideias e trends. Chave do Vue Query: `['marketing', groupId, 'ideas', filtros]`
 * (o socket `marketing:changed` invalida o grupo inteiro).
 *
 * Filtros moram na URL, para link colado abrir igual: `?q=`, `?tipo=`,
 * `?status=` (abertas | viraram | arquivadas), `?tag=` e `?ordem=` (curtidas
 * | recentes). A marca vem de `?marca=`, do layout.
 */

export type IdeaStatusTab = 'abertas' | 'viraram' | 'arquivadas'

const STATUS_BY_TAB: Record<IdeaStatusTab, IdeaStatus | 'ALL'> = {
  abertas: 'OPEN',
  viraram: 'CONVERTED',
  arquivadas: 'ARCHIVED',
}

const KIND_BY_URL: Record<string, IdeaKind> = {
  ideias: 'IDEA',
  trends: 'TREND',
  referencias: 'REFERENCE',
}
export const URL_BY_KIND: Record<IdeaKind, string> = {
  IDEA: 'ideias',
  TREND: 'trends',
  REFERENCE: 'referencias',
}

function one(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function useIdeaFilters(brandFilter: MaybeRefOrGetter<string | null>) {
  const route = useRoute()
  const router = useRouter()

  const q = computed(() => one(route.query.q))
  const tag = computed(() => one(route.query.tag))
  const kind = computed<IdeaKind | null>(() => KIND_BY_URL[one(route.query.tipo)] ?? null)
  const tab = computed<IdeaStatusTab>(() => {
    const s = one(route.query.status)
    return s === 'viraram' || s === 'arquivadas' ? s : 'abertas'
  })
  const sort = computed<'likes' | 'recent'>(() => (one(route.query.ordem) === 'recentes' ? 'recent' : 'likes'))

  const apiFilters = computed<IdeaFilters>(() => ({
    status: STATUS_BY_TAB[tab.value],
    kind: kind.value ?? undefined,
    companyId: toValue(brandFilter) ?? undefined,
    tag: tag.value || undefined,
    q: q.value || undefined,
    sort: sort.value,
  }))

  function patch(values: Record<string, string | null>) {
    const query = { ...route.query }
    for (const [key, value] of Object.entries(values)) {
      if (value) query[key] = value
      else delete query[key]
    }
    void router.replace({ query })
  }

  return {
    q,
    tag,
    kind,
    tab,
    sort,
    apiFilters,
    setQ: (value: string) => patch({ q: value.trim() || null }),
    setTag: (value: string | null) => patch({ tag: value }),
    setKind: (value: IdeaKind | null) => patch({ tipo: value ? URL_BY_KIND[value] : null }),
    setTab: (value: IdeaStatusTab) => patch({ status: value === 'abertas' ? null : value }),
    setSort: (value: 'likes' | 'recent') => patch({ ordem: value === 'recent' ? 'recentes' : null }),
    clear: () => patch({ q: null, tag: null, tipo: null }),
  }
}

export function useIdeasQuery(groupId: MaybeRefOrGetter<string | null>, filters: MaybeRefOrGetter<IdeaFilters>) {
  return useQuery({
    queryKey: computed(() => ['marketing', toValue(groupId) ?? '-', 'ideas', toValue(filters)] as const),
    queryFn: () => listIdeas(toValue(groupId)!, toValue(filters)),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

export function useIdeaActions(groupId: MaybeRefOrGetter<string | null>) {
  const queryClient = useQueryClient()
  const gid = () => toValue(groupId)!
  const keyPrefix = () => ['marketing', gid(), 'ideas'] as const
  const refresh = () => queryClient.invalidateQueries({ queryKey: keyPrefix() })

  /** Troca a ideia nas listas em cache sem esperar o servidor (curtir é instantâneo). */
  function patchCached(ideaId: string, change: (idea: MarketingIdea) => MarketingIdea) {
    queryClient.setQueriesData<MarketingIdea[]>({ queryKey: keyPrefix() }, (old) =>
      old?.map((idea) => (idea.id === ideaId ? change(idea) : idea)),
    )
  }

  const create = useMutation({
    mutationFn: (input: IdeaInput) => createIdea(gid(), input),
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: (vars: { id: string; input: Partial<IdeaInput> }) => updateIdea(gid(), vars.id, vars.input),
    onSuccess: refresh,
  })
  const like = useMutation({
    mutationFn: (vars: { id: string; liked: boolean }) => likeIdea(gid(), vars.id, vars.liked),
    onMutate: (vars) => {
      patchCached(vars.id, (idea) => ({
        ...idea,
        likedByMe: vars.liked,
        likesCount: Math.max(0, idea.likesCount + (vars.liked ? 1 : -1)),
      }))
    },
    onError: refresh,
    onSuccess: (data) => {
      patchCached(data.id, (idea) => ({ ...idea, likedByMe: data.liked, likesCount: data.likesCount }))
    },
  })
  const convert = useMutation({
    mutationFn: (vars: { id: string; input: ConvertIdeaInput }) => convertIdea(gid(), vars.id, vars.input),
    onSettled: refresh,
  })
  const archive = useMutation({
    mutationFn: (vars: { id: string; archived: boolean }) => archiveIdea(gid(), vars.id, vars.archived),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteIdea(gid(), id),
    onSuccess: refresh,
  })

  return { create, update, like, convert, archive, remove }
}
