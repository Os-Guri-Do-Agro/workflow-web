/**
 * Store do protótipo de tarefas recorrentes.
 *
 * PROTÓTIPO: estado em memória de módulo (fora do `useRecurringTasks`), então
 * navegar para outra tela e voltar não zera o que foi criado — e nenhuma
 * requisição sai daqui. Quando o backend existir, este arquivo vira o
 * composable de Vue Query e o resto da feature não muda: as telas só falam com
 * a API que está exposta no `return`.
 *
 * O ponto do desenho é que **ocorrência não é gravada**. As datas saem da regra
 * a cada render (`expandRule`); só o que a pessoa mudou à mão em uma data
 * específica vira registro (`overrides`). Sem isso, "toda segunda, para sempre"
 * exigiria materializar o calendário inteiro por antecedência — e a virada de
 * mês voltaria a ser um trabalho manual, que é o problema que a feature existe
 * para matar.
 */
import { computed, reactive, ref, type Ref } from 'vue'
import type { ActivityStatus } from '../activity-types'
import type {
  OccurrenceOverride,
  RecurringOccurrence,
  RecurringTemplate,
} from './recurrence-types'
import { occurrenceKey } from './recurrence-types'
import { MOCK_TEMPLATES } from './recurring-mock'
import {
  dateInMonth,
  expandRule,
  monthKeyOf,
  monthRange,
  today,
} from './recurrence-engine'

// ── Estado do protótipo (módulo, não componente) ─────────────────────────────

const templates = ref<RecurringTemplate[]>(
  // Cópia profunda barata: a semente é constante e não pode ser mutada pelo
  // primeiro `patchTemplate` que rodar.
  JSON.parse(JSON.stringify(MOCK_TEMPLATES)) as RecurringTemplate[],
)

const overrides = reactive<Record<string, OccurrenceOverride>>({})

let seq = 0
const newId = () => `tpl-local-${Date.now().toString(36)}-${seq++}`

// ── Derivação de ocorrências ─────────────────────────────────────────────────

/**
 * Monta a ocorrência de um modelo numa data, já com o override aplicado.
 *
 * Devolve `null` quando a data foi dispensada e o chamador não pediu para ver
 * dispensadas — o board não deve mostrar o que a pessoa tirou da frente.
 */
function buildOccurrence(
  template: RecurringTemplate,
  date: string,
  includeSkipped: boolean,
): RecurringOccurrence | null {
  const override = overrides[occurrenceKey(template.id, date)]
  if (override?.skipped && !includeSkipped) return null

  return {
    id: occurrenceKey(template.id, date),
    templateId: template.id,
    title: template.title,
    description: template.description,
    priorityNumber: template.priorityNumber,
    // Sem override, a ocorrência nasce no status do modelo. É isso que faz a
    // fixa do mês aparecer direto em "Em teste" sem ninguém arrastar.
    status: override?.status ?? template.initialStatus,
    date: override?.dueDate ?? date,
    assignees: template.assignees,
    tags: template.tags,
    subtasks: template.subtasks,
    frequency: template.rule.frequency,
    touched: !!override,
    skipped: !!override?.skipped,
  }
}

/**
 * Ocorrências de todos os modelos dentro de `[from, to]`.
 *
 * Modelo pausado só entra pelas datas que a pessoa já tocou: pausar interrompe
 * a geração daqui para a frente, não apaga o que já estava em andamento.
 */
function occurrencesInRange(
  from: string,
  to: string,
  opts?: { includeSkipped?: boolean },
): RecurringOccurrence[] {
  const includeSkipped = opts?.includeSkipped ?? false
  const out: RecurringOccurrence[] = []

  for (const template of templates.value) {
    for (const date of expandRule(template.rule, from, to)) {
      const touched = !!overrides[occurrenceKey(template.id, date)]
      if (!template.active && !touched) continue
      const occurrence = buildOccurrence(template, date, includeSkipped)
      if (occurrence) out.push(occurrence)
    }
  }

  // Ordem estável: dia, depois prioridade (P0 primeiro), depois título. Sem o
  // desempate por título, dois cards de mesma prioridade trocariam de lugar a
  // cada render e a lista pareceria instável.
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.priorityNumber - b.priorityNumber ||
      a.title.localeCompare(b.title),
  )
}

// ── API pública ──────────────────────────────────────────────────────────────

