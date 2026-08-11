import api from '../api'
// Import de TIPO apenas (apagado na compilação): dá contrato real aos métodos
// de documento sem acoplar o service à feature em runtime. O resto do arquivo
// ainda é `any` por herança; tipar tudo é limpeza de outra rodada.
import type { ActivityDoc, ActivityDocMeta } from '@/features/tasks/activity-types'

class activityService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  /**
   * `companyId` explícito é obrigatório em telas agregadas (o /board mostra
   * atividades de TODAS as empresas). Sem ele o interceptor cai na empresa ativa
   * do localStorage e a API responde 404 ao mover card de outra empresa.
   */
  patchActivityStatus(id: string, status: string, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.patch(
        `/activity/${id}/status`,
        { status },
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao atualizar atividade',
    )
  }

  /** Move o card no kanban persistindo status + ordem manual (position 0-based). */
  moveActivity(id: string, data: { status: string; position: number }): Promise<any> {
    return this.handleRequest(
      api.patch(`/activity/${id}/move`, data),
      'Erro ao mover atividade',
    )
  }

  postActivity(data: any): Promise<any> {
    return this.handleRequest(
      api.post('/activity', data),
      'Erro ao criar atividade',
    )
  }

  /** Localiza a atividade no workspace (empresa + mês) para resolver links antigos `/activity/:id`. */
  locateActivity(id: string): Promise<{ companyId: string; monthId: string; taskId: string }> {
    return this.handleRequest(
      api.get(`/activity/${id}/locate`),
      'Erro ao localizar atividade',
    )
  }

  /** `companyId` explícito: o painel do /board abre cards de QUALQUER empresa. */
  getActivityById(id: string, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.get(
        `/activity/${id}`,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao buscar atividade',
    )
  }

  /** Aceita patch parcial (`{ title }` sozinho, `{ dueDate: null }` para limpar). */
  patchActivity(id: string, data: any, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.patch(
        `/activity/${id}`,
        data,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao atualizar atividade',
    )
  }

  deleteActivity(id: string): Promise<any> {
    return this.handleRequest(
      api.delete(`/activity/${id}`),
      'Erro ao deletar atividade',
    )
  }

  /**
   * Upload de UM arquivo. Vários arquivos = várias chamadas em paralelo, feito
   * por quem chama: assim cada um tem progresso próprio e um arquivo recusado
   * (tamanho, extensão bloqueada) não derruba o lote.
   *
   * `onProgress` recebe 0..100. O servidor valida tamanho e extensão de novo:
   * a checagem do cliente é conveniência, não a regra.
   *
   * `asFile` só importa para `.md`: declara que o usuário escolheu deixar o
   * arquivo como anexo em vez de virar documento da tarefa. Sem essa
   * declaração o servidor recusa `.md`, de propósito — ver `upload-rules.ts`.
   */
  postActivityAttachment(
    id: string,
    data: FormData,
    options?: {
      companyId?: string
      onProgress?: (percent: number) => void
      asFile?: boolean
    },
  ): Promise<any> {
    if (options?.asFile) data.append('asFile', 'true')
    return this.handleRequest(
      api.post(`/activity/${id}/attachment`, data, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(options?.companyId ? { 'x-company-id': options.companyId } : {}),
        },
        onUploadProgress: (event) => {
          if (!options?.onProgress) return
          // `total` some quando o servidor não anuncia o tamanho; nesse caso
          // segurar em 99 é mais honesto que fingir uma porcentagem.
          const percent = event.total
            ? Math.round((event.loaded / event.total) * 100)
            : 99
          options.onProgress(Math.min(percent, 100))
        },
      }),
      'Erro ao fazer upload do anexo',
    )
  }

  deleteAttachment(attachmentId: string, companyId?: string): Promise<any> {
    return this.handleRequest(
      api.delete(
        `/activity/attachment/${attachmentId}`,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao deletar anexo',
    )
  }

  // ─── Documentos markdown ───────────────────────────────────────────────────
  //
  // O detalhe da atividade traz só os METADADOS dos documentos. O conteúdo vem
  // por aqui, um documento por vez, porque markdown de spec dentro de payload
  // de lista inviabiliza o board.

  getDoc(docId: string, companyId?: string): Promise<ActivityDoc> {
    return this.handleRequest(
      api.get(
        `/activity/doc/${docId}`,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao carregar documento',
    )
  }

  postDoc(
    activityId: string,
    data: { title: string; filename?: string; content?: string; isPrimary?: boolean },
    companyId?: string,
  ): Promise<ActivityDoc> {
    return this.handleRequest(
      api.post(
        `/activity/${activityId}/doc`,
        data,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao criar documento',
    )
  }

  patchDoc(
    docId: string,
    data: { title?: string; filename?: string; content?: string; isPrimary?: boolean },
    companyId?: string,
  ): Promise<ActivityDoc> {
    return this.handleRequest(
      api.patch(
        `/activity/doc/${docId}`,
        data,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao salvar documento',
    )
  }

  reorderDocs(
    activityId: string,
    docIds: string[],
    companyId?: string,
  ): Promise<ActivityDocMeta[]> {
    return this.handleRequest(
      api.patch(
        `/activity/${activityId}/doc/reorder`,
        { docIds },
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao reordenar documentos',
    )
  }

  deleteDoc(docId: string, companyId?: string): Promise<{ message: string }> {
    return this.handleRequest(
      api.delete(
        `/activity/doc/${docId}`,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao remover documento',
    )
  }

  postSuggest(id: string): Promise<any> {
    return this.handleRequest(
      api.post(`/activity/${id}/suggest`, {}),
      'Erro ao sugerir atividade',
    )
  }
}

export default new activityService()
