import { useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { toast as sonner } from 'vue-sonner'
import { restoreTrash, type RestoreResult, type TrashedRef, type TrashType } from '@/service/marketing/marketing-trash'
import { apiErrorMessage } from '../calendar/api-error'
import { useMarketing } from '../composables/useMarketing'

/** Quanto tempo o "Desfazer" fica na tela. */
const UNDO_MS = 8000

/**
 * O que muda na tela quando algo volta (ou sai de vez) da lixeira: a ala
 * inteira e, para UTM, as telas de fora da ala que mostram o mesmo QR e o mesmo
 * link curto (auditoria da parte C: restaurar a UTM deixava "QR Codes" e o
 * Encurtador sem ela até recarregar).
 */
export function refreshAfterTrash(qc: QueryClient, groupId: string, type: TrashType) {
  const keys: unknown[][] = [['marketing', groupId]]
  if (type === 'utm') keys.push(['qr'], ['short-links'])
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })))
}

/** "Voltaram 4. 1 não voltou: <motivo>." para o lote que voltou em parte. */
export function partialRestoreMessage(res: RestoreResult): string | null {
  const failed = res.failed ?? []
  if (!failed.length) return null
  const ok = res.restored.length
  const head = `${ok === 1 ? 'Voltou 1' : `Voltaram ${ok}`}. ${failed.length === 1 ? '1 não voltou' : `${failed.length} não voltaram`}`
  return `${head}: ${failed[0]!.message}`
}

/**
 * Toast "foi para a lixeira" com "Desfazer" (spec R2, C6). Todo botão de
 * apagar da ala chama `announce` com o `trashed` que a API devolveu; desfazer
 * restaura e invalida o grupo inteiro (o socket também avisa as outras telas).
 *
 * Chame dentro do `setup` (usa o Vue Query e o grupo ativo).
 */
export function useTrashUndo() {
  const qc = useQueryClient()
  const mk = useMarketing()

  function announce(
    trashed: TrashedRef | null | undefined,
    what: string,
    opts: {
      onRestored?: () => void
      groupId?: string | null
      /** O que o "Desfazer" NÃO devolve (vai na descrição antes e depois). */
      undoNote?: string
    } = {},
  ) {
    const groupId = opts.groupId ?? mk.groupId.value
    if (!trashed || !groupId) {
      sonner.success(`${what} foi para a lixeira.`)
      return
    }
    sonner.success(`${what} foi para a lixeira.`, {
      description: opts.undoNote
        ? `Fica 30 dias na Lixeira da ala. ${opts.undoNote}`
        : 'Fica 30 dias na Lixeira da ala e dá para restaurar.',
      duration: UNDO_MS,
      action: {
        label: 'Desfazer',
        onClick: async () => {
          try {
            const res = await restoreTrash(groupId, trashed)
            await refreshAfterTrash(qc, groupId, trashed.type)
            const partial = partialRestoreMessage(res)
            if (partial) {
              // Lote que voltou em parte: o resto continua na Lixeira, com o motivo.
              sonner.warning(partial, { description: 'O que não voltou continua na Lixeira da ala.' })
            } else {
              const note = res.restored.find((r) => r.note)?.note
              const description = [note ? `Detalhe: ${note}.` : '', opts.undoNote ?? ''].filter(Boolean).join(' ')
              sonner.success('Voltou da lixeira.', description ? { description } : undefined)
            }
            opts.onRestored?.()
          } catch (err) {
            sonner.error(apiErrorMessage(err, 'Não deu para desfazer. Abra a Lixeira da ala.'))
          }
        },
      },
    })
  }

  return { announce }
}

/** Texto padrão do diálogo de apagar (a ação é reversível por 30 dias). */
export const TRASH_CONFIRM_LABEL = 'Mandar para a lixeira'
export function trashConfirmMessage(what: string): string {
  // Sem "apagado/apagada": `what` é de qualquer gênero (o card, a campanha...).
  return `${what} sai das telas e dos totais agora e fica 30 dias na Lixeira da ala, de onde dá para restaurar. Passados os 30 dias, o Nevo apaga de vez.`
}
