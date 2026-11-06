import api from '../api'
import { mkt } from './marketing-core'

/**
 * Tarefa do Nevo ligada ao card (R1, P3; contrato na spec
 * docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md, D6 a D8).
 *
 * Dois lados:
 * - DENTRO da ala (`/marketing/g/:g/...`): o card lista, liga, desliga e tenta
 *   de novo; o seletor lista as candidatas.
 * - FORA da ala (`/marketing/tasks/:id/cards`): o painel da tarefa no Nevo
 *   pergunta quais cards estão ligados, com o `x-company-id` da empresa da
 *   tarefa, como o resto do board.
 */

/** Status da tarefa do board do Nevo (rótulo e cor saem de `features/tasks/task-meta.ts`). */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'REVIEWED' | 'DONE'

export interface TaskBrand {
  name: string
  /** Chave da paleta de tags (`teal`, `amber`...) ou null. */
  color: string | null
}

export interface TaskPerson {
  id: string
  name: string
  avatarUrl: string | null
}

export interface TaskMonth {
  id: string
  name: string
  number: number
  /** Trimestre da empresa (`Q4`). O Nevo não guarda ano no mês. */
  quarter: string
}

export interface CardTaskItem {
  /** Id do VÍNCULO (desligar e "Tentar de novo"), não da tarefa. */
  id: string
  title: string
  status: TaskStatus
  company: TaskBrand
  /** Só quem é da empresa da tarefa abre no board (o freelancer vê só o título). */
  canOpen: boolean
  canUnlink: boolean
  /** Só com falha pendente e pela regra do desligar */
  canRetry?: boolean
  lastSyncStatus: TaskStatus | null
  lastSyncAt: string | null
  /** Frase pronta da última falha ao mover (null = ok). */
  lastSyncError: string | null
  linkedBy: { id: string; name: string } | null
  createdAt: string
  // Só com `canOpen`:
  activityId?: string
  companyId?: string
  monthId?: string
  month?: TaskMonth
  dueDate?: string | null
  responsibles?: TaskPerson[]
}

export interface CardTasks {
  available: boolean
  max: number
  /** Para onde o mapa da D6 manda a tarefa no status atual do card (null = não mexe). */
  targetStatus: TaskStatus | null
  canLink: boolean
  canRetry: boolean
  items: CardTaskItem[]
}

export interface SyncOutcome {
  linkId: string
  ok: boolean
  changed: boolean
  error?: string
}

export interface TaskCandidate {
  id: string
  title: string
  status: TaskStatus
  companyId: string
  company: TaskBrand
  month: TaskMonth
  dueDate: string | null
  responsibles: TaskPerson[]
  /** Já ligada a ESTE card. */
  linked: boolean
}

export interface TaskCandidates {
  /** Empresas que a pessoa pode usar (a marca do card primeiro). */
  companies: Array<{ companyId: string } & TaskBrand>
  items: TaskCandidate[]
  truncated: boolean
  limit: number
}

export interface TaskMarketingCard {
  id: string
  groupId: string
  title: string
  status: string
  kind: string
  archived: boolean
  brand: TaskBrand
  /** Rota da ala com o grupo (`/marketing/cards/<id>?grupo=<g>`). */
  link: string
}

export interface TaskMarketingCards {
  /** false = a API ainda não tem a tabela (a seção não aparece). */
  available: boolean
  total: number
  /** Os que a pessoa vê na ala; os outros entram só no `total`. */
  cards: TaskMarketingCard[]
}

const enc = encodeURIComponent

export async function listCardTasks(groupId: string, cardId: string): Promise<CardTasks> {
  const { data } = await api.get<CardTasks>(mkt(groupId, `/cards/${enc(cardId)}/tasks`))
  return data
}

export async function linkCardTask(groupId: string, cardId: string, activityId: string) {
  const { data } = await api.post<CardTasks & { sync: SyncOutcome }>(mkt(groupId, `/cards/${enc(cardId)}/tasks`), {
    activityId,
  })
  return data
}

export async function unlinkCardTask(groupId: string, cardId: string, linkId: string): Promise<CardTasks> {
  const { data } = await api.delete<CardTasks>(mkt(groupId, `/cards/${enc(cardId)}/tasks/${enc(linkId)}`))
  return data
}

export async function retryCardTask(groupId: string, cardId: string, linkId: string) {
  const { data } = await api.post<CardTasks & { sync: SyncOutcome }>(
    mkt(groupId, `/cards/${enc(cardId)}/tasks/${enc(linkId)}/sync`),
  )
  return data
}

export async function getTaskCandidates(
  groupId: string,
  filter: { companyId?: string | null; q?: string; cardId?: string },
): Promise<TaskCandidates> {
  const params: Record<string, string> = {}
  if (filter.companyId) params.companyId = filter.companyId
  if (filter.q?.trim()) params.q = filter.q.trim()
  if (filter.cardId) params.cardId = filter.cardId
  const { data } = await api.get<TaskCandidates>(mkt(groupId, '/tasks/candidates'), { params })
  return data
}

/**
 * Cards ligados à tarefa, para o painel dela no Nevo. `companyId` explícito:
 * o `/board` abre tarefa de qualquer empresa e o guard confere a do header.
 */
export async function getTaskMarketingCards(activityId: string, companyId?: string | null): Promise<TaskMarketingCards> {
  const { data } = await api.get<TaskMarketingCards>(
    `/marketing/tasks/${enc(activityId)}/cards`,
    companyId ? { headers: { 'x-company-id': companyId } } : undefined,
  )
  return data
}
