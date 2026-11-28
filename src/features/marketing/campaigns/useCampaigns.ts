import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasSession } from '@/composables/useSession'
import {
  changeCampaignStatus,
  createCampaign,
  deleteCampaign,
  getCampaign,
  linkCampaignCard,
  listCampaigns,
  listLinkableCards,
  unlinkCampaignCard,
  updateCampaign,
  updateCampaignResults,
  type CampaignFilters,
  type CampaignInput,
  type CampaignPatch,
  type CampaignResultsInput,
  type CampaignStatus,
} from '@/service/marketing/marketing-campaigns'
import { CAMPAIGN_STATUS_ORDER } from './campaign-labels'

/**
 * Campanhas. Chaves: `['marketing', groupId, 'campaigns', 'list', filtros]` e
 * `['marketing', groupId, 'campaigns', 'detail', id]` (o socket invalida o
 * grupo inteiro). Filtros e o painel aberto moram na URL: `?q=`, `?status=`
 * (minúsculo, igual ao status) e `?campanha=<id>`.
 */

function one(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function useCampaignFilters(brandFilter: MaybeRefOrGetter<string | null>) {
  const route = useRoute()
  const router = useRouter()

  const q = computed(() => one(route.query.q))
  const status = computed<CampaignStatus | null>(() => {
    const raw = one(route.query.status).toUpperCase()
    return (CAMPAIGN_STATUS_ORDER as string[]).includes(raw) ? (raw as CampaignStatus) : null
  })
  const openId = computed(() => one(route.query.campanha) || null)

  const apiFilters = computed<CampaignFilters>(() => ({
    status: status.value ?? undefined,
    companyId: toValue(brandFilter) ?? undefined,
    q: q.value || undefined,
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
    status,
    openId,
    apiFilters,
    setQ: (value: string) => patch({ q: value.trim() || null }),
    setStatus: (value: CampaignStatus | null) => patch({ status: value ? value.toLowerCase() : null }),
    open: (id: string) => patch({ campanha: id }),
    close: () => patch({ campanha: null }),
    clear: () => patch({ q: null, status: null }),
  }
}

export function useCampaignsQuery(groupId: MaybeRefOrGetter<string | null>, filters: MaybeRefOrGetter<CampaignFilters>) {
  return useQuery({
    queryKey: computed(() => ['marketing', toValue(groupId) ?? '-', 'campaigns', 'list', toValue(filters)] as const),
    queryFn: () => listCampaigns(toValue(groupId)!, toValue(filters)),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

export function useCampaignDetail(groupId: MaybeRefOrGetter<string | null>, campaignId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(
      () => ['marketing', toValue(groupId) ?? '-', 'campaigns', 'detail', toValue(campaignId) ?? '-'] as const,
    ),
    queryFn: () => getCampaign(toValue(groupId)!, toValue(campaignId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(campaignId)),
    staleTime: 10_000,
    retry: (count, error) => {
      // 404 é "não existe ou não é seu": repetir não muda nada.
      const status = (error as { response?: { status?: number } })?.response?.status
      return status === 404 || status === 403 ? false : count < 2
    },
  })
}

export function useLinkableCards(
  groupId: MaybeRefOrGetter<string | null>,
  campaignId: MaybeRefOrGetter<string | null>,
  search: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    queryKey: computed(
      () =>
        ['marketing', toValue(groupId) ?? '-', 'campaigns', 'linkable', toValue(campaignId) ?? '-', toValue(search)] as const,
    ),
    queryFn: () => listLinkableCards(toValue(groupId)!, toValue(campaignId)!, toValue(search)),
    enabled: computed(() => hasSession.value && !!toValue(groupId) && !!toValue(campaignId) && toValue(enabled)),
    staleTime: 5_000,
  })
}

export function useCampaignActions(groupId: MaybeRefOrGetter<string | null>) {
  const queryClient = useQueryClient()
  const gid = () => toValue(groupId)!
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['marketing', gid(), 'campaigns'] })

  const create = useMutation({
    mutationFn: (input: CampaignInput) => createCampaign(gid(), input),
    onSuccess: refresh,
  })
  const update = useMutation({
    mutationFn: (vars: { id: string; input: CampaignPatch }) => updateCampaign(gid(), vars.id, vars.input),
    onSuccess: refresh,
  })
  const saveResults = useMutation({
    mutationFn: (vars: { id: string; input: CampaignResultsInput }) => updateCampaignResults(gid(), vars.id, vars.input),
    onSuccess: refresh,
  })
  const changeStatus = useMutation({
    mutationFn: (vars: { id: string; status: CampaignStatus }) => changeCampaignStatus(gid(), vars.id, vars.status),
    // Em 409/403 a tela precisa do estado real do servidor, não do que ela achava.
    onSettled: refresh,
  })
  const linkCard = useMutation({
    mutationFn: (vars: { id: string; cardId: string }) => linkCampaignCard(gid(), vars.id, vars.cardId),
    onSuccess: refresh,
  })
  const unlinkCard = useMutation({
    mutationFn: (vars: { id: string; cardId: string }) => unlinkCampaignCard(gid(), vars.id, vars.cardId),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteCampaign(gid(), id),
    onSuccess: refresh,
  })

  return { create, update, saveResults, changeStatus, linkCard, unlinkCard, remove }
}
