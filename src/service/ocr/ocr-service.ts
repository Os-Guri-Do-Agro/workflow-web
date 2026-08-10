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

/** Por onde a leitura passou. `text` é o caminho barato; `vision` lê a página. */
export type OcrMode = 'text' | 'vision' | 'hybrid'

/** De onde veio cada campo preenchido. */
export type OcrFonte = 'documento' | 'receita' | 'nr4'

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
  mode: OcrMode
  visionReason: string | null
  pages: number | null
  pagesAnalyzed: number[]
  retrieval: boolean
  cacheHit: boolean
  attempts: number
  /** `null` quando o modelo usado não tem preço conhecido. */
  costUsd: number | null
  enrichment: 'ok' | 'falhou' | 'desligado' | 'nao_aplicavel'
}

/** Consumo agregado do mês, para conferir a fatura. */
export interface OcrConsumo {
  mes: string
  documentos: number
  documentosCobrados: number
  documentosDeCache: number
  tokensIn: number
  tokensOut: number
  custoUsd: number
  custoMedioUsd: number
  porModo: Partial<Record<OcrMode, number>>
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
  /** Blocos da v1: aditivos, ausentes em leituras antigas. */
  extracao?: {
    modo: OcrMode
    modelo: string
    paginas: number | null
    paginasAnalisadas: number[]
    retrieval: boolean
    cacheHit: boolean
    tentativas: number
    tokensIn: number
    tokensOut: number
    custoUsd: number | null
    enriquecimento: 'ok' | 'falhou' | 'desligado' | 'nao_aplicavel'
    ms: number
  }
  /** Mapa campo → de onde o valor veio. */
  procedencia?: Record<string, OcrFonte>
  /** Campos-alvo que ficaram vazios (ausentes no documento, não erro). */
  camposAusentes?: string[]
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
      // O axios do app força JSON global; sem esta sobrescrita o FormData sai
      // como application/json e o multer nunca vê o arquivo (mesmo padrão do
      // upload de bug-report). Derivação passa pelo modelo: timeout maior.
      headers: { 'Content-Type': 'multipart/form-data' },
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
  /** @param mes formato YYYY-MM; omitido = mês corrente. */
  async consumo(companyId: string, mes?: string) {
    const r = await api.get<OcrConsumo>('/ocr/consumo', {
      params: { companyId, ...(mes ? { mes } : {}) },
    })
    return r.data
  },

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
      headers: { 'Content-Type': 'multipart/form-data' },
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
