import axios from 'axios'
import api from '../api'
import { mkt } from './marketing-core'

/**
 * Cliente da M2-A: UTMs e QR (spec m2-rastreio-estrategia.md). Uma UTM da ala é
 * um link do encurtador mais o contexto de marketing; o QR, quando existe,
 * aponta para o LINK CURTO (por isso trocar o destino não invalida a placa).
 */

export interface UtmShortLink {
  id: string
  code: string
  shortUrl: string
  targetUrl: string
  finalUrl: string
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  clickCount: number
  active: boolean
}

export interface UtmQr {
  id: string
  code: string
  scanCount: number
  active: boolean
  style: Record<string, string> | null
  /** O que o QR desenha: `/q/<code>` */
  redirectUrl: string
  imageUrl: string
}

export interface MarketingUtm {
  id: string
  companyId: string
  placement: string
  campaign: { id: string; name: string } | null
  cardId: string | null
  card: { id: string; title: string } | null
  partnerId: string | null
  partner: { id: string; name: string } | null
  activationId: string | null
  activation: { id: string; title: string } | null
  shortLink: UtmShortLink
  qr: UtmQr | null
  createdBy: { id: string; name: string } | null
  createdAt: string
}

export interface UtmOptions {
  sources: string[]
  mediums: string[]
  campaigns: { id: string; name: string; companyId: string; status: string }[]
  cards: { id: string; title: string; companyId: string; kind: string }[]
  partners: { id: string; name: string; companyId: string | null }[]
  activations: { id: string; title: string; companyId: string }[]
}

export interface UtmMetrics {
  days: { day: string; clicks: number; scans: number }[]
  totals: { clicks: number; scans: number; clicksOutsideQr: number }
  referers: { referer: string; count: number }[]
}

export interface UtmFilters {
  companyId?: string
  campaignId?: string
  source?: string
  medium?: string
  q?: string
}

export interface UtmInput {
  companyId: string
  targetUrl: string
  utmSource: string
  utmMedium: string
  utmCampaign: string
  utmContent?: string | null
  utmTerm?: string | null
  placement: string
  campaignId?: string | null
  cardId?: string | null
  partnerId?: string | null
  activationId?: string | null
  force?: boolean
}

export type UtmPatch = Partial<Omit<UtmInput, 'companyId'>>

export async function listUtms(groupId: string, filters: UtmFilters = {}) {
  const { data } = await api.get<MarketingUtm[]>(mkt(groupId, '/utm'), { params: filters })
  return data
}

export async function getUtmOptions(groupId: string) {
  const { data } = await api.get<UtmOptions>(mkt(groupId, '/utm/options'))
  return data
}

export async function getUtmMetrics(groupId: string, utmId: string) {
  const { data } = await api.get<UtmMetrics>(mkt(groupId, `/utm/${encodeURIComponent(utmId)}/metrics`))
  return data
}

export async function createUtm(groupId: string, input: UtmInput) {
  const { data } = await api.post<MarketingUtm>(mkt(groupId, '/utm'), input)
  return data
}

export async function updateUtm(groupId: string, utmId: string, patch: UtmPatch) {
  const { data } = await api.patch<MarketingUtm>(mkt(groupId, `/utm/${encodeURIComponent(utmId)}`), patch)
  return data
}

export async function setUtmActive(groupId: string, utmId: string, active: boolean) {
  const { data } = await api.post<MarketingUtm>(mkt(groupId, `/utm/${encodeURIComponent(utmId)}/active`), { active })
  return data
}

export async function createUtmQr(groupId: string, utmId: string, style?: Record<string, string>) {
  const { data } = await api.post<MarketingUtm>(mkt(groupId, `/utm/${encodeURIComponent(utmId)}/qr`), style ? { style } : {})
  return data
}

export async function deleteUtm(groupId: string, utmId: string) {
  await api.delete(mkt(groupId, `/utm/${encodeURIComponent(utmId)}`))
}

/** Id da UTM que já existe, quando a criação deu 409 (duplicada). */
export function duplicateUtmId(error: unknown): string | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null
  const id = (error.response.data as { existingId?: unknown } | undefined)?.existingId
  return typeof id === 'string' ? id : null
}
