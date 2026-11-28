import api from '../api'
import { mkt } from './marketing-core'

/**
 * Publicação nas redes (R2, parte A; contrato na spec
 * docs/specs/2026/q4/q4-2/ala-marketing/r2-publicacao-dados-avisos.md, A1 a A9).
 *
 * Nenhuma resposta traz token de rede: a conta só tem nome, status e validade.
 */

export type SocialProvider = 'meta' | 'youtube' | 'linkedin' | 'tiktok'
export type SocialNetwork = 'INSTAGRAM' | 'FACEBOOK' | 'META_ADS' | 'YOUTUBE' | 'LINKEDIN' | 'TIKTOK'
export type PublishMode = 'AUTO' | 'DRAFT' | 'MANUAL'
export type Placement = 'FEED' | 'CAROUSEL' | 'REEL' | 'STORY' | 'VIDEO' | 'SHORT' | 'POST'
export type PublicationStatus =
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'DRAFT_SENT'
  | 'WAITING_MANUAL'
  | 'FAILED'
  | 'CANCELED'

export interface SocialProviderStatus {
  provider: SocialProvider
  label: string
  configured: boolean
  networks: SocialNetwork[]
  callbackUrl: string
  scopes: string[]
  env: string[]
  consoleUrl: string
  steps: string[]
}

export interface SocialStatus {
  callbackBase: string
  canConnect: boolean
  providers: SocialProviderStatus[]
}

export interface SocialAccount {
  id: string
  companyId: string
  network: SocialNetwork
  provider: SocialProvider | null
  externalId: string
  name: string
  username: string | null
  avatarUrl: string | null
  /** ACTIVE | EXPIRED | ERROR */
  status: 'ACTIVE' | 'EXPIRED' | 'ERROR' | 'REVOKED'
  lastError: string | null
  expiresAt: string | null
  lastCheckedAt: string | null
  createdAt: string
  connectedBy: { id: string; name: string } | null
  /** Tem renovação: o Nevo renova o acesso sozinho antes de vencer */
  autoRenew: boolean
  info: { pageName: string | null; currency: string | null }
}

export interface PublicationMetrics {
  date: string
  fetchedAt: string
  impressions: number | null
  reach: number | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  clicks: number | null
}

export interface CardPublication {
  id: string
  network: string
  mode: PublishMode
  placement: Placement | null
  /** Rótulo do formato ("Carrossel"): o Visualizador não recebe o plano */
  placementLabel: string | null
  status: PublicationStatus
  statusLabel: string
  scheduledAt: string
  attempts: number
  nextAttemptAt: string | null
  permalink: string | null
  publishedAt: string | null
  lastError: string | null
  /** Falhou sem a rede confirmar: o post pode ter saído ("Tentar de novo" pede para conferir antes). */
  ambiguous: boolean
  /** Falhou com o card fora de Agendado (ou noutra versão): o que fazer, já que o "Tentar de novo" não vale */
  retryHint: string | null
  /** null para o Visualizador (ele só vê o status) */
  caption: string | null
  account: { id: string; name: string; username: string | null; status: string } | null
  createdBy: { id: string; name: string } | null
  openUrl: string | null
  metrics: PublicationMetrics | null
  can: { retry: boolean; markPublished: boolean; cancel: boolean }
}

export interface PublishPlanRow {
  network: string
  label: string
  modes: Array<{ value: PublishMode; label: string; available: boolean }>
  defaultMode: PublishMode
  placements: Array<{ value: Placement; label: string }>
  defaultPlacement: Placement
  accounts: Array<{ id: string; name: string; username: string | null; status: string }>
  defaultAccountId: string | null
  /** A marca tem mais de uma conta ativa nesta rede: a pessoa escolhe (nada vem marcado) */
  accountRequired?: boolean
  hint: string | null
  alreadyPublished: { at: string | null; permalink: string | null } | null
}

export interface CardPublications {
  card: { id: string; status: string; publishAt: string | null; networks: string[]; approvalValid: boolean }
  canManage: boolean
  canSchedule: boolean
  scheduleBlock: string | null
  hasPending: boolean
  /** Alguma publicação está saindo agora: Desagendar, lixeira e versão nova esperam */
  publishing?: boolean
  publications: CardPublication[]
  plan: PublishPlanRow[] | null
  approvedAssets: Array<{ id: string; name: string; mimeType: string; size: number }>
}

