/**
 * Os três tipos que aparecem no calendário e na linha do tempo, numa forma só:
 * item da agenda (RoadmapEntry), entrega (tarefa com prazo) e marco/review.
 * As origens nunca se fundem: quem lê precisa saber se clicar abre a tarefa,
 * o item ou o marco.
 */
import type { RoadmapDelivery, RoadmapEntry, RoadmapMonth } from '@/service/roadmap/roadmap-monthly-service'
import type { RoadmapMilestoneDto } from '@/service/roadmap/roadmap-milestones-service'
import { ROADMAP_CATEGORIES, categoryMeta, testWindow, type CategoryMeta } from './roadmap-meta'

export type RoadmapItem =
  | { kind: 'entry'; key: string; date: string; title: string; entry: RoadmapEntry; monthKey: string; cat: CategoryMeta }
  | { kind: 'delivery'; key: string; date: string; title: string; delivery: RoadmapDelivery }
  | { kind: 'milestone'; key: string; date: string; title: string; milestone: RoadmapMilestoneDto }

/** Filtro da legenda: um tipo de item, as tarefas ou os marcos. */
export type ItemFilterKey = RoadmapEntry['category'] | 'tasks' | 'milestones'

export function filterKeyOf(item: RoadmapItem): ItemFilterKey {
  // Item da agenda do tipo Marco e o marco da linha do tempo são a mesma ideia
  // para quem lê: um filtro só ("Marcos"), não dois chips quase iguais.
  if (item.kind === 'entry') return item.entry.category === 'milestone' ? 'milestones' : item.entry.category
  return item.kind === 'delivery' ? 'tasks' : 'milestones'
}

const CATEGORY_ORDER = new Map(ROADMAP_CATEGORIES.map((c, i) => [c.value, i]))

function rank(item: RoadmapItem): number {
  if (item.kind === 'milestone') return 0
  if (item.kind === 'entry') return 1 + (CATEGORY_ORDER.get(item.entry.category) ?? 9)
  // Atrasada antes da em dia; concluída por último.
  if (item.delivery.overdue) return 20
  return item.delivery.status === 'DONE' ? 40 : 30
}

export function compareItems(a: RoadmapItem, b: RoadmapItem): number {
  return a.date.localeCompare(b.date) || rank(a) - rank(b) || a.title.localeCompare(b.title, 'pt-BR')
}

export function buildItems(months: readonly RoadmapMonth[], milestones: readonly RoadmapMilestoneDto[]): RoadmapItem[] {
  const items: RoadmapItem[] = []
  for (const month of months) {
    for (const entry of month.entries) {
      items.push({ kind: 'entry', key: `e:${entry.id}`, date: entry.date, title: entry.title, entry, monthKey: month.key, cat: categoryMeta(entry.category) })
    }
    for (const delivery of month.deliveries ?? []) {
      items.push({ kind: 'delivery', key: `d:${delivery.activityId}`, date: delivery.date, title: delivery.title, delivery })
    }
  }
  for (const milestone of milestones) {
    items.push({ kind: 'milestone', key: `m:${milestone.id}`, date: milestone.date, title: milestone.title, milestone })
  }
  return items.sort(compareItems)
}

export interface TestBand {
  id: string
  start: string
  end: string
  days: number
  title: string
  milestone: RoadmapMilestoneDto
}

export function testBands(milestones: readonly RoadmapMilestoneDto[]): TestBand[] {
  return milestones
    .filter((m): m is RoadmapMilestoneDto & { testStart: string } => Boolean(m.testStart))
    .map((m) => ({ id: m.id, title: m.title, milestone: m, ...testWindow(m.testStart, m.date) }))
    .sort((a, b) => a.start.localeCompare(b.start))
}

export function groupByDate(items: readonly RoadmapItem[]): { date: string; items: RoadmapItem[] }[] {
  const groups: { date: string; items: RoadmapItem[] }[] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.date === item.date) last.items.push(item)
    else groups.push({ date: item.date, items: [item] })
  }
  return groups
}
