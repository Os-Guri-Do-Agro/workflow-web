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
export function stripHtmlPreview(html: string | null | undefined, max = 150): string {
  if (!html) return ''

  const text = new DOMParser()
    .parseFromString(html, 'text/html')
    .body.textContent ?? ''

  const clean = text.replace(/\s+/g, ' ').trim()

  if (clean.length <= max) return clean

  return `${clean.slice(0, max).trimEnd()}…`
}
