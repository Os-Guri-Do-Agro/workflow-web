/**
 * Store das tarefas recorrentes.
 *
 * PROTÓTIPO: nenhuma requisição sai daqui. Quando o backend existir, este
 * arquivo vira o composable de Vue Query e o resto da feature não muda — as
 * telas só falam com a API que está exposta no `return`.
 *
 * Três coisas estruturam o arquivo:
 *
 * 1. **Ocorrência não é gravada.** As datas saem da regra a cada render
 *    (`expandRule`); só o que a pessoa mudou à mão em UMA data vira registro
 *    (`overrides`). Materializar "toda segunda, para sempre" por antecedência
 *    traria de volta o trabalho manual de virada de mês que a feature existe
 *    para matar.
 *
 * 2. **O estado é por empresa e sobrevive ao F5** (`safeStorage`). Enquanto não
 *    há backend, perder tudo ao recarregar a aba tornava a feature indefensável
 *    na prática: ninguém escreve uma rotina que some. O formato é versionado
 *    (`v1`) para poder ser descartado sem cerimônia quando a API chegar.
 *
 * 3. **O board mostra UMA ocorrência por regra** (`boardOccurrences`). Ver a
 *    nota de desenho em cima do computed: é a correção do problema de uma regra
 *    diária despejar 22 cards idênticos numa coluna.
 */
import { computed, effectScope, reactive, shallowRef, watch, type Ref } from 'vue'
import { safeStorage } from '@/utils/safe-storage'
import type { ActivityStatus } from '../activity-types'
import type {
  BoardOccurrence,
  OccurrenceOverride,
  RecurringOccurrence,
  RecurringTemplate,
} from './recurrence-types'
import { occurrenceKey, parseOccurrenceId } from './recurrence-types'
import { dateInMonth, expandRule, monthKeyOf, monthRange, today } from './recurrence-engine'
import { currentDay } from './current-day'

// ── Estado persistido, por empresa ───────────────────────────────────────────

interface RecurringState {
  templates: RecurringTemplate[]
  overrides: Record<string, OccurrenceOverride>
}

/**
 * `v1` no meio da chave é deliberado: o formato é de protótipo e vai ser jogado
 * fora quando a API existir. Sem a versão, um payload de um formato antigo volta
 * a ser lido depois e vira bug silencioso meses à frente.
 */
const STORAGE_PREFIX = 'workflow:recurring:v1:'

const emptyState = (): RecurringState => ({ templates: [], overrides: {} })

/**
 * Escopo DESANEXADO para os watchers de persistência.
 *
 * O estado de uma empresa vive enquanto a aba viver, mas `stateFor` é chamado de
 * dentro do `setup` de uma view. Sem escopo próprio, o watcher de gravação seria
 * adotado por esse componente e morreria junto com ele — a pessoa navegaria para
 * outra tela e as escritas seguintes parariam de ser gravadas, sem erro nenhum
 * aparecendo em tela.
 */
const persistenceScope = effectScope(true)

const states = new Map<string, RecurringState>()

function readState(companyId: string): RecurringState {
  const raw = safeStorage.getItem(STORAGE_PREFIX + companyId)
  if (!raw) return emptyState()
  try {
    const parsed = JSON.parse(raw) as Partial<RecurringState>
    return {
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      overrides:
        parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
    }
  } catch {
    // Registro corrompido não pode derrubar o board: começa vazio e a próxima
    // escrita conserta o registro.
    return emptyState()
  }
}

function stateFor(companyId: string): RecurringState {
  // Sem empresa ativa não há onde gravar; o estado existe só para a tela não
  // quebrar enquanto a empresa ainda está carregando.
  const key = companyId || '__sem-empresa__'
  const cached = states.get(key)
  if (cached) return cached

  const state = reactive(companyId ? readState(companyId) : emptyState())
  states.set(key, state)

  if (companyId) {
    persistenceScope.run(() => {
      // Watch profundo em vez de gravar dentro de cada mutação: esquecer uma
      // única chamada é o tipo de bug que só aparece depois do F5.
      watch(
        state,
        () => {
          safeStorage.setItem(
            STORAGE_PREFIX + companyId,
            JSON.stringify({ templates: state.templates, overrides: state.overrides }),
          )
        },
        { deep: true, flush: 'post' },
      )
    })
  }

  return state
}

