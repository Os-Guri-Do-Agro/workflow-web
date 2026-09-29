/**
 * Criação inline do board do mês (spec board-tarefas-redesign, D5): o "Criar"
 * do rodapé da coluna, o "+" do cabeçalho e a tecla C abrem um campo no lugar;
 * Enter cria a tarefa NAQUELA coluna, no FIM, e o campo continua aberto.
 *
 * Otimista: o card aparece na hora (id `tmp:*`, esmaecido, sem arrastar nem
 * abrir) e some se o POST falhar, com o título de volta no campo. Os pendentes
 * moram FORA do `tasks` (ref que o refetch substitui inteiro): o board os soma
 * depois dos cards reais, então um refetch no meio não os apaga.
 *
 * Servidor, em duas escritas e numa fila (Enter, Enter, Enter mantém a ordem):
 * 1. `POST /activity` já com `status` (o DTO aceita; a tarefa nasce na coluna
 *    certa, sem piscar em "A fazer" nas outras abas). Nasce com `position` 0,
 *    e numa coluna já renumerada isso a poria em 2º lugar, não no fim;
 * 2. `PATCH /move` para o fim da coluna (só se houver outro card nela), o mesmo
 *    caminho do "Mover para", que renumera e avisa o realtime.
 */
import { ref, watch, type Ref } from 'vue'
import activityService from '@/service/activities/activity-service'
import { useToast } from '@/composables/useToast'
import { ACTIVITY_STATUSES } from '../task-meta'
import type { ActivityStatus } from '../activity-types'
import { isPendingTaskId, newPendingTaskId } from '../pending-task'

export interface QuickCreateTarget {
  status: ActivityStatus
  /** Linha do "Agrupar: Pessoa" onde o campo abriu; `null` no board simples. */
  laneKey: string | null
}

export interface QuickCreatePerson {
  id: string
  name: string
}

/** O mínimo de card que a criação monta (o do board do mês). */
export interface QuickCreateCard {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  updatedAt?: string
  recurrenceId?: string | null
  responsibles?: Array<{ userId?: string; user: { id?: string; name: string } }>
  tags?: Array<{ tag: { id: string; name: string; slug: string; color: string | null } }>
  subtasks?: Array<{ id: string; title: string; status: string }>
}

/** Resposta do `POST /activity` (ACTIVITY_INCLUDE), só o que o card usa. */
interface CreatedActivity {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  updatedAt?: string
  recurrenceId?: string | null
  responsibles?: Array<{ userId?: string; user?: { id?: string; name?: string } }>
  tags?: QuickCreateCard['tags']
  subtasks?: Array<{ id: string; title: string; status: string }>
  position?: number | null
}

interface RequestError {
  response?: { data?: { message?: string | string[] } }
}

function apiMessage(error: unknown): string | null {
  const msg = (error as RequestError)?.response?.data?.message
  if (Array.isArray(msg)) return msg.join(', ')
  return msg ?? null
}

/** Fim da coluna quando o board já é de outro mês: o servidor limita ao tamanho. */
const END_OF_COLUMN = 1_000_000

const emptyColumns = <T>(): Record<ActivityStatus, T[]> =>
  Object.fromEntries(ACTIVITY_STATUSES.map((s) => [s.value, [] as T[]])) as Record<
    ActivityStatus,
    T[]
  >

