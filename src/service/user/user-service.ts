import api from '../api'

export type CompanyRole = 'ADMIN' | 'WORKER' | 'CLIENT' | 'VIEWER'

/**
 * Foto de perfil da pessoa. Dois formatos válidos:
 * - URL absoluta `https://...` (bucket público; é o normal, inclusive para as
 *   quatro fotos iniciais depois que a API as leva para lá);
 * - caminho relativo `/avatars/<nome>.webp` (foto inicial que a API ainda não
 *   levou para o bucket, servida pelo próprio front até lá).
 * `null` = sem foto (ou a migration ainda não foi aplicada): a UI mostra as
 * iniciais. Quem desenha é sempre o `PersonAvatar`.
 */
export type AvatarUrl = string | null

/** Pessoa como `GET /user` (quem divide alguma empresa comigo) a devolve. */
export interface VisibleUser {
  id: string
  name: string
  email: string
  avatarUrl?: AvatarUrl
  createdAt?: string
  discordUserId?: string | null
  discordUsername?: string | null
}

/** Resultado de `GET /user/search` (autocomplete de @menção, empresa ativa). */
export interface UserSearchResult {
  id: string
  name: string
  email: string
  avatarUrl?: AvatarUrl
}

export interface MeCompanyLink {
  companyId: string
  role: CompanyRole
  company?: { id: string; name: string; cnpj?: string | null }
  [key: string]: unknown
}

/** `GET /user/me`: o perfil de quem está logado, com as empresas. */
export interface MeProfile {
  id: string
  name: string
  email: string
  avatarUrl?: AvatarUrl
  createdAt?: string
  companies: MeCompanyLink[]
}

/** Resposta de `POST /user/me/avatar` e `DELETE /user/me/avatar`. */
export interface AvatarResponse {
  avatarUrl: AvatarUrl
}

/** Limites do upload, espelhados do servidor (que é quem manda). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Corpo de `POST /user` (criação pelo ADMIN; o servidor ignora o que não conhece). */
export interface CreateUserInput {
  name: string
  email: string
  password: string
  role?: string
}

class userService {
  private async handleRequest<T>(request: Promise<{ data: T }>, errorMessage: string): Promise<T> {
    try {
      const { data } = await request
      return data
    } catch (error) {
      console.error(`${errorMessage}: ${error instanceof Error ? error.message : String(error)}`, error)
      throw error
    }
  }

  postUser(userData: CreateUserInput): Promise<VisibleUser> {
    return this.handleRequest(api.post<VisibleUser>('/user', userData), 'Erro ao criar usuário')
  }

  /** Quem divide alguma empresa comigo (não depende da empresa ativa). */
  getAllUsers(): Promise<VisibleUser[]> {
    return this.handleRequest(api.get<VisibleUser[]>('/user'), 'Erro ao buscar usuários')
  }

  /** Busca usuários da empresa ativa por nome/email (autocomplete de @menção). */
  searchUsers(q: string): Promise<UserSearchResult[]> {
    return this.handleRequest(
      api.get<UserSearchResult[]>('/user/search', { params: { q } }),
      'Erro ao buscar usuários',
    )
  }

  getInfoAuth(): Promise<MeProfile> {
    return this.handleRequest(api.get<MeProfile>('/user/me'), 'Erro ao buscar minhas informações')
  }

  /**
   * Troca a foto de quem está logado. Multipart com o campo `file` (jpg, png ou
   * webp até 5 MB); o servidor corta em quadrado de 512 px e converte para WebP.
   *
   * Sem o banco preparado (migration pendente) a API responde 503 com a
   * mensagem pronta em PT-BR: quem chama mostra `getApiErrorMessage(error)`.
   */
  async uploadAvatar(file: File): Promise<AvatarResponse> {
    const form = new FormData()
    form.append('file', file)
    const response = await api.post<AvatarResponse>('/user/me/avatar', form, {
      // O axios do app força JSON global; sem esta sobrescrita o FormData sai
      // serializado como JSON e o servidor não acha o arquivo.
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  /** Remove a foto: a pessoa volta a aparecer com as iniciais. */
  async removeAvatar(): Promise<AvatarResponse> {
    const response = await api.delete<AvatarResponse>('/user/me/avatar')
    return response.data
  }
}

export default new userService()
