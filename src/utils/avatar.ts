/**
 * Identidade visual de PESSOA (iniciais + tom), compartilhada pelo board de
 * tarefas e pelo ranking da equipe: a mesma pessoa tem o mesmo tom nos dois
 * lugares, o que só funciona com uma função de hash única.
 *
 * Os tons vivem em `plugins/tokens.ts` (`--avatar-1..6`, por tema) — aqui só
 * se escolhe qual, nunca a cor em si.
 *
 * Quem desenha a pessoa na tela é SEMPRE o `components/ui/PersonAvatar.vue`
 * (foto quando existe, estas iniciais quando não existe ou a imagem falha).
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

/**
 * Nome como chave de busca: sem acento, sem caixa e com os espaços colapsados.
 * É o que liga "Letícia Porfirio" (payload com nome) a "leticia porfirio"
 * (diretório), nos lugares que só conhecem o nome, como as rotinas.
 */
export function normalizePersonName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * URL pronta para o `<img>` a partir do `avatarUrl` da API.
 *
 * - `https://...` (bucket público), `blob:` e `data:image/` (prévia local)
 *   passam como estão;
 * - `/avatars/x.webp` é relativo à ORIGEM DO FRONT (os avatares prontos moram em
 *   `public/avatars/`), não à API: o navegador resolve sozinho;
 * - caminho sem barra inicial ganha a barra, para não virar relativo à rota
 *   atual (`/tasks/m-09/avatars/...`);
 * - qualquer outro esquema (`javascript:`, `//host` etc.) é recusado e a pessoa
 *   aparece com as iniciais.
 */
export function resolveAvatarSrc(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw) || /^blob:/i.test(raw) || /^data:image\//i.test(raw)) return raw
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return null
  return raw.startsWith('/') ? raw : `/${raw}`
}
