/**
 * Sementes do protótipo — dados fictícios, nenhuma chamada de API.
 *
 * Foram escolhidos para a tela já nascer contando a história dos três
 * problemas que motivaram a feature, em vez de mostrar uma lista genérica:
 *
 * - as FIXAS do mês, que hoje vivem paradas na coluna "Em teste" e são
 *   recopiadas na mão a cada virada de mês;
 * - as SEMANAIS por dia da semana, que hoje viram quatro ou cinco cards
 *   duplicados no board;
 * - uma tarefa AVULSA já criada em "Em andamento", porque nem toda tarefa
 *   nasce em "A fazer".
 *
 * As datas são relativas a hoje de propósito: o protótipo não pode envelhecer
 * e virar uma tela de cards atrasados na primeira semana.
 */
import type { RecurringTag, RecurringTemplate } from './recurrence-types'
import { addDays, monthKeyOf, today, weekdayOf } from './recurrence-engine'

export const MOCK_MEMBERS = [
  'Luis Gustavo',
  'Ana Prado',
  'Rafael Lima',
  'Carla Menezes',
] as const

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
  {
    id: 'tpl-migracao',
    title: 'Migrar o ambiente de homologação',
    description: 'Tarefa avulsa que já começou: foi criada direto em "Em andamento".',
    priorityNumber: 1,
    initialStatus: 'IN_PROGRESS',
    assignees: ['Luis Gustavo'],
    tags: [MOCK_TAGS[2]!],
    subtasks: [{ title: 'Subir o banco novo', description: '' }],
    rule: {
      frequency: 'once',
      interval: 1,
      weekdays: [],
      monthDay: 1,
      skipWeekends: false,
      startDate: addDays(today(), 3),
      endDate: null,
    },
    active: true,
    createdAt: today(),
  },
]
