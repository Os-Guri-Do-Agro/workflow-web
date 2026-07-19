/**
 * Formato REAL devolvido pela API em `GET /activity/:id` e `PATCH /activity/:id`
 * (o `ACTIVITY_INCLUDE` do `activity.service.ts` da API).
 *
 * Existe porque o `Activity` de `core/types` diverge do contrato: lá os campos
 * são `assignees: string[]`, `status: 'todo'`, `month: string`. A API devolve
 * `responsibles: [{ userId, user }]`, `status: 'TODO'` e `monthId` escalar.
 * Tipar o painel pelo tipo errado seria refatorar no escuro.
 */
export type ActivityStatus = 'TODO' | 'IN_PROGRESS' | 'IN_TESTING' | 'DONE'

export interface ActivityUser {
  id: string
  name: string
  email?: string
}

export interface ActivityResponsible {
  userId: string
  user: ActivityUser
}

export interface ActivityAttachment {
  id: string
  filename: string
  url: string
}

export interface ActivitySubtask {
  id: string
  title: string
  description?: string | null
  status: string
  priorityNumber: number
  dueDate: string | null
  responsibles?: ActivityResponsible[]
}

export interface ActivityDetail {
  id: string
  title: string
  description: string | null
  status: string
  priorityNumber: number
  dueDate: string | null
  createdAt: string
  updatedAt?: string
  monthId?: string | null
  /** Nem toda resposta traz o mês expandido; o escalar `monthId` sempre vem. */
  month?: { id: string; name: string } | null
  parentId?: string | null
  responsibles?: ActivityResponsible[]
  attachments?: ActivityAttachment[]
  subtasks?: ActivitySubtask[]
}

/** Corpo aceito por `PATCH /activity/:id`. Tudo opcional: o backend é parcial. */
export interface ActivityPatchPayload {
  title?: string
  description?: string
  priorityNumber?: number
  /** `null` limpa a data no banco; `undefined` some do JSON e não limpa nada. */
  dueDate?: string | null
  monthId?: string
  responsibleUserIds?: string[]
}
