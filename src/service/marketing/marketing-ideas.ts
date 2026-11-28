import api from '../api'
import { mkt } from './marketing-core'
import type { TrashedRef } from './marketing-trash'

/**
 * Cliente das Ideias e trends da ala Marketing (spec
 * docs/specs/2026/q4/q4-2/ala-marketing/m2-rastreio-estrategia.md, "M2-B").
 * Rotas em `/marketing/g/:groupId/ideas`.
 */

export type IdeaKind = 'IDEA' | 'TREND' | 'REFERENCE'
export type IdeaStatus = 'OPEN' | 'CONVERTED' | 'ARCHIVED'

export interface MarketingIdea {
  id: string
  /** Marca (null = do grupo inteiro) */
  companyId: string | null
  title: string
  description: string | null
  referenceUrl: string | null
  /** Rede de referência (mesma lista do card) */
  network: string | null
  kind: IdeaKind
  tags: string[]
  status: IdeaStatus
  convertedCardId: string | null
  likesCount: number
  likedByMe: boolean
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  /** O servidor já resolveu: autor ou Admin edita; Admin (ou autor Editor) apaga */
  canEdit: boolean
  canDelete: boolean
}

export interface IdeaFilters {
  /** Padrão da API: tudo menos arquivadas. `ALL` traz também as arquivadas */
  status?: IdeaStatus | 'ALL'
  kind?: IdeaKind
  companyId?: string
  tag?: string
  q?: string
  sort?: 'likes' | 'recent'
}

export interface IdeaInput {
  title: string
  description?: string | null
  referenceUrl?: string | null
  network?: string | null
  kind?: IdeaKind
  tags?: string[]
  companyId?: string | null
}

export interface ConvertIdeaInput {
  companyId?: string | null
  kind?: string
  title?: string
}

export interface ConvertIdeaResult {
  idea: MarketingIdea
  card: { id: string; title: string; status: string; companyId: string }
}

function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>
}

export async function listIdeas(groupId: string, filters: IdeaFilters = {}) {
  const { data } = await api.get<MarketingIdea[]>(mkt(groupId, '/ideas'), { params: clean(filters) })
  return data
}

export async function createIdea(groupId: string, input: IdeaInput) {
  const { data } = await api.post<MarketingIdea>(mkt(groupId, '/ideas'), input)
  return data
}

export async function updateIdea(groupId: string, ideaId: string, input: Partial<IdeaInput>) {
  const { data } = await api.patch<MarketingIdea>(mkt(groupId, `/ideas/${encodeURIComponent(ideaId)}`), input)
  return data
}

export async function likeIdea(groupId: string, ideaId: string, liked: boolean) {
  const { data } = await api.post<{ id: string; liked: boolean; likesCount: number }>(
    mkt(groupId, `/ideas/${encodeURIComponent(ideaId)}/like`),
    { liked },
  )
  return data
}

export async function convertIdea(groupId: string, ideaId: string, input: ConvertIdeaInput = {}) {
  const { data } = await api.post<ConvertIdeaResult>(
    mkt(groupId, `/ideas/${encodeURIComponent(ideaId)}/convert`),
    input,
  )
  return data
}

export async function archiveIdea(groupId: string, ideaId: string, archived: boolean) {
  const { data } = await api.post<MarketingIdea>(mkt(groupId, `/ideas/${encodeURIComponent(ideaId)}/archive`), {
    archived,
  })
  return data
}

/** Manda para a lixeira (R2, C6): `trashed` serve ao "Desfazer". */
export async function deleteIdea(groupId: string, ideaId: string) {
  const { data } = await api.delete<{ ok: boolean; trashed?: TrashedRef }>(
    mkt(groupId, `/ideas/${encodeURIComponent(ideaId)}`),
  )
  return data
}
