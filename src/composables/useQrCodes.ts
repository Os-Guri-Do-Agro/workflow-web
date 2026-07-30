import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import qrService, {
  type CreateQrInput,
  type QrCode,
  type QrListParams,
  type QrMetrics,
  type UpdateQrInput,
} from '@/service/qr/qr-service'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export const qrKeys = {
  all: ['qr'] as const,
  metrics: (id: string) => ['qr', 'metrics', id] as const,
}

/**
 * Página da listagem de QR.
 *
 * A chave carrega os filtros, então cada combinação tem cache próprio. As
 * mutations continuam invalidando `['qr']` puro: o TanStack casa por PREFIXO,
 * então uma chave só derruba todas as páginas e nenhuma delas fica mostrando
 * dado velho depois de criar ou excluir.
 *
 * `placeholderData` mantém a página anterior na tela enquanto a próxima chega.
 * Sem isso a grade sumia a cada clique de paginação e a tela piscava, que é
 * exatamente a sensação de lentidão que esta entrega existe para tirar.
 */
export function useQrList(params: MaybeRef<QrListParams>) {
  return useQuery({
    queryKey: computed(() => [...qrKeys.all, 'list', unref(params)] as const),
    queryFn: () => qrService.list(unref(params)),
    staleTime: 1000 * 15,
    placeholderData: (anterior) => anterior,
  })
}

/** Métricas de um QR (contagem + série por dia + scans recentes). */
export function useQrMetrics(id: MaybeRef<string | null>) {
  return useQuery<QrMetrics>({
    queryKey: computed(() => qrKeys.metrics(unref(id) ?? '')),
    queryFn: () => qrService.metrics(unref(id) as string),
    enabled: computed(() => !!unref(id)),
    staleTime: 1000 * 15,
  })
}

/** Mutations de gestão do QR — todas invalidam ['qr'] e dão toast. */
export function useQrMutations() {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()

  // Invalida a lista de QR E a de pastas: criar/mover/excluir QR muda o qrCount
  // das pastas (badge). Sem isso o contador da pasta fica defasado até o staleTime.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qrKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['qr-folders'] })
  }

  const create = useMutation({
    mutationFn: (input: CreateQrInput) => qrService.create(input),
    onSuccess: () => {
      success('QR criado')
      void invalidate()
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Não foi possível criar o QR')),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQrInput }) =>
      qrService.update(id, data),
    onSuccess: (qr: QrCode) => {
      success('QR atualizado')
      void invalidate()
      void queryClient.invalidateQueries({ queryKey: qrKeys.metrics(qr.id) })
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Não foi possível salvar o QR')),
  })

  const cancel = useMutation({
    mutationFn: (id: string) => qrService.cancel(id),
    onSuccess: () => {
      success('QR cancelado')
      void invalidate()
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Não foi possível cancelar o QR')),
  })

  const remove = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      qrService.remove(id, password),
    onSuccess: () => {
      success('QR excluído')
      void invalidate()
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Não foi possível excluir o QR')),
  })

  return { create, update, cancel, remove }
}
