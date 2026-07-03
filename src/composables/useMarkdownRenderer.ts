import { marked } from "marked"
import DOMPurify from "dompurify"
import hljs from "highlight.js/lib/common"

/**
 * Highlight de blocos de código via highlight.js.
 *
 * O `marked` v18 removeu a option `highlight`, então sobrescrevemos o renderer
 * de `code`. As cores dos tokens (.hljs-*) vêm do CSS do componente que renderiza
 * (ex.: AssistantPanel.vue), mantendo tudo theme-aware. O HTML gerado ainda passa
 * por DOMPurify no `renderMarkdown` — spans com class são preservados.
 */
let highlightConfigured = false
function configureHighlight(): void {
  if (highlightConfigured) return
  highlightConfigured = true
  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }): string {
        const language = lang && hljs.getLanguage(lang) ? lang : undefined
        const highlighted = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value
        return `<pre><code class="hljs language-${language ?? "plaintext"}">${highlighted}</code></pre>`
      },
    },
  })
}

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
  configureHighlight()
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
