import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
import api from '@/service/api'

/**
 * Usuário logado (GET /user/me), cacheado via TanStack Query com a chave ['me'].
 *
 * Fonte única para gatear as "ferramentas premium" na UI (QR, Meu tempo, widget
 * do timer). `isFluvio` é `false` enquanto carrega — o front só ESCONDE o que é
 * gated; o backend é quem barra de verdade (403 sem o flag).
 */
export interface CurrentUser {
  id: string
  name?: string
  email?: string
  isFluvio?: boolean
  [key: string]: unknown
}

export const meKeys = {
  me: ['me'] as const,
}

export function useCurrentUser() {
  // staleTime alto: o flag muda raramente; evita refetch a cada montagem de nav.
  const query = useQuery({
    queryKey: meKeys.me,
    queryFn: async () => {
      const { data } = await api.get<CurrentUser>('/user/me')
      return data
    },
    staleTime: 1000 * 60 * 10,
    // Só busca se houver sessão (senão o 401 desloga em páginas públicas).
    enabled: !!localStorage.getItem('token'),
  })

  const me = query.data
  const isFluvio = computed<boolean>(() => me.value?.isFluvio === true)

  return { query, me, isFluvio }
}
