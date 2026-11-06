import { createSharedComposable, useMediaQuery } from '@vueuse/core'

/**
 * Celular em retrato (spec v2-celular-roadmap-notas, D1 e D3). Abaixo de 640px
 * o board vira uma coluna por vez, com abas, e a nota troca a toolbar do topo
 * pela barra presa acima do teclado.
 *
 * É outra régua que a do `useCompactViewport` (899px, a troca da moldura):
 * entre 641 e 899px a moldura já é a de celular, mas cabem duas colunas do
 * board lado a lado e a toolbar da nota inteira. Os 640px são os mesmos dos
 * `@media (max-width: 640px)` que já existiam no board e nas notas.
 *
 * Compartilhado: um `matchMedia` só, por mais componentes que perguntem.
 */
export const PHONE_VIEWPORT_QUERY = '(max-width: 640px)'

export const usePhoneViewport = createSharedComposable(() => useMediaQuery(PHONE_VIEWPORT_QUERY))
