import '@/assets/fonts/geist/geist.css'
import '@fontsource-variable/inter'
import '@/styles/reset.css'
import '@/styles/typography.css'
import '@/styles/xp.css'
import '@/styles/overlays.css'
import '@/styles/menus.css'
import 'vue-sonner/style.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { applyThemeTokens, type AccentName, type ThemeName } from '@/plugins/tokens'
import reveal from '@/plugins/reveal'
import { queryClient } from '@/service/query-client'
import { startRealtimeQuerySync } from '@/composables/useRealtimeQuerySync'

// O echarts NÃO é registrado aqui de propósito. Registrar `VChart` global fazia
// os 536 KB da biblioteca entrarem no chunk de entrada, então quem abria a tela
// de login baixava os gráficos do dashboard. Cada componente que desenha gráfico
// importa `vue-echarts` e chama `use()` com os módulos que ele mesmo usa.

const initialTheme: ThemeName =
  (localStorage.getItem('ui.theme') as ThemeName | null) ||
  (localStorage.getItem('theme') as ThemeName | null) ||
  'dark'

const initialAccent: AccentName =
  (localStorage.getItem('ui.accent') as AccentName | null) || 'teal'

applyThemeTokens(initialTheme === 'light' ? 'light' : 'dark', initialAccent)

const warn = console.warn.bind(console)
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('next()')) return
  warn(...args)
}

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
app.use(vuetify)
app.use(router)
// Motion: o app usa `motion-v` (componente `<Motion>`) onde precisa de física de
// mola. O `MotionPlugin` do `@vueuse/motion` ficou aqui desde a Fase P do design
// system registrando uma diretiva `v-motion` que nenhum componente usou.
// A instância vem de service/query-client para que logout, troca de empresa e a
// sincronização por socket possam mexer no mesmo cache que os componentes usam.
app.use(VueQueryPlugin, { queryClient })
// `v-reveal` (entrada com stagger; spec overhaul-visual-premium). O plugin só
// registra a diretiva — o gsap em si entra por import dinâmico no primeiro uso,
// então nada disso pesa no chunk de entrada.
app.use(reveal)

// Liga os eventos de socket no cache (invalidação por empresa, catch-up na
// reconexão e ao voltar pra aba). Fora de componente porque a view que precisa
// do dado nem sempre está montada quando o evento chega.
startRealtimeQuerySync()

// Sincronizar authStore com localStorage na inicialização
import('@/stores/authStores').then(({ useActiveCompanyId }) => {
  const savedId = localStorage.getItem('activeCompany')
  if (savedId) useActiveCompanyId().setCompanyId(savedId)
})

app.mount('#app')
