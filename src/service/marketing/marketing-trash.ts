import api from '../api'
import { mkt } from './marketing-core'

/**
 * Lixeira da ala (spec R2, C6). Apagar em qualquer módulo manda para cá
 * (`deletedAt`): some de toda tela e total, volta pelo "Restaurar" em até 30
 * dias, e o expurgo apaga de vez depois disso.
 */

export type TrashType =
  | 'card'
  | 'campaign'
  | 'idea'
  | 'link'
  | 'utm'
  | 'activation'
  | 'partner'
  | 'expense'
  | 'recurring_expense'
  | 'quote'
  | 'library_folder'
  | 'library_item'

/** O que toda rota de apagar devolve agora (o "Desfazer" do toast usa isto). */
export interface TrashedRef {
  type: TrashType
  id?: string
  /** Lote (apagar vários arquivos do Acervo de uma vez) */
  ids?: string[]
}

export interface TrashEntry {
  type: TrashType
  typeLabel: string
  id: string
  title: string
  companyId: string | null
  deletedAt: string
  deletedBy: { id: string; name: string } | null
  purgeAt: string
  contents: { folders: number; items: number } | null
  amountCents: number | null
  canRestore: boolean
  canPurge: boolean
}

export interface TrashList {
  items: TrashEntry[]
  retentionDays: number
  truncated: boolean
}

export interface RestoreResult {
  ok: true
  type: TrashType
  restored: Array<{ id: string; title: string; note: string | null }>
  /**
   * Lote: os que não voltaram e por quê (um que falha não para os outros).
   * Um item só não usa isto: o erro sobe com a frase.
   */
  failed?: Array<{ id: string; message: string }>
}

export async function getTrash(groupId: string, params: { type?: string; companyId?: string; q?: string } = {}) {
  const { data } = await api.get<TrashList>(mkt(groupId, '/trash'), { params })
  return data
}

export async function restoreTrash(groupId: string, ref: TrashedRef) {
  const { data } = await api.post<RestoreResult>(mkt(groupId, '/trash/restore'), ref)
  return data
}

export async function purgeTrash(groupId: string, type: TrashType, id: string) {
  const { data } = await api.delete<{ ok: true; removedFiles: number }>(
    mkt(groupId, `/trash/${type}/${encodeURIComponent(id)}`),
  )
  return data
}
