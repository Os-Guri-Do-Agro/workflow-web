/**
 * Protótipo de tarefas recorrentes — modelo de dados.
 *
 * PROTÓTIPO: nada aqui fala com a API. O objetivo é fechar o desenho do
 * produto (o que é um modelo, o que é uma ocorrência, o que a pessoa edita)
 * antes de existir contrato de backend. Quando o contrato nascer, este arquivo
 * vira a base do DTO — por isso os campos usam os MESMOS nomes da atividade
 * real (`priorityNumber`, `dueDate`, `status`), e não sinônimos inventados.
 *
 * Três decisões que estruturam o resto:
 *
 * 1. **Modelo ≠ ocorrência.** O que a pessoa cria é um MODELO (`RecurringTemplate`):
 *    o texto da tarefa mais a regra de repetição. O que ela vê no board de cada
 *    dia é uma OCORRÊNCIA (`RecurringOccurrence`), derivada da regra. Ocorrência
 *    não é gravada até alguém mexer nela — ver `OccurrenceOverride`.
 *
 * 2. **Tarefa avulsa é o mesmo objeto**, com `frequency: 'once'`. Assim o
 *    formulário é um só: criar "toda segunda" e criar "só dia 12" seguem o
 *    mesmo caminho, e transformar uma na outra é trocar um campo — não
 *    recriar a tarefa.
 *
 * 3. **O mês é derivado do prazo, nunca escolhido à parte.** Não existe campo
 *    `monthId` aqui de propósito: `dueDate` manda. Mudar a data para novembro
 *    move a tarefa para novembro sozinha, que é exatamente a dor de copiar o
 *    quadro inteiro na virada do mês.
 */
import type { ActivityStatus } from '../activity-types'

export type RecurrenceFrequency = 'once' | 'daily' | 'weekly' | 'monthly'

/** Dia do mês, ou `'last'` para "último dia" (28/29/30/31 conforme o mês). */
export type MonthDay = number | 'last'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  /** A cada N dias/semanas/meses. `1` = toda semana, `2` = semana sim, semana não. */
  interval: number
  /**
   * Dias da semana da regra semanal. `0` = domingo … `6` = sábado.
   * Ignorado nas outras frequências.
   */
  weekdays: number[]
  /** Dia do mês da regra mensal. Ignorado nas outras frequências. */
  monthDay: MonthDay
  /**
   * Regra diária que pula sábado e domingo. É o caso comum de "todo dia" no
   * trabalho: quase ninguém quer o card nascendo no fim de semana.
   */
  skipWeekends: boolean
  /** Primeira data possível, `'YYYY-MM-DD'`. Também é o prazo do `'once'`. */
  startDate: string
  /** Última data possível. `null` = sem fim (o caso das tarefas fixas). */
  endDate: string | null
}

/**
 * O que a pessoa escreve uma vez e vale para todas as repetições.
 *
 * `initialStatus` existe porque tarefa nem sempre nasce em "A fazer": as fixas
 * do mês vivem em "Em teste" desde o primeiro dia, e obrigar a arrastar cada
 * uma depois de criar é trabalho que a ferramenta estava criando, não tirando.
 */
export interface RecurringTemplate {
  id: string
  title: string
  description: string
  priorityNumber: number
  /** Status em que CADA ocorrência nasce. */
  initialStatus: ActivityStatus
  /** Nomes, não ids: o protótipo não tem catálogo de membros de verdade. */
  assignees: string[]
  tags: RecurringTag[]
  subtasks: RecurringSubtask[]
  rule: RecurrenceRule
  /**
   * Pausado não gera ocorrência NOVA, mas as que já foram tocadas continuam
   * na tela. Pausar não é apagar histórico.
   */
  active: boolean
  createdAt: string
}

export interface RecurringTag {
  id: string
  name: string
  slug: string
  color: string | null
}

export interface RecurringSubtask {
  title: string
  description: string
}

/**
 * A alteração que a pessoa fez em UMA ocorrência específica.
 *
 * Só o que foge do modelo é gravado. Ocorrência intocada não ocupa espaço
 * nenhum: ela é recalculada da regra toda vez. Isso é o que permite "toda
 * segunda, para sempre" sem gerar mil linhas por antecedência.
 */
export interface OccurrenceOverride {
  status?: ActivityStatus
  /** Ocorrência dispensada nesta data (feriado, semana atípica). */
  skipped?: boolean
  /** Prazo remarcado só desta vez, sem mexer na regra. */
  dueDate?: string
}

/** A tarefa como ela aparece no board/agenda de um dia. Sempre derivada. */
export interface RecurringOccurrence {
  /** `templateId|YYYY-MM-DD` — estável, para o override achar o dono. */
  id: string
  templateId: string
  title: string
  description: string
  priorityNumber: number
  status: ActivityStatus
  /** `'YYYY-MM-DD'`. É o prazo E o dia em que ela aparece. */
  date: string
  assignees: string[]
  tags: RecurringTag[]
  subtasks: RecurringSubtask[]
  frequency: RecurrenceFrequency
  /** `true` quando existe override: a pessoa já mexeu nesta data. */
  touched: boolean
  skipped: boolean
}

/** Chave do override. Uma função para os dois lados nunca discordarem. */
export function occurrenceKey(templateId: string, date: string): string {
  return `${templateId}|${date}`
}
