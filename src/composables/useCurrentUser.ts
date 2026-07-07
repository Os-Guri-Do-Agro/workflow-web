import { useQuery } from '@tanstack/vue-query'
import api from '@/service/api'

/**
 * Usuário logado (GET /user/me), cacheado via TanStack Query com a chave ['me'].
 *
 * As ferramentas (QR, Meu tempo, timer) não têm mais gate por-usuário: o acesso
 * é por membership (estar vinculado a uma empresa). O backend barra por role/escopo.
 */
export interface CurrentUser {
  id: string
  name?: string
  email?: string
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

  return { query, me }
}
