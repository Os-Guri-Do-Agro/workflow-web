/**
 * Integrações de deploy (spec workflow-api webhook-deploy-amplify-railway).
 *
 * Configuração da empresa ativa (`x-company-id` do interceptor). Só ADMIN:
 * WORKER recebe 403. Com a migration ainda não aplicada, a listagem volta `[]`
 * e as escritas voltam 503 com a mensagem em português, que a tela mostra.
 *
 * O token de entrada aparece UMA vez, na criação e na rotação: o servidor só
 * guarda o hash.
 */
import api from '../api'

export type DeployProvider = 'AMPLIFY' | 'RAILWAY'
export type DeployStatus = 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
export type DeliveryOutcome = 'ACCEPTED' | 'IGNORED' | 'REJECTED' | 'TEST'

export interface DeploySource {
  id: string
  label?: string
}

export interface DeployIntegrationView {
  id: string
  companyId: string
  provider: DeployProvider
  name: string
  enabled: boolean
  tokenPrefix: string
  allowedSources: DeploySource[]
  notifyUserIds: string[]
  notifyOnStarted: boolean
  notifyDiscord: boolean
  ingestUrl: string
  lastEventAt: string | null
  tokenRotatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DeployDeliveryView {
  id: string
  receivedAt: string
  outcome: DeliveryOutcome
  httpStatus: number
  reason: string | null
  status: DeployStatus | null
  rawStatus: string | null
  sourceId: string | null
  sourceLabel: string | null
  branch: string | null
  jobId: string | null
  duplicateCount: number
  lastDuplicateAt: string | null
  dispatchError: string | null
}

export interface DeployIntegrationSecret {
  integration: DeployIntegrationView
  token: string
  ingestUrl: string
  header: string
}

export interface CreateDeployIntegrationInput {
  provider: DeployProvider
  name: string
  allowedSources?: DeploySource[]
  notifyUserIds?: string[]
  notifyOnStarted?: boolean
  notifyDiscord?: boolean
}

export type UpdateDeployIntegrationInput = Partial<Omit<CreateDeployIntegrationInput, 'provider'>> & {
  enabled?: boolean
}

const deployIntegrationsService = {
  async list(): Promise<DeployIntegrationView[]> {
    const { data } = await api.get<DeployIntegrationView[]>('/deploy-integrations')
    return Array.isArray(data) ? data : []
  },

  async create(input: CreateDeployIntegrationInput): Promise<DeployIntegrationSecret> {
    const { data } = await api.post<DeployIntegrationSecret>('/deploy-integrations', input)
    return data
  },

  async update(id: string, input: UpdateDeployIntegrationInput): Promise<DeployIntegrationView> {
    const { data } = await api.patch<DeployIntegrationView>(`/deploy-integrations/${id}`, input)
    return data
  },

  async rotateToken(id: string): Promise<DeployIntegrationSecret> {
    const { data } = await api.post<DeployIntegrationSecret>(`/deploy-integrations/${id}/rotate-token`)
    return data
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/deploy-integrations/${id}`)
  },

  async deliveries(id: string, take = 50): Promise<DeployDeliveryView[]> {
    const { data } = await api.get<DeployDeliveryView[]>(`/deploy-integrations/${id}/deliveries`, {
      params: { take },
    })
    return Array.isArray(data) ? data : []
  },

  async test(id: string, status: Exclude<DeployStatus, 'CANCELLED'> = 'FAILED'): Promise<{ ok: true; delivery: DeployDeliveryView }> {
    const { data } = await api.post<{ ok: true; delivery: DeployDeliveryView }>(`/deploy-integrations/${id}/test`, { status })
    return data
  },
}

export default deployIntegrationsService
