/**
 * Tradução entre o campo `description` da atividade e o HTML do editor.
 *
 * O campo carrega DOIS formatos ao mesmo tempo, e vai carregar por muito tempo:
 *
 * - **Texto plano**, de toda atividade criada antes desta rodada (o campo era um
 *   `<textarea>`). Pode conter `\n` e caracteres que parecem markup (`a < b`).
 * - **HTML de texto rico**, do editor novo.
 *
 * Não há migration de conteúdo (ver decisão A3 da spec R1): a distinção é feita
 * na leitura. Este arquivo é o único lugar do front que sabe disso. Todo mundo
 * que lê ou escreve descrição de atividade passa por aqui.
 */
import { renderHtml } from '@/composables/useMarkdownRenderer'

/**
 * Tem pelo menos uma tag HTML?
 *
 * Genérico de propósito. Em caso de dúvida o valor é tratado como TEXTO PLANO,
 * que é o lado seguro: texto plano é escapado antes de aparecer na tela, então
 * `<img onerror=...>` num campo legado vira texto visível, não script executado.
 */
const HAS_TAG = /<[a-z][a-z0-9-]*(\s[^>]*)?\/?>|<\/[a-z][a-z0-9-]*\s*>/i

/**
 * Documento vazio na serialização do ProseMirror.
 *
 * O TipTap nunca devolve string vazia: um editor sem conteúdo serializa como
 * `<p></p>`. Gravar isso faria a descrição nunca voltar a ser "vazia", e a
 * leitura mostraria um parágrafo em branco em vez de "Sem descrição".
 */
const EMPTY_DOC = /^(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i

/** Marcas e nós que significam "a pessoa formatou", para a instrumentação. */
const FORMATTING_TAG = /<(strong|em|s|u|code|a|ul|ol|li|blockquote)\b/i

/** Fronteiras de bloco que precisam virar espaço ao achatar em uma linha. */
const BLOCK_END = /<\/(p|li|blockquote|div)\s*>|<br\s*\/?>/gi

export function isHtmlish(value: string | null | undefined): boolean {
  return !!value && HAS_TAG.test(value)
}

/** Escapa só o necessário para um nó de texto. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Converte texto plano em HTML, preservando a intenção das quebras de linha.
 *
 * De brinde, conserta um defeito antigo: a descrição era escrita num textarea
 * com `\n` e renderizada como HTML sem `pre-wrap`, então uma lista de critérios
 * de aceitação virava um parágrafo grudado. Aqui linha em branco separa
 * parágrafo e quebra simples vira `<br>`.
 *
 * O escape vem ANTES da conversão de quebras, senão `&` de um `&lt;` recém
 * criado seria escapado de novo.
 */
export function plainToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  return normalized
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Reduz o documento vazio do ProseMirror a string vazia de verdade. */
export function normalizeHtml(html: string): string {
  const trimmed = html.trim()
  return EMPTY_DOC.test(trimmed) ? '' : trimmed
}

/**
 * O que entra no editor e o que aparece na leitura.
 *
 * HTML passa pelo DOMPurify (defesa contra o conteúdo sujo que já está no banco,
 * gravado antes de a API sanitizar na escrita). Texto plano é escapado.
 */
export function toEditorHtml(raw: string | null | undefined): string {
  if (!raw) return ''
  return isHtmlish(raw) ? normalizeHtml(renderHtml(raw)) : plainToHtml(raw)
}

/**
 * Achata a descrição em uma linha de texto, para resumo em lista e para contagem.
 *
 * Sanitiza ANTES de tocar no DOM: um `<img onerror>` colocado num `innerHTML`,
 * mesmo de elemento solto, executa. `textContent` de HTML não sanitizado seria
 * seguro, mas o caminho até ele não é.
 */
export function htmlToPlainText(raw: string | null | undefined): string {
  if (!raw) return ''
  if (!isHtmlish(raw)) return raw.replace(/\s+/g, ' ').trim()
  const holder = document.createElement('div')
  holder.innerHTML = renderHtml(raw.replace(BLOCK_END, ' '))
  return (holder.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Quantidade de caracteres de TEXTO (o markup não conta). */
export function plainTextLength(raw: string | null | undefined): number {
  return htmlToPlainText(raw).length
}

/** A pessoa usou alguma formatação, ou só digitou parágrafos? */
export function hasFormatting(html: string | null | undefined): boolean {
  return !!html && FORMATTING_TAG.test(html)
}
