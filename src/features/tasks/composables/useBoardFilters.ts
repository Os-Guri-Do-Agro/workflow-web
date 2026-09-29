/**
 * Filtros do board do mês (spec board-tarefas-redesign, D8): busca por título
 * e chave, pessoas, "Só minhas", "Atrasadas", "Atualizadas 24h", "Sem
 * responsável", tags e prioridade. Tudo na URL, com a memória por empresa
 * ("Lembrar filtro") por cima.
 *
 * Por que tudo na URL agora (antes só `?tags=` ia): com a toolbar sempre à
 * vista, o filtro virou o jeito de olhar o board, e "me manda o link das
 * atrasadas da Ana" precisa abrir exatamente o que a pessoa viu. Chaves em
 * português, iguais às do `/board` quando o significado é o mesmo:
 *
 *   ?q=pix&pessoa=u2,u3&prioridade=3,4&tags=app,site
 *   &minhas=1&atrasadas=1&recentes=1&sem-responsavel=1&agrupar=pessoa
 *
 * `agrupar` não é filtro (não conta em "Limpar filtros" nem no número de
 * filtros ligados), mas mora aqui porque segue as mesmas regras: vai para a
 * URL, atravessa a troca de mês e entra no "Lembrar filtro" (spec D12).
 *
 * Como os grupos combinam: E entre grupos; dentro do grupo, pessoas e
 * prioridades por OU (um card tem um nível só, e "Ana ou Leo" é a pergunta de
 * quem olha duas pessoas) e tags por E (marcar "cms" e "urgente" mostra o que
 * é as duas coisas; com OU cada tag AUMENTARIA a lista).
 *
 * Os predicados rodam sobre as colunas COMPUTADAS a partir do mesmo ref que o
 * arraste e o realtime mutam (risco Médio da spec): o filtro nunca guarda cópia
 * de card.
 */
