import api from '../api'

class githubConnectionService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  list(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/github-connection', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar conexões',
    )
  }

  create(data: { ownerLogin: string; token: string }): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post('/github-connection', data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao criar conexão',
    )
  }

  remove(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.delete(`/github-connection/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao remover conexão',
    )
  }

  listAvailable(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/github-connection/${id}/available-repos`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar repos disponíveis',
    )
  }

  syncAll(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(
        `/github-connection/${id}/sync-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      'Erro ao sincronizar repositórios',
    )
  }
}

export default new githubConnectionService()
