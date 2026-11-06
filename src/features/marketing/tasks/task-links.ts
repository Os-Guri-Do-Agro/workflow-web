import type { RouteLocationRaw } from 'vue-router'
import type { CardTaskItem, TaskMonth } from '@/service/marketing/marketing-tasks'

/**
 * Peças da tarefa do Nevo ligada ao card (R1, P3) que mais de uma tela usa.
 *
 * Chave do Vue Query dentro da ala SEMPRE sob `['marketing', groupId, ...]`:
 * o socket `marketing:changed` (ligar, desligar e o sync emitem) invalida o
 * grupo inteiro e a lista do card atualiza sozinha.
 */
export const taskKeys = {
  card: (groupId: string, cardId: string) => ['marketing', groupId, 'cards', 'tasks', cardId] as const,
  candidates: (groupId: string, filter: unknown) => ['marketing', groupId, 'tasks', 'candidates', filter] as const,
  /** Todas as listas de candidatas do grupo (qualquer card, busca ou empresa). */
  allCandidates: (groupId: string) => ['marketing', groupId, 'tasks', 'candidates'] as const,
  /** Painel da tarefa no Nevo: fora da ala (não tem grupo na chave). */
  ofTask: (activityId: string, companyId: string | null) => ['marketing-task-cards', activityId, companyId] as const,
  /** Prefixo de todos os painéis de tarefa (o socket da ala não alcança esta chave). */
  ofTaskAll: ['marketing-task-cards'] as const,
}

/**
 * "Abrir no board": o mesmo link que o aviso da tarefa usa
 * (`/tasks/<mês>?task=<id>&company=<empresa>`). O board troca a empresa ativa
 * pelo `?company=` antes de qualquer consulta, então funciona com outra
 * empresa aberta no topo. `null` para quem não é da empresa.
 */
export function boardLinkFor(item: CardTaskItem): RouteLocationRaw | null {
  if (!item.canOpen || !item.monthId || !item.activityId || !item.companyId) return null
  return { path: `/tasks/${item.monthId}`, query: { task: item.activityId, company: item.companyId } }
}

/** "Novembro · Q4". */
export function monthLabel(month: TaskMonth | null | undefined): string {
  if (!month) return ''
  return `${month.name} · ${month.quarter}`
}