export function useRecurringTasks(monthKey: Ref<string>) {
  const range = computed(() => monthRange(monthKey.value))

  /** As ocorrências do mês selecionado, prontas para agenda e board. */
  const monthOccurrences = computed(() =>
    occurrencesInRange(range.value.start, range.value.end),
  )

  /**
   * As fixas do mês: um card por modelo mensal, independente do dia.
   *
   * Ficam numa faixa própria porque é assim que elas são usadas — pendurada no
   * mês inteiro, não presa a um dia. Espalhá-las pelo calendário junto das
   * semanais esconderia justamente o que a pessoa quer ver de relance.
   */
  const monthlyFixed = computed(() =>
    monthOccurrences.value.filter((o) => o.frequency === 'monthly'),
  )

  /** Tudo que não é fixa do mês: o que de fato cai em um dia do calendário. */
  const scheduled = computed(() =>
    monthOccurrences.value.filter((o) => o.frequency !== 'monthly'),
  )

  /** Colunas no formato que o `KanbanBoard` já consome. */
  const byStatus = computed(() => {
    const columns: Record<ActivityStatus, RecurringOccurrence[]> = {
      TODO: [],
      IN_PROGRESS: [],
      IN_TESTING: [],
      DONE: [],
    }
    for (const occurrence of monthOccurrences.value) columns[occurrence.status].push(occurrence)
    return columns
  })

  // ── Mutações do modelo ──

  function createTemplate(template: Omit<RecurringTemplate, 'id' | 'createdAt'>): RecurringTemplate {
    const created: RecurringTemplate = { ...template, id: newId(), createdAt: today() }
    templates.value = [created, ...templates.value]
    return created
  }

  function updateTemplate(id: string, patch: Partial<RecurringTemplate>): void {
    templates.value = templates.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
  }

  function removeTemplate(id: string): void {
    templates.value = templates.value.filter((t) => t.id !== id)
    for (const key of Object.keys(overrides)) {
      if (key.startsWith(`${id}|`)) delete overrides[key]
    }
  }

  function toggleActive(id: string): void {
    const template = templates.value.find((t) => t.id === id)
    if (template) updateTemplate(id, { active: !template.active })
  }

  /**
   * Muda o PRAZO do modelo e, com ele, o mês em que a tarefa vive.
   *
   * É a operação que substitui o ritual de recopiar o quadro na virada do mês:
   * a pessoa mexe na data, e o mês de destino é consequência — não uma segunda
   * escolha que ela precisa lembrar de fazer.
   *
   * Devolve a chave `'YYYY-MM'` de destino para quem chamou avisar na tela.
   */
  function moveToMonth(id: string, targetMonthKey: string): string | null {
    const template = templates.value.find((t) => t.id === id)
    if (!template) return null
    const nextStart = dateInMonth(template.rule.startDate, targetMonthKey)
    updateTemplate(id, { rule: { ...template.rule, startDate: nextStart } })
    return monthKeyOf(nextStart)
  }

  // ── Mutações da ocorrência (viram override) ──

  function patchOccurrence(occurrenceId: string, patch: OccurrenceOverride): void {
    overrides[occurrenceId] = { ...overrides[occurrenceId], ...patch }
  }

  function setOccurrenceStatus(occurrenceId: string, status: ActivityStatus): void {
    patchOccurrence(occurrenceId, { status })
  }

  /** Dispensa esta data (feriado, semana atípica) sem mexer na regra. */
  function skipOccurrence(occurrenceId: string): void {
    patchOccurrence(occurrenceId, { skipped: true })
  }

  /** Devolve a ocorrência ao calendário e apaga o registro, se nada mais mudou. */
  function restoreOccurrence(occurrenceId: string): void {
    const current = overrides[occurrenceId]
    if (!current) return
    const { skipped: _skipped, ...rest } = current
    if (Object.keys(rest).length === 0) delete overrides[occurrenceId]
    else overrides[occurrenceId] = rest
  }

  /** Volta a ocorrência ao que o modelo diz, apagando o override inteiro. */
  function resetOccurrence(occurrenceId: string): void {
    delete overrides[occurrenceId]
  }

  // ── Consultas auxiliares ──

  const templateById = (id: string) => templates.value.find((t) => t.id === id) ?? null

  /** Quantas ocorrências o modelo gera no mês exibido. */
  function countInMonth(id: string): number {
    const template = templateById(id)
    if (!template) return 0
    return expandRule(template.rule, range.value.start, range.value.end).length
  }

  /** Quantas ocorrências uma regra AINDA NÃO SALVA geraria no mês exibido. */
  function countRuleInMonth(rule: RecurringTemplate['rule']): number {
    return expandRule(rule, range.value.start, range.value.end).length
  }

  return {
    templates,
    overrides,
    monthOccurrences,
    monthlyFixed,
    scheduled,
    byStatus,
    createTemplate,
    updateTemplate,
    removeTemplate,
    toggleActive,
    moveToMonth,
    setOccurrenceStatus,
    skipOccurrence,
    restoreOccurrence,
    resetOccurrence,
    templateById,
    countRuleInMonth,
    countInMonth,
  }
}