import { computed, ref, watch, type Ref } from 'vue'
import type { LocationQuery, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { getUserToken } from '@/utils/authContent'
import { dateOnlyDiffDays } from '@/utils/date'
import { ACTIVITY_STATUSES, priorityLevel } from '../task-meta'
import { matchesTaskKey, taskKey } from '../task-key'
import type { ActivityStatus } from '../activity-types'
import { useTaskFilterMemory, type BoardGrouping } from './useTaskFilterMemory'

export type { BoardGrouping }

/** O mínimo do card que os filtros leem. */
export interface FilterableTask {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  updatedAt?: string
  responsibles?: Array<{ userId?: string; user: { id?: string; name: string } }>
  tags?: Array<{ tag: { id: string; name: string; slug: string; color: string | null } }>
}

export type FilterColumns<T extends FilterableTask> = Record<ActivityStatus, T[]>

export interface BoardPerson {
  /** id quando algum card traz; senão o nome (card de rotina só tem o nome). */
  key: string
  name: string
  /** Quantos cards do mês têm a pessoa entre os responsáveis. */
  count: number
}

export interface BoardTagOption {
  id: string
  name: string
  slug: string
  color: string | null
  count: number
}

/** Chaves da query que são filtro. Todo o resto (`task`, `new`...) passa intacto. */
export const FILTER_QUERY_KEYS = [
  'q',
  'pessoa',
  'prioridade',
  'tags',
  'minhas',
  'atrasadas',
  'recentes',
  'sem-responsavel',
  'agrupar',
] as const

const STATUSES = ACTIVITY_STATUSES.map((s) => s.value)
const DAY_MS = 86_400_000

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const list = (v: unknown): string[] =>
  str(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
const flag = (v: unknown): boolean => str(v) === '1'

/** Sem acento e sem caixa: "Relatório" acha "relatorio". */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function sameList(a: readonly (string | number)[], b: readonly (string | number)[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function useBoardFilters<T extends FilterableTask>(opts: {
  route: RouteLocationNormalizedLoaded
  router: Router
  companyId: Ref<string>
  companyName: Ref<string>
  /** Todos os cards do mês (reais e de rotina), por coluna. */
  columns: Ref<FilterColumns<T>>
  /**
   * Membros da empresa (id e nome). O card de rotina só traz o NOME do
   * responsável; é por aqui que ele vira id quando nenhum card real do mês traz
   * a pessoa. Sem isso a linha dela no "Agrupar: Pessoa" ficava com o nome por
   * chave, e o "+" dela criava a tarefa sem responsável.
   */
  members?: Ref<ReadonlyArray<{ id: string; name: string }>>
}) {
  const { route, router } = opts

  // ── Estado (lido da URL na criação) ──────────────────────────────────────
  const q = ref('')
  const people = ref<string[]>([])
  const priorities = ref<number[]>([])
  const tags = ref<string[]>([])
  const mine = ref(false)
  const late = ref(false)
  const recent = ref(false)
  const nobody = ref(false)
  /** Opção de exibição, não filtro: `person` = linhas por responsável (D12). */
  const groupBy = ref<BoardGrouping>('none')

  function readQuery(query: LocationQuery) {
    const nextQ = str(query.q)
    if (nextQ !== q.value) q.value = nextQ
    const nextPeople = list(query.pessoa)
    if (!sameList(nextPeople, people.value)) people.value = nextPeople
    // Aceita 0 a 5 (links antigos do número cru) e guarda o NÍVEL: 5 vira 4.
    const nextPrio = [
      ...new Set(
        list(query.prioridade)
          .filter((p) => /^[0-5]$/.test(p))
          .map((p) => priorityLevel(p) as number),
      ),
    ].sort()
    if (!sameList(nextPrio, priorities.value)) priorities.value = nextPrio
    const nextTags = list(query.tags)
    if (!sameList(nextTags, tags.value)) tags.value = nextTags
    if (flag(query.minhas) !== mine.value) mine.value = flag(query.minhas)
    if (flag(query.atrasadas) !== late.value) late.value = flag(query.atrasadas)
    if (flag(query.recentes) !== recent.value) recent.value = flag(query.recentes)
    if (flag(query['sem-responsavel']) !== nobody.value) nobody.value = flag(query['sem-responsavel'])
    const nextGroup: BoardGrouping = str(query.agrupar) === 'pessoa' ? 'person' : 'none'
    if (nextGroup !== groupBy.value) groupBy.value = nextGroup
  }

  readQuery(route.query)
  const urlHadFilters = FILTER_QUERY_KEYS.some((k) => str(route.query[k]))
  /**
   * A rota do board. Saindo dele, a view ainda está montada quando a rota nova
   * chega: a URL de outra tela não diz nada sobre o filtro e não pode zerá-lo,
   * nem o filtro pode ir para a URL dela.
   */
  const boardRoute = route.name

  /** Só a parte "filtro" da query, para levar junto na troca de mês. */
  const filterQuery = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    if (q.value.trim()) out.q = q.value.trim()
    if (people.value.length) out.pessoa = people.value.join(',')
    if (priorities.value.length) out.prioridade = [...priorities.value].sort().join(',')
    if (tags.value.length) out.tags = tags.value.join(',')
    if (mine.value) out.minhas = '1'
    if (late.value) out.atrasadas = '1'
    if (recent.value) out.recentes = '1'
    if (nobody.value) out['sem-responsavel'] = '1'
    if (groupBy.value === 'person') out.agrupar = 'pessoa'
    return out
  })

  // Estado → URL. `replace`, não `push`: filtrar não é navegar, e o voltar do
  // navegador precisa sair do board (ou fechar o painel), não desfazer letra
  // por letra da busca.
  function writeUrl(next: Record<string, string>) {
    if (route.name !== boardRoute) return
    const query: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if ((FILTER_QUERY_KEYS as readonly string[]).includes(key)) continue
      if (typeof value === 'string') query[key] = value
    }
    Object.assign(query, next)
    const current = Object.fromEntries(
      Object.entries(route.query).filter(([, v]) => typeof v === 'string'),
    )
    if (JSON.stringify(current) === JSON.stringify(query)) return
    void router.replace({ query })
  }
  watch(filterQuery, writeUrl)

  // ── Memória ("Lembrar filtro") ───────────────────────────────────────────
  const { remember, setRemember, restore } = useTaskFilterMemory(
    opts.companyId,
    { people, priorities, tags, mine, late, recent, nobody, group: groupBy },
    { urlHasFilters: () => urlHadFilters },
  )

  // URL → estado: voltar/avançar no navegador tem que refletir no filtro, senão
  // a URL e a tela discordam depois de um botão de voltar.
  //
  // Exceção: trocar de MÊS por um link sem filtro (o menu lateral). A view é
  // reaproveitada entre `/tasks/:month`, e ler a URL nova zerava os filtros,
  // que o "Lembrar filtro" então gravava por cima do recorte guardado. Com a
  // memória ligada, o mês novo abre com o recorte guardado, que vai para a URL
  // pelo `watch(filterQuery)` acima. O `‹ ›` leva o filtro na URL e não cai aqui.
  let lastMonth = str(route.params.month)
  watch(
    () => [str(route.params.month), FILTER_QUERY_KEYS.map((k) => str(route.query[k])).join('|')],
    () => {
      if (route.name !== boardRoute) return
      const month = str(route.params.month)
      const monthChanged = month !== lastMonth
      lastMonth = month
      const urlHasFilters = FILTER_QUERY_KEYS.some((k) => str(route.query[k]))
      if (monthChanged && !urlHasFilters && remember.value && restore()) {
        // A busca por texto não é guardada: não atravessa a troca de mês.
        q.value = ''
        // O recorte restaurado costuma ser o mesmo que já estava na tela, e aí
        // o `watch(filterQuery)` não dispara: a URL é escrita aqui.
        writeUrl(filterQuery.value)
        return
      }
      readQuery(route.query)
    },
  )

  // ── Quem é "eu" e quem é quem ────────────────────────────────────────────
  const token = getUserToken()
  const myId = token?.sub ?? null
  const myName = token?.name ?? null

  /**
   * Nome → id, a partir dos cards que trazem o id (o de rotina só traz nome) e,
   * para quem só aparece em rotina, dos membros da empresa.
   */
  const idByName = computed(() => {
    const map = new Map<string, string>()
    for (const status of STATUSES) {
      for (const task of opts.columns.value[status] ?? []) {
        for (const r of task.responsibles ?? []) {
          const id = r.userId ?? r.user.id
          if (id && !map.has(r.user.name)) map.set(r.user.name, id)
        }
      }
    }
    for (const member of opts.members?.value ?? []) {
      if (member.id && member.name && !map.has(member.name)) map.set(member.name, member.id)
    }
    return map
  })

  type Responsible = NonNullable<FilterableTask['responsibles']>[number]

  function personKey(r: Responsible): string {
    return r.userId ?? r.user.id ?? idByName.value.get(r.user.name) ?? r.user.name
  }

  const isMe = (r: Responsible) =>
    (!!myId && personKey(r) === myId) || (!!myName && r.user.name === myName)

  /** Quem está logado, para a criação inline já nascer com responsável. */
  const me = { id: myId, name: myName }

  // ── Predicados ───────────────────────────────────────────────────────────
  const isLate = (task: T, status: ActivityStatus) =>
    status !== 'DONE' && !!task.dueDate && dateOnlyDiffDays(task.dueDate) < 0

  /** `updatedAt` vem no payload do board; card de rotina não tem e fica de fora. */
  const isRecent = (task: T, now: number) => {
    if (!task.updatedAt) return false
    const at = new Date(task.updatedAt).getTime()
    return Number.isFinite(at) && now - at <= DAY_MS
  }

  const hasNobody = (task: T) => !(task.responsibles ?? []).length
  const isMine = (task: T) => (task.responsibles ?? []).some(isMe)

  function matchesSearch(task: T, needle: string): boolean {
    if (normalizeText(task.title ?? '').includes(normalizeText(needle))) return true
    return matchesTaskKey(taskKey(task, opts.companyName.value), needle)
  }

  function matches(task: T, status: ActivityStatus, now = Date.now()): boolean {
    const needle = q.value.trim()
    if (needle && !matchesSearch(task, needle)) return false
    if (people.value.length) {
      const wanted = new Set(people.value)
      const hit = (task.responsibles ?? []).some(
        (r) => wanted.has(personKey(r)) || wanted.has(r.user.name),
      )
      if (!hit) return false
    }
    if (mine.value && !isMine(task)) return false
    if (late.value && !isLate(task, status)) return false
    if (recent.value && !isRecent(task, now)) return false
    if (nobody.value && !hasNobody(task)) return false
    if (priorities.value.length && !priorities.value.includes(priorityLevel(task.priorityNumber))) {
      return false
    }
    if (tags.value.length) {
      const slugs = new Set((task.tags ?? []).map((link) => link.tag.slug))
      if (!tags.value.every((slug) => slugs.has(slug))) return false
    }
    return true
  }

  const filtered = computed<FilterColumns<T>>(() => {
    const now = Date.now()
    const out = {} as FilterColumns<T>
    for (const status of STATUSES) {
      out[status] = (opts.columns.value[status] ?? []).filter((t) => matches(t, status, now))
    }
    return out
  })

  // ── Contagens (sobre o mês inteiro, sem os outros filtros) ───────────────
  const counts = computed(() => {
    const now = Date.now()
    const c = { mine: 0, late: 0, recent: 0, nobody: 0, total: 0 }
    for (const status of STATUSES) {
      for (const task of opts.columns.value[status] ?? []) {
        c.total++
        if (isMine(task)) c.mine++
        if (isLate(task, status)) c.late++
        if (isRecent(task, now)) c.recent++
        if (hasNobody(task)) c.nobody++
      }
    }
    return c
  })

  /** Pessoas do mês, das mais carregadas para as menos. */
  const peopleList = computed<BoardPerson[]>(() => {
    const byKey = new Map<string, BoardPerson>()
    for (const status of STATUSES) {
      for (const task of opts.columns.value[status] ?? []) {
        const seen = new Set<string>()
        for (const r of task.responsibles ?? []) {
          const key = personKey(r)
          if (seen.has(key)) continue
          seen.add(key)
          const entry = byKey.get(key) ?? { key, name: r.user.name, count: 0 }
          entry.count++
          byKey.set(key, entry)
        }
      }
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  })

  const tagList = computed<BoardTagOption[]>(() => {
    const bySlug = new Map<string, BoardTagOption>()
    for (const status of STATUSES) {
      for (const task of opts.columns.value[status] ?? []) {
        for (const { tag } of task.tags ?? []) {
          const entry = bySlug.get(tag.slug) ?? { ...tag, count: 0 }
          entry.count++
          bySlug.set(tag.slug, entry)
        }
      }
    }
    return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name))
  })

  const priorityCounts = computed(() => {
    const c = [0, 0, 0, 0, 0]
    for (const status of STATUSES) {
      for (const task of opts.columns.value[status] ?? []) c[priorityLevel(task.priorityNumber)]!++
    }
    return c
  })

  // ── Ações ────────────────────────────────────────────────────────────────
  const isPersonOn = (person: BoardPerson) =>
    people.value.includes(person.key) || people.value.includes(person.name)

  function togglePerson(person: BoardPerson) {
    people.value = isPersonOn(person)
      ? people.value.filter((k) => k !== person.key && k !== person.name)
      : [...people.value, person.key]
  }

  function toggleTag(slug: string) {
    tags.value = tags.value.includes(slug)
      ? tags.value.filter((s) => s !== slug)
      : [...tags.value, slug]
  }

  function togglePriority(level: number) {
    priorities.value = priorities.value.includes(level)
      ? priorities.value.filter((p) => p !== level)
      : [...priorities.value, level].sort()
  }

  const quick = { mine, late, recent, nobody }
  type QuickFilter = keyof typeof quick

  function toggleQuick(name: QuickFilter) {
    quick[name].value = !quick[name].value
  }

  function setQuery(value: string) {
    q.value = value
  }

  function setGroupBy(value: BoardGrouping) {
    groupBy.value = value
  }

  function clearTags() {
    tags.value = []
  }

  function clear() {
    q.value = ''
    people.value = []
    priorities.value = []
    tags.value = []
    mine.value = false
    late.value = false
    recent.value = false
    nobody.value = false
  }

  const activeCount = computed(
    () =>
      (q.value.trim() ? 1 : 0) +
      people.value.length +
      priorities.value.length +
      tags.value.length +
      [mine, late, recent, nobody].filter((f) => f.value).length,
  )

  /**
   * Desligar a memória limpa a tela junto, e não só o registro. O agrupamento
   * fica como está: é o jeito de olhar o board, não um recorte dele. Se desmarcar
   * apenas parasse de gravar, a pessoa continuaria olhando um board filtrado
   * depois de dizer que não quer mais filtro guardado.
   */
  function toggleRemember() {
    const next = !remember.value
    setRemember(next)
    if (!next) clear()
  }

  return {
    q,
    people,
    priorities,
    tags,
    mine,
    late,
    recent,
    nobody,
    groupBy,
    setGroupBy,
    personKey,
    isMe,
    me,
    remember,
    toggleRemember,
    filtered,
    filterQuery,
    counts,
    peopleList,
    tagList,
    priorityCounts,
    activeCount,
    isPersonOn,
    togglePerson,
    toggleTag,
    togglePriority,
    toggleQuick,
    setQuery,
    clearTags,
    clear,
  }
}

export type BoardFilters = ReturnType<typeof useBoardFilters>
export type QuickFilterName = 'mine' | 'late' | 'recent' | 'nobody'
