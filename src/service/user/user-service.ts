import api from '../api'

class userService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error: any) {
      console.error(`${errorMessage}: ${error.message}`, error)
      throw error
    }
  }

  postUser(userData: any): Promise<any> {
    return this.handleRequest(api.post('/user', userData), 'Erro ao criar usuário')
  }

  getAllUsers(): Promise<any> {
    const token = localStorage.getItem('token')
    return this.handleRequest(
      api.get('/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      'Erro ao buscar usuários',
    )
  }
}

export default new userService()
