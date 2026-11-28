import api from '../api'
import { mkt } from './marketing-core'

/**
 * Cliente da área "Dados" da ala (M4: dados do app) e da "Conexão com o app"
 * em Configurações. Toda soma que vem do app é um intervalo (`CellSum`): uma
 * célula de 1 a 4 chega cortada (privacidade), e a tela mostra "de 13 a 22" em
 * vez de inventar número. Os estoques de assinaturas e pets vêm só com o total,
 * arredondados PARA CIMA de 5 em 5 (`rounded`): o valor v quer dizer "entre v-4
 * e v", e a tela diz "até 5" ou "cerca de v". O funil por UTM e os rankings
 * contam por semana fechada (segunda a domingo).
 */

export interface CellSum {
  min: number
  max: number
  /** Células cortadas (de 1 a 4) que entraram na soma */
  cut: number
  /** Células (dias) que entraram na soma */
  cells: number
}

export type AppPeriod = 7 | 30 | 90

export interface AppPeriodRange {
  from: string
  to: string
  days: number
}

export interface AppBrandStatus {
  companyId: string
  activeTokens: number
  revokedTokens: number
  lastReceivedAt: string | null
  lastDate: string | null
  stale: boolean
}

export interface AppDataStatus {
  connected: boolean
  hasData: boolean
  stale: boolean
  staleHours: number
  brands: AppBrandStatus[]
}

export interface AppFlowKpi {
  current: CellSum
  previous: CellSum
  delta: number | null
}

export interface AppStockKpi {
  value: CellSum | null
  date: string | null
  /** `usuario` (último acesso da conta), `aparelho` ou `misto` */
  source: string | null
  previous: CellSum | null
  delta: number | null
  /**
   * Fim do período menos o fim do anterior, só com as duas fotos exatas. Nas
   * assinaturas fica no lugar dos cancelamentos, que o app não manda.
   */
  change: number | null
  /** O app manda arredondado para cima, de 5 em 5 (assinaturas e pets): a tela diz "até 5" ou "cerca de" */
  rounded: boolean
}

export interface AppBreakdownRow {
  dimension: string
  label: string
  current: CellSum
  previous: CellSum
}

export interface AppSeriesPoint {
  date: string
  value: CellSum | null
  previousDate: string
  previous: CellSum | null
}

export interface AppDataOverview {
  period: { current: AppPeriodRange; previous: AppPeriodRange }
  status: AppDataStatus
  hasData: boolean
  kpis: {
    cadastros: AppFlowKpi
    assinaturas_novas: AppFlowKpi
    pets_novos: AppFlowKpi
    ativos_1d: AppStockKpi
    ativos_7d: AppStockKpi
    ativos_30d: AppStockKpi
    assinaturas_ativas: AppStockKpi
    pets: AppStockKpi
  }
  series: AppSeriesPoint[]
  activeSeries: { date: string; value: CellSum | null }[]
  /** Só fluxos: os estoques vêm sem quebra (plano, tipo e espécie saíram do contrato em 07/11) */
  breakdowns: {
    canal: AppBreakdownRow[]
    plataforma: AppBreakdownRow[]
    comoConheceu: AppBreakdownRow[]
    uso: AppBreakdownRow[]
    /** Pets cadastrados no período, por espécie */
    especie: AppBreakdownRow[]
  }
  lookerStudioUrl: string | null
}

export interface AppLink {
  utmId: string
  companyId: string
  placement: string
  code: string
  targetUrl: string
  qr: { code: string } | null
  card: { id: string; title: string; kind: string } | null
  campaign: { id: string; name: string } | null
  partner: { id: string; name: string } | null
  referralCode: string | null
  clicks: number
  scans: number
}

export interface AppConversion {
  min: number
  max: number
}

export interface AppFunnelRow {
  companyId: string
  key: string
  source: string
  medium: string
  campaign: string
  content: string
  /** false = a tupla chegou do app mas não existe UTM com ela no Nevo */
  inNevo: boolean
  links: AppLink[]
  clicks: number
  scans: number
  signups: CellSum
  conversion: AppConversion | null
}

export interface AppRankRow {
  id: string
  name: string
  extra?: Record<string, unknown>
  signups: CellSum
  clicks: number
  scans: number
  links: number
  /** A tupla também é de outro item (o app não sabe por qual link a pessoa veio) */
  shared: boolean
  conversion: AppConversion | null
}

export interface AppPartnerRankRow {
  id: string
  name: string
  partnerId: string | null
  code: string | null
  kind: string | null
  matchedBy: 'utm' | 'code' | 'name' | null
  viaCode: CellSum
  viaUtm: CellSum
  signups: CellSum
  clicks: number
}

