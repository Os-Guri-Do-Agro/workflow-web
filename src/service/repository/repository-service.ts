import api from '../api'

class repositoryService {
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
      api.get('/repository', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar repositórios',
    )
  }

  create(data: {
    companyId: string
    owner: string
    name: string
    defaultBranch?: string
    token?: string
    visibility?: 'TEAM' | 'RESTRICTED'
  }): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post('/repository', data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao criar repositório',
    )
  }

  update(
    id: string,
    data: Partial<{
      owner: string
      name: string
      defaultBranch: string
      token: string | null
      visibility: 'TEAM' | 'RESTRICTED'
    }>,
  ): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.patch(`/repository/${id}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao atualizar repositório',
    )
  }

  remove(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.delete(`/repository/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao remover repositório',
    )
  }

  listAccess(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/repository/${id}/access`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar acessos',
    )
  }

  grantAccess(
    id: string,
    data: { userId: string; level?: 'READ' | 'WRITE' | 'ADMIN' },
  ): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(`/repository/${id}/access`, data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao conceder acesso',
    )
  }

  revokeAccess(id: string, userId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.delete(`/repository/${id}/access/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao revogar acesso',
    )
  }

  // ─── GitHub proxy ─────────────────────────────────────────────────────

  listBranches(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/repository/${id}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar branches',
    )
  }

  listTree(id: string, branch?: string, path?: string): Promise<any> {
    const token = localStorage.getItem('token')
    const params = new URLSearchParams()
    if (branch) params.append('branch', branch)
    if (path) params.append('path', path)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.handleRequest(
      api.get(`/repository/${id}/tree${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar arquivos',
    )
  }

  getFile(id: string, path: string, branch?: string): Promise<any> {
    const token = localStorage.getItem('token')
    const params = new URLSearchParams({ path })
    if (branch) params.append('branch', branch)
    return this.handleRequest(
      api.get(`/repository/${id}/file?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao carregar arquivo',
    )
  }

  listPulls(id: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/repository/${id}/pulls?state=${state}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao listar pull requests',
    )
  }

  createPull(
    id: string,
    data: { title: string; body?: string; head: string; base?: string; draft?: boolean },
  ): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(`/repository/${id}/pulls`, data, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao criar pull request',
    )
  }

  getCloneInfo(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/repository/${id}/clone`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      'Erro ao buscar URLs de clone',
    )
  }
}

export default new repositoryService()
