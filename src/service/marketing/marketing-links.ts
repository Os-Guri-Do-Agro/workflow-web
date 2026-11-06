import api from '../api'
import { mkt } from './marketing-core'

/**
 * Cliente dos Links de trabalho (cofre da ala, M1-B). A listagem NUNCA traz a
 * senha: só `hasSecret`. O valor sai pelo `revealLink`, que fica registrado no
 * histórico da ala.
 */

export interface MarketingLink {
  id: string
  /** Marca; null = link do grupo inteiro */
  companyId: string | null
  title: string
  url: string
  category: string
  username: string | null
  hasSecret: boolean
  notes: string | null
  isFavorite: boolean
  createdBy: { id: string; name: string } | null
  canDelete: boolean
  createdAt: string
  updatedAt: string
}

export interface LinkInput {
  title?: string
  url?: string
  category?: string
  companyId?: string | null
  username?: string | null
  /** Texto troca, null apaga, ausente mantém */
  secret?: string | null
  notes?: string | null
}

export async function listLinks(
  groupId: string,
  filter: { category?: string; companyId?: string | null; q?: string } = {},
): Promise<MarketingLink[]> {
  const params: Record<string, string> = {}
  if (filter.category) params.category = filter.category
  if (filter.companyId) params.companyId = filter.companyId
  if (filter.q) params.q = filter.q
  const { data } = await api.get<MarketingLink[]>(mkt(groupId, '/links'), { params })
  return data
}

export async function createLink(groupId: string, input: LinkInput): Promise<MarketingLink> {
  const { data } = await api.post<MarketingLink>(mkt(groupId, '/links'), input)
  return data
}

export async function updateLink(groupId: string, linkId: string, input: LinkInput): Promise<MarketingLink> {
  const { data } = await api.patch<MarketingLink>(mkt(groupId, `/links/${encodeURIComponent(linkId)}`), input)
  return data
}

export async function deleteLink(groupId: string, linkId: string): Promise<void> {
  await api.delete(mkt(groupId, `/links/${encodeURIComponent(linkId)}`))
}

export async function revealLink(groupId: string, linkId: string): Promise<string> {
  const { data } = await api.post<{ id: string; secret: string }>(
    mkt(groupId, `/links/${encodeURIComponent(linkId)}/reveal`),
  )
  return data.secret
}

export async function favoriteLink(groupId: string, linkId: string, favorite: boolean): Promise<boolean> {
  const { data } = await api.post<{ id: string; isFavorite: boolean }>(
    mkt(groupId, `/links/${encodeURIComponent(linkId)}/favorite`),
    { favorite },
  )
  return data.isFavorite
}
