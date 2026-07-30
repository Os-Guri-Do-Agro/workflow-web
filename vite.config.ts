import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    // Só em `vite dev`. No build de produção o plugin não faz sentido e ainda
    // injeta o overlay de devtools no bundle que o usuário baixa.
    ...(command === 'serve' ? [vueDevTools()] : []),
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  /**
   * NÃO adicione `build.rollupOptions.output.manualChunks` aqui.
   *
   * Foi tentado e medido na R1 do épico workflow-v2, e piorou. Agrupar
   * bibliotecas grandes à mão (`editor`, `charts`, `vuetify`, `collab`) parece
   * certo e produz o efeito oposto: basta UM módulo do grupo ser alcançável pelo
   * grafo de entrada para o Rollup pendurar o chunk INTEIRO no carregamento
   * inicial. Números da medição, em JS baixado antes da primeira tela:
   *
   *   3,39 MB  antes (chunk único, zero rota lazy)
   *   1,61 MB  rotas lazy + manualChunks
   *   1,87 MB  rotas lazy + manualChunks (segunda tentativa de agrupamento)
   *   1,22 MB  rotas lazy, SEM manualChunks   <- o que está valendo
   *
   * A divisão automática do Rollup já cria os chunks compartilhados entre rotas
   * assíncronas sem esse efeito colateral. O que de fato reduziu o inicial foi:
   * (a) todas as rotas por `import()` em `router/index.ts`, (b) o painel do
   * assistente como `defineAsyncComponent` (tirou 314 KB de `highlight.js` da
   * entrada), (c) o echarts deixando de ser componente global no `main.ts`.
   *
   * O que sobra de grande no inicial é o Vuetify (~529 KB minificado, plugin, não
   * dá para carregar sob demanda). Sair dele é a R3 do épico.
   */
}))
