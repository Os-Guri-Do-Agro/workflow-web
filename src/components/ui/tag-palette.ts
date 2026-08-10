import { tagColors } from '@/plugins/tokens'

/**
 * Paleta das tags, do lado do design system.
 *
 * Mora em `components/ui/` (e não em `features/tasks/`) porque o `TagChip` é um
 * primitive e o board o consome: um componente de `components/` importando de
 * `features/*` inverteria a direção da dependência que o projeto declara.
 *
 * As chaves precisam bater com `TAG_COLOR_KEYS` de
 * `workflow-api/src/tag/tag.constants.ts` e com `tagColors` de `plugins/tokens.ts`.
 */
export const TAG_COLOR_KEYS = Object.keys(tagColors)

/** Forma mínima de tag que o chip precisa. Deliberadamente não é `ActivityTag`. */
export interface TagLike {
  id: string
  name: string
  slug: string
  color?: string | null
}

/**
 * Resolve a cor da tag para uma custom property do tema.
 *
 * Nunca devolve hex: quem pinta é `var(--tag-<chave>)`, que `applyThemeTokens`
 * reescreve ao trocar de tema. Chip com hex fixo ficaria ilegível num dos dois.
 *
 * Tag sem cor escolhida (a maioria: o usuário digita o nome e aperta Enter)
 * recebe uma cor **determinística pelo slug**. Determinística importa: se
 * sorteasse, a mesma tag mudaria de cor a cada render e o board pareceria
 * quebrado. O hash é o menor possível que distribui razoavelmente 12 valores.
 */
export function tagColorVar(tag: { slug: string; color?: string | null }): string {
  const key = tag.color && tag.color in tagColors ? tag.color : fallbackKey(tag.slug)
  return `var(--tag-${key})`
}

function fallbackKey(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    // djb2 reduzido: multiplicação por 33 e soma, truncado em 32 bits pelo `| 0`.
    hash = (hash * 33 + slug.charCodeAt(i)) | 0
  }
  // `?? 'slate'` só existe para o compilador: `TAG_COLOR_KEYS` vem de
  // `tagColors`, que nunca é vazio, e o índice é sempre válido.
  return TAG_COLOR_KEYS[Math.abs(hash) % TAG_COLOR_KEYS.length] ?? 'slate'
}
