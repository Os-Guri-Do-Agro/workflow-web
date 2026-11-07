import axios from 'axios'
import api from '../api'
import { mkt } from './marketing-core'
import type { TrashedRef } from './marketing-trash'

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
  /** Só na criação: cria o QR junto, na mesma transação (R1, D10) */
  withQr?: boolean
}

export type UtmPatch = Partial<Omit<UtmInput, 'companyId' | 'withQr'>>

export async function listUtms(groupId: string, filters: UtmFilters = {}) {
  const { data } = await api.get<MarketingUtm[]>(mkt(groupId, '/utm'), { params: filters })
  return data
}

/** Página da lista (R2, C7): acima de 500 UTMs a tela pagina pelo cursor. */
export interface UtmPage {
  items: MarketingUtm[]
  nextCursor: string | null
  /** Quantas casam com o filtro (todas as páginas) */
  total: number
}

export async function listUtmPage(groupId: string, filters: UtmFilters, cursor: string | null, limit = 200) {
  const { data } = await api.get<UtmPage>(mkt(groupId, '/utm/page'), {
    params: { ...filters, limit: String(limit), ...(cursor ? { cursor } : {}) },
  })
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

/** Manda para a lixeira (R2, C6): o link e o QR param de redirecionar; `trashed` serve ao "Desfazer". */
export async function deleteUtm(groupId: string, utmId: string) {
  const { data } = await api.delete<{ ok: boolean; trashed?: TrashedRef }>(
    mkt(groupId, `/utm/${encodeURIComponent(utmId)}`),
  )
  return data
}

/**
 * Uma UTM pelo id (`GET utm/:id`): o painel `?utm=` abre UTM que a lista
 * filtrada (ou o teto de 500 da lista) não trouxe. 404 = não existe ou é de
 * marca que a pessoa não vê. API anterior à rota (404 do Nest, "Cannot GET"):
 * cai na lista sem filtros.
 */
export async function findUtmById(groupId: string, utmId: string): Promise<{ utm: MarketingUtm | null }> {
  try {
    const { data } = await api.get<MarketingUtm>(mkt(groupId, `/utm/${encodeURIComponent(utmId)}`))
    return { utm: data }
  } catch (error) {
    const message = axios.isAxiosError(error) ? String((error.response?.data as { message?: unknown })?.message ?? '') : ''
    if (!(axios.isAxiosError(error) && error.response?.status === 404 && /^Cannot GET/i.test(message))) throw error
  }
  const found = (await listUtms(groupId)).find((u) => u.id === utmId)
  if (!found) throw new UtmNotFoundError()
  return { utm: found }
}

export class UtmNotFoundError extends Error {
  constructor() {
    super('UTM não encontrada.')
  }
}

export function isUtmNotFound(error: unknown): boolean {
  return error instanceof UtmNotFoundError || (axios.isAxiosError(error) && error.response?.status === 404)
}

/** Id da UTM que já existe, quando a criação deu 409 (duplicada). */
export function duplicateUtmId(error: unknown): string | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null
  const id = (error.response.data as { existingId?: unknown } | undefined)?.existingId
  return typeof id === 'string' ? id : null
}
