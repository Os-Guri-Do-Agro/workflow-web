import type { ContactChannel, PartnerKind, PartnerStatus } from '@/service/marketing/marketing-partners'
import { daysBetween, spYmd, todaySp } from '../calendar/calendar-time'

/** Rótulos, cores e datas de Parceiros. */

export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  VET_CLINIC: 'Clínica veterinária',
  PET_SHOP: 'Pet shop',
  INFLUENCER: 'Influenciador',
  PRINTER: 'Gráfica',
  SUPPLIER: 'Fornecedor',
  EVENT: 'Evento',
  NGO: 'ONG',
  OTHER: 'Outro',
}
export const PARTNER_KINDS = Object.keys(PARTNER_KIND_LABEL) as PartnerKind[]

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  PROSPECT: 'Prospecção',
  NEGOTIATING: 'Negociando',
  ACTIVE: 'Ativo',
  PAUSED: 'Pausado',
  ENDED: 'Encerrado',
}
export const PARTNER_STATUSES = Object.keys(PARTNER_STATUS_LABEL) as PartnerStatus[]

export const PARTNER_STATUS_TONE: Record<PartnerStatus, string> = {
  PROSPECT: 'slate',
  NEGOTIATING: 'amber',
  ACTIVE: 'green',
  PAUSED: 'orange',
  ENDED: 'red',
}

export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  WHATSAPP: 'WhatsApp',
  CALL: 'Ligação',
  EMAIL: 'E-mail',
  MEETING: 'Reunião',
  VISIT: 'Visita',
  OTHER: 'Outro',
}
export const CONTACT_CHANNELS = Object.keys(CONTACT_CHANNEL_LABEL) as ContactChannel[]

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** 5567999998888 -> "+55 (67) 99999-8888". Fora do padrão BR, devolve com + na frente. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return ''
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${digits}`
}

/*
 * Datas em Brasília, como a API (data só com dia é gravada ao meio-dia de
 * Brasília): no fuso do navegador, em UTC+9 o "20 nov" virava "21 nov".
 */

/** "20 nov" (com o ano se não for o corrente). */
export function formatDay(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return ''
  const day = spYmd(iso)
  const year = day.slice(0, 4)
  const base = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`
  return year === todaySp(now).slice(0, 4) ? base : `${base} ${year}`
}

/** Diferença em dias de calendário de Brasília (hoje = 0, ontem = -1). */
function dayDiff(iso: string, now: Date): number {
  return daysBetween(todaySp(now), spYmd(iso))
}

/** "hoje", "ontem", "há 12 dias", "há 3 meses". */
export function sinceLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'nunca'
  const diff = -dayDiff(iso, now)
  if (diff <= 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff < 45) return `há ${diff} dias`
  const months = Math.round(diff / 30)
  return months < 12 ? `há ${months} meses` : `há ${Math.round(months / 12)} ano(s)`
}

/** Próximo passo vencido (data anterior a hoje) ou para hoje. */
export function stepState(iso: string | null | undefined, now = new Date()): 'late' | 'today' | 'future' | null {
  if (!iso) return null
  const diff = dayDiff(iso, now)
  return diff < 0 ? 'late' : diff === 0 ? 'today' : 'future'
}

/** ISO -> 'YYYY-MM-DD' de Brasília, para o campo de data. */
export function toDateInput(iso: string | null | undefined): string {
  return iso ? spYmd(iso) : ''
}
