import { onBeforeUnmount, onMounted, unref, type MaybeRef } from 'vue'

/**
 * Colar arquivo do clipboard (Ctrl+V) em qualquer tela que aceite upload.
 *
 * Sem isto, anexar um print custa: Win+Shift+S, abrir o Paint, colar, salvar
 * com nome, achar a pasta, arrastar. Todo lugar que aceita arquivo deveria
 * aceitar o que já está na área de transferência.
 *
 * ## O que NÃO é capturado
 *
 * - Colar **texto**: só reage quando o clipboard traz arquivo de fato
 *   (`clipboardData.files`), então Ctrl+V num campo de busca continua colando
 *   texto normalmente.
 * - Colar dentro de um **editor de conteúdo** (`contentEditable`, ex. TipTap):
 *   o editor tem o próprio tratamento de imagem e é mais específico que este.
 *
 * O listener fica no `document` em fase de bolha (não captura), então quem
 * quiser tratar antes só precisa de `stopPropagation`.
 */

/** Print vem do clipboard sem nome; "image.png" repetido não ajuda ninguém. */
function nameForPasted(file: File, index: number): string {
  if (file.name && file.name !== 'image.png') return file.name

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    ` ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
  const suffix = index > 0 ? `-${index + 1}` : ''
  return `Captura ${stamp}${suffix}.${extension}`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  // input e textarea aceitam texto, mas NÃO aceitam arquivo: colar um print
  // com o cursor na busca deve anexar, não sumir. Só o editor rico é exceção.
  return target.isContentEditable || tag === 'select'
}

export function usePasteFiles(
  onFiles: (files: File[]) => void,
  options: { enabled?: MaybeRef<boolean> } = {},
) {
  function handlePaste(event: ClipboardEvent) {
    if (unref(options.enabled) === false) return
    if (isEditableTarget(event.target)) return

    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length === 0) return

    event.preventDefault()
    onFiles(
      files.map(
        (file, index) =>
          new File([file], nameForPasted(file, index), {
            type: file.type,
            lastModified: file.lastModified,
          }),
      ),
    )
  }

  onMounted(() => document.addEventListener('paste', handlePaste))
  onBeforeUnmount(() => document.removeEventListener('paste', handlePaste))
}
