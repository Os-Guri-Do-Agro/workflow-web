/**
 * "Agrupar: Pessoa" do board do mês (spec board-tarefas-redesign, D12): as
 * mesmas quatro colunas, em linhas por responsável.
 *
 * Regras:
 * - a tarefa fica na linha do PRIMEIRO responsável; os outros continuam como
 *   avatar no card (o card esconde só o dono da linha);
 * - "Sem responsável" vai no topo quando existe; depois a linha de quem olha
 *   ("você") e o resto em ordem alfabética. Ordem por carga faria as linhas
 *   trocarem de lugar a cada tarefa criada, e a pessoa perderia a própria;
 * - dentro de cada célula a ordem é a da coluna (a ordem manual do mês).
 *
 * É sempre COMPUTADO a partir das colunas já filtradas, que por sua vez saem do
 * mesmo ref que o arraste e o realtime mutam: nenhuma linha guarda cópia de card
 * (risco Médio da spec).
 *
 * Exemplo (Ana é a pessoa logada):
 *
 *   TODO: [t1 (Leo, Ana), t2 (sem ninguém)]   IN_PROGRESS: [t3 (Ana)]
 *   → [ Sem responsável: TODO [t2] ]
 *     [ Ana (você):      IN_PROGRESS [t3] ]
 *     [ Leo:             TODO [t1] ]          (t1 mostra o avatar da Ana)
 */
import { ACTIVITY_STATUSES } from './task-meta'
import type { ActivityStatus } from './activity-types'

/** Chave da linha "Sem responsável". Não colide com id (cuid) nem com nome. */
export const NOBODY_LANE = '__sem-responsavel__'

export interface LaneResponsible {
  userId?: string
  user: { id?: string; name: string }
}

export interface LaneTask {
  id: string
  responsibles?: LaneResponsible[]
}

export interface BoardLane<T extends LaneTask = LaneTask> {
  /** id da pessoa (ou o nome, quando nenhum card traz o id); `NOBODY_LANE` para ninguém. */
  key: string
  /** `null` na linha "Sem responsável". */
  name: string | null
  isMe: boolean
  columns: Record<ActivityStatus, T[]>
  counts: Record<ActivityStatus, number>
  total: number
}

function emptyColumns<V>(make: () => V): Record<ActivityStatus, V> {
  return Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s.value, make()])) as Record<
    ActivityStatus,
    V
  >
}

export function groupByPerson<T extends LaneTask>(
  columns: Partial<Record<ActivityStatus, T[]>>,
  personKey: (r: LaneResponsible) => string,
  isMe: (r: LaneResponsible) => boolean,
): BoardLane<T>[] {
  const lanes = new Map<string, BoardLane<T>>()

  const laneFor = (key: string, name: string | null, me: boolean): BoardLane<T> => {
    let lane = lanes.get(key)
    if (!lane) {
      lane = {
        key,
        name,
        isMe: me,
        columns: emptyColumns<T[]>(() => []),
        counts: emptyColumns(() => 0),
        total: 0,
      }
      lanes.set(key, lane)
    }
    return lane
  }

  for (const { value: status } of ACTIVITY_STATUSES) {
    for (const task of columns[status] ?? []) {
      const first = task.responsibles?.[0]
      const lane = first
        ? laneFor(personKey(first), first.user.name, isMe(first))
        : laneFor(NOBODY_LANE, null, false)
      lane.columns[status].push(task)
      lane.counts[status] += 1
      lane.total += 1
    }
  }

  return [...lanes.values()].sort((a, b) => {
    if (a.key === NOBODY_LANE) return -1
    if (b.key === NOBODY_LANE) return 1
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1
    return (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR')
  })
}
