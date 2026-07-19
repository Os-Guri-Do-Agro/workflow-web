import { QueryClient } from '@tanstack/vue-query'

/**
 * QueryClient único do app. Antes ele era criado por dentro do VueQueryPlugin,
 * o que impedia qualquer código fora de componente (logout, troca de empresa,
 * sincronização por socket) de mexer no cache. Com a instância exportada aqui,
 * `main.ts` passa ela pro plugin e o resto do app importa a mesma.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 10,
      // Voltar pra aba precisa trazer dado fresco. O staleTime de 2min segura a
      // tempestade: só refaz o fetch de query que já passou do prazo.
      refetchOnWindowFocus: true,
      // Rede voltou: o navegador avisa e as queries montadas se atualizam.
      refetchOnReconnect: true,
    },
  },
})