export interface ScheduleItem {
  network: string
  mode: PublishMode
  placement: Placement
  accountId: string | null
}

export interface ScheduleCheck {
  ok: boolean
  global: string[]
  items: Array<{
    network: string
    label: string
    mode: PublishMode
    placement: Placement
    accountId: string | null
    caption: string
    captionFrom: string | null
    problems: string[]
    warnings: string[]
  }>
}

export type MetricTotals = Record<'impressions' | 'reach' | 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'clicks', number | null>

export interface AdLinkDay {
  date: string
  spendCents: number | null
  impressions: number
  reach: number | null
  clicks: number
  results: number | null
}

export interface AdLink {
  id: string
  name: string
  externalCampaignId: string
  account: { id: string; name: string; status: string; currency: string | null }
  lastSyncAt: string | null
  lastSyncError: string | null
  resultLabel: string | null
  totals: { spendCents: number | null; impressions: number; reach: number; clicks: number; results: number }
  days: AdLinkDay[]
  months: Array<{
    month: string
    label: string
    spendCents: number
    launched: {
      expenseId: string
      amountCents: number
      inTrash: boolean
      /** null = nesta campanha. Outra: id e nome (id null = sem campanha, ou de marca que a pessoa não vê) */
      campaign: { id: string | null; name: string | null; inTrash: boolean } | null
    } | null
  }>
}

export interface CampaignSocial {
  campaign: { id: string; companyId: string; name: string }
  canEdit: boolean
  seesMoney: boolean
  posts: {
    count: number
    totals: MetricTotals
    byNetwork: Array<{ network: string; label: string; posts: number; totals: MetricTotals }>
  }
  ads: {
    canLink: boolean
    accounts: Array<{ id: string; name: string; status: string; currency: string | null }>
    totals: { spendCents: number | null; impressions: number; reach: number; clicks: number; results: number }
    links: AdLink[]
  }
}

export interface AdCampaignOption {
  id: string
  name: string
  objective: string | null
  status: string | null
  linkedHere: boolean
  linkedElsewhere: boolean
}

const enc = encodeURIComponent

export async function getSocialStatus(groupId: string): Promise<SocialStatus> {
  const { data } = await api.get<SocialStatus>(mkt(groupId, '/social/status'))
  return data
}

export async function listSocialAccounts(groupId: string, companyId?: string): Promise<SocialAccount[]> {
  const { data } = await api.get<SocialAccount[]>(mkt(groupId, '/social/accounts'), {
    params: companyId ? { companyId } : undefined,
  })
  return data
}

export async function getConnectUrl(groupId: string, provider: SocialProvider, companyId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(mkt(groupId, `/social/connect/${provider}`), { params: { companyId } })
  return data.url
}

/** O que a rede trouxe no login (reserva de 10 min, só de quem conectou). Sem token. */
export interface PendingConnection {
  key: string
  provider: SocialProvider
  providerLabel: string
  /** Marca de onde a pessoa clicou em Conectar (sugestão) */
  companyId: string | null
  expiresAt: string
  brands: Array<{ id: string; name: string }>
  items: Array<{
    ref: string
    network: SocialNetwork
    networkLabel: string
    /** Id público da rede (página, perfil) */
    externalId: string
    name: string
    username: string | null
    avatarUrl: string | null
    pageName: string | null
    currency: string | null
    /** Já está numa marca: só dá para marcar se o destino for ela mesma */
    /**
     * Já ligada a uma marca do grupo. `hidden`: marca que a pessoa não vê (a
     * API não manda nem o id nem o nome dela).
     */
    linkedTo: { companyId: string; name: string; hidden: false } | { companyId: null; name: null; hidden: true } | null
  }>
}

export async function getPendingConnection(groupId: string, key: string): Promise<PendingConnection> {
  const { data } = await api.get<PendingConnection>(mkt(groupId, `/social/pending/${enc(key)}`))
  return data
}

export async function confirmPendingConnection(groupId: string, key: string, input: { companyId: string; refs: string[] }) {
  const { data } = await api.post<{ ok: boolean; provider: SocialProvider; saved: number; blocked: string[]; accounts: SocialAccount[] }>(
    mkt(groupId, `/social/pending/${enc(key)}/confirm`),
    input,
  )
  return data
}

export async function discardPendingConnection(groupId: string, key: string) {
  await api.delete(mkt(groupId, `/social/pending/${enc(key)}`))
}

