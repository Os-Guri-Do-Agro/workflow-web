import api from '../api'
import type { ActivityTag } from '@/features/tasks/activity-types'

/** Tag do catálogo com a contagem de uso, que ordena o autocomplete. */
export interface TagWithUsage extends ActivityTag {
  usageCount: number
}

/**
 * Catálogo de tags da empresa.
 *
 * **Não existe método de exclusão, e isso é a regra, não uma lacuna.** A tag da
 * empresa é permanente: tirar a tag de uma tarefa é `PATCH /activity/:id` com
 * `tagIds` sem ela. A API também não expõe rota de delete.
 */
class TagService {
  private async handleRequest<T>(
    request: Promise<{ data: T }>,
    errorMessage: string,
  ): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  /**
   * Busca no SERVIDOR, não no cliente. Como tag nunca é excluída, o catálogo só
   * cresce: filtrar um array carregado inteiro deixaria de escalar rápido, e a
   * ordenação por uso precisa da contagem que só o banco tem.
   */
  list(params?: { q?: string; limit?: number; companyId?: string }): Promise<TagWithUsage[]> {
    return this.handleRequest(
      api.get('/tag', {
        params: {
          ...(params?.q ? { q: params.q } : {}),
          ...(params?.limit ? { limit: params.limit } : {}),
        },
        ...(params?.companyId
          ? { headers: { 'x-company-id': params.companyId } }
          : {}),
      }),
      'Erro ao carregar tags',
    )
  }

  /**
   * Cria a tag, ou devolve a existente com o mesmo nome normalizado.
   *
   * Idempotente: o fluxo é "digitou e apertou Enter", sem o usuário saber se a
   * tag já existia. Chamar duas vezes com "Bug" e "bug " devolve a mesma tag.
   */
  create(
    name: string,
    options?: { color?: string; companyId?: string },
  ): Promise<TagWithUsage> {
    return this.handleRequest(
      api.post(
        '/tag',
        { name, ...(options?.color ? { color: options.color } : {}) },
        options?.companyId
          ? { headers: { 'x-company-id': options.companyId } }
          : undefined,
      ),
      'Erro ao criar tag',
    )
  }

  /** Renomear vale para todas as tarefas que usam a tag. 409 se o nome colidir. */
  update(
    id: string,
    data: { name?: string; color?: string },
    companyId?: string,
  ): Promise<TagWithUsage> {
    return this.handleRequest(
      api.patch(
        `/tag/${id}`,
        data,
        companyId ? { headers: { 'x-company-id': companyId } } : undefined,
      ),
      'Erro ao atualizar tag',
    )
  }
}

export default new TagService()
