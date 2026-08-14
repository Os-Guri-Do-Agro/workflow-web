/**
 * Torna `localStorage`/`sessionStorage` sempre utilizáveis.
 *
 * **Este módulo precisa ser o PRIMEIRO import do `main.ts`.** Módulos ES são
 * executados na ordem em que aparecem, e vários módulos do app leem storage no
 * corpo (stores, router, serviços) — o shim tem que estar de pé antes deles.
 *
 * ## O problema que ele resolve
 *
 * Acessar `window.localStorage` **lança `SecurityError`** quando o navegador
 * bloqueia armazenamento para o site: Opera e Brave com o escudo ligado,
 * Firefox com proteção contra rastreamento rígida, janela privada, política
 * corporativa de cookies. Não é o `getItem` que falha, é o acesso à
 * propriedade.
 *
 * Como o acesso acontece no boot (tema, empresa ativa, token), a exceção subia
 * antes do Vue montar e o resultado era **tela branca**: a pessoa simplesmente
 * "não conseguia mais acessar", enquanto para o restante do time tudo
 * funcionava. Foi reproduzido assim, com o mesmo navegador e o storage
 * bloqueado.
 *
 * ## O que ele faz
 *
 * Troca o storage inacessível por um equivalente em memória. A degradação é
 * honesta e pequena: as preferências valem só enquanto a aba estiver aberta, e
 * a pessoa precisa entrar de novo ao recarregar. Nada disso impede trabalhar.
 */

/**
 * Chaves que valem a pena persistir em cookie quando não há storage.
 *
 * Só o essencial da sessão, e por um motivo prático: sem persistir nada, a
 * pessoa é mandada para o login a cada recarregamento — ou seja, continua "sem
 * conseguir acessar", que é justamente o problema. Cookie de PRIMEIRA parte
 * segue funcionando nos navegadores que bloqueiam storage de site.
 *
 * Preferência de tema e afins ficam de fora: encher o cabeçalho de toda
 * requisição com preferência de interface é caro e não muda nada de essencial.
 */
const CHAVES_EM_COOKIE = new Set(['token', 'activeCompany'])

/** Cookies têm teto por volta de 4 KB; acima disso o navegador descarta calado. */
const LIMITE_COOKIE = 3800

function lerCookie(nome: string): string | null {
  try {
    const alvo = `${encodeURIComponent(nome)}=`
    for (const parte of document.cookie.split('; ')) {
      if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length))
    }
  } catch {
    // Cookies também bloqueados: aí sobra a memória mesmo.
  }
  return null
}

function gravarCookie(nome: string, valor: string | null): void {
  try {
    const seguro = window.location.protocol === 'https:' ? '; Secure' : ''
    if (valor === null) {
      document.cookie = `${encodeURIComponent(nome)}=; Max-Age=0; Path=/; SameSite=Lax${seguro}`
      return
    }
    if (valor.length > LIMITE_COOKIE) return
    // Cookie de SESSÃO (sem Max-Age): morre ao fechar o navegador, que é o
    // comportamento menos invasivo para guardar credencial.
    document.cookie = `${encodeURIComponent(nome)}=${encodeURIComponent(valor)}; Path=/; SameSite=Lax${seguro}`
  } catch {
    // idem
  }
}

/**
 * `comCookie` só para o substituto do `localStorage`: o `sessionStorage` é
 * efêmero por definição, e persistir credencial a partir dele contrariaria a
 * expectativa de quem escreveu o código que o usou.
 */
function criarMemoria(comCookie: boolean): Storage {
  const dados = new Map<string, string>()
  // Recupera o que sobreviveu em cookie, para a sessão atravessar o reload.
  if (comCookie) {
    for (const chave of CHAVES_EM_COOKIE) {
      const valor = lerCookie(chave)
      if (valor !== null) dados.set(chave, valor)
    }
  }

  return {
    get length() {
      return dados.size
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => {
      dados.set(k, String(v))
      if (comCookie && CHAVES_EM_COOKIE.has(k)) gravarCookie(k, String(v))
    },
    removeItem: (k: string) => {
      dados.delete(k)
      if (comCookie && CHAVES_EM_COOKIE.has(k)) gravarCookie(k, null)
    },
    clear: () => {
      if (comCookie) {
        for (const k of dados.keys()) if (CHAVES_EM_COOKIE.has(k)) gravarCookie(k, null)
      }
      dados.clear()
    },
  } as Storage
}

/** O acesso funciona de verdade? Ler E escrever, porque só ler pode enganar. */
function utilizavel(getter: () => Storage): boolean {
  try {
    const s = getter()
    const chave = '__nevo_probe__'
    s.setItem(chave, '1')
    s.removeItem(chave)
    return true
  } catch {
    return false
  }
}

function instalar(nome: 'localStorage' | 'sessionStorage'): void {
  if (utilizavel(() => window[nome])) return

  const memoria = criarMemoria(nome === 'localStorage')
  try {
    Object.defineProperty(window, nome, {
      value: memoria,
      configurable: true,
      writable: false,
    })
    console.warn(
      `[nevo] ${nome} bloqueado por este navegador. Suas preferências valem só nesta aba.`,
    )
  } catch {
    // Não deu para redefinir (navegador muito restritivo). Quem usa
    // `safeStorage` continua protegido; o resto vai falhar como antes, e não há
    // o que fazer daqui.
  }
}

if (typeof window !== 'undefined') {
  instalar('localStorage')
  instalar('sessionStorage')
}
