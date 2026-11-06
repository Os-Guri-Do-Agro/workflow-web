import { hasMarketingRole, type MarketingRole } from '@/service/marketing/marketing-core'
import type { MarketingCardAsset, MarketingCardCover, MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { CARD_STATUS_TONE, cardStatusLabel, statusesFor, type CardKind, type CardStatus } from '../marketing-labels'
import { MARKETING_TIME_ZONE } from '../calendar/calendar-time'

/**
 * Peças da Aprovação (M1-A) que várias telas usam: chaves do Vue Query, datas,
 * o espelho da regra de mover (para o menu "Mover para" do board e a folha do
 * celular adiantarem a resposta; quem decide é o servidor) e o tipo de cada
 * arquivo.
 */

/** Chaves SEMPRE sob `['marketing', groupId, ...]`: o socket invalida o grupo inteiro. */
export const cardKeys = {
  all: (groupId: string) => ['marketing', groupId, 'cards'] as const,
  list: (groupId: string, filters: unknown) => ['marketing', groupId, 'cards', 'list', filters] as const,
  detail: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'detail', cardId] as const,
  comments: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'comments', cardId] as const,
  history: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'history', cardId] as const,
}

export type Track = 'digital' | 'print'

/** Colunas do board para a trilha. */
export function trackStatuses(track: Track): CardStatus[] {
  return statusesFor(track === 'print' ? 'PRINT' : 'POST')
}

// ── Datas (SEMPRE em Brasília, como o calendário e a API) ───────────────────
// Campo `datetime-local`: `spLocalInput` / `spLocalInputToIso` de calendar-time.

const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: MARKETING_TIME_ZONE, day: '2-digit', month: 'short' })
const dayTimeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: MARKETING_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const fullFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: MARKETING_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "12 de nov." vira "12 nov" (curto e sem ponto). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return ''
  return dayFmt.format(new Date(iso)).replace(/\./g, '').replace(' de ', ' ')
}

export function formatDayTime(iso: string | null | undefined): string {
  if (!iso) return ''
  return dayTimeFmt.format(new Date(iso)).replace(/\./g, '').replace(' de ', ' ').replace(',', ' às')
}

export function formatFull(iso: string | null | undefined): string {
  if (!iso) return ''
  return fullFmt.format(new Date(iso)).replace(',', ' às')
}