/**
 * O período do filtro arredondado para semanas fechadas inteiras (o funil e os
 * rankings leem a semana): da segunda `from` ao domingo `to`. Os cliques e as
 * leituras de QR contam no mesmo intervalo.
 */
export interface AppWeekWindow {
  from: string
  to: string
  /** Semanas fechadas no intervalo (0 = nenhuma fechou ainda) */
  count: number
  /** A semana em curso que o período toca: entra na segunda-feira depois de `to` */
  open: { from: string; to: string } | null
}

export interface AppAttribution {
  period: AppPeriodRange
  weeks: AppWeekWindow
  funnel: AppFunnelRow[]
  rankings: {
    campaigns: AppRankRow[]
    cards: AppRankRow[]
    partners: AppPartnerRankRow[]
    qrs: AppRankRow[]
  }
  totals: {
    clicks: number
    scans: number
    /** Cadastros das semanas (a soma das linhas do funil, das outras e dos sem UTM) */
    signups: CellSum
    signupsWithUtm: CellSum
    /** `utm:outras` das semanas com a `utm:sem_utm` separada: link montado fora da ala, ou UTM com menos de 5 cadastros na semana */
    signupsOtherUtm: CellSum
    /** `utm:sem_utm`: cadastro que não veio de link com UTM */
    signupsWithoutUtm: CellSum
    /**
     * `utm:outras` das semanas SEM a linha `utm:sem_utm`: o recorte juntou os sem UTM ao
     * balde (contrato, regra 2), e a linha diz "Sem UTM e outras".
     */
    signupsWithoutUtmAndOther: CellSum
    /** O mesmo para o parceiro: `parceiro:outros`, `parceiro:sem_parceiro` e o balde que levou os dois */
    partnersOther: CellSum
    partnersNone: CellSum
    partnersNoneAndOther: CellSum
  }
}

export interface AppDataHome {
  status: AppDataStatus
  period: AppPeriodRange
  signups: AppFlowKpi
  active7: { value: CellSum | null; date: string | null; source: string | null }
  subscriptions: { value: CellSum | null; date: string | null; source: string | null; rounded: boolean }
}

export interface AppToken {
  id: string
  companyId: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revoked: boolean
  revokedAt: string | null
  createdAt: string
  createdBy: { id: string; name: string } | null
}

export interface CreatedAppToken extends AppToken {
  /** O valor completo: só nesta resposta */
  token: string
}

export interface AppDataFilter {
  companyId?: string | null
  days?: AppPeriod
  to?: string
}

const params = (f: AppDataFilter) => ({
  ...(f.companyId ? { companyId: f.companyId } : {}),
  ...(f.days ? { days: f.days } : {}),
  ...(f.to ? { to: f.to } : {}),
})

export async function getAppDataStatus(groupId: string, companyId?: string | null) {
  const { data } = await api.get<AppDataStatus>(mkt(groupId, '/app-data/status'), {
    params: params({ companyId }),
  })
  return data
}

export async function getAppDataOverview(groupId: string, filter: AppDataFilter) {
  const { data } = await api.get<AppDataOverview>(mkt(groupId, '/app-data/overview'), { params: params(filter) })
  return data
}

export async function getAppAttribution(groupId: string, filter: AppDataFilter) {
  const { data } = await api.get<AppAttribution>(mkt(groupId, '/app-data/attribution'), { params: params(filter) })
  return data
}

/**
 * Baixa o CSV (números por dia ou funil). O nome vem do `Content-Disposition`
 * quando o CORS deixa ler; senão do `fallbackName` (o período na tela).
 */
export async function downloadAppDataCsv(
  groupId: string,
  filter: AppDataFilter & { kind: 'daily' | 'funnel' },
  fallbackName?: string,
) {
  const response = await api.get<Blob>(mkt(groupId, '/app-data/export.csv'), {
    params: { ...params(filter), kind: filter.kind },
    responseType: 'blob',
  })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName ?? `dados-do-app-${filter.kind}.csv`
  const url = URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}

export async function getAppTokens(groupId: string) {
  const { data } = await api.get<AppToken[]>(mkt(groupId, '/app-tokens'))
  return data
}

export async function createAppToken(groupId: string, body: { companyId: string; name: string }) {
  const { data } = await api.post<CreatedAppToken>(mkt(groupId, '/app-tokens'), body)
  return data
}

export async function revokeAppToken(groupId: string, tokenId: string) {
  const { data } = await api.delete<AppToken>(mkt(groupId, `/app-tokens/${encodeURIComponent(tokenId)}`))
  return data
}
