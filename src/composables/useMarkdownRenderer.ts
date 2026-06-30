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

/**
 * Sanitiza HTML já pronto (vindo do backend) para uso seguro em `v-html`.
 *
 * Usar quando a string JÁ é HTML (ex.: `improveReport`/`improvedReport`),
 * NÃO markdown — aqui só passamos pelo DOMPurify, sem `marked`, para não
 * reprocessar/quebrar o markup do servidor.
 *
 * @param html HTML cru (não sanitizado) vindo do backend
 * @returns HTML sanitizado (string vazia quando `html` for vazio/nullish)
 */
export function renderHtml(html: string): string {
  if (!html) return ""
  return DOMPurify.sanitize(html)
}
