import { computed, ref, watch } from 'vue'

/**
 * Período das telas de tempo: Hoje · Mês navegável · Tudo.
 *
 * Por que não existe mais "7 dias" / "30 dias": janela deslizante muda de base
 * todo dia e não fecha com nada — ninguém fatura nem compara desempenho assim.
 * O recorte que as pessoas usam é o mês, e por isso ele é o padrão.
 *
 * "Tudo" é a AUSÊNCIA de `from`/`to`, não uma data mínima inventada: o backend
 * trata range vazio como "sem filtro" (`rangeFilter` devolve undefined em
 * `workflow-api/src/time-tracking/time-tracking.service.ts`), então lifetime já
 * funciona sem deploy de API.
 *
 * Todos os limites são construídos em horário LOCAL. Montar o mês em UTC puxaria
 * o último dia do mês anterior para dentro do range de quem está em UTC-3.
 */

export type PeriodKind = 'today' | 'month' | 'all'

/** Range para a API: campos ausentes = sem filtro (lifetime). */
export interface PeriodRange {
  from?: string
  to?: string
}

/**
 * Uma chave por aba: escolher "Tudo" no meu histórico não deve reconfigurar o
 * placar da equipe na próxima visita (e vice-versa).
 */
export type PeriodScopeKey = 'me' | 'team'
const storageKeyFor = (scope: PeriodScopeKey) => `time.period.${scope}`

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** Só o MODO persiste. Ver comentário em `anchor`. */
function readStoredKind(scope: PeriodScopeKey): PeriodKind {
  try {
    const raw = localStorage.getItem(storageKeyFor(scope))
    if (raw === 'today' || raw === 'month' || raw === 'all') return raw
  } catch {
    // localStorage bloqueado (modo privado/sandbox) não pode derrubar a tela.
  }
  return 'month'
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function monthLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Range dos últimos 7 dias, usado pelo gráfico de ritmo no modo "Hoje". */
export function last7Range(): PeriodRange {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 6)
  return { from: startOfDay(from).toISOString(), to: endOfDay(now).toISOString() }
}

/** Uma coluna do gráfico de ritmo. */
export interface PulseBar {
  key: string
  sec: number
  /** Legenda sob a coluna; string vazia esconde (mês denso mostra de 5 em 5). */
  wd: string
  isToday: boolean
  /** Texto do tooltip quando a legenda é curta demais para identificar a coluna. */
  title?: string
}

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Chave de dia local para uma data já construída em horário local. */
function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Monta as colunas do ritmo a partir do total por dia (`YYYY-MM-DD` → segundos).
 *
 * A granularidade acompanha o período: sete dias no modo "Hoje" (um dia só não
 * é ritmo), dia a dia no mês, e mês a mês em "Tudo" — onde dia a dia seriam
 * centenas de colunas ilegíveis.
 */
