import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasSession } from '@/composables/useSession'
import realtimeService from '@/service/realtime/realtime-service'
import {
  getMarketingMe,
  getMarketingMembers,
  hasMarketingRole,
  type MarketingBrand,
  type MarketingRole,
} from '@/service/marketing/marketing-core'
import { safeStorage } from '@/utils/safe-storage'

/**
 * Estado da ala Marketing no front (spec 00-fundacao.md).
 *
 * Convenção de chave do Vue Query: TUDO da ala começa com
 * `['marketing', groupId, '<área>', ...]` (ex.: `['marketing', g, 'cards', filtros]`).
 * O socket `marketing:changed` invalida `['marketing', groupId]` inteiro, então
 * uma área nova não precisa fazer nada para atualizar em tempo real.
 * `['marketing', 'me']` é a exceção (não tem grupo).
 */

const GROUP_KEY = 'marketing.group'
const storedGroup = ref<string | null>(safeStorage.getItem(GROUP_KEY))

export const marketingKeys = {
  me: ['marketing', 'me'] as const,
  group: (groupId: string) => ['marketing', groupId] as const,
  members: (groupId: string) => ['marketing', groupId, 'members'] as const,
}

/** Grupos da pessoa. Sem sessão não chama nada; sem a ala na API vem `available: false`. */
export function useMarketingMe() {
  return useQuery({
    queryKey: marketingKeys.me,
    queryFn: getMarketingMe,
    enabled: hasSession,
    staleTime: 60_000,
  })
}

export function useMarketing() {
  const me = useMarketingMe()
  const route = useRoute()
  const router = useRouter()

  const groups = computed(() => me.data.value?.groups ?? [])
  const group = computed(
    () => groups.value.find((g) => g.id === storedGroup.value) ?? groups.value[0] ?? null,
  )
  const groupId = computed(() => group.value?.id ?? null)
  const role = computed<MarketingRole | null>(() => group.value?.role ?? null)
  const brands = computed<MarketingBrand[]>(() => group.value?.brands ?? [])
  const permissions = computed(() => group.value?.permissions ?? null)
  const settings = computed(() => group.value?.settings ?? null)
  /** A pessoa tem a ala (algum grupo) e a API tem a ala. */
  const hasAccess = computed(() => !!me.data.value?.available && groups.value.length > 0)

  function selectGroup(id: string) {
    storedGroup.value = id
    safeStorage.setItem(GROUP_KEY, id)
  }

  /** Papel >= `min` no grupo ativo. */
  function can(min: MarketingRole) {
    return hasMarketingRole(role.value, min)
  }

  /**
   * Filtro de marca da tela, na URL (`?marca=<companyId>`), para link colado
   * abrir igual. `null` = todas as marcas que a pessoa vê.
   */
  const brandFilter = computed<string | null>(() => {
    const q = route.query.marca
    return typeof q === 'string' && brands.value.some((b) => b.companyId === q) ? q : null
  })

  function setBrandFilter(companyId: string | null) {
    const query = { ...route.query }
    if (companyId) query.marca = companyId
    else delete query.marca
    void router.replace({ query })
  }

  function brandById(companyId: string | null | undefined) {
    return brands.value.find((b) => b.companyId === companyId)
  }

  return {
    me,
    groups,
    group,
    groupId,
    role,
    brands,
    permissions,
    settings,
    hasAccess,
    selectGroup,
    can,
    brandFilter,
    setBrandFilter,
    brandById,
  }
}

/** Equipe do grupo (para responsável, menção, avatar). */
export function useMarketingMembers(groupId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => marketingKeys.members(toValue(groupId) ?? '-')),
    queryFn: () => getMarketingMembers(toValue(groupId)!),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 5 * 60_000,
  })
}

/**
 * Tempo real: montado UMA vez no MarketingLayout. Qualquer mudança no grupo
 * (vinda de outra pessoa ou de outra aba) invalida as queries do grupo.
 */
export function useMarketingRealtime() {
  const queryClient = useQueryClient()
  const unsubscribe = realtimeService.connect({
    marketingChanged: (payload) => {
      void queryClient.invalidateQueries({ queryKey: marketingKeys.group(payload.groupId) })
      // Grupo (configurações, marcas, nome) ou membro (papel, marcas visíveis):
      // o `/marketing/me` dos OUTROS membros também muda (papel, `can()`,
      // `viewerSeesFinance`), e ele não mora sob a chave do grupo.
      if (payload.entityType === 'group' || payload.entityType === 'member') {
        void queryClient.invalidateQueries({ queryKey: marketingKeys.me })
      }
    },
    reconnect: () => {
      void queryClient.invalidateQueries({ queryKey: ['marketing'] })
    },
  })
  onScopeDispose(() => unsubscribe?.())
}