/** 7.4 -> "0:07"; 75 -> "1:15". */
export function formatSeconds(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(sec ?? 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "há 3 min", "há 2 h", senão a data. */
export function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  return formatDayTime(iso)
}

// ── Arquivos ────────────────────────────────────────────────────────────────

export function isImageMime(mime: string | null | undefined) {
  return !!mime && mime.startsWith('image/')
}

export function isVideoMime(mime: string | null | undefined) {
  return !!mime && mime.startsWith('video/')
}

/** O que o navegador desenha: a prévia RGB quando existe, senão o original. */
export function displayUrl(asset: Pick<MarketingCardAsset, 'url' | 'previewUrl'> | MarketingCardCover | null) {
  if (!asset) return null
  return asset.previewUrl ?? asset.url ?? null
}

/** Imagem que o navegador mostra (com prévia ou formato comum). */
export function isViewableImage(asset: Pick<MarketingCardAsset, 'mimeType' | 'hasPreview'>) {
  if (asset.hasPreview) return true
  return isImageMime(asset.mimeType) && !/tiff|heic|heif/i.test(asset.mimeType)
}

// ── Espelho da regra de mover (só para a interface) ────────────────────────
//
// Cópia de `checkMove` (workflow-api/src/marketing/core/marketing-status.ts) e
// das duas travas que o `POST /cards/:id/move` põe antes dela
// (marketing-cards.service.ts): a trilha da gráfica é da tela Gráfica, e
// mandar para aprovação exige versão. A DECISÃO (pode ou não pode) segue o
// servidor regra por regra e na mesma ordem; só a frase é escrita para a tela.
// Mudou a regra lá, mude aqui (o roteiro marketing-board-fit-e2e.cjs compara
// com o `me.allowedMoves` do servidor).
//
// O resumo do board não diz se a versão tem arquivo ou legenda: com versão, o
// espelho deixa mandar para aprovação e, se faltar conteúdo, vale a recusa do
// servidor (a mesma frase do arraste). Fora isso, o espelho nunca trava o que
// o servidor aceitaria.

/** O que a tela sabe do card. Campo ausente = não sabe (o espelho não trava por ele). */
export interface MoveCardInfo {
  kind: CardKind | string
  status: CardStatus
  /** A aprovação vale para a versão atual. */
  approvalValid?: boolean
  /** Tem versão atual (V1 em diante). */
  hasVersion?: boolean
  /** Tem data de publicação (Agendado exige). */
  hasPublishAt?: boolean
}

export function moveInfoOf(card: MarketingCardSummary): MoveCardInfo {
  return {
    kind: card.kind,
    status: card.status,
    approvalValid: card.approvalValid,
    hasVersion: !!card.currentVersion,
    hasPublishAt: !!card.publishAt,
  }
}

/** Depois de aprovado, a peça impressa anda pela tela Gráfica (lá fica o checklist pré-gráfica). */
export const PRINT_DESK_STATUSES: readonly CardStatus[] = ['SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED']

const STEPS_COMMON: Partial<Record<CardStatus, CardStatus[]>> = {
  IDEA: ['IN_PRODUCTION'],
  IN_PRODUCTION: ['IDEA', 'AWAITING_APPROVAL'],
  AWAITING_APPROVAL: ['IN_PRODUCTION'],
  CHANGES_REQUESTED: ['IN_PRODUCTION', 'AWAITING_APPROVAL'],
}
/** Setas de quem é Editor (o `EDITOR_MOVES` da API). */
const STEPS: Record<Track, Partial<Record<CardStatus, CardStatus[]>>> = {
  digital: { ...STEPS_COMMON, APPROVED: ['SCHEDULED'], SCHEDULED: ['APPROVED', 'PUBLISHED'] },
  print: {
    ...STEPS_COMMON,
    APPROVED: ['SENT_TO_PRINTER'],
    SENT_TO_PRINTER: ['APPROVED', 'PROOF_RECEIVED'],
    PROOF_RECEIVED: ['SENT_TO_PRINTER', 'DELIVERED'],
  },
}
const NEEDS_APPROVAL = new Set<CardStatus>(['APPROVED', 'SCHEDULED', 'PUBLISHED', 'SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED'])
const FINAL = new Set<CardStatus>(['PUBLISHED', 'DELIVERED'])

type MoveRule =
  | 'ok'
  | 'viewer'
  | 'other-track'
  | 'print-desk'
  | 'no-version'
  | 'approve-action'
  | 'changes-action'
  | 'final'
  | 'no-step'
  | 'not-approved'
  | 'no-publish-date'

/** Qual regra do servidor barra o passo (na ordem dele), ou 'ok'. */
function moveRule(card: MoveCardInfo, to: CardStatus, role: MarketingRole | null): MoveRule {
  const from = card.status
  if (from === to) return 'ok'
  if (!hasMarketingRole(role, 'EDITOR')) return 'viewer'
  if (!statusesFor(card.kind).includes(to)) return 'other-track'
  if (card.kind === 'PRINT' && PRINT_DESK_STATUSES.includes(to)) return 'print-desk'
  if (to === 'AWAITING_APPROVAL' && card.hasVersion === false) return 'no-version'
  if (to === 'APPROVED' && from === 'AWAITING_APPROVAL') return 'approve-action'
  if (to === 'CHANGES_REQUESTED') return 'changes-action'
  // Reabrir: Admin volta qualquer card para o começo.
  if ((to === 'IDEA' || to === 'IN_PRODUCTION') && hasMarketingRole(role, 'ADMIN')) return 'ok'
  const track: Track = card.kind === 'PRINT' ? 'print' : 'digital'
  if (!(STEPS[track][from] ?? []).includes(to)) return FINAL.has(from) ? 'final' : 'no-step'
  if (NEEDS_APPROVAL.has(to) && card.approvalValid === false) return 'not-approved'
  if (to === 'SCHEDULED' && card.hasPublishAt === false) return 'no-publish-date'
  return 'ok'
}

/** Frase curta da recusa, escrita para quem olha o menu (o servidor tem a dele). */
function moveReason(rule: MoveRule, card: MoveCardInfo, to: CardStatus, role: MarketingRole | null): string | null {
  const admin = hasMarketingRole(role, 'ADMIN')
  switch (rule) {
    case 'ok':
      return null
    case 'viewer':
      return 'Visualizador não muda o status do card.'
    case 'other-track':
      return 'Esse status é de outra trilha.'
    case 'print-desk':
      return 'Envio, prova e entrega são pela tela Gráfica.'
    case 'no-version':
      return 'Feche uma versão (V1) com a arte ou a legenda antes.'
    case 'approve-action':
      return admin ? 'Aprove pelo botão Aprovar, na página do card.' : 'Só Admin aprova, pelo botão Aprovar na página do card.'
    case 'changes-action':
      if (card.status !== 'AWAITING_APPROVAL') return 'Ajuste se pede com o card aguardando aprovação.'
      return admin ? 'Peça pelo botão Pedir ajuste, na página do card.' : 'Só Admin pede ajuste, na página do card.'
    case 'final':
      return admin ? 'Card finalizado. Reabra para produção antes.' : 'Card finalizado. Só Admin reabre para produção.'
    case 'not-approved':
      return 'A versão atual ainda não foi aprovada.'
    case 'no-publish-date':
      return 'Defina a data de publicação antes de agendar.'
    case 'no-step': {
      const order = statusesFor(card.kind)
      const at = order.indexOf(card.status)
      const back = order.indexOf(to) < at
      if (back && (to === 'IDEA' || to === 'IN_PRODUCTION')) return 'Só Admin reabre o card.'
      if (back && to === 'AWAITING_APPROVAL') return 'Volta para aprovação ao subir uma versão nova.'
      // O próximo passo do fluxo (mesmo que ele próprio ainda peça algo, como a data).
      const steps = STEPS[card.kind === 'PRINT' ? 'print' : 'digital'][card.status] ?? []
      const next = order.find((s) => order.indexOf(s) > at && steps.includes(s))
      if (!back && next) return `Um passo por vez: antes vem ${cardStatusLabel(next, card.kind)}.`
      return 'Esse passo não existe no fluxo do card.'
    }
  }
}

/** Motivo previsível de recusa (null = o servidor deve aceitar). */
export function moveHint(card: MoveCardInfo, to: CardStatus, role: MarketingRole | null): string | null {
  return moveReason(moveRule(card, to, role), card, to, role)
}

export interface MoveTarget {
  value: CardStatus
  label: string
  tone: string
  current: boolean
  /** Motivo da recusa prevista; null = pode ir. */
  blocked: string | null
}

/** Os status da trilha do card, na ordem do board, com o atual e o motivo de cada recusa. */
export function moveTargets(card: MoveCardInfo, role: MarketingRole | null): MoveTarget[] {
  return statusesFor(card.kind).map((s) => ({
    value: s,
    label: cardStatusLabel(s, card.kind),
    tone: CARD_STATUS_TONE[s],
    current: s === card.status,
    blocked: s === card.status ? null : moveHint(card, s, role),
  }))
}