export function buildPulseBars(
  kind: PeriodKind,
  anchor: Date,
  byDay: Map<string, number>,
): PulseBar[] {
  const now = new Date()
  const todayKey = localDayKey(now)

  if (kind === 'today') {
    const out: PulseBar[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = localDayKey(d)
      out.push({
        key,
        sec: byDay.get(key) ?? 0,
        wd: d.toLocaleDateString('pt-BR', { weekday: 'narrow' }).toUpperCase(),
        isToday: key === todayKey,
      })
    }
    return out
  }

  if (kind === 'month') {
    const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
    const out: PulseBar[] = []
    for (let day = 1; day <= days; day++) {
      const key = localDayKey(new Date(anchor.getFullYear(), anchor.getMonth(), day))
      // 31 legendas não cabem no rail: de 5 em 5, mais o primeiro e o último.
      // O múltiplo de 5 vizinho do último dia sai de cena para "30 31" não
      // colidir no fim da régua.
      const showLabel = day === 1 || day === days || (day % 5 === 0 && days - day >= 3)
      out.push({
        key,
        sec: byDay.get(key) ?? 0,
        wd: showLabel ? String(day) : '',
        isToday: key === todayKey,
      })
    }
    return out
  }

  // "Tudo": uma coluna por mês, do primeiro registro até hoje.
  const byMonth = new Map<string, number>()
  for (const [key, sec] of byDay) {
    const m = key.slice(0, 7)
    byMonth.set(m, (byMonth.get(m) ?? 0) + sec)
  }
  if (byMonth.size === 0) return []

  const months = [...byMonth.keys()].sort()
  const first = months[0] ?? todayKey.slice(0, 7)
  const currentMonth = todayKey.slice(0, 7)
  const newest = months[months.length - 1] ?? currentMonth
  const last = newest > currentMonth ? newest : currentMonth

  /** "YYYY-MM" → índice absoluto de mês, para iterar sem aritmética de data. */
  const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1
  const firstY = Math.floor(monthIndex(first) / 12)
  const firstM = (monthIndex(first) % 12) + 1
  const lastY = Math.floor(monthIndex(last) / 12)
  const lastM = (monthIndex(last) % 12) + 1

  const out: PulseBar[] = []
  // Mês sem registro entra como coluna vazia: colapsar a lacuna faria uma pausa
  // de meio ano parecer trabalho contínuo.
  for (let y = firstY, m = firstM; y < lastY || (y === lastY && m <= lastM); ) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const multiYear = firstY !== lastY
    // Com mais de um ano na régua, janeiro e a primeira coluna levam o ano
    // junto — senão mar/2025 e mar/2026 ficam idênticos.
    const withYear = multiYear && (m === 1 || out.length === 0)
    const abbr = MONTH_ABBR[m - 1] ?? ''
    out.push({
      key,
      sec: byMonth.get(key) ?? 0,
      wd: withYear ? `${abbr}/${String(y).slice(2)}` : abbr,
      isToday: key === currentMonth,
      title: `${abbr}/${y}`,
    })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

export function useTimePeriod(scope: PeriodScopeKey = 'me') {
  const kind = ref<PeriodKind>(readStoredKind(scope))

  /**
   * Mês exibido. NÃO persiste de propósito: voltar dias depois direto em "Maio"
   * porque foi onde você parou é armadilha silenciosa — o contexto padrão é o
   * mês corrente.
   */
  const anchor = ref(new Date())

  watch(kind, (k) => {
    try {
      localStorage.setItem(storageKeyFor(scope), k)
    } catch {
      // Ver readStoredKind: persistência é conveniência, não requisito.
    }
    // Sair do modo mês e voltar recomeça no mês corrente.
    if (k !== 'month') anchor.value = new Date()
  })

  const range = computed<PeriodRange>(() => {
    if (kind.value === 'all') return {}
    if (kind.value === 'today') {
      const now = new Date()
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
    }
    const a = anchor.value
    const first = new Date(a.getFullYear(), a.getMonth(), 1, 0, 0, 0, 0)
    // Dia 0 do mês seguinte = último dia deste mês, sem tabela de 28/30/31.
    const last = endOfDay(new Date(a.getFullYear(), a.getMonth() + 1, 0))
    return { from: first.toISOString(), to: last.toISOString() }
  })

  const label = computed(() => {
    if (kind.value === 'today') return 'Hoje'
    if (kind.value === 'all') return 'Todo o período'
    return monthLabel(anchor.value)
  })

  /** Rótulo curto para títulos de card ("Ritmo (Agosto)"). */
  const shortLabel = computed(() => {
    if (kind.value === 'today') return '7 dias'
    if (kind.value === 'all') return 'por mês'
    return MONTHS[anchor.value.getMonth()]
  })

  /**
   * Range do gráfico de ritmo. Fora do modo "Hoje" é o próprio período, então o
   * Vue Query serve da MESMA query do resumo, sem request extra.
   */
  const pulseRange = computed<PeriodRange>(() =>
    kind.value === 'today' ? last7Range() : range.value,
  )

  /** Rótulo do mês exibido, independente do modo (o picker sempre mostra um mês). */
  const anchorLabel = computed(() => monthLabel(anchor.value))

  const isCurrentMonth = computed(() => sameMonth(anchor.value, new Date()))

  /** Não há tempo registrado no futuro: o mês corrente é o teto. */
  const canGoNext = computed(() => kind.value === 'month' && !isCurrentMonth.value)
  const canGoPrev = computed(() => kind.value === 'month')

  function shiftMonth(delta: number) {
    const a = anchor.value
    anchor.value = new Date(a.getFullYear(), a.getMonth() + delta, 1)
  }

  function prev() {
    if (canGoPrev.value) shiftMonth(-1)
  }

  function next() {
    if (canGoNext.value) shiftMonth(1)
  }

  function setKind(k: PeriodKind) {
    kind.value = k
  }

  /**
   * Lifetime é a consulta cara do backend (agrega tudo em memória, sem groupBy),
   * e o histórico de ontem não muda: cache longo. Os demais seguem os 15s do
   * resto do time tracking, que convive com timer ao vivo.
   */
  const staleTime = computed(() => (kind.value === 'all' ? 1000 * 60 * 5 : 1000 * 15))

  return {
    kind,
    anchor,
    range,
    pulseRange,
    label,
    shortLabel,
    anchorLabel,
    isCurrentMonth,
    canGoPrev,
    canGoNext,
    prev,
    next,
    setKind,
    staleTime,
  }
}
