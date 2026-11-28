import axios from 'axios'
import api from '../api'
import { onSessionReset } from '../session-hooks'

/**
 * Cliente da FUNDAÇÃO da ala Marketing (spec
 * docs/specs/2026/q4/q4-2/ala-marketing/00-fundacao.md). Cada fase tem o seu
 * arquivo ao lado (`marketing-cards.ts`, `marketing-utm.ts`, ...) e monta as
 * rotas com `mkt(groupId, '/...')`.
 *
 * A ala NÃO usa `x-company-id`: o grupo vai no path e a API confere o papel
 * no grupo. A marca de cada item é o `companyId` dele.
 */

export type MarketingRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER'

export const MARKETING_ROLE_LABEL: Record<MarketingRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Visualizador',
}

const RANK: Record<MarketingRole, number> = { OWNER: 3, ADMIN: 2, EDITOR: 1, VIEWER: 0 }

export function hasMarketingRole(role: MarketingRole | null | undefined, min: MarketingRole) {
  return !!role && RANK[role] >= RANK[min]
}

export interface MarketingSettings {
  viewerSeesFinance: boolean
  editorRevealsSecrets: boolean
  campaignNeedsApproval: boolean
  editorCanDelete: boolean
  expenseCategories: string[]
  utmSources: string[]
  utmMediums: string[]
  linkCategories: string[]
  /** Relatório do Looker Studio do grupo (M4): botão da área Dados. API antiga não manda. */
  lookerStudioUrl?: string | null
}

export interface MarketingBrand {
  companyId: string
  name: string
  /** Chave da paleta de tags (`teal`, `amber`...) ou null */
  color: string | null
}

export interface MarketingPermissions {
  seeFinance: boolean
  revealSecrets: boolean
  approve: boolean
  edit: boolean
  manageMembers: boolean
  ownerSettings: boolean
}

export interface MarketingGroupSummary {
  id: string
  name: string
  role: MarketingRole
  title: string | null
  marketingEnabled: boolean
  /** Marcas que a pessoa VÊ */
  brands: MarketingBrand[]
  settings: MarketingSettings
  permissions: MarketingPermissions
}

export interface MarketingMe {
  /** false = a API ainda não tem a ala (migration pendente ou rota ausente) */
  available: boolean
  canCreateGroup: boolean
  groups: MarketingGroupSummary[]
}

export interface MarketingMember {
  userId: string
  name: string
  email: string | null
  avatarUrl: string | null
  role: MarketingRole
  title: string | null
  brandIds: string[]
  createdAt: string
}

export interface MarketingLogEntry {
  id: string
  companyId: string | null
  verb: string
  entityType: string
  entityId: string
  summary: string
  createdAt: string
  actor: { id: string; name: string } | null
}

export interface MarketingAsset {
  id: string
  name: string
  mimeType: string
  size: number
  sha256: string | null
  width: number | null
  height: number | null
  durationSec: number | null
  colorSpace: string | null
  hasPreview: boolean
  position: number
  status: 'PENDING' | 'READY'
  uploadedById: string | null
  createdAt: string
  cardId: string | null
  versionId: string | null
  activationId: string | null
  expenseId: string | null
  quoteId: string | null
  /** As rotas de listagem das fases mandam as URLs assinadas junto */
  url?: string | null
  previewUrl?: string | null
}

/** Upload em partes (TUS) com o mesmo token do ticket, direto no storage. */
export interface MarketingResumableTicket {
  /** `<storage>/upload/resumable/sign` */
  endpoint: string
  bucket: string
  objectName: string
  /** 6 MB, o tamanho que o Supabase exige por parte */
  chunkSize: number
}

/** Resposta de toda rota de fase que PEDE upload (`.../assets` com POST). */
export interface MarketingUploadTicket {
  asset: MarketingAsset
  uploadUrl: string
  token: string
  maxBytes: number
  /** null (ou ausente, API antiga): só o PUT único */
  resumable?: MarketingResumableTicket | null
}