let seq = 0
const newId = () => `tpl-local-${Date.now().toString(36)}-${seq++}`

// ── API pública ──────────────────────────────────────────────────────────────

export function useRecurringTasks(monthKey: Ref<string>, companyId: Ref<string>) {
  const state = shallowRef<RecurringState>(stateFor(companyId.value))
  watch(companyId, (id) => {
    state.value = stateFor(id)
  })

  const templates = computed(() => state.value.templates)
  const overrides = computed(() => state.value.overrides)

  const range = computed(() => monthRange(monthKey.value))

  /** Monta a ocorrência de um modelo numa data, já com o override aplicado. */
  function buildOccurrence(template: RecurringTemplate, date: string): RecurringOccurrence {
    const override = state.value.overrides[occurrenceKey(template.id, date)]
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
   * TODAS as ocorrências do mês, dispensadas inclusive.
   *
   * A dispensada precisa continuar existindo aqui: é ela que a Agenda desenha
   * apagada, com o botão de trazer de volta. Filtrá-la na origem transformava
   * "dispensar esta segunda" numa ação sem desfazer — o card sumia do board e
   * não sobrava nada em tela para clicar.
   */
  const monthOccurrences = computed<RecurringOccurrence[]>(() => {
    const out: RecurringOccurrence[] = []
    for (const template of state.value.templates) {
      for (const date of expandRule(template.rule, range.value.start, range.value.end)) {
        const touched = !!state.value.overrides[occurrenceKey(template.id, date)]
        // Modelo pausado só entra pelas datas que a pessoa já tocou: pausar
        // interrompe a geração daqui para a frente, não apaga o que já estava
        // em andamento.
        if (!template.active && !touched) continue
        out.push(buildOccurrence(template, date))
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
  })

  /**
   * As fixas do mês: um card por modelo mensal, independente do dia.
   *
   * Ficam numa faixa própria porque é assim que elas são usadas — penduradas no
   * mês inteiro, não presas a um dia.
   */
  const monthlyFixed = computed(() =>
    monthOccurrences.value.filter((o) => o.frequency === 'monthly'),
  )

  /** Tudo que não é fixa do mês: o que de fato cai em um dia do calendário. */
  const scheduled = computed(() =>
    monthOccurrences.value.filter((o) => o.frequency !== 'monthly'),
  )

  /**
   * A ocorrência que representa o modelo hoje.
   *
   * `list` chega ordenada por data. A de hoje ganha; sem ela, a próxima do mês;
   * sem futuro nenhum (mês passado, ou regra que já terminou), a última.
   */
  function currentOf(list: RecurringOccurrence[], now: string): RecurringOccurrence | null {
    return (
      list.find((o) => o.date === now) ??
      list.find((o) => o.date > now) ??
      list[list.length - 1] ??
      null
    )
  }

  /**
   * O que a REPETIÇÃO ocupa no board do mês: uma linha por regra.
   *
   * O board é uma superfície do MÊS, mas uma rotina diária é uma coisa do DIA.
   * Despejar as 22 datas de "todo dia útil" nas colunas trata a repetição como
   * 22 tarefas diferentes — que é exatamente o trabalho manual que a feature
   * existe para matar, só que gerado automaticamente. O mês visto por dia é a
   * Agenda; o board mostra o que está pedindo alguma coisa agora.
   *
   * Entram:
   *
   * - a **ocorrência corrente** (hoje → a próxima → a última), uma por modelo;
   * - as **tocadas que continuam abertas** (a pessoa arrastou e não terminou).
   *   Sem elas, começar a tarefa de segunda e voltar na quarta faria o trabalho
   *   em andamento sumir do quadro.
   *
   * O que fica de fora vira o contador `hiddenInMonth` no card corrente, que é
   * o que leva para a Agenda. Dispensada não entra: já foi tirada da frente.
   */
  const boardOccurrences = computed<BoardOccurrence[]>(() => {
    // `currentDay` e não `today()`: função pura não é dependência reativa, e uma
    // aba aberta durante a madrugada ficava mostrando o card de ontem até o F5.
    const now = currentDay.value
    const byTemplate = new Map<string, RecurringOccurrence[]>()
    for (const occurrence of monthOccurrences.value) {
      if (occurrence.skipped) continue
      const list = byTemplate.get(occurrence.templateId)
      if (list) list.push(occurrence)
      else byTemplate.set(occurrence.templateId, [occurrence])
    }

    const out: BoardOccurrence[] = []
    for (const list of byTemplate.values()) {
      const current = currentOf(list, now)
      const shown = new Map<string, RecurringOccurrence>()
      if (current) shown.set(current.id, current)
      for (const occurrence of list) {
        if (occurrence.touched && occurrence.status !== 'DONE') {
          shown.set(occurrence.id, occurrence)
        }
      }
      const hidden = list.length - shown.size
      // Atrasada é a que ficou de FORA do quadro e já passou sem ninguém
      // encostar. Contar as que estão em tela duplicaria o aviso: o card já
      // pinta o próprio prazo vencido de vermelho.
      let overdue = 0
      for (const occurrence of list) {
        if (!shown.has(occurrence.id) && occurrence.date < now && !occurrence.touched) {
          overdue++
        }
      }
      for (const occurrence of shown.values()) {
        // Os contadores vão SÓ na corrente: repetidos em cada card virariam
        // ruído e dariam a impressão de que cada um esconde outras tantas datas.
        const isCurrent = occurrence.id === current?.id
        out.push({
          ...occurrence,
          hiddenInMonth: isCurrent ? hidden : 0,
          overdueInMonth: isCurrent ? overdue : 0,
        })
      }
    }

    return out.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.priorityNumber - b.priorityNumber ||
        a.title.localeCompare(b.title),
    )
  })

  // ── Mutações do modelo ──

  function createTemplate(
    template: Omit<RecurringTemplate, 'id' | 'createdAt'>,
  ): RecurringTemplate {
    const created: RecurringTemplate = { ...template, id: newId(), createdAt: today() }
    state.value.templates.unshift(created)
    return created
  }

  function updateTemplate(id: string, patch: Partial<RecurringTemplate>): void {
    const template = state.value.templates.find((t) => t.id === id)
    if (template) Object.assign(template, patch)
  }

  function removeTemplate(id: string): void {
    const index = state.value.templates.findIndex((t) => t.id === id)
    if (index !== -1) state.value.templates.splice(index, 1)
    for (const key of Object.keys(state.value.overrides)) {
      if (parseOccurrenceId(key)?.templateId === id) delete state.value.overrides[key]
    }
  }

  function toggleActive(id: string): void {
    const template = state.value.templates.find((t) => t.id === id)
    if (template) template.active = !template.active
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
    const template = state.value.templates.find((t) => t.id === id)
    if (!template) return null
    const nextStart = dateInMonth(template.rule.startDate, targetMonthKey)
    template.rule = { ...template.rule, startDate: nextStart }
    return monthKeyOf(nextStart)
  }

  // ── Mutações da ocorrência (viram override) ──

  function patchOccurrence(occurrenceId: string, patch: OccurrenceOverride): void {
    state.value.overrides[occurrenceId] = {
      ...state.value.overrides[occurrenceId],
      ...patch,
    }
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
    const current = state.value.overrides[occurrenceId]
    if (!current) return
    const { skipped: _skipped, ...rest } = current
    if (Object.keys(rest).length === 0) delete state.value.overrides[occurrenceId]
    else state.value.overrides[occurrenceId] = rest
  }

  /** Volta a ocorrência ao que o modelo diz, apagando o override inteiro. */
  function resetOccurrence(occurrenceId: string): void {
    delete state.value.overrides[occurrenceId]
  }

  // ── Consultas auxiliares ──

  const templateById = (id: string) => state.value.templates.find((t) => t.id === id) ?? null

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
    boardOccurrences,
    monthlyFixed,
    scheduled,
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
