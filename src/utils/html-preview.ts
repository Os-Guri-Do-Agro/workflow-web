/**
 * Extrai um preview de texto limpo a partir do HTML do editor (TipTap).
 *
 * Usa o DOMParser do browser para descartar todas as tags e ler apenas o
 * `textContent`, colapsa whitespace, faz trim e trunca com reticências quando
 * o texto passa de `max` caracteres. Garante que nunca vaze markup cru para a
 * UI (ex.: cards de notas).
 *
 * @param html  HTML bruto vindo do editor (pode ser vazio/undefined/null).
 * @param max   Tamanho máximo do preview antes de truncar. Default 150.
 * @returns     Texto limpo, possivelmente truncado com "…". "" se vazio.
 */
const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr,td,th,div,summary'

/**
 * Um bloco por trecho, com separador entre eles. Antes o `textContent` grudava
 * os parágrafos e a prévia lia "Decisões Cadastro com foto entra na versão 1.4
 * Push de vacina...": título, itens de lista e frases viravam uma frase só.
 * Bloco que já termina em pontuação ganha só um espaço; os outros, " · ".
 */
export function stripHtmlPreview(html: string | null | undefined, max = 150): string {
  if (!html) return ''

  const body = new DOMParser().parseFromString(html, 'text/html').body
  body.querySelectorAll(BLOCKS).forEach((el) => el.append('\n'))
  const parts = (body.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const clean = parts.reduce((acc, part) => {
    if (!acc) return part
    return /[.!?:;…]$/.test(acc) ? `${acc} ${part}` : `${acc} · ${part}`
  }, '')

  if (clean.length <= max) return clean

  return `${clean.slice(0, max).trimEnd()}…`
}