/** `GET /marketing/g/:g/assets/limits` */
export interface MarketingUploadLimits {
  maxBytes: number
  maxMb: number
  resumable: boolean
  chunkBytes: number
}

/** Monta a rota de um grupo: `mkt(g, '/cards')` = `/marketing/g/<g>/cards`. */
export function mkt(groupId: string, suffix = ''): string {
  return `/marketing/g/${encodeURIComponent(groupId)}${suffix}`
}

export async function getMarketingMe(): Promise<MarketingMe> {
  try {
    const { data } = await api.get<MarketingMe>('/marketing/me')
    return data
  } catch (error) {
    // API sem a ala (deploy antigo): some do menu, sem toast nem erro na tela.
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return { available: false, canCreateGroup: false, groups: [] }
    }
    throw error
  }
}

export async function getMarketingMembers(groupId: string): Promise<MarketingMember[]> {
  const { data } = await api.get<MarketingMember[]>(mkt(groupId, '/members'))
  return data
}

export async function getMarketingLog(
  groupId: string,
  filter: { entityType?: string; entityId?: string; take?: number } = {},
): Promise<MarketingLogEntry[]> {
  const { data } = await api.get<MarketingLogEntry[]>(mkt(groupId, '/log'), { params: filter })
  return data
}

export async function getAssetDownload(groupId: string, assetId: string) {
  const { data } = await api.get<{ url: string; name: string; size: number; sha256: string | null }>(
    mkt(groupId, `/assets/${encodeURIComponent(assetId)}/download`),
  )
  return data
}

// ── Arquivos (motor de envio da R1: features/marketing/uploads) ─────────────

/** Metadados que a rota da fase recebe para emitir o ticket. */
export interface MarketingUploadMeta {
  name: string
  mimeType: string
  size: number
  sha256?: string
  /** Caminho dentro da pasta arrastada (o Acervo recria as subpastas) */
  relativePath?: string
}

const limitsCache = new Map<string, Promise<MarketingUploadLimits | null>>()
// O teto é do plano do grupo: outra conta na mesma aba lê de novo.
onSessionReset(() => limitsCache.clear())

/**
 * Teto por arquivo do grupo, lido uma vez por sessão. `null` quando a API é
 * anterior à R1 (sem a rota): a fila segue e o ticket recusa o que passar.
 */
export function getUploadLimits(groupId: string): Promise<MarketingUploadLimits | null> {
  let hit = limitsCache.get(groupId)
  if (!hit) {
    hit = api
      .get<MarketingUploadLimits>(mkt(groupId, '/assets/limits'))
      .then((r) => r.data)
      .catch((error) => {
        limitsCache.delete(groupId)
        if (axios.isAxiosError(error) && error.response?.status === 404) return null
        throw error
      })
    limitsCache.set(groupId, hit)
  }
  return hit
}

/** Confirma o upload direto (a fundação confere no storage, mede e gera a prévia). */
export async function confirmMarketingAsset(
  groupId: string,
  assetId: string,
  meta: { durationSec?: number; width?: number; height?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<MarketingAsset> {
  const { data } = await api.post<MarketingAsset>(mkt(groupId, `/assets/${encodeURIComponent(assetId)}/confirm`), meta, {
    signal: opts.signal,
  })
  return data
}

/** Token novo para retomar um envio que ainda não terminou (o assinado vale 2 h). */
export async function renewUploadTicket(
  groupId: string,
  assetId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<MarketingUploadTicket> {
  const { data } = await api.post<MarketingUploadTicket>(
    mkt(groupId, `/assets/${encodeURIComponent(assetId)}/upload-token`),
    undefined,
    { signal: opts.signal },
  )
  return data
}

/** Cancela um envio pendente (apaga a linha e o que já chegou ao storage). */
export async function abortMarketingUpload(groupId: string, assetId: string): Promise<void> {
  await api.post(mkt(groupId, `/assets/${encodeURIComponent(assetId)}/abort`))
}
