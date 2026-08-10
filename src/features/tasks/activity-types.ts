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

/**
 * Etiqueta da empresa. `color` é CHAVE de paleta (`blue`, `amber`), nunca hex:
 * quem resolve para token é `tag-palette.ts`, senão a cor quebra num dos temas.
 * `null` = cor determinística pelo slug.
 */
export interface ActivityTag {
  id: string
  name: string
  slug: string
  color: string | null
}

/** Como a tag chega dentro da atividade (a API devolve a linha da pivot). */
export interface ActivityTagLink {
  tag: ActivityTag
}

export interface ActivityAttachment {
  id: string
  filename: string
  url: string
  /**
   * Nulos no acervo legado (anexos gravados antes de ago/2026 só tinham url e
   * filename). `mimeType` foi preenchido por extensão na migration, best-effort;
   * `size` e `uploadedBy` são desconhecidos e continuam nulos para sempre.
   * Quem renderiza precisa tratar os três, não assumir.
   */
  mimeType?: string | null
  size?: number | null
  uploadedBy?: { id: string; name: string } | null
  createdAt?: string
}

/**
 * Documento markdown SEM o conteúdo.
 *
 * É o que vem em toda listagem. O `content` mora em `GET /activity/doc/:id` de
 * propósito: uma atividade com três specs dentro do payload do board acaba com
 * a tela. Ver `useActivityDocs` para o carregamento sob demanda.
 */
export interface ActivityDocMeta {
  id: string
  title: string
  filename: string
  isPrimary: boolean
  position: number
  createdAt: string
  updatedAt: string
  createdBy?: { id: string; name: string } | null
}

/** O documento com o markdown cru. Só `GET /activity/doc/:id` devolve isto. */
export interface ActivityDoc extends ActivityDocMeta {
  content: string
  activityId: string
}

export interface ActivitySubtask {
  id: string
  title: string
  description?: string | null
  status: string
  priorityNumber: number
  dueDate: string | null
  responsibles?: ActivityResponsible[]
  tags?: ActivityTagLink[]
  /** Quantos documentos a frente tem. A lista do pai mostra o número, não os docs. */
  _count?: { docs: number }
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
  tags?: ActivityTagLink[]
  docs?: ActivityDocMeta[]
  /**
   * Documentos do módulo (a atividade pai), vistos de dentro da frente. Sempre
   * vazio quando a atividade não tem pai. Somente leitura: editar é na origem.
   */
  inheritedDocs?: ActivityDocMeta[]
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
  /**
   * Conjunto COMPLETO de tags. `[]` desvincula todas. Desvincular não exclui a
   * tag: ela continua no catálogo da empresa (tag é permanente, por decisão de
   * produto). Ausente = não mexe nas tags.
   */
  tagIds?: string[]
}

/** Achata a pivot: o componente quer a tag, não a linha de ligação. */
export function tagsOf(entity: {
  tags?: ActivityTagLink[] | null
}): ActivityTag[] {
  return (entity.tags ?? []).map((link) => link.tag)
}
