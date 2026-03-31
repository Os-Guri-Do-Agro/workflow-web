import api from '../../api'

class companyVariableService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  postCompanyVariable(data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.post(`/company-variable`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao criar variável',
    )
  }

  getCompanyVariables(): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.get(`/company-variable`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao buscar variáveis',
    )
  }

  patchCompanyVariable(id: string, data: any): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.patch(`/company-variable/${id}`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao atualizar variável',
    )
  }

  deleteCompanyVariable(id: string): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    return this.handleRequest(
      api.delete(`/company-variable/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
        },
      }),
      'Erro ao deletar variável',
    )
  }

  uploadVariableImage(id: string, file: File): Promise<any> {
    const token = localStorage.getItem('token')
    const companyId = localStorage.getItem('activeCompany')
    const formData = new FormData()
    formData.append('file', file)
    return this.handleRequest(
      api.post(`/company-variable/${id}/image`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-company-id': companyId,
          'Content-Type': 'multipart/form-data',
        },
      }),
      'Erro ao fazer upload da imagem',
    )
  }
}

export default new companyVariableService()
