/**
 * Copia um texto, inclusive um que ainda vai chegar da rede (revelar segredo,
 * montar `.env`). Safari e Firefox recusam o `writeText` depois de um `await`
 * (o gesto do clique "expira"): o `ClipboardItem` com uma Promise segura o
 * gesto até o texto chegar. Mesma técnica do `TaskDocs`.
 *
 * Se a Promise do texto falhar (ex.: 403 ao revelar), o erro sobe para quem
 * chamou e nada é copiado.
 */
export async function copyText(text: string | Promise<string>): Promise<void> {
  const pending = Promise.resolve(text)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': pending.then((t) => new Blob([t], { type: 'text/plain' })),
        }),
      ])
      return
    } catch (err) {
      // A falha veio do texto (rede): não adianta tentar de novo.
      const failedText = await pending.then(
        () => false,
        () => true,
      )
      if (failedText) throw err
      // Navegador sem ClipboardItem com Promise: cai no writeText.
    }
  }
  await navigator.clipboard.writeText(await pending)
}
