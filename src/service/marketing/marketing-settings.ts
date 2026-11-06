import api from '../api'
import { mkt, type MarketingRole, type MarketingSettings } from './marketing-core'

/**
 * Configurações da ala (fundação): grupo, empresas, equipe e as chaves do
 * Dono. A regra de quem pode o quê mora na API; a tela só esconde o que a
 * pessoa não pode.
 */

export interface MarketingGroupDetail {
  id: string
  name: string
  marketingEnabled: boolean
  createdAt: string
  role: MarketingRole
  settings: MarketingSettings
  companies: {
    companyId: string
    name: string
    color: string | null
    marketingEnabled: boolean
    addedAt: string
  }[]
}

export interface AvailableCompany {
  id: string
  name: string
}

export interface AccessLinkResult {
  link: string
  emailed: boolean
  expiresAt: string
  user: { id: string; name: string; email: string }
}

export interface AddMemberResult {
  member: { userId: string; name: string; email: string; role: MarketingRole; brandIds: string[] }
  created: boolean
  accessLink: AccessLinkResult | null
}

export async function getGroupDetail(groupId: string) {
  const { data } = await api.get<MarketingGroupDetail>(mkt(groupId))
  return data
}

export async function updateGroup(groupId: string, body: { name?: string; marketingEnabled?: boolean }) {
  const { data } = await api.patch(mkt(groupId), body)
  return data
}

export async function updateGroupSettings(groupId: string, settings: Partial<MarketingSettings>) {
  const { data } = await api.patch<MarketingSettings>(mkt(groupId, '/settings'), { settings })
  return data
}

export async function getAvailableCompanies(groupId?: string) {
  const url = groupId ? mkt(groupId, '/companies/available') : '/marketing/companies/available'
  const { data } = await api.get<AvailableCompany[]>(url)
  return data
}

export async function createGroup(body: { name: string; companyIds: string[] }) {
  const { data } = await api.post<{ id: string; name: string }>('/marketing/groups', body)
  return data
}

export async function linkCompany(groupId: string, body: { companyId: string; color?: string }) {
  const { data } = await api.post(mkt(groupId, '/companies'), body)
  return data
}

export async function updateLinkedCompany(
  groupId: string,
  companyId: string,
  body: { marketingEnabled?: boolean; color?: string | null },
) {
  const { data } = await api.patch(mkt(groupId, `/companies/${encodeURIComponent(companyId)}`), body)
  return data
}

export async function unlinkCompany(groupId: string, companyId: string) {
  await api.delete(mkt(groupId, `/companies/${encodeURIComponent(companyId)}`))
}

export async function addMember(
  groupId: string,
  body: { email: string; name?: string; role: MarketingRole; brandIds?: string[]; title?: string },
) {
  const { data } = await api.post<AddMemberResult>(mkt(groupId, '/members'), body)
  return data
}

export async function updateMember(
  groupId: string,
  userId: string,
  body: { role?: MarketingRole; brandIds?: string[]; title?: string | null },
) {
  const { data } = await api.patch(mkt(groupId, `/members/${encodeURIComponent(userId)}`), body)
  return data
}

export async function removeMember(groupId: string, userId: string) {
  await api.delete(mkt(groupId, `/members/${encodeURIComponent(userId)}`))
}

export async function memberAccessLink(groupId: string, userId: string) {
  const { data } = await api.post<AccessLinkResult>(mkt(groupId, `/members/${encodeURIComponent(userId)}/access-link`))
  return data
}
