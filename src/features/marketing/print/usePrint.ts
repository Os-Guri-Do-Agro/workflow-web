import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  createPrintCard,
  listPrintCards,
  openPrepress,
  setPrepressDone,
  setPrintStatus,
  updatePrintSpecs,
  type PrintCard,
  type PrintSpecsPatch,
  type PrintTrailStatus,
  type PrepressState,
} from '@/service/marketing/marketing-print'
import type { CardStatus } from '../marketing-labels'

/** Chaves SEMPRE `['marketing', groupId, 'print', ...]` (o socket invalida o grupo). */
export const printKeys = {
  all: (g: string) => ['marketing', g, 'print'] as const,
  list: (g: string, companyId: string | null) => ['marketing', g, 'print', 'list', companyId ?? 'all'] as const,
}

/** Trilha da peça impressa, na ordem (a aprovação é do card; da "Aprovado" em diante é a Gráfica). */
export const PRINT_TRAIL: CardStatus[] = [
  'IN_PRODUCTION',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SENT_TO_PRINTER',
  'PROOF_RECEIVED',
  'DELIVERED',
]

export interface PrintAction {
  to: PrintTrailStatus
  label: string
  primary?: boolean
}

/** Botões da trilha para o status atual (o servidor ainda confere tudo). */
export function printActions(status: CardStatus): PrintAction[] {
  if (status === 'APPROVED') return [{ to: 'SENT_TO_PRINTER', label: 'Enviar para a gráfica', primary: true }]
  if (status === 'SENT_TO_PRINTER') {
    return [
      { to: 'PROOF_RECEIVED', label: 'Prova recebida', primary: true },
      { to: 'APPROVED', label: 'Voltar para aprovado' },
    ]
  }
  if (status === 'PROOF_RECEIVED') {
    return [
      { to: 'DELIVERED', label: 'Marcar como entregue', primary: true },
      { to: 'SENT_TO_PRINTER', label: 'Voltar para enviado' },
    ]
  }
  return []
}

export function usePrintCards(groupId: MaybeRefOrGetter<string | null>, companyId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => printKeys.list(toValue(groupId) ?? '-', toValue(companyId))),
    queryFn: () => listPrintCards(toValue(groupId)!, toValue(companyId) ? { companyId: toValue(companyId)! } : {}),
    enabled: computed(() => hasSession.value && !!toValue(groupId)),
    staleTime: 15_000,
  })
}

export function usePrintMutations(groupId: MaybeRefOrGetter<string | null>) {
  const qc = useQueryClient()
  const g = () => toValue(groupId)!
  const refresh = () => qc.invalidateQueries({ queryKey: printKeys.all(g()) })
  /** Troca só o checklist da peça no cache (marcar item não refaz a lista inteira). */
  const patchPrepress = (cardId: string, prepress: PrepressState) => {
    qc.setQueriesData<PrintCard[]>({ queryKey: [...printKeys.all(g()), 'list'] }, (old) =>
      old?.map((c) => (c.id === cardId ? { ...c, prepress } : c)),
    )
  }
  return {
    create: useMutation({
      mutationFn: (v: { companyId: string; title: string }) => createPrintCard(g(), v),
      onSuccess: refresh,
    }),
    specs: useMutation({
      mutationFn: (v: { id: string; specs: PrintSpecsPatch }) => updatePrintSpecs(g(), v.id, v.specs),
      onSuccess: refresh,
    }),
    openPrepress: useMutation({
      mutationFn: (id: string) => openPrepress(g(), id).then((p) => ({ id, p })),
      onSuccess: ({ id, p }) => patchPrepress(id, p),
    }),
    toggle: useMutation({
      mutationFn: (v: { id: string; itemId: string; done: boolean }) =>
        setPrepressDone(g(), v.id, v.itemId, v.done).then((p) => ({ id: v.id, p })),
      onSuccess: ({ id, p }) => patchPrepress(id, p),
    }),
    status: useMutation({
      mutationFn: (v: { id: string; to: PrintTrailStatus; force?: boolean }) =>
        setPrintStatus(g(), v.id, v.to, v.force),
      onSuccess: refresh,
    }),
  }
}
