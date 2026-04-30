import api from '../api'

class bugReportService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  getPublicCompany(companyId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/bug-report/public/company/${companyId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar empresa pública',
    )
  }

  uploadBugReport(formData: FormData, onProgress?: (p: number) => void): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post('/bug-report/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (e) => {
          if (e.total && onProgress) {
            onProgress(Math.round((e.loaded * 100) / e.total))
          }
        },
      }),
      'Erro ao enviar bug report',
    )
  }

  getStatus(reportId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/bug-report/${reportId}/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar status do bug report',
    )
  }

  listByCompany(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/bug-report/by-company', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao listar bug reports',
    )
  }

  listMessages(reportId: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get(`/bug-report/${reportId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao listar mensagens',
    )
  }

  postMessage(reportId: string, content: string): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.post(
        `/bug-report/${reportId}/message`,
        { content },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      ),
      'Erro ao enviar mensagem',
    )
  }
}

export default new bugReportService()
