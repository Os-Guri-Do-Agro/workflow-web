import { computed, toRaw } from 'vue'
import { useQuery, type QueryClient } from '@tanstack/vue-query'
import { queryClient as appQueryClient } from '@/service/query-client'
import userService, { type AvatarUrl, type MeProfile } from '@/service/user/user-service'
import { meKeys } from '@/composables/useCurrentUser'
import { normalizePersonName, resolveAvatarSrc } from '@/utils/avatar'
import { safeStorage } from '@/utils/safe-storage'

/**
 * Diretório de PESSOAS: quem divide alguma empresa comigo, com a foto de cada
 * uma. É a fonte do `PersonAvatar`, então é aqui que "a foto nova aparece em
 * todo lugar" acontece: trocar ou remover a foto invalida este cache e todo
 * avatar da tela se redesenha.
 *
 * Monta a partir de `GET /user` (usuários visíveis) + `GET /user/me` (eu, que o
 * `/user` pode não trazer). Dois índices:
 * - por id, para quem tem `user.id` no payload (o caso comum);
 * - por nome normalizado (sem acento, sem caixa), para quem só tem o nome, como
 *   as rotinas e os comentários antigos. Nome repetido no diretório NÃO entra no
 *   índice por nome: foto errada é pior do que iniciais.
 *
 * A chave não leva a empresa ativa: o `/user` já responde "quem divide empresa
 * comigo", igual em qualquer empresa. Por isso a troca de empresa não descarta
 * este cache (ver `isPersonScoped` em `service/realtime/session-reset.ts`); o
 * logout descarta (`queryClient.clear()`).
 */

export interface DirectoryPerson {
  id: string
  name: string
  email?: string
  /** Como a API mandou (relativo ou absoluto). Para o `<img>`, use `avatarFor`. */
  avatarUrl: AvatarUrl
}

export interface PersonRef {
  id?: string | null
  name?: string | null
}

export const peopleKeys = {
  all: ['people'] as const,
  directory: ['people', 'directory'] as const,
}

/** Foto muda pouco: 10 min de cache, e quem troca a própria foto invalida. */
const DIRECTORY_STALE_MS = 1000 * 60 * 10

interface DirectoryIndex {
  byId: Map<string, DirectoryPerson>
  /** `null` = nome ambíguo (duas pessoas com o mesmo nome normalizado). */
  byName: Map<string, DirectoryPerson | null>
}

async function fetchDirectory(): Promise<DirectoryPerson[]> {
  // `allSettled`: se só um dos dois falhar, o que voltou já pinta as fotos. O
  // `/user/me` passa pelo cache `['me']` do `useCurrentUser` para não repetir a
  // requisição que o shell já fez (o `fetchQuery` refaz se estiver velho ou
  // invalidado, que é o caso logo depois de trocar a foto).
  const [others, me] = await Promise.allSettled([
    userService.getAllUsers(),
    appQueryClient.fetchQuery({
      queryKey: meKeys.me,
      queryFn: () => userService.getInfoAuth(),
      staleTime: DIRECTORY_STALE_MS,
    }) as Promise<MeProfile>,
  ])
  if (others.status === 'rejected' && me.status === 'rejected') throw others.reason

  const people = new Map<string, DirectoryPerson>()
  const add = (p: { id?: string; name?: string; email?: string; avatarUrl?: AvatarUrl } | null | undefined) => {
    if (!p?.id) return
    people.set(p.id, {
      id: p.id,
      name: p.name ?? '',
      email: p.email,
      avatarUrl: typeof p.avatarUrl === 'string' && p.avatarUrl.trim() ? p.avatarUrl : null,
    })
  }
  if (others.status === 'fulfilled' && Array.isArray(others.value)) others.value.forEach(add)
  // O `/me` vem por último e ganha: é a leitura mais fresca da MINHA foto.
  if (me.status === 'fulfilled') add(me.value)
  return [...people.values()]
}

/**
 * Índices calculados UMA vez por resposta, não por avatar: um board tem
 * centenas de `PersonAvatar` lendo o mesmo array. A chave é o array cru (o
 * `data` do Vue Query chega como proxy readonly, e cada proxy aponta para ele).
 */
const indexCache = new WeakMap<object, DirectoryIndex>()

function indexFor(list: readonly DirectoryPerson[] | undefined): DirectoryIndex | null {
  if (!list) return null
  const raw = toRaw(list) as DirectoryPerson[]
  const cached = indexCache.get(raw)
  if (cached) return cached
  const byId = new Map<string, DirectoryPerson>()
  const byName = new Map<string, DirectoryPerson | null>()
  for (const person of raw) {
    byId.set(person.id, person)
    const key = normalizePersonName(person.name)
    if (!key) continue
    byName.set(key, byName.has(key) ? null : person)
  }
  const index = { byId, byName }
  indexCache.set(raw, index)
  return index
}

export function usePeopleDirectory() {
  const query = useQuery({
    queryKey: peopleKeys.directory,
    queryFn: fetchDirectory,
    staleTime: DIRECTORY_STALE_MS,
    gcTime: DIRECTORY_STALE_MS * 3,
    // Rota pública (board/roadmap por token) não tem sessão: sem isto o
    // diretório pediria `/user` sem token. Lá o avatar fica nas iniciais.
    enabled: !!safeStorage.getItem('token'),
  })

  const index = computed(() => indexFor(query.data.value as readonly DirectoryPerson[] | undefined))

  /** A pessoa no diretório: primeiro pelo id; sem id (ou id desconhecido), pelo nome. */
  function personFor(ref: PersonRef): DirectoryPerson | null {
    const idx = index.value
    if (!idx) return null
    if (ref.id) {
      const byId = idx.byId.get(ref.id)
      if (byId) return byId
    }
    if (ref.name) {
      const byName = idx.byName.get(normalizePersonName(ref.name))
      if (byName) return byName
    }
    return null
  }

  /**
   * URL pronta para o `<img>` (relativo resolvido na origem do front) ou `null`
   * quando a pessoa não tem foto, não está no diretório ou ele ainda carrega.
   * Reativo: dentro de `computed`/template, redesenha quando o diretório muda.
   */
  function avatarFor(ref: PersonRef): string | null {
    return resolveAvatarSrc(personFor(ref)?.avatarUrl)
  }

  return { query, personFor, avatarFor }
}

/**
 * Aplica a MINHA foto nova no cache na hora (todo avatar meu na tela troca sem
 * esperar a rede) e invalida o diretório e o `/me` para o servidor confirmar.
 * Usado depois de `POST`/`DELETE /user/me/avatar`.
 */
export async function applyMyAvatar(client: QueryClient, userId: string | null | undefined, avatarUrl: AvatarUrl) {
  if (userId) {
    client.setQueryData<DirectoryPerson[]>(peopleKeys.directory, (list) =>
      list?.map((p) => (p.id === userId ? { ...p, avatarUrl } : p)),
    )
    client.setQueryData<Record<string, unknown>>(meKeys.me, (me) => (me ? { ...me, avatarUrl } : me))
  }
  await Promise.all([
    client.invalidateQueries({ queryKey: meKeys.me }),
    client.invalidateQueries({ queryKey: peopleKeys.all }),
  ])
}

/** O diretório mudou de gente (alguém entrou numa empresa minha): relê. */
export function invalidatePeopleDirectory(client: QueryClient = appQueryClient) {
  return client.invalidateQueries({ queryKey: peopleKeys.all })
}
