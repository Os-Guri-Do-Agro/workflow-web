import { createSharedComposable, useMediaQuery } from '@vueuse/core'

/**
 * Largura em que o app troca a moldura de desktop (sidebar de 248px + topbar
 * com busca, chip, timer e menus) pela moldura de celular (topo compacto + tab
 * bar). Abaixo de 900px a sidebar sozinha comia mais de um quarto da tela e o
 * conteúdo não cabia: em 375px ela ocupava dois terços e a home ficava cortada.
 *
 * 900 e não 768 porque o iPad em retrato (768/820/834) e a janela dividida no
 * desktop caem no mesmo problema: a topbar do desktop não cabe nessas larguras.
 *
 * Compartilhado: um único `matchMedia` para o app inteiro, por mais componentes
 * que perguntem.
 */
export const COMPACT_VIEWPORT_QUERY = '(max-width: 899px)'

export const useCompactViewport = createSharedComposable(() => useMediaQuery(COMPACT_VIEWPORT_QUERY))
