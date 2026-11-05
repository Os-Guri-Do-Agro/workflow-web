import api, { publicApi } from '../api'

/** Resposta de `POST /auth/reset-password`. */
export interface ResetPasswordResult {
  message: string
  email: string
}

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

  /**
   * Pede o link de senha nova. A API responde SEMPRE a mesma mensagem, exista
   * a conta ou não. Vai pelo `publicApi`: rota sem sessão, e um 401 aqui não
   * pode derrubar a sessão de ninguém.
   */
  forgotPassword(email: string): Promise<{ message: string }> {
    return this.handleRequest(
      publicApi.post('/auth/forgot-password', { email }),
      'Erro ao pedir link de senha',
    )
  }

  /** Define a senha pelo link (`?token=` da rota `/redefinir-senha`). */
  resetPassword(token: string, password: string): Promise<ResetPasswordResult> {
    return this.handleRequest(
      publicApi.post('/auth/reset-password', { token, password }),
      'Erro ao definir a senha',
    )
  }
}

export default new authService()
