/**
 * Rascunho da próxima versão de um card: a ORDEM do carrossel, a nota e o
 * pedido de "fechar a versão quando o envio terminar".
 *
 * Mora fora do `MarketingUploadVersionDialog` de propósito: fechar o diálogo
 * (ou sair do card) no meio do envio NÃO cancela nada. A fila segue subindo e,
 * se a pessoa pediu para fechar a versão, ela é criada aqui quando o último
 * arquivo fica pronto, com a mesma rota do botão (`createVersion`: mesma ordem,
 * mesma nota, e o card volta para Aguardando aprovação como sempre).
 *
 * Arquivo com erro segura o fechamento (a pessoa tenta de novo ou tira o
 * arquivo); arquivo cancelado sai da versão.
 */
import { computed, reactive } from 'vue'
import { getApiErrorMessage } from '@/service/api'
import { createVersion, type MarketingCardDetail } from '@/service/marketing/marketing-cards'
import { queryClient } from '@/service/query-client'
import { useToast } from '@/composables/useToast'
import { onSessionReset } from '@/service/session-hooks'
import { cardKeys } from '../approvals/approvals-meta'
import { useUploadQueue, type UploadItem } from './upload-queue'

export interface DraftAsset {
  id: string
  name: string
  size: number
  mimeType: string
  thumb: string | null
}

export interface VersionDraft {
  readonly key: string
  groupId: string
  cardId: string
  cardTitle: string
  /** Ordem do carrossel: `a:<assetId>` (arquivo solto pronto) ou `q:<itemId>` (na fila). */
  order: string[]
  note: string
  /** Post com legenda escrita: a versão vale mesmo sem arquivo. */
  hasCaption: boolean
  /** Fecha a versão sozinho quando todos terminarem. */
  scheduled: boolean
  state: 'idle' | 'waiting' | 'creating' | 'failed'
  error: string | null
  /** Status do card quando o fechamento foi pedido (para a frase "voltou para Aguardando"). */
  statusAtSchedule: string | null
  /** Assets que a fila acabou de confirmar (antes do card ser buscado de novo). */
  assets: Record<string, DraftAsset>
}

/** Versão criada sozinha: o diálogo aberto no card repassa ao `@done` da tela. */
type CreatedListener = (detail: MarketingCardDetail, draft: VersionDraft) => boolean | void

const drafts = reactive(new Map<string, VersionDraft>())
const createdListeners = new Set<CreatedListener>()
/** Versões fechadas sozinhas nesta sessão (a bandeja mostra "V3 fechada"). */
export const closedVersions = reactive<Array<{ id: string; groupId: string; cardId: string; text: string; at: number }>>([])

const keyOf = (groupId: string, cardId: string) => `${groupId}:${cardId}`
const targetKey = (cardId: string) => `card:${cardId}`

export function getDraft(groupId: string, cardId: string, cardTitle: string): VersionDraft {
  const key = keyOf(groupId, cardId)
  let d = drafts.get(key)
  if (!d) {
    drafts.set(key, {
      key,
      groupId,
      cardId,
      cardTitle,
      order: [],
      note: '',
      hasCaption: false,
      scheduled: false,
      state: 'idle',
      error: null,
      statusAtSchedule: null,
      assets: {},
    })
    d = drafts.get(key)!
  }
  d.cardTitle = cardTitle
  return d
}

/** Rascunhos com fechamento pedido (ou que falharam): a bandeja mostra uma linha para cada. */
export const scheduledDrafts = computed(() =>
  [...drafts.values()].filter((d) => d.scheduled || d.state === 'failed'),
)

/**
 * Concilia a ordem com o que existe: arquivos soltos do card (servidor) e itens
 * da fila deste card. Mantém a posição de quem já estava; o novo entra no fim.
 */
export function syncDraft(draft: VersionDraft, card: MarketingCardDetail) {
  const q = useUploadQueue()
  const inVersion = new Set(card.versions.flatMap((v) => v.assets.map((a) => a.id)))
  const staged = new Set(card.stagedAssets.map((a) => a.id))
  const live = q.items.value.filter((i) => i.target.key === targetKey(draft.cardId) && i.groupId === draft.groupId)
  const next: string[] = []
  const seen = new Set<string>()
  const push = (k: string) => {
    if (!seen.has(k)) {
      seen.add(k)
      next.push(k)
    }
  }
  for (const k of draft.order) {
    if (k.startsWith('a:')) {
      const id = k.slice(2)
      if (inVersion.has(id)) continue
      if (staged.has(id) || draft.assets[id]) push(k)
    } else {
      const item = q.find(k.slice(2))
      if (!item || item.status === 'canceled') continue
      if (item.status === 'done' && item.asset) {
        if (!inVersion.has(item.asset.id)) push(`a:${item.asset.id}`)
      } else push(k)
    }
  }
  for (const a of card.stagedAssets) if (!inVersion.has(a.id)) push(`a:${a.id}`)
  for (const item of live) {
    if (item.status === 'canceled') continue
    if (item.status === 'done' && item.asset) {
      if (!inVersion.has(item.asset.id) && staged.has(item.asset.id)) push(`a:${item.asset.id}`)
    } else push(`q:${item.id}`)
  }
  draft.order = next
}

export function scheduleVersion(draft: VersionDraft, opts: { hasCaption: boolean; status: string }) {
  draft.scheduled = true
  draft.hasCaption = opts.hasCaption
  draft.statusAtSchedule = opts.status
  draft.state = 'waiting'
  draft.error = null
  void tryFinalize(draft)
}

