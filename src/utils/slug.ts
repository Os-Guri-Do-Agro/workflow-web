/**
 * Gêmeo de `workflow-api/src/common/slug.ts`.
 *
 * A unicidade da tag é decidida no servidor; esta cópia existe só para o campo
 * de tags saber, ANTES de chamar a API, se o que a pessoa digitou já é uma tag
 * da lista. Sem isso, digitar "bug" com "Bug" na tela ofereceria "Criar tag
 * bug" e a API devolveria a tag existente, deixando a UI mentindo.
 *
 * As duas precisam concordar. Se mudar uma, mude a outra.
 */
const DIACRITICS = /\p{Diacritic}/gu

export function normalizeTagSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
