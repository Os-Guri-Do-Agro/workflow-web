/**
 * Título exibível de um bug report.
 *
 * A API já grava um título determinista na criação, mas reports antigos (feitos
 * antes disso) podem ter todos os campos de título nulos. Esta função repete a
 * mesma cadeia de fallback no cliente pra nenhuma tela mostrar card sem título.
 */

const TITLE_MAX_CHARS = 80

// Placeholders herdados que devem ser tratados como "sem título".
const PLACEHOLDER_TITLE_RE = /^(bug( report)? sem t[ií]tulo\.?|\(sem t[ií]tulo ainda\))$/i

export interface BugReportTitleSource {
  extractedTitle?: string | null
  rawTitle?: string | null
  descriptionText?: string | null
  spec?: { title?: string | null } | null
  activity?: { title?: string | null } | null
  videoMimetype?: string | null
  videoUrl?: string | null
  createdAt?: string | Date | null
}

function truncate(text: string, max = TITLE_MAX_CHARS): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut
  return `${base.replace(/[\s.,;:!?-]+$/, '')}...`
}

function clean(value: string | null | undefined, maxChars: number): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (PLACEHOLDER_TITLE_RE.test(text)) return null
  return truncate(text, maxChars)
}

function originOf(report: BugReportTitleSource): 'vídeo' | 'imagem' | 'texto' {
  if (!report.videoUrl && !report.videoMimetype) return 'texto'
  return report.videoMimetype?.startsWith('image/') ? 'imagem' : 'vídeo'
}

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}

export function bugReportTitle(
  report: BugReportTitleSource | null | undefined,
  maxChars: number = TITLE_MAX_CHARS,
): string {
  if (!report) return 'Reporte sem detalhes'

  const direct =
    clean(report.extractedTitle, maxChars) ??
    clean(report.spec?.title, maxChars) ??
    clean(report.rawTitle, maxChars) ??
    clean(report.activity?.title, maxChars)
  if (direct) return direct

  const firstLine = (report.descriptionText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  const fromDescription = clean(firstLine, maxChars)
  if (fromDescription) return fromDescription

  const date = formatDate(report.createdAt)
  const origin = originOf(report)
  return date ? `Reporte por ${origin} em ${date}` : `Reporte por ${origin}`
}