export function unscheduleVersion(draft: VersionDraft) {
  draft.scheduled = false
  draft.state = 'idle'
  draft.error = null
}

/** "Tentar de novo" da bandeja quando o fechamento falhou. */
export function retryVersion(draft: VersionDraft) {
  draft.scheduled = true
  draft.state = 'waiting'
  draft.error = null
  void tryFinalize(draft)
}

/** Versão fechada pelo botão: o rascunho recomeça vazio (nota e ordem). */
export function clearDraft(draft: VersionDraft) {
  drafts.delete(draft.key)
}

/** Tira o rascunho da bandeja (os arquivos soltos continuam no card). */
export function dropDraftNotice(draft: VersionDraft) {
  if (draft.state === 'failed') {
    draft.state = 'idle'
    draft.error = null
    draft.scheduled = false
  }
}

/** O diálogo aberto no card escuta: devolver `true` assume o aviso (sem toast duplicado). */
export function onVersionCreated(fn: CreatedListener): () => void {
  createdListeners.add(fn)
  return () => createdListeners.delete(fn)
}

/** Resumo do rascunho para a bandeja e o diálogo. */
export function draftProgress(draft: VersionDraft) {
  const q = useUploadQueue()
  let waiting = 0
  let errors = 0
  let ready = 0
  for (const k of draft.order) {
    if (k.startsWith('a:')) {
      ready++
      continue
    }
    const item = q.find(k.slice(2))
    if (!item || item.status === 'canceled') continue
    if (item.status === 'error') errors++
    else if (item.status === 'done') ready++
    else waiting++
  }
  return { waiting, errors, ready, total: waiting + errors + ready }
}

async function tryFinalize(draft: VersionDraft) {
  if (!draft.scheduled || draft.state === 'creating') return
  const q = useUploadQueue()
  const ids: string[] = []
  const { waiting, errors } = draftProgress(draft)
  if (waiting) {
    draft.state = 'waiting'
    draft.error = null
    return
  }
  if (errors) {
    draft.state = 'waiting'
    draft.error =
      errors === 1
        ? '1 arquivo com erro segura a versão: tente de novo ou tire o arquivo.'
        : `${errors} arquivos com erro seguram a versão: tente de novo ou tire os arquivos.`
    return
  }
  for (const k of draft.order) {
    if (k.startsWith('a:')) ids.push(k.slice(2))
    else {
      const item = q.find(k.slice(2))
      if (item?.status === 'done' && item.asset) ids.push(item.asset.id)
    }
  }
  const toast = useToast()
  if (!ids.length && !draft.hasCaption) {
    draft.scheduled = false
    draft.state = 'failed'
    draft.error = 'Nenhum arquivo subiu, então a versão não foi fechada.'
    toast.error(`${draft.error} (${draft.cardTitle})`)
    return
  }
  draft.state = 'creating'
  try {
    const detail = await createVersion(draft.groupId, draft.cardId, ids, draft.note.trim() || null)
    queryClient.setQueryData(cardKeys.detail(draft.groupId, draft.cardId), detail)
    void queryClient.invalidateQueries({ queryKey: ['marketing', draft.groupId, 'cards', 'list'] })
    void queryClient.invalidateQueries({ queryKey: cardKeys.history(draft.groupId, draft.cardId) })
    const v = detail.versions.find((x) => x.id === detail.currentVersionId)
    const back = detail.status === 'AWAITING_APPROVAL' && draft.statusAtSchedule !== 'AWAITING_APPROVAL'
    const text = `V${v?.number ?? ''} de "${draft.cardTitle}" fechada${back ? '. O card voltou para Aguardando aprovação.' : '.'}`
    closedVersions.unshift({ id: `${draft.key}:${Date.now()}`, groupId: draft.groupId, cardId: draft.cardId, text, at: Date.now() })
    if (closedVersions.length > 10) closedVersions.length = 10
    drafts.delete(draft.key)
    let handled = false
    for (const fn of createdListeners) if (fn(detail, draft) === true) handled = true
    if (!handled) toast.success(text)
  } catch (error) {
    draft.state = 'failed'
    draft.error = getApiErrorMessage(error, 'Não deu para fechar a versão.')
    toast.error(`${draft.cardTitle}: ${draft.error}`)
  }
}

// A fila avisa: o item pronto vira `a:<assetId>` na mesma posição; o
// cancelado sai; e cada mudança reavalia o fechamento.
useUploadQueue().subscribe(({ type, item }) => {
  if (item.target.kind !== 'card-version') return
  const draft = drafts.get(keyOf(item.groupId, item.target.key.slice('card:'.length)))
  if (!draft) return
  const qk = `q:${item.id}`
  const at = draft.order.indexOf(qk)
  if (type === 'done' && item.asset) {
    draft.assets[item.asset.id] = assetOf(item)
    if (at >= 0) draft.order.splice(at, 1, `a:${item.asset.id}`)
  } else if ((type === 'canceled' || type === 'removed') && at >= 0) {
    draft.order.splice(at, 1)
  }
  void tryFinalize(draft)
})

// Saiu da conta: rascunho e "V3 fechada" são da pessoa, não passam para a próxima.
onSessionReset(() => {
  drafts.clear()
  closedVersions.splice(0)
})

function assetOf(item: UploadItem): DraftAsset {
  return {
    id: item.asset!.id,
    name: item.name,
    size: item.size,
    mimeType: item.mimeType,
    thumb: item.thumbUrl,
  }
}
