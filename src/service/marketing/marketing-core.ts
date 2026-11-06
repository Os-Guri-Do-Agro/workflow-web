import axios from 'axios'
import api from '../api'

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

/** Resposta de toda rota de fase que PEDE upload (`.../assets` com POST). */
export interface MarketingUploadTicket {
  asset: MarketingAsset
  uploadUrl: string
  token: string
  maxBytes: number
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

/** sha256 hex do arquivo, no navegador (é o que prova que a gráfica recebeu o original). */
export async function sha256OfFile(file: File): Promise<string | undefined> {
  try {
    if (!globalThis.crypto?.subtle) return undefined
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return undefined
  }
}

/** Duração de vídeo/áudio lida no navegador (o servidor não lê vídeo). */
function mediaDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
    const url = URL.createObjectURL(file)
    const done = (value?: number) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : undefined)
    el.onerror = () => done(undefined)
    el.src = url
  })
}

const rawHttp = axios.create()

/**
 * Sobe um arquivo da ala: a fase pede o ticket (rota dela, que valida o dono),
 * o navegador faz PUT direto no storage e a fundação confirma.
 *
 * `requestTicket` recebe os metadados (nome, tipo, tamanho, sha256) e chama a
 * rota da fase, ex.: `(meta) => api.post(mkt(g, `/cards/${id}/versions/${v}/assets`), meta)`.
 *
 * O PUT vai num axios CRU (sem o nosso Authorization nem o interceptor de
 * sessão), pelo mesmo motivo do Drive.
 */
export async function uploadMarketingFile(
  groupId: string,
  file: File,
  requestTicket: (meta: { name: string; mimeType: string; size: number; sha256?: string }) => Promise<MarketingUploadTicket>,
  onProgress?: (percent: number) => void,
): Promise<MarketingAsset> {
  const [sha256, durationSec] = await Promise.all([sha256OfFile(file), mediaDuration(file)])
  const ticket = await requestTicket({
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    sha256,
  })
  await rawHttp.put(ticket.uploadUrl, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      Authorization: `Bearer ${ticket.token}`,
    },
    onUploadProgress: (event) => {
      if (!onProgress) return
      onProgress(event.total ? Math.min(98, Math.round((event.loaded / event.total) * 98)) : 90)
    },
  })
  const { data } = await api.post<MarketingAsset>(
    mkt(groupId, `/assets/${encodeURIComponent(ticket.asset.id)}/confirm`),
    { durationSec },
  )
  onProgress?.(100)
  return data
}
