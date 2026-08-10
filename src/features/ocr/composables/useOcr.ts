import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, unref, type MaybeRef } from 'vue'
import ocrService, { type OcrField } from '@/service/ocr/ocr-service'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

const keys = {
  template: (companyId: string) => ['ocr', 'template', companyId] as const,
  documents: (companyId: string) => ['ocr', 'documents', companyId] as const,
  webhook: (companyId: string) => ['ocr', 'webhook', companyId] as const,
  consumo: (companyId: string) => ['ocr', 'consumo', companyId] as const,
}

/** Template da empresa ativa (null = ainda não configurado). */
export function useOcrTemplate(companyId: MaybeRef<string | null>) {
  return useQuery({
    queryKey: computed(() => keys.template(unref(companyId) ?? '')),
    queryFn: () => ocrService.getTemplate(unref(companyId) as string),
    enabled: computed(() => !!unref(companyId)),
    staleTime: 30_000,
  })
}

/** Acervo: documentos lidos da empresa ativa. */
export function useOcrDocuments(companyId: MaybeRef<string | null>) {
  return useQuery({
    queryKey: computed(() => keys.documents(unref(companyId) ?? '')),
    queryFn: () => ocrService.listDocuments(unref(companyId) as string),
    enabled: computed(() => !!unref(companyId)),
    staleTime: 15_000,
  })
}

/**
 * Consumo do mês. É o que responde "quanto custou" sem abrir o banco: a
 * cobrança do OCR é repasse, então o número precisa estar na tela.
 */
export function useOcrConsumo(companyId: MaybeRef<string | null>) {
  return useQuery({
    queryKey: computed(() => keys.consumo(unref(companyId) ?? '')),
    queryFn: () => ocrService.consumo(unref(companyId) as string),
    enabled: computed(() => !!unref(companyId)),
    staleTime: 60_000,
  })
}

export function useOcrWebhook(
  companyId: MaybeRef<string | null>,
  isAdmin: MaybeRef<boolean>,
) {
  return useQuery({
    queryKey: computed(() => keys.webhook(unref(companyId) ?? '')),
    queryFn: () => ocrService.getWebhook(unref(companyId) as string),
    // O endpoint é ADMIN-only; sem o gate a query de um WORKER viraria 403 no console.
    enabled: computed(() => !!unref(companyId) && !!unref(isAdmin)),
    staleTime: 30_000,
  })
}

export function useOcrMutations(companyId: MaybeRef<string | null>) {
  const queryClient = useQueryClient()
  const { success, error: showError } = useToast()
  const cid = () => unref(companyId) as string

  const uploadTemplate = useMutation({
    mutationFn: (file: File) => ocrService.uploadTemplate(cid(), file),
    onSuccess: () => {
      success('Modelo absorvido. Revise os campos antes de liberar ao integrador.')
      void queryClient.invalidateQueries({ queryKey: keys.template(cid()) })
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível processar o modelo')),
  })

  const updateFields = useMutation({
    mutationFn: (fields: OcrField[]) => ocrService.updateFields(cid(), fields),
    onSuccess: () => {
      success('Campos do template salvos')
      void queryClient.invalidateQueries({ queryKey: keys.template(cid()) })
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível salvar os campos')),
  })

  const readTest = useMutation({
    mutationFn: (file: File) => ocrService.readTest(cid(), file),
    onSuccess: () => {
      // O teste passa pelo caminho REAL: entra no acervo e na cobrança.
      void queryClient.invalidateQueries({ queryKey: keys.documents(cid()) })
      void queryClient.invalidateQueries({ queryKey: keys.consumo(cid()) })
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível ler o documento')),
  })

  const setWebhook = useMutation({
    mutationFn: (url: string) => ocrService.setWebhook(cid(), url),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.webhook(cid()) })
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível salvar o webhook')),
  })

  const deleteWebhook = useMutation({
    mutationFn: () => ocrService.deleteWebhook(cid()),
    onSuccess: () => {
      success('Webhook removido')
      void queryClient.invalidateQueries({ queryKey: keys.webhook(cid()) })
    },
    onError: (err) =>
      showError(getApiErrorMessage(err, 'Não foi possível remover o webhook')),
  })

  return { uploadTemplate, updateFields, readTest, setWebhook, deleteWebhook }
}

export { ocrService }
