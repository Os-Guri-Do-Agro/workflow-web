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
  variable: 'Variável',
  user: 'Pessoa',
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
  // Ala Marketing: `MARKETING_<kind>` (kinds do `notify` em workflow-api/src/marketing).
  MARKETING_APPROVAL_REQUESTED: 'Pedido de aprovação',
  MARKETING_APPROVED: 'Card aprovado',
  MARKETING_CHANGES_REQUESTED: 'Ajuste pedido',
  MARKETING_NEW_VERSION: 'Nova versão',
  MARKETING_MENTIONED: 'Menção',
  MARKETING_CARD_ASSIGNED: 'Card para você',
  MARKETING_DEADLINE_TOMORROW: 'Prazo amanhã',
  MARKETING_PUBLISH_TOMORROW: 'Publicação amanhã',
  MARKETING_CAMPAIGN_APPROVAL_REQUESTED: 'Campanha para aprovar',
  MARKETING_CAMPAIGN_APPROVED: 'Campanha aprovada',
  MARKETING_CAMPAIGN_REOPENED: 'Campanha reaberta',
  MARKETING_MEMBER_ADDED: 'Ala Marketing',
  MARKETING_PROOF_RECEIVED: 'Prova da gráfica',
  // R2 (A): publicação nas redes
  MARKETING_PUBLISH_NOW: 'Hora de publicar',
  MARKETING_PUBLISH_DRAFT: 'Rascunho no app',
  MARKETING_PUBLISH_FAILED: 'Publicação falhou',
  MARKETING_PUBLISH_CANCELED: 'Publicação cancelada',
  MARKETING_PUBLISHED: 'Publicado',
  MARKETING_SOCIAL_EXPIRING: 'Conta de rede vencendo',
  MARKETING_SOCIAL_EXPIRED: 'Reconectar rede',
  // R2 (C4): meta de cadência da semana atrasada
  MARKETING_CADENCE_BEHIND: 'Cadência da semana',
}

export function inboxTypeLabel(type: string | null | undefined): string {
  const key = (type ?? '').toUpperCase()
  // Tipo novo da ala que ainda não tem rótulo: ao menos diz de onde veio.
  return INBOX_LABEL[key] ?? (key.startsWith('MARKETING_') ? 'Marketing' : 'Aviso')
}
