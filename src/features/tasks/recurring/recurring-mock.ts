/**
 * Sementes de DEMONSTRAÇÃO — dados fictícios, nenhuma chamada de API.
 *
 * **Nada aqui é carregado por padrão.** Estas cinco regras já foram a semente
 * inicial do protótipo e o resultado era um board real poluído: só a diária
 * ("Triagem dos bug reports") gerava 18 cards em setembro/2026, e ao lado das
 * atividades de verdade apareciam responsáveis que não existem na empresa. O
 * arquivo fica no repo para apresentar a feature com o board cheio — para isso,
 * hidrate `useRecurringTasks` com `MOCK_TEMPLATES` de propósito, num ambiente
 * onde ninguém está trabalhando.
 *
 * Só REPETIÇÕES: a tarefa avulsa passou a ir pela API de verdade quando a
 * recorrência virou um campo do formulário de tarefa, e semear uma avulsa
 * fictícia aqui só encheria o board de um card que não é de ninguém.
 *
 * Foram escolhidas para o board já nascer contando as duas histórias que
 * motivaram a feature, em vez de mostrar uma lista genérica:
 *
 * - as FIXAS do mês, que hoje vivem paradas na coluna "Em teste" e são
 *   recopiadas na mão a cada virada de mês;
 * - as SEMANAIS por dia da semana, que hoje viram quatro ou cinco cards
 *   duplicados no board.
 *
 * As datas são relativas a hoje de propósito: o protótipo não pode envelhecer
 * e virar uma tela de cards atrasados na primeira semana.
 */
import type { RecurringTag, RecurringTemplate } from './recurrence-types'
import { addDays, monthKeyOf, today, weekdayOf } from './recurrence-engine'

const tag = (name: string, color: string | null): RecurringTag => ({
  id: `tag-${name.toLowerCase()}`,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  color,
})

export const MOCK_TAGS: RecurringTag[] = [
  tag('Rotina', 'blue'),
  tag('Cliente', 'violet'),
  tag('Infra', 'amber'),
  tag('Financeiro', 'green'),
  tag('Relatório', null),
]

/** Primeiro dia do mês corrente: âncora natural das regras mensais. */
const firstOfThisMonth = `${monthKeyOf(today())}-01`

/** Segunda-feira desta semana, para as regras semanais não nascerem no passado. */
const mondayThisWeek = addDays(today(), -((weekdayOf(today()) + 6) % 7))

export const MOCK_TEMPLATES: RecurringTemplate[] = [
  {
    id: 'tpl-fechamento',
    title: 'Fechamento financeiro do mês',
    description:
      'Conferir notas emitidas, conciliar entradas e fechar o relatório do mês para a contabilidade.',
    priorityNumber: 0,
    // Nasce em "Em teste" porque é exatamente onde estas ficam hoje, à mão.
    initialStatus: 'IN_TESTING',
    assignees: ['Luis Gustavo'],
    tags: [MOCK_TAGS[3]!, MOCK_TAGS[4]!],
    subtasks: [
      { title: 'Conferir notas emitidas', description: '' },
      { title: 'Conciliar entradas do banco', description: '' },
      { title: 'Enviar planilha para a contabilidade', description: '' },
    ],
    rule: {
      frequency: 'monthly',
      interval: 1,
      weekdays: [],
      monthDay: 'last',
      skipWeekends: false,
      startDate: firstOfThisMonth,
      endDate: null,
    },
    active: true,
    createdAt: firstOfThisMonth,
  },
  {
    id: 'tpl-backup',
    title: 'Conferir backup dos servidores',
    description: 'Validar que os snapshots da noite rodaram e que o restore de teste passou.',
    priorityNumber: 1,
    initialStatus: 'IN_TESTING',
    assignees: ['Rafael Lima'],
    tags: [MOCK_TAGS[2]!, MOCK_TAGS[0]!],
    subtasks: [],
    rule: {
      frequency: 'monthly',
      interval: 1,
      weekdays: [],
      monthDay: 5,
      skipWeekends: false,
      startDate: firstOfThisMonth,
      endDate: null,
    },
    active: true,
    createdAt: firstOfThisMonth,
  },
  {
    id: 'tpl-reuniao',
    title: 'Reunião de alinhamento semanal',
    description: 'Rodar o quadro do time, revisar bloqueios e fechar as prioridades da semana.',
    priorityNumber: 1,
    initialStatus: 'TODO',
    assignees: ['Luis Gustavo', 'Ana Prado'],
    tags: [MOCK_TAGS[0]!],
    subtasks: [
      { title: 'Revisar bloqueios da semana passada', description: '' },
      { title: 'Fechar prioridades da semana', description: '' },
    ],
    rule: {
      frequency: 'weekly',
      interval: 1,
      weekdays: [1], // segunda
      monthDay: 1,
      skipWeekends: false,
      startDate: mondayThisWeek,
      endDate: null,
    },
    active: true,
    createdAt: mondayThisWeek,
  },
  {
    id: 'tpl-relatorio-cliente',
    title: 'Relatório de performance para o cliente',
    description: 'Puxar os números da semana, montar o resumo e enviar por e-mail até as 18h.',
    priorityNumber: 0,
    initialStatus: 'TODO',
    assignees: ['Ana Prado'],
    tags: [MOCK_TAGS[1]!, MOCK_TAGS[4]!],
    subtasks: [],
    rule: {
      frequency: 'weekly',
      interval: 1,
      weekdays: [2, 4], // terça e quinta
      monthDay: 1,
      skipWeekends: false,
      startDate: mondayThisWeek,
      endDate: null,
    },
    active: true,
    createdAt: mondayThisWeek,
  },
  {
    id: 'tpl-triagem',
    title: 'Triagem dos bug reports abertos',
    description: 'Classificar o que chegou, responder o que dá para responder e priorizar o resto.',
    priorityNumber: 2,
    initialStatus: 'IN_PROGRESS',
    assignees: ['Rafael Lima', 'Carla Menezes'],
    tags: [MOCK_TAGS[0]!],
    subtasks: [],
    rule: {
      frequency: 'daily',
      interval: 1,
      weekdays: [],
      monthDay: 1,
      skipWeekends: true,
      startDate: mondayThisWeek,
      endDate: null,
    },
    active: true,
    createdAt: mondayThisWeek,
  },
]
