import api from '../api'
import { mkt } from './marketing-core'

/** Cliente dos Parceiros (M3-B). Rotas em `/marketing/g/:groupId/partners`. */

export type PartnerKind = 'VET_CLINIC' | 'PET_SHOP' | 'INFLUENCER' | 'PRINTER' | 'SUPPLIER' | 'EVENT' | 'NGO' | 'OTHER'
export type PartnerStatus = 'PROSPECT' | 'NEGOTIATING' | 'ACTIVE' | 'PAUSED' | 'ENDED'
export type ContactChannel = 'WHATSAPP' | 'CALL' | 'EMAIL' | 'MEETING' | 'VISIT' | 'OTHER'

export interface Partner {
  id: string
  /** null = parceiro do grupo inteiro */
  companyId: string | null
  name: string
  kind: PartnerKind
  contactName: string | null
  /** Só dígitos com DDI (5567999998888) */
  phone: string | null
  whatsappUrl: string | null
  email: string | null
  instagram: string | null
  instagramUrl: string | null
  city: string | null
  status: PartnerStatus
  lastContactAt: string | null
  nextStep: string | null
  nextStepAt: string | null
  notes: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  activationsCount: number
}

export interface PartnerContact {
  id: string
  partnerId: string
  at: string
  channel: ContactChannel
  note: string
  by: { id: string; name: string } | null
  createdAt: string
}

export interface PartnerFilters {
  status?: PartnerStatus | ''
  kind?: PartnerKind | ''
  companyId?: string | null
  q?: string
  nextStepDue?: boolean
}

export interface PartnerInput {
  companyId?: string | null
  name?: string
  kind?: PartnerKind
  contactName?: string | null
  phone?: string | null
  email?: string | null
  instagram?: string | null
  city?: string | null
  status?: PartnerStatus
  nextStep?: string | null
  /** 'YYYY-MM-DD' ou ISO; '' limpa */
  nextStepAt?: string | null
  notes?: string | null
}

export async function listPartners(groupId: string, filters: PartnerFilters = {}) {
  const params: Record<string, string> = {}
  if (filters.status) params.status = filters.status
  if (filters.kind) params.kind = filters.kind
  if (filters.companyId) params.companyId = filters.companyId
  if (filters.q?.trim()) params.q = filters.q.trim()
  if (filters.nextStepDue) params.nextStepDue = '1'
  const { data } = await api.get<Partner[]>(mkt(groupId, '/partners'), { params })
  return data
}

export async function getPartner(groupId: string, id: string) {
  const { data } = await api.get<Partner>(mkt(groupId, `/partners/${encodeURIComponent(id)}`))
  return data
}

export async function createPartner(groupId: string, input: PartnerInput) {
  const { data } = await api.post<Partner>(mkt(groupId, '/partners'), input)
  return data
}

export async function updatePartner(groupId: string, id: string, input: PartnerInput) {
  const { data } = await api.patch<Partner>(mkt(groupId, `/partners/${encodeURIComponent(id)}`), input)
  return data
}

export async function deletePartner(groupId: string, id: string) {
  await api.delete(mkt(groupId, `/partners/${encodeURIComponent(id)}`))
}

export async function listPartnerContacts(groupId: string, id: string) {
  const { data } = await api.get<PartnerContact[]>(mkt(groupId, `/partners/${encodeURIComponent(id)}/contacts`))
  return data
}

export async function addPartnerContact(
  groupId: string,
  id: string,
  input: { channel: ContactChannel; note: string; at?: string },
) {
  const { data } = await api.post<PartnerContact>(
    mkt(groupId, `/partners/${encodeURIComponent(id)}/contacts`),
    input,
  )
  return data
}

export async function deletePartnerContact(groupId: string, id: string, contactId: string) {
  await api.delete(mkt(groupId, `/partners/${encodeURIComponent(id)}/contacts/${encodeURIComponent(contactId)}`))
}
