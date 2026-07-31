import api from '../api'

class authService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  postLogin(data: any): Promise<any> {
    return this.handleRequest(api.post('/auth/login', data), 'Erro ao fazer login')
  }
}

export default new authService()
