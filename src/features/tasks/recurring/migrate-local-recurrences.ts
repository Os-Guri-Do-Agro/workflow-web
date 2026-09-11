/**
 * Migração das rotinas locais para a API — uma vez, por empresa.
 *
 * Quem usou a feature no modo local tem regras num `localStorage` que ninguém
 * mais vai ler quando a flag virar. Sem migração, elas simplesmente somem da
 * tela no dia do deploy — e quem as escreveu não tem como saber que existiam.
 *
 * Três regras de segurança, e as três importam:
 *
 * 1. **O registro local NUNCA é apagado.** Nem depois de migrar com sucesso.
 *    Ele é o backup: se a migração falhar no meio, se o servidor recusar uma
 *    regra, ou se alguém precisar conferir o que havia, o dado original
 *    continua onde estava. Apagar economizaria alguns KB e custaria o único
 *    caminho de volta.
 * 2. **Roda uma vez por empresa**, marcada numa chave SEPARADA
 *    (`workflow:recurring:migrated:v1:<companyId>`). Marca separada em vez de
 *    mutação no registro original mantém a regra 1 verdadeira.
 * 3. **Falha parcial não perde o resto.** Cada regra é enviada por conta
 *    própria; uma recusada não impede as outras, e o relatório diz quais
 *    ficaram para trás.
 */
import { safeStorage } from '@/utils/safe-storage'
import activityRecurrenceService from '@/service/activities/activity-recurrence-service'
import type { RecurringTemplate } from './recurrence-types'
import { ruleToApi } from './recurrence-api-mapping'

const STORAGE_PREFIX = 'workflow:recurring:v1:'
const MIGRATED_PREFIX = 'workflow:recurring:migrated:v1:'

export interface MigrationReport {
  /** Quantas rotinas locais existiam. */
  found: number
  /** Quantas foram criadas na API. */
  migrated: number
  /** Títulos das que o servidor recusou — ficam no registro local, intactas. */
  failed: string[]
}

const EMPTY: MigrationReport = { found: 0, migrated: 0, failed: [] }

function readLocalTemplates(companyId: string): RecurringTemplate[] {
  const raw = safeStorage.getItem(STORAGE_PREFIX + companyId)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { templates?: unknown }
    return Array.isArray(parsed.templates) ? (parsed.templates as RecurringTemplate[]) : []
  } catch {
    return []
  }
}

export function alreadyMigrated(companyId: string): boolean {
  return safeStorage.getItem(MIGRATED_PREFIX + companyId) !== null
}

/**
 * Envia as rotinas locais desta empresa para a API.
 *
 * Devolve o relatório para a tela avisar o que aconteceu — migração silenciosa
 * é pior que nenhuma: a pessoa vê rotinas que não criou nesta sessão e não sabe
 * de onde vieram.
 *
 * As **tags e os responsáveis não vão junto**: no modo local eles eram nomes
 * soltos, sem id de membro nem de tag da empresa, e inventar vínculo errado
 * numa rotina é pior que deixá-la sem vínculo — o erro seria copiado para toda
 * ocorrência futura. Título, descrição, prioridade, status inicial, subtarefas
 * e a REGRA (que é o trabalho de verdade) vão inteiros.
 */
export async function migrateLocalRecurrences(companyId: string): Promise<MigrationReport> {
  if (!companyId || alreadyMigrated(companyId)) return EMPTY

  const templates = readLocalTemplates(companyId)
  if (!templates.length) {
    // Marca mesmo sem nada a fazer: evita reler o storage a cada abertura do mês.
    safeStorage.setItem(MIGRATED_PREFIX + companyId, new Date().toISOString())
    return EMPTY
  }

  const report: MigrationReport = { found: templates.length, migrated: 0, failed: [] }

  for (const template of templates) {
    try {
      await activityRecurrenceService.create(companyId, {
        title: template.title,
        description: template.description || null,
        priorityNumber: template.priorityNumber,
        initialStatus: template.initialStatus,
        active: template.active,
        responsibleUserIds: [],
        tagIds: [],
        subtasks: (template.subtasks ?? []).map((s) => ({
          title: s.title,
          description: s.description || null,
        })),
        rule: ruleToApi(template.rule),
      })
      report.migrated++
    } catch {
      report.failed.push(template.title)
    }
  }

  // Marca mesmo com falha parcial: repetir a migração inteira criaria duplicata
  // das que já foram. O que falhou continua no registro local para ser
  // recriado à mão, e o relatório diz quais são.
  safeStorage.setItem(MIGRATED_PREFIX + companyId, new Date().toISOString())
  return report
}
