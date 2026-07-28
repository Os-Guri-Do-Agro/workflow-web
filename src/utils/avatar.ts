/**
 * Identidade visual de PESSOA (iniciais + tom), compartilhada pelo board de
 * tarefas e pelo ranking da equipe: a mesma pessoa tem o mesmo tom nos dois
 * lugares, o que só funciona com uma função de hash única.
 *
 * Os tons vivem em `plugins/tokens.ts` (`--avatar-1..6`, por tema) — aqui só
 * se escolhe qual, nunca a cor em si.
 */
const AVATAR_TONES = 6

/** Tom estável da pessoa a partir do nome (token CSS, não hex). */
export function avatarTone(name: string): string {
  const sum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return `var(--avatar-${(sum % AVATAR_TONES) + 1})`
}

/** Iniciais para o avatar: primeira letra do primeiro e do último nome. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