export function useQuickCreate<T extends QuickCreateCard>(opts: {
  /** Colunas REAIS do mês (o ref que o arraste e o realtime mutam). */
  tasks: Ref<Record<ActivityStatus, T[]>>
  monthId: Ref<string>
  /** Quem nasce responsável pela tarefa criada neste lugar (ou ninguém). */
  responsibleFor: (target: QuickCreateTarget) => QuickCreatePerson | null
  /** O card otimista entrou na tela (ex.: avisar que o filtro o esconde). */
  onQueued?: (card: T, target: QuickCreateTarget) => void
  /** A tarefa existe e está no lugar (ex.: anunciar ao leitor de tela). */
  onCreated?: (card: T, target: QuickCreateTarget) => void
  refresh: () => Promise<unknown>
}) {
  const { error: showError } = useToast()

  /** Onde o campo está aberto (uma criação por vez na tela). */
  const composer = ref<QuickCreateTarget | null>(null)
  /** Cards otimistas por coluna, ainda sem resposta do servidor. */
  const pending = ref(emptyColumns<T>()) as Ref<Record<ActivityStatus, T[]>>
  /** Título devolvido ao campo quando o POST falhou. */
  const restore = ref<{ title: string; nonce: number } | null>(null)

  let queue: Promise<void> = Promise.resolve()

  function open(target: QuickCreateTarget) {
    composer.value = { ...target }
  }

  function close() {
    composer.value = null
  }

  // Trocou de mês: o campo e os otimistas eram do board anterior.
  watch(opts.monthId, () => {
    composer.value = null
    pending.value = emptyColumns<T>()
  })

  function dropPending(id: string, status: ActivityStatus) {
    const list = pending.value[status]
    const at = list.findIndex((t) => t.id === id)
    if (at !== -1) list.splice(at, 1)
  }

  function removeReal(id: string) {
    for (const s of ACTIVITY_STATUSES) {
      const list = opts.tasks.value[s.value]
      const at = list?.findIndex((t) => t.id === id) ?? -1
      if (at !== -1) list!.splice(at, 1)
    }
  }

  function toCard(created: CreatedActivity, draft: T): T {
    return {
      ...draft,
      id: created.id,
      title: created.title ?? draft.title,
      priorityNumber: created.priorityNumber ?? 0,
      dueDate: created.dueDate ?? null,
      updatedAt: created.updatedAt ?? draft.updatedAt,
      recurrenceId: created.recurrenceId ?? null,
      responsibles: created.responsibles
        ? created.responsibles.map((r) => ({
            userId: r.userId ?? r.user?.id,
            user: { id: r.user?.id ?? r.userId, name: r.user?.name ?? '' },
          }))
        : draft.responsibles,
      tags: created.tags ?? [],
      subtasks: (created.subtasks ?? []).map((s) => ({ id: s.id, title: s.title, status: s.status })),
    }
  }

  async function persist(
    draft: T,
    target: QuickCreateTarget,
    person: QuickCreatePerson | null,
    monthId: string,
  ) {
    const { status } = target
    let created: CreatedActivity
    try {
      created = await activityService.postActivity({
        title: draft.title,
        description: '',
        priorityNumber: 0,
        monthId,
        status,
        responsibleUserIds: person ? [person.id] : [],
      })
    } catch (error: unknown) {
      dropPending(draft.id, status)
      showError(
        `Não foi possível criar "${draft.title}". ${apiMessage(error) ?? 'Tente de novo.'}`,
      )
      // Rollback: o título volta para o campo (se ele ainda estiver aberto e vazio).
      restore.value = { title: draft.title ?? '', nonce: Date.now() }
      return
    }

    dropPending(draft.id, status)

    // Já é outro mês na tela: só garante o fim da coluna no servidor.
    if (monthId !== opts.monthId.value) {
      await activityService
        .moveActivity(created.id, { status, position: END_OF_COLUMN })
        .catch(() => undefined)
      return
    }

    const card = toCard(created, draft)
    // Um refetch (o realtime de "criada") pode ter trazido o card antes: um só.
    removeReal(card.id)
    const column = opts.tasks.value[status]
    column.push(card)
    const position = column.length - 1

    if (position > 0) {
      try {
        const moved = (await activityService.moveActivity(card.id, {
          status,
          position,
        })) as CreatedActivity | null
        if (moved?.updatedAt) card.updatedAt = moved.updatedAt
      } catch (error: unknown) {
        showError(
          `A tarefa foi criada, mas não foi para o fim da coluna. ${apiMessage(error) ?? ''}`.trim(),
        )
        await opts.refresh()
        return
      }
    }
    opts.onCreated?.(card, target)
  }

  /** Enter no campo. O título já vem limpo (uma linha só). */
  function submit(title: string) {
    const target = composer.value
    const clean = title.replace(/\s*[\r\n]+\s*/g, ' ').trim()
    if (!target || !clean) return
    const person = opts.responsibleFor(target)
    const draft = {
      id: newPendingTaskId(),
      title: clean,
      priorityNumber: 0,
      dueDate: null,
      updatedAt: new Date().toISOString(),
      recurrenceId: null,
      responsibles: person ? [{ userId: person.id, user: { id: person.id, name: person.name } }] : [],
      tags: [],
      subtasks: [],
    } as unknown as T
    pending.value[target.status].push(draft)
    opts.onQueued?.(draft, { ...target })
    const monthId = opts.monthId.value
    queue = queue
      .then(() => persist(draft, { ...target }, person, monthId))
      .catch(() => undefined)
  }

  const isPending = isPendingTaskId

  return { composer, pending, restore, open, close, submit, isPending }
}