export async function disconnectAccount(groupId: string, accountId: string) {
  const { data } = await api.delete<{ ok: boolean; revoked: boolean; revokeError: string | null; affectedPublications: number }>(
    mkt(groupId, `/social/accounts/${enc(accountId)}`),
  )
  return data
}

export async function checkAccount(groupId: string, accountId: string): Promise<SocialAccount> {
  const { data } = await api.post<SocialAccount>(mkt(groupId, `/social/accounts/${enc(accountId)}/check`))
  return data
}

export async function getCardPublications(groupId: string, cardId: string): Promise<CardPublications> {
  const { data } = await api.get<CardPublications>(mkt(groupId, `/cards/${enc(cardId)}/publications`))
  return data
}

export async function checkSchedule(groupId: string, cardId: string, items: ScheduleItem[]): Promise<ScheduleCheck> {
  const { data } = await api.post<ScheduleCheck>(mkt(groupId, `/cards/${enc(cardId)}/publications/check`), { items })
  return data
}

export async function schedulePublications(groupId: string, cardId: string, items: ScheduleItem[]): Promise<CardPublications> {
  const { data } = await api.post<CardPublications>(mkt(groupId, `/cards/${enc(cardId)}/publications`), { items })
  return data
}

export async function retryPublication(groupId: string, cardId: string, publicationId: string): Promise<CardPublications> {
  const { data } = await api.post<CardPublications>(
    mkt(groupId, `/cards/${enc(cardId)}/publications/${enc(publicationId)}/retry`),
  )
  return data
}

export async function markPublicationPublished(
  groupId: string,
  cardId: string,
  publicationId: string,
  url: string | null,
): Promise<CardPublications> {
  const { data } = await api.post<CardPublications>(
    mkt(groupId, `/cards/${enc(cardId)}/publications/${enc(publicationId)}/published`),
    { url },
  )
  return data
}

export async function cancelPublication(groupId: string, cardId: string, publicationId: string): Promise<CardPublications> {
  const { data } = await api.post<CardPublications>(
    mkt(groupId, `/cards/${enc(cardId)}/publications/${enc(publicationId)}/cancel`),
  )
  return data
}

export async function refreshCardMetrics(groupId: string, cardId: string) {
  const { data } = await api.post<{ updated: number; failed: number; publication: CardPublications }>(
    mkt(groupId, `/cards/${enc(cardId)}/publications/metrics`),
  )
  return data
}

export async function getCampaignSocial(groupId: string, campaignId: string): Promise<CampaignSocial> {
  const { data } = await api.get<CampaignSocial>(mkt(groupId, `/campaigns/${enc(campaignId)}/social`))
  return data
}

export async function listAdCampaigns(groupId: string, campaignId: string, accountId: string): Promise<AdCampaignOption[]> {
  const { data } = await api.get<AdCampaignOption[]>(mkt(groupId, `/campaigns/${enc(campaignId)}/ad-campaigns`), {
    params: { accountId },
  })
  return data
}

export async function linkAdCampaign(
  groupId: string,
  campaignId: string,
  input: { accountId: string; externalCampaignId: string; name?: string },
): Promise<CampaignSocial> {
  const { data } = await api.post<CampaignSocial>(mkt(groupId, `/campaigns/${enc(campaignId)}/ad-links`), input)
  return data
}

export async function unlinkAdCampaign(groupId: string, campaignId: string, linkId: string): Promise<CampaignSocial> {
  const { data } = await api.delete<CampaignSocial>(mkt(groupId, `/campaigns/${enc(campaignId)}/ad-links/${enc(linkId)}`))
  return data
}

export async function syncAdCampaign(groupId: string, campaignId: string, linkId: string): Promise<CampaignSocial> {
  const { data } = await api.post<CampaignSocial>(mkt(groupId, `/campaigns/${enc(campaignId)}/ad-links/${enc(linkId)}/sync`))
  return data
}

export async function launchAdSpend(
  groupId: string,
  campaignId: string,
  linkId: string,
  input: { month: string; update?: boolean },
) {
  const { data } = await api.post<{
    ok: boolean
    expenseId: string
    created: boolean
    changed: boolean
    /** Campos editados à mão que o "Atualizar valor" deixou como estavam */
    kept?: string[]
    amountCents: number
    month: string
  }>(
    mkt(groupId, `/campaigns/${enc(campaignId)}/ad-links/${enc(linkId)}/launch`),
    input,
  )
  return data
}
