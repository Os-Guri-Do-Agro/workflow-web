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
 * Memória das últimas conversões.
 *
 * ## Por que existe
 *
 * `renderMarkdown` e `renderHtml` são chamados DENTRO DE TEMPLATE em vários
 * lugares (painel do assistente, detalhe de bug report, relatório) — inclusive
 * dentro de `v-for`. Função chamada em template roda a cada re-render, então um
 * chat com 20 mensagens reprocessava 20 markdowns, com destaque de sintaxe e
 * sanitização, a cada tique reativo da tela. É trabalho de dezenas de
 * milissegundos por frame para produzir exatamente o mesmo HTML de antes.
 *
 * Memoizar aqui conserta TODOS os pontos de chamada de uma vez, inclusive os que
 * ainda não existem, sem obrigar cada tela a virar `computed`. O conteúdo é
 * imutável: mesma entrada, mesma saída.
 *
 * O limite existe para não segurar HTML de conversas antigas na memória para
 * sempre; descarta o mais antigo, que é o menos provável de reaparecer na tela.
 */
const LIMITE_DE_CACHE = 120

function memoizar(fn: (entrada: string) => string): (entrada: string) => string {
  const cache = new Map<string, string>()
  return (entrada: string) => {
    const hit = cache.get(entrada)
    if (hit !== undefined) return hit
    const saida = fn(entrada)
    if (cache.size >= LIMITE_DE_CACHE) {
      const maisAntigo = cache.keys().next().value
      if (maisAntigo !== undefined) cache.delete(maisAntigo)
    }
    cache.set(entrada, saida)
    return saida
  }
}

/**
 * Converte markdown (vindo da IA) em HTML seguro para uso em `v-html`.
 *
 * Single source of truth markdown -> HTML sanitizado. Sempre passa por
 * DOMPurify; nunca expor `marked.parse` direto num `v-html`.
 *
 * Memoizado: pode ser chamado de template sem custo por render.
 *
 * @param md texto markdown cru
 * @returns HTML sanitizado (string vazia quando `md` for vazio/nullish)
 */
export const renderMarkdown = memoizar((md: string): string => {
  if (!md) return ""
  configureHighlight()
  const raw = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(raw)
})

/**
 * Sanitiza HTML já pronto (vindo do backend) para uso seguro em `v-html`.
 *
 * Usar quando a string JÁ é HTML (ex.: `improveReport`/`improvedReport`),
 * NÃO markdown — aqui só passamos pelo DOMPurify, sem `marked`, para não
 * reprocessar/quebrar o markup do servidor.
 *
 * Memoizado pelo mesmo motivo do `renderMarkdown`: é chamado de template.
 *
 * @param html HTML cru (não sanitizado) vindo do backend
 * @returns HTML sanitizado (string vazia quando `html` for vazio/nullish)
 */
export const renderHtml = memoizar((html: string): string => {
  if (!html) return ""
  return DOMPurify.sanitize(html)
})
