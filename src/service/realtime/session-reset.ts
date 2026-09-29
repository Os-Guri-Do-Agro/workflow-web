import type { QueryKey } from '@tanstack/vue-query'
import { queryClient } from '@/service/query-client'
import realtimeService from '@/service/realtime/realtime-service'

/**
 * Derruba tudo que sobrevive a um logout feito por navegação SPA (sem reload):
 * o socket (singleton de módulo, que continuava autenticado como o usuário
 * anterior e entregando eventos das empresas dele) e o cache do Vue Query
 * (dados da conta antiga apareciam pro próximo usuário na mesma aba).
 */
export function resetSessionState(): void {
  realtimeService.disconnect()
  queryClient.clear()
}

/**
 * Dados da PESSOA, não da empresa: a chave não muda na troca e a resposta vale
 * para qualquer empresa ativa, então não há o que descartar.
 * - `['streak', 'me']` soma todas as empresas (D6 da spec sequencia-diaria-nevo);
 * - `['time', 'current']` é o timer rodando do usuário (`GET /time/current`
 *   filtra só pelo usuário).
 * - `['people', ...]` é o diretório de pessoas com as fotos (`GET /user` já é
 *   "quem divide alguma empresa comigo", a mesma resposta em qualquer empresa).
 * Resetar faria o chip e o cronômetro piscarem vazios até o refetch, e todo
 * avatar da tela trocar a foto pelas iniciais e voltar.
 */
function isPersonScoped(key: QueryKey): boolean {
  return (
    (key[0] === 'streak' && key[1] === 'me') ||
    (key[0] === 'time' && key[1] === 'current') ||
    key[0] === 'people'
  )
}

/**
 * Troca de empresa: descarta o cache remoto para nada da empresa anterior ser
 * servido enquanto o refetch não volta. Não derruba o socket porque as rooms
 * são de todas as empresas do usuário.
 *
 * `resetQueries`, e não `removeQueries`: remover destruía a Query sem avisar
 * os observadores montados (o chip da sequência, o cronômetro do topo, a view
 * que continua na tela). Eles ficavam presos numa Query fora do cache, e a
 * invalidação do socket, o foco na janela e o `setQueryData` de quem para o
 * timer, que só percorrem o cache, nunca mais chegavam neles: o cronômetro
 * seguia "rodando" depois de parado e o relógio da meta de foco não achava
 * mais o timer. O reset volta cada Query ao estado inicial (sem o dado da
 * empresa anterior) e refaz as ativas, com os observadores ainda ligados.
 * As de chave com a empresa (`['streak', 'team', empresa]`, `['inbox', ...]`)
 * seguem o mesmo caminho e o observador se religa à chave nova sozinho.
 */
export function resetCompanyScopedState(): void {
  void queryClient.resetQueries({ predicate: (q) => !isPersonScoped(q.queryKey) })
}
