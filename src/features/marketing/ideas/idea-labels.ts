import { Bookmark, Lightbulb, TrendingUp, type LucideIcon } from 'lucide-vue-next'
import type { IdeaKind } from '@/service/marketing/marketing-ideas'

export const IDEA_KIND_LABEL: Record<IdeaKind, string> = {
  IDEA: 'Ideia',
  TREND: 'Trend',
  REFERENCE: 'Referência',
}

export const IDEA_KIND_PLURAL: Record<IdeaKind, string> = {
  IDEA: 'Ideias',
  TREND: 'Trends',
  REFERENCE: 'Referências',
}

export const IDEA_KIND_HINT: Record<IdeaKind, string> = {
  IDEA: 'Algo que a marca poderia fazer.',
  TREND: 'Um formato ou assunto em alta que vale aproveitar.',
  REFERENCE: 'Um post de outra conta para servir de inspiração.',
}

export const IDEA_KIND_ICON: Record<IdeaKind, LucideIcon> = {
  IDEA: Lightbulb,
  TREND: TrendingUp,
  REFERENCE: Bookmark,
}

/** Cor do tipo (chave de `--tag-*`). */
export const IDEA_KIND_TONE: Record<IdeaKind, string> = {
  IDEA: 'amber',
  TREND: 'pink',
  REFERENCE: 'indigo',
}

/** `https://www.tiktok.com/@x/video/1` -> `tiktok.com` (null se não for URL) */
export function referenceDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Link só se for http/https: o que vem do banco nunca vira `javascript:` no href. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/** "hoje", "ontem", "há 3 dias", ou a data curta quando passa de um mês. */
export function relativeDay(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  return then.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
