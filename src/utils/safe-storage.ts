/**
 * `localStorage` que não derruba a aplicação.
 *
 * Acessar `localStorage` **lança** em situações comuns e fora do nosso
 * controle: Firefox com proteção contra rastreamento rígida, Opera e Brave com
 * bloqueio de armazenamento para o site, janela privada, política corporativa
 * de cookies, e iframes de terceiros. Não é o `getItem` que falha — é o próprio
 * acesso à propriedade `window.localStorage`, com `SecurityError`.
 *
 * Isso importa muito mais do que parece: o interceptor de request do axios lê o
 * token do storage. Se ele lançar ali, **toda chamada de API morre antes de
 * sair**, e a tela que depende de dados fica permanentemente inacessível — só
 * para as pessoas com aquela configuração de privacidade, o que faz o problema
 * parecer "coisa de um navegador".
 *
 * Aqui a leitura vira `null` e a escrita vira no-op, que é a degradação certa:
 * a sessão não persiste entre recarregamentos, mas o produto funciona.
 */

/** Espelho em memória, para a sessão continuar coerente dentro da aba. */
const memoria = new Map<string, string>()

let avisado = false

function indisponivel(erro: unknown): void {
  if (avisado) return
  avisado = true
  // Uma linha só, e em nível de aviso: não é erro da aplicação, é ambiente.
  console.warn(
    '[nevo] Armazenamento local indisponível neste navegador; a sessão vale só nesta aba.',
    erro,
  )
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch (erro) {
      indisponivel(erro)
      return memoria.get(key) ?? null
    }
  },

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch (erro) {
      // Cota estourada também cai aqui, e também não deve derrubar nada.
      indisponivel(erro)
      memoria.set(key, value)
    }
  },

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key)
    } catch (erro) {
      indisponivel(erro)
      memoria.delete(key)
    }
  },
}

/** Mesma proteção para o `sessionStorage`. */
export const safeSessionStorage = {
  getItem(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key)
    } catch (erro) {
      indisponivel(erro)
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value)
    } catch (erro) {
      indisponivel(erro)
    }
  },
}
