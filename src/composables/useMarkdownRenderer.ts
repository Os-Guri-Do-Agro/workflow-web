import { marked } from "marked"
import DOMPurify from "dompurify"

/**
 * Converte markdown (vindo da IA) em HTML seguro para uso em `v-html`.
 *
 * Single source of truth markdown -> HTML sanitizado. Sempre passa por
 * DOMPurify; nunca expor `marked.parse` direto num `v-html`.
 *
 * @param md texto markdown cru
 * @returns HTML sanitizado (string vazia quando `md` for vazio/nullish)
 */
export function renderMarkdown(md: string): string {
  if (!md) return ""
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw)
}
