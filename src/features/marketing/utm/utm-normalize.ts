/**
 * Espelho de `normalizeUtmValue` da API (marketing-validation.ts) para a PRÉVIA
 * ao vivo do gerador. O servidor sempre normaliza de novo: aqui é só para a
 * pessoa ver, antes de salvar, exatamente o que vai para a URL.
 */
export function normalizeUtmValue(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

/** http(s) válido, ou null. Sem esquema assume https (igual à API). */
export function parseTarget(raw: string): URL | null {
  const text = raw.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Separa os utm_* colados na URL: devolve a base limpa e o que foi achado. */
export function splitPastedUtm(raw: string): { base: string; found: Partial<Record<(typeof UTM_KEYS)[number], string>> } | null {
  const url = parseTarget(raw)
  if (!url) return null
  const found: Partial<Record<(typeof UTM_KEYS)[number], string>> = {}
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)
    if (value && value.trim()) found[key] = value.trim()
    url.searchParams.delete(key)
  }
  return { base: url.toString(), found }
}

export interface UtmPreviewFields {
  target: string
  source: string
  medium: string
  campaign: string
  content: string
  term: string
}

/** URL final como o servidor monta: base + utm_* na ordem canônica, sem vazio. */
export function buildFinalPreview(f: UtmPreviewFields): string | null {
  const split = splitPastedUtm(f.target)
  if (!split) return null
  const url = new URL(split.base)
  const values: Record<(typeof UTM_KEYS)[number], string> = {
    utm_source: normalizeUtmValue(f.source),
    utm_medium: normalizeUtmValue(f.medium),
    utm_campaign: normalizeUtmValue(f.campaign),
    utm_term: normalizeUtmValue(f.term),
    utm_content: normalizeUtmValue(f.content),
  }
  for (const key of UTM_KEYS) {
    if (values[key]) url.searchParams.set(key, values[key])
  }
  return url.toString()
}

/** Nome de arquivo seguro para o QR baixado. */
export function fileSlug(text: string): string {
  return normalizeUtmValue(text) || 'qr'
}
