import api from '../api'

/**
 * Cliente da superfície INTERNA do OCR Digital (`/ocr`, JWT).
 * A superfície do integrador (`/api/v1/ocr`, token wfqr_) não é chamada daqui —
 * ela é consumida pelos sistemas das empresas; as docs vivem em `/ocr-docs`.
 */

/** Campo do template, revisável pelo ADMIN. */
export interface OcrField {
  key: string
  label: string
  type: 'string' | 'number' | 'date'
  description: string
}

export interface OcrTemplate {
  id: string
  companyId: string
  fileName: string
  fields: OcrField[]
  version: number
  updatedAt: string
}

export interface OcrDocumentRow {
  id: string
  fileName: string
  templateVersion: number
  signatureValid: boolean
  signatureType: 'ICP-Brasil' | 'gov.br' | null
  signedBy: string | null
  dados: Record<string, unknown>
  model: string
  tokensIn: number
  tokensOut: number
  ms: number
  webhookStatus: 'NONE' | 'SENT' | 'FAILED'
  createdAt: string
}

export interface OcrWebhookInfo {
  id: string
  url: string
  active: boolean
  updatedAt?: string
}

/** Resposta da leitura (mesmo shape do endpoint do integrador). */
export interface OcrReadResult {
  documentoLido: boolean
  assinatura: {
    valida: boolean
    tipo: 'ICP-Brasil' | 'gov.br' | null
    assinadoPor: string | null
    assinadoEm: string | null
    totalAssinaturas: number
    revogacaoVerificada: boolean
    carimboTempo?: {
      presente: boolean
      verificado: boolean
      data: string | null
    } | null
    detalhes: Array<{
      valida: boolean
      tipo: string | null
      assinadoPor: string | null
      revogacao?: 'ok' | 'revogado' | 'nao_verificada'
      motivo: string | null
    }>
  }
  dados: Record<string, unknown>
  documentoId: string
}

const ocrService = {
  async getTemplate(companyId: string) {
    const r = await api.get<OcrTemplate | null>('/ocr/template', {
      params: { companyId },
    })
    return r.data
  },

  /** Upload do documento-modelo: o backend deriva os campos com o Claude. */
  async uploadTemplate(companyId: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    const r = await api.post<OcrTemplate>('/ocr/template', form, {
      params: { companyId },
      // Derivação passa pelo modelo: mais lenta que um upload comum.
      timeout: 120_000,
    })
    return r.data
  },

  async updateFields(companyId: string, fields: OcrField[]) {
    const r = await api.patch<OcrTemplate>(
      '/ocr/template/fields',
      { fields },
      { params: { companyId } },
    )
    return r.data
  },

  async listDocuments(companyId: string) {
    const r = await api.get<OcrDocumentRow[]>('/ocr/documents', {
      params: { companyId },
    })
    return r.data
  },

  /** URL assinada de curta duração do PDF original no acervo. */
  async documentUrl(companyId: string, documentId: string) {
    const r = await api.get<{ url: string }>(`/ocr/documents/${documentId}/url`, {
      params: { companyId },
    })
    return r.data.url
  },

  async readTest(companyId: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    const r = await api.post<OcrReadResult>('/ocr/read-test', form, {
      params: { companyId },
      timeout: 120_000,
    })
    return r.data
  },

  async getWebhook(companyId: string) {
    const r = await api.get<OcrWebhookInfo | null>('/ocr/webhook', {
      params: { companyId },
    })
    return r.data
  },

  /** O `secret` retornado só existe AQUI, uma vez — igual ao token do QR. */
  async setWebhook(companyId: string, url: string) {
    const r = await api.put<OcrWebhookInfo & { secret: string }>(
      '/ocr/webhook',
      { url },
      { params: { companyId } },
    )
    return r.data
  },

  async deleteWebhook(companyId: string) {
    await api.delete('/ocr/webhook', { params: { companyId } })
  },
}

export default ocrService
