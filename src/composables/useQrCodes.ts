import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import qrService, {
  type CreateQrInput,
  type QrCode,
  type QrMetrics,
  type UpdateQrInput,
} from '@/service/qr/qr-service'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

export const qrKeys = {
  all: ['qr'] as const,
  metrics: (id: string) => ['qr', 'metrics', id] as const,
}

/** Lista dos QR do usuário. */
export function useQrList() {
  return useQuery({
    queryKey: qrKeys.all,
    queryFn: () => qrService.list(),
    staleTime: 1000 * 15,
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qrKeys.all })

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
