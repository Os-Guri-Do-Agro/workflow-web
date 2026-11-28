/**
 * Destino "Acervo" da fila GLOBAL de envio da ala (`useUploadQueue`, bandeja
 * "Envios"). O lote inteiro entra na fila de uma vez (3 em paralelo, como
 * qualquer envio da ala); este módulo só sabe o que é do Acervo:
 *
 * - o ticket vem de `POST library/uploads` com o DESTINO BASE (o lugar e a
 *   pasta escolhidos) mais o `relativePath` do arquivo: o servidor recria as
 *   subpastas e devolve a pasta resolvida. A base nunca muda, então um
 *   "Tentar de novo" não aninha a subpasta dentro dela mesma;
 * - repetido (mesmo sha256 já no Acervo) vira PERGUNTA da fila (`{ prompt }`):
 *   a bandeja mostra "Manter os dois" e "Pular", sem segurar vaga, e com
 *   "fazer o mesmo para os outros deste envio". Ninguém guarda promessa na
 *   tela, então sair da tela não trava a fila;
 * - o item nasce no `onUploaded` (passo final da fila, com repetição): se
 *   falhar, o arquivo fica com erro e o "Tentar de novo" cria só o item, com o
 *   mesmo arquivo já guardado. O resultado do lote conta o `itemId` criado;
 * - o painel da tela do Acervo só LÊ os itens `kind: 'library'` da fila.
 */
import { reactive } from 'vue'
import { useToast } from '@/composables/useToast'
import { onSessionReset } from '@/service/session-hooks'
import {
  createLibraryItem,
  libraryKeys,
  requestLibraryUploads,
} from '@/service/marketing/marketing-library'
import { UploadError } from '../uploads/transport'
import { useUploadQueue, type UploadBatch, type UploadEntry, type UploadItem, type UploadTarget } from '../uploads/upload-queue'

export interface LibraryUploadDest {
  /** null = Geral do grupo */
  companyId: string | null
  folderId: string | null
}

/** O que só o Acervo sabe de cada arquivo da fila (por id do item da fila). */
interface LibraryItemState {
  /** Pasta que o servidor resolveu (base + subpastas do `relativePath`) */
  folderId: string | null | undefined
  /** Item do Acervo criado: é isto que diz "enviado" */
  itemId: string | null
}

const perItem = reactive(new Map<string, LibraryItemState>())
const flattenedBatches = new Set<string>()

function stateOf(item: UploadItem): LibraryItemState {
  let s = perItem.get(item.id)
  if (!s) {
    perItem.set(item.id, { folderId: undefined, itemId: null })
    s = perItem.get(item.id)!
  }
  return s
}

/** Item do Acervo criado para este arquivo da fila (ou null). */
export function libraryItemIdOf(item: UploadItem): string | null {
  return perItem.get(item.id)?.itemId ?? null
}

export const SKIPPED_DUPLICATE = 'Já estava no acervo. Pulado.'

