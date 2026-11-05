/**
 * Nome em português dos códigos de evento que a API devolve (spec
 * v2-mobile-e-home). A timeline e o sino mostravam o código cru ("activity ·
 * status_changed", "DEPLOY_FAILED", "COMMENT"): era copy de quem construiu,
 * não de quem usa. Código desconhecido vira um rótulo neutro, nunca o código.
 */

const ENTITY_LABEL: Record<string, string> = {
  activity: 'Tarefa',
  deploy: 'Deploy',
  board: 'Board',
  note: 'Nota',
  bug_report: 'Bug report',
  bugreport: 'Bug report',
  roadmap_month: 'Roadmap',
  roadmap: 'Roadmap',
  comment: 'Comentário',
}

/** Linha de apoio do evento da timeline (o resumo já diz o que aconteceu). */
export function feedEntityLabel(entityType: string | null | undefined): string {
  return ENTITY_LABEL[(entityType ?? '').toLowerCase()] ?? 'Atividade'
}

const INBOX_LABEL: Record<string, string> = {
  ACTIVITY_ASSIGNED: 'Tarefa atribuída',
  ACTIVITY_STATUS: 'Status da tarefa',
  COMMENT: 'Comentário',
  COMMENT_MENTION: 'Menção',
  DEPLOY: 'Deploy',
  DEPLOY_FAILED: 'Deploy falhou',
  MEETING: 'Reunião',
  BUG_REPORT_READY: 'Bug report',
  BOARD_SHARED: 'Board compartilhado',
}

export function inboxTypeLabel(type: string | null | undefined): string {
  return INBOX_LABEL[(type ?? '').toUpperCase()] ?? 'Aviso'
}
