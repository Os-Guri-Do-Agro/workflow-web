/**
 * Helpers de duração para o time tracking.
 *
 * Diferente de `utils/date.ts` (date-only, guardado ao meio-dia UTC), aqui
 * lidamos com INSTANTES reais e com durações em segundos.
 */

/**
 * Normaliza segundos vindos de fora. `Math.max(0, NaN)` é NaN, não 0, então sem
 * este guarda uma data inválida da API vazava "NaN:NaN" direto para a topbar.
 */
function safeSec(totalSec: number): number {
  return Number.isFinite(totalSec) ? Math.max(0, Math.floor(totalSec)) : 0
}

/** Segundos → cronômetro "H:MM:SS" (com horas) ou "MM:SS" (sem). */
export function formatTimer(totalSec: number): string {
  const sec = safeSec(totalSec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  return `${mm}:${ss}`
}

/** Segundos → duração legível "2h 15m" / "15m" / "45s". */
export function formatDurationLong(totalSec: number): string {
  const sec = safeSec(totalSec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${sec}s`
}

/** Segundos entre agora e um `startedAt` ISO (fonte de verdade = servidor). */
export function elapsedSince(startedAtIso: string): number {
  const started = new Date(startedAtIso).getTime()
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.round((Date.now() - started) / 1000))
}

/** Instante ISO → "HH:MM" local (ex.: 14:05). */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Instante ISO → dia local "YYYY-MM-DD" (chave de agrupamento). */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** "YYYY-MM-DD" (ou ISO) → rótulo de dia amigável em pt-BR (Hoje / Ontem / data). */
export function formatDayLabel(dayIso: string): string {
  const d = new Date(dayIso.length === 10 ? `${dayIso}T12:00:00` : dayIso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return 'Hoje'
  if (sameDay(d, yesterday)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
}
