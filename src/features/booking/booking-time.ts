/**
 * Fuso horário no front do agendamento, só com `Intl` (sem lib de data).
 *
 * A regra que manda: **o servidor fala em instantes (ISO UTC) e a tela decide
 * o fuso.** O convidado vê os horários no fuso DELE (detectado do navegador,
 * trocável na tela), o anfitrião configura no fuso DELE. Nada aqui usa o fuso
 * da máquina implicitamente: `new Date().getHours()` mostraria a hora do
 * computador, que é exatamente o erro que faz alguém em Lisboa entrar na
 * reunião três horas atrasado.
 *
 * Datas civis são strings "YYYY-MM-DD", com aritmética em UTC (mesma convenção
 * de `utils/date.ts` e do motor do backend).
 */

const DAY_MS = 86_400_000

const partsCache = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsCache.set(timeZone, f)
  }
  return f
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** Fuso do navegador; cai em São Paulo se o ambiente não informar. */
export function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && isValidTimeZone(tz)) return tz
  } catch {
    /* ambiente sem Intl completo */
  }
  return 'America/Sao_Paulo'
}

interface Parts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function zonedParts(instant: number, timeZone: string): Parts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  }
}

function offsetMs(instant: number, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Instante → data civil no fuso. */
export function dateKeyInZone(instant: string | number | Date, timeZone: string): string {
  const p = zonedParts(new Date(instant).getTime(), timeZone)
  return toDateKey(p.year, p.month, p.day)
}

/** Meia-noite da data civil no fuso, como instante (mesmo algoritmo do backend). */
export function zonedMidnight(dateKey: string, timeZone: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const wall = Date.UTC(y!, m! - 1, d!)
  const o1 = offsetMs(wall, timeZone)
  const t1 = wall - o1
  const o2 = offsetMs(t1, timeZone)
  if (o1 === o2) return t1
  const t2 = wall - o2
  if (offsetMs(t2, timeZone) === o2) return t2
  return Math.max(t1, t2)
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(y!, m! - 1, d!) + days * DAY_MS)
  return toDateKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
}

export function todayKey(timeZone: string): string {
  return dateKeyInZone(Date.now(), timeZone)
}

/** "09:30" no fuso. */
export function formatTime(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))
}

/**
 * Data civil por extenso ("sexta-feira, 20 de novembro"). Formata em UTC ao
 * meio-dia: a data civil já É a data, não pode andar com fuso nenhum.
 */
export function formatDateKey(
  dateKey: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opts }).format(
    new Date(Date.UTC(y!, m! - 1, d!, 12)),
  )
}

/** "sexta-feira, 20 de novembro de 2026" do instante, no fuso. */
export function formatDayOf(instant: string, timeZone: string): string {
  return formatDateKey(dateKeyInZone(instant, timeZone), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** "09:30 – 10:00" no fuso. */
export function formatTimeRange(start: string, end: string, timeZone: string): string {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`
}

/**
 * Dia do instante relativo a hoje, no fuso: "hoje", "amanhã", "ontem" ou
 * "sex., 20 de nov.". Minúsculo: quem usa no começo da frase capitaliza.
 */
export function relativeDayLabel(instant: string, timeZone: string): string {
  const key = dateKeyInZone(instant, timeZone)
  const today = todayKey(timeZone)
  if (key === today) return 'hoje'
  if (key === addDays(today, 1)) return 'amanhã'
  if (key === addDays(today, -1)) return 'ontem'
  return formatDateKey(key, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Mês de ano" para o cabeçalho do calendário. */
export function formatMonth(year: number, month: number): string {
  const text = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, 15)))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "GMT-3" no instante (o offset muda com o horário de verão). */
export function gmtOffset(timeZone: string, at: number = Date.now()): string {
  const minutes = Math.round(offsetMs(at, timeZone) / 60_000)
  if (minutes === 0) return 'GMT'
  const sign = minutes > 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** Nome do lugar a partir do id IANA: "America/Sao_Paulo" → "Sao Paulo". */
export function zoneCity(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone
  return last.replace(/_/g, ' ')
}

/** Nome longo do fuso em pt-BR ("Horário Padrão de Brasília"), quando o Intl souber. */
export function zoneLongName(timeZone: string, at: number = Date.now()): string {
  try {
    const name = new Intl.DateTimeFormat('pt-BR', { timeZone, timeZoneName: 'long' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value
    if (name && !name.startsWith('GMT')) return name
  } catch {
    /* fuso desconhecido */
  }
  return zoneCity(timeZone)
}

/** "São Paulo · Horário Padrão de Brasília (GMT-3)". */
export function zoneLabel(timeZone: string, at: number = Date.now()): string {
  return `${zoneLongName(timeZone, at)} (${gmtOffset(timeZone, at)})`
}

export interface ZoneOption {
  value: string
  city: string
  region: string
  offset: string
  offsetMinutes: number
  /** Texto de busca sem acento. */
  search: string
}

const FALLBACK_ZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Belem',
  'America/Fortaleza',
  'America/Recife',
  'America/Cuiaba',
  'America/Rio_Branco',
  'America/Noronha',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Luanda',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
]

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

let zoneCache: ZoneOption[] | null = null

/** Todos os fusos IANA conhecidos, ordenados por offset e nome. */
export function listTimeZones(): ZoneOption[] {
  if (zoneCache) return zoneCache
  let ids: string[] = FALLBACK_ZONES
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone')
    if (supported?.length) ids = supported
  } catch {
    /* navegador antigo: fica a lista curta */
  }
  const now = Date.now()
  zoneCache = ids
    .filter(isValidTimeZone)
    .map((value) => {
      const offsetMinutes = Math.round(offsetMs(now, value) / 60_000)
      const city = zoneCity(value)
      const region = value.includes('/') ? value.split('/')[0]! : ''
      const offset = gmtOffset(value, now)
      return {
        value,
        city,
        region,
        offset,
        offsetMinutes,
        search: normalize(`${value} ${city} ${offset} ${zoneLongName(value, now)}`),
      }
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city))
  return zoneCache
}

export function searchZones(query: string): ZoneOption[] {
  const q = normalize(query.trim())
  const all = listTimeZones()
  if (!q) return all
  return all.filter((z) => z.search.includes(q))
}

/**
 * Semanas do mês para o calendário (domingo primeiro, como o calendário
 * brasileiro). `null` = célula vazia antes do dia 1 / depois do último dia.
 */
export function monthWeeks(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(toDateKey(year, month, day))
  while (cells.length % 7) cells.push(null)
  const weeks: Array<Array<string | null>> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const WEEKDAY_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

/** Selo de duração em dois andares ("30" sobre "min", "1" sobre "hora", "1h30"). */
export function durationBadge(minutes: number): { value: string; unit: string } {
  if (minutes < 60) return { value: String(minutes), unit: 'min' }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!m) return { value: String(h), unit: h === 1 ? 'hora' : 'horas' }
  return { value: `${h}h${String(m).padStart(2, '0')}`, unit: '' }
}

/** "30 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
