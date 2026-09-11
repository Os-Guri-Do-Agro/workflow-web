/**
 * Tradução entre o vocabulário da TELA e o da API.
 *
 * Existe como arquivo próprio, e não escondida dentro do service ou do
 * composable, porque é exatamente aqui que uma integração silenciosamente
 * quebra: três campos mudam de forma no caminho, e nenhum deles dá erro quando
 * traduzido errado — a regra só passa a gerar as datas erradas.
 *
 * As três (§6.1 de `docs/specs/tarefas-recorrentes-frontend.md`):
 *
 * 1. **A frequência muda de caixa.** `'weekly'` na tela, `'WEEKLY'` na API.
 * 2. **`monthDay` vira dois campos.** A tela usa a sentinela `'last'`; a API
 *    separa em `monthDay: null` + `monthDayLast: true`. A sentinela é melhor
 *    para o `<select>` (uma opção a mais na mesma lista) e o par é melhor para
 *    o banco (nada de número mágico) — cada lado fica com a forma que serve.
 * 3. **Responsável deixa de ser nome.** O protótipo guardava nomes por não ter
 *    catálogo de membros; a API quer `responsibleUserIds`.
 *
 * Funções puras, sem Vue e sem HTTP: dá para testar com entrada e saída.
 */
import type {
  ApiBoardRecurrence,
  ApiRecurrence,
  ApiRecurrenceRule,
  RecurrenceCreatePayload,
  RecurrenceRuleInput,
} from '@/service/activities/activity-recurrence-service'
import type {
  RecurrenceFrequency,
  RecurrenceRule,
  RecurringTemplate,
} from './recurrence-types'

// ── Regra ────────────────────────────────────────────────────────────────────

/** `'weekly'` → `'WEEKLY'`. */
export function ruleToApi(rule: RecurrenceRule): RecurrenceRuleInput {
  const last = rule.monthDay === 'last'
  return {
    frequency: rule.frequency.toUpperCase() as ApiRecurrenceRule['frequency'],
    interval: Math.max(1, Math.trunc(rule.interval) || 1),
    weekdays: [...rule.weekdays].sort((a, b) => a - b),
    // `monthDayLast` vence o `monthDay` no servidor; mandar `null` junto evita
    // depender dessa precedência para o resultado estar certo.
    monthDay: last ? null : Number(rule.monthDay) || 1,
    monthDayLast: last,
    skipWeekends: rule.skipWeekends,
    startDate: rule.startDate,
    endDate: rule.endDate,
  }
}

/** `'WEEKLY'` → `'weekly'`, e os dois campos de dia do mês viram um. */
export function ruleFromApi(rule: ApiRecurrenceRule): RecurrenceRule {
  return {
    frequency: rule.frequency.toLowerCase() as RecurrenceFrequency,
    interval: rule.interval,
    weekdays: rule.weekdays ?? [],
    // A tela sempre tem um dia do mês para mostrar no `<select>`, mesmo numa
    // regra semanal onde ele é ignorado: `1` é o padrão do formulário vazio.
    monthDay: rule.monthDayLast ? 'last' : (rule.monthDay ?? 1),
    skipWeekends: rule.skipWeekends,
    startDate: rule.startDate,
    endDate: rule.endDate,
  }
}

// ── Modelo da tarefa ─────────────────────────────────────────────────────────

/**
 * O que o formulário da tela produz, no formato do `POST`/`PATCH`.
 *
 * `tagIds` e `responsibleUserIds` são conjuntos COMPLETOS (a mesma gramática do
 * `PATCH /activity/:id`): mandar `[]` desvincula tudo, e omitir o campo não
 * toca em nada. Por isso eles sempre vão — o formulário sempre conhece o
 * conjunto inteiro, e omitir aqui significaria "não mexi", que seria mentira.
 */
export function templateToApi(
  template: Omit<RecurringTemplate, 'id' | 'createdAt'>,
  /** Ids dos responsáveis; a tela guarda ids de membro desde a troca pela API. */
  responsibleUserIds: string[],
): RecurrenceCreatePayload {
  return {
    title: template.title,
    description: template.description || null,
    priorityNumber: template.priorityNumber,
    initialStatus: template.initialStatus,
    active: template.active,
    responsibleUserIds,
    tagIds: template.tags.map((t) => t.id),
    subtasks: template.subtasks.map((s) => ({
      title: s.title,
      description: s.description || null,
    })),
    rule: ruleToApi(template.rule),
  }
}

/** A rotina completa da API no formato que os componentes já consomem. */
export function templateFromApi(row: ApiRecurrence): RecurringTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    priorityNumber: row.priorityNumber,
    initialStatus: row.initialStatus,
    // Os componentes desenham NOME (avatar e tooltip). O id vive no formulário,
    // que refaz a ida por `responsibleUserIds`.
    assignees: row.responsibles.map((r) => r.user.name),
    tags: row.tags.map((link) => link.tag),
    subtasks: row.subtasks.map((s) => ({
      title: s.title,
      description: s.description ?? '',
    })),
    rule: ruleFromApi(row.rule),
    active: row.active,
    createdAt: row.createdAt?.slice(0, 10) ?? '',
  }
}

/**
 * O resumo do board como um `RecurringTemplate` parcial.
 *
 * O board manda menos campos (§2.3 do contrato: sem descrição, tags nem
 * responsáveis). Preencher os que faltam com vazio é honesto **para o uso que
 * este objeto tem**: desenhar a Agenda e rotular o card com `describeRule`.
 * Quem precisa da rotina inteira — o diálogo de gestão — lê da lista completa.
 */
export function templateFromBoard(row: ApiBoardRecurrence): RecurringTemplate {
  return {
    id: row.id,
    title: row.title,
    description: '',
    priorityNumber: 0,
    initialStatus: row.initialStatus,
    assignees: [],
    tags: [],
    subtasks: [],
    rule: ruleFromApi(row.rule),
    active: row.active,
    createdAt: '',
  }
}