/** Destino da fila para uma pasta do Acervo. `label` é o lugar ("PetJourney / Fotos"). */
export function libraryTarget(groupId: string, dest: LibraryUploadDest, label: string): UploadTarget {
  // Cópia congelada: o destino base é o que a pessoa escolheu, sempre.
  const base = Object.freeze({ companyId: dest.companyId, folderId: dest.folderId })
  return {
    key: `library:${base.companyId ?? 'geral'}:${base.folderId ?? 'raiz'}`,
    kind: 'library',
    label: `Acervo, ${label}`,
    async requestTicket(g, meta, { signal, item }) {
      if (meta.choice === 'skip') return { skip: true, reason: SKIPPED_DUPLICATE }
      const res = await requestLibraryUploads(
        g,
        {
          companyId: base.companyId,
          folderId: base.folderId,
          files: [
            {
              name: meta.name,
              size: meta.size,
              mimeType: meta.mimeType,
              sha256: meta.sha256,
              relativePath: meta.relativePath,
              keepBoth: meta.choice === 'keep' || undefined,
            },
          ],
        },
        { signal },
      )
      if (res.flattened) flattenedBatches.add(item.batchId)
      const f = res.files[0]
      if (!f) throw new UploadError('O servidor não devolveu o envio deste arquivo.', 'refused')
      if (f.error) throw new UploadError(f.error, 'refused')
      if (!f.ticket && f.duplicateOf) {
        const d = f.duplicateOf
        const alias = d.title && d.title !== item.name.replace(/\.[^.]+$/, '') ? ` (como "${d.title}")` : ''
        return {
          prompt: {
            message: `Já está no acervo em ${d.folderPath}${alias}.`,
            choices: [
              { value: 'skip', label: 'Pular' },
              { value: 'keep', label: 'Manter os dois', primary: true },
            ],
            batchLabel: 'Fazer o mesmo para os outros repetidos deste envio',
          },
        }
      }
      if (!f.ticket) throw new UploadError('O servidor não liberou o envio deste arquivo.', 'refused')
      // A pasta resolvida só serve para criar o item; o próximo ticket usa a base de novo.
      stateOf(item).folderId = f.folderId
      return f.ticket
    },
    // O item nasce aqui (idempotente no servidor: o mesmo asset devolve o mesmo item).
    async onUploaded(asset, item, { signal }) {
      const s = stateOf(item)
      if (s.itemId) return
      const created = await createLibraryItem(
        groupId,
        {
          assetId: asset.id,
          folderId: s.folderId === undefined ? base.folderId : s.folderId,
          companyId: base.companyId,
        },
        { signal },
      )
      s.itemId = created.id
    },
    invalidate: (g) => [libraryKeys.all(g)],
  }
}

export interface LibraryUploadSummary {
  done: number
  skipped: number
  failed: number
  canceled: number
  flattened: boolean
}

function summarize(batch: UploadBatch): LibraryUploadSummary {
  const items = batch.items
  return {
    done: items.filter((i) => !!libraryItemIdOf(i)).length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    failed: items.filter((i) => i.status === 'error' || (i.status === 'done' && !libraryItemIdOf(i))).length,
    canceled: items.filter((i) => i.status === 'canceled').length,
    flattened: flattenedBatches.has(batch.id),
  }
}

/** "3 arquivos enviados para PetJourney / Fotos; 1 pulado." */
export function summaryText(s: LibraryUploadSummary, label: string): string {
  const parts: string[] = []
  if (s.done) parts.push(s.done === 1 ? `1 arquivo enviado para ${label}` : `${s.done} arquivos enviados para ${label}`)
  if (s.skipped) parts.push(s.skipped === 1 ? '1 pulado' : `${s.skipped} pulados`)
  if (s.canceled) parts.push(s.canceled === 1 ? '1 cancelado' : `${s.canceled} cancelados`)
  if (s.failed) parts.push(s.failed === 1 ? '1 não subiu (veja nos envios)' : `${s.failed} não subiram (veja nos envios)`)
  if (s.flattened) parts.push('pastas além de 5 níveis ficaram no 5º nível')
  return parts.length ? `${parts.join('; ')}.` : ''
}

/**
 * Põe o lote inteiro na fila global, com destino `dest` (lugar e pasta base);
 * o `relativePath` de cada entrada recria as subpastas dentro dela. O resumo
 * sai num aviso quando o lote termina (mesmo com a pessoa em outra tela da ala).
 */
export function enqueueLibraryUploads(
  groupId: string,
  entries: UploadEntry[],
  dest: LibraryUploadDest,
  label: string,
  opts: { onSettled?: (summary: LibraryUploadSummary) => void } = {},
): UploadBatch {
  const toast = useToast()
  const batch = useUploadQueue().enqueue(groupId, entries, libraryTarget(groupId, dest, label), {
    onBatchSettled: (b) => {
      const s = summarize(b)
      opts.onSettled?.(s)
      // Só cancelado ou pulado: foi a própria pessoa, e a bandeja já mostra (o
      // aviso cobriria o "Tentar de novo" dela).
      if (!s.done && !s.failed) return
      const text = summaryText(s, label)
      if (!text) return
      if (s.failed) toast.warning(text)
      else toast.success(text)
    },
  })
  for (const r of batch.rejected) toast.error(`${r.name}: ${r.reason}`)
  return batch
}

// Saiu da conta: os itens da fila somem, e o que o Acervo sabia deles também.
onSessionReset(() => {
  perItem.clear()
  flattenedBatches.clear()
})
useUploadQueue().subscribe(({ type, item }) => {
  if (type === 'removed') perItem.delete(item.id)
})
