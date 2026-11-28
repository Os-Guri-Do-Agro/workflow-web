/**
 * Destinos de envio da ala (o `UploadTarget` da fila). Cada um chama a rota da
 * fase que VALIDA O DONO e devolve o ticket; o resto (hash, storage, confirm,
 * repetição) é da fila.
 *
 * Para um destino novo, crie um objeto `UploadTarget` (o do Acervo mora em
 * `library/library-upload.ts`)
 * com `key` estável, `kind`, `label` e `requestTicket` (que recebe o `signal`
 * do cancelar: passe ao axios); `accept`, `onUploaded`
 * e `invalidate` são opcionais. O `requestTicket` pode devolver `{ prompt }`
 * (repetido: "Manter os dois" ou "Pular") ou `{ skip: true }`.
 */
import api from '@/service/api'
import { mkt, type MarketingUploadMeta, type MarketingUploadTicket } from '@/service/marketing/marketing-core'
import { cardKeys } from '../approvals/approvals-meta'
import type { UploadTarget } from './upload-queue'

const id = encodeURIComponent

/** Só os campos que as rotas das fases conhecem (o ValidationPipe descarta o resto). */
function phaseMeta(meta: MarketingUploadMeta) {
  return { name: meta.name, mimeType: meta.mimeType, size: meta.size, sha256: meta.sha256 }
}

async function ticket(route: string, meta: MarketingUploadMeta, signal: AbortSignal): Promise<MarketingUploadTicket> {
  // Cancelar aborta o pedido; ticket que chega mesmo assim a fila devolve (abort no servidor).
  const { data } = await api.post<MarketingUploadTicket>(route, phaseMeta(meta), { signal })
  return data
}

/**
 * Arquivo SOLTO do card (entra na próxima versão quando ela fecha). A ordem do
 * carrossel e o "fechar a versão ao terminar" moram em `version-drafts.ts`.
 */
export function cardVersionTarget(groupId: string, cardId: string, cardTitle: string): UploadTarget {
  return {
    key: `card:${cardId}`,
    kind: 'card-version',
    label: `Card ${cardTitle}`,
    requestTicket: (g, meta, { signal }) => ticket(mkt(g, `/cards/${id(cardId)}/assets`), meta, signal),
    invalidate: (g) => [cardKeys.detail(g, cardId)],
  }
}

const PHOTO_OR_VIDEO = /^(image|video)\//

export function activationPhotoTarget(activationId: string, title: string): UploadTarget {
  return {
    key: `activation:${activationId}`,
    kind: 'activation-photo',
    label: `Ativação ${title}`,
    accept: (file) => (PHOTO_OR_VIDEO.test(file.type) ? null : 'Só foto e vídeo entram na ativação.'),
    requestTicket: (g, meta, { signal }) => ticket(mkt(g, `/activations/${id(activationId)}/photos`), meta, signal),
    invalidate: (g) => [['marketing', g, 'activations']],
  }
}

/** O mesmo filtro da API (finance.service: INVOICE_EXT e INVOICE_MIME). */
const INVOICE_EXT = /\.(pdf|xml|png|jpe?g|webp|heic|heif|gif|tiff?)$/i
const INVOICE_MIME = /^(application\/pdf|application\/xml|text\/xml|image\/)/i

export function expenseInvoiceTarget(expenseId: string, description: string): UploadTarget {
  return {
    key: `expense:${expenseId}`,
    kind: 'expense-invoice',
    label: `Nota de ${description}`,
    accept: (file) =>
      INVOICE_EXT.test(file.name) || INVOICE_MIME.test(file.type) ? null : 'Nota fiscal: envie PDF, XML ou imagem.',
    requestTicket: (g, meta, { signal }) => ticket(mkt(g, `/finance/expenses/${id(expenseId)}/invoices`), meta, signal),
    invalidate: (g) => [['marketing', g, 'finance'], ['marketing', g, 'activations']],
  }
}

export function quoteFileTarget(quoteId: string, description: string): UploadTarget {
  return {
    key: `quote:${quoteId}`,
    kind: 'quote-file',
    label: `Orçamento ${description}`,
    requestTicket: (g, meta, { signal }) => ticket(mkt(g, `/quotes/${id(quoteId)}/files`), meta, signal),
    invalidate: (g) => [['marketing', g, 'quotes']],
  }
}
