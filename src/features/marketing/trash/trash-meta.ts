import {
  FileImage,
  FileText,
  Folder,
  Image,
  KeyRound,
  Lightbulb,
  Link2,
  PartyPopper,
  Receipt,
  Repeat,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-vue-next'
import type { TrashType } from '@/service/marketing/marketing-trash'

/**
 * Os 12 tipos da lixeira (espelho de `marketing-trash.ts` da API). `feminine`:
 * "apagada hoje", "foi apagada de vez" (Campanha, Ideia, UTM, Ativação, Pasta).
 */
export const TRASH_TYPE_META: Record<TrashType, { label: string; icon: LucideIcon; finance?: boolean; feminine?: boolean }> = {
  card: { label: 'Card', icon: FileImage },
  campaign: { label: 'Campanha', icon: Target, feminine: true },
  idea: { label: 'Ideia', icon: Lightbulb, feminine: true },
  link: { label: 'Link do cofre', icon: KeyRound },
  utm: { label: 'UTM', icon: Link2, feminine: true },
  activation: { label: 'Ativação', icon: PartyPopper, feminine: true },
  partner: { label: 'Parceiro', icon: Users },
  expense: { label: 'Lançamento', icon: Receipt, finance: true },
  recurring_expense: { label: 'Recorrente', icon: Repeat, finance: true },
  quote: { label: 'Orçamento', icon: FileText },
  library_folder: { label: 'Pasta do Acervo', icon: Folder, feminine: true },
  library_item: { label: 'Arquivo do Acervo', icon: Image },
}

/** "apagado" ou "apagada", pelo tipo. */
export function deletedWord(type: TrashType): string {
  return TRASH_TYPE_META[type]?.feminine ? 'apagada' : 'apagado'
}

export const TRASH_TYPES = Object.keys(TRASH_TYPE_META) as TrashType[]

/** "há 2 dias", "hoje" (Brasília não importa aqui: é diferença de tempo). */
export function agoLabel(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

/** "sai em 28 dias", "sai amanhã", "sai hoje". */
export function purgeLabel(iso: string, now = Date.now()): string {
  const days = Math.ceil((new Date(iso).getTime() - now) / 86_400_000)
  if (days <= 0) return 'sai hoje'
  if (days === 1) return 'sai amanhã'
  return `sai em ${days} dias`
}

/** "com 1 subpasta e 3 arquivos" (pasta do Acervo). */
export function contentsLabel(c: { folders: number; items: number } | null): string {
  if (!c || (!c.folders && !c.items)) return ''
  const parts: string[] = []
  if (c.folders) parts.push(c.folders === 1 ? '1 subpasta' : `${c.folders} subpastas`)
  if (c.items) parts.push(c.items === 1 ? '1 arquivo' : `${c.items} arquivos`)
  return `com ${parts.join(' e ')}`
}
