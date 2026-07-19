import '@fontsource-variable/inter'
import '@/styles/reset.css'
import '@/styles/typography.css'
import '@/styles/xp.css'
import '@/styles/overlays.css'
import 'vue-sonner/style.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import vuetify from './plugins/vuetify'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { createPinia } from 'pinia'
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { MotionPlugin } from '@vueuse/motion'
import { applyThemeTokens, type AccentName, type ThemeName } from '@/plugins/tokens'
import { queryClient } from '@/service/query-client'
import { startRealtimeQuerySync } from '@/composables/useRealtimeQuerySync'

use([CanvasRenderer, PieChart, TitleComponent, TooltipComponent, LegendComponent])

const initialTheme: ThemeName =
  (localStorage.getItem('ui.theme') as ThemeName | null) ||
  (localStorage.getItem('theme') as ThemeName | null) ||
  'dark'

const initialAccent: AccentName =
  (localStorage.getItem('ui.accent') as AccentName | null) || 'neutral'

applyThemeTokens(initialTheme === 'light' ? 'light' : 'dark', initialAccent)

const warn = console.warn.bind(console)
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('next()')) return
  warn(...args)
}

const app = createApp(App)

const pinia = createPinia()

app.component('VChart', VChart)
app.use(pinia)
app.use(vuetify)
app.use(router)
app.use(MotionPlugin)
// A instância vem de service/query-client para que logout, troca de empresa e a
// sincronização por socket possam mexer no mesmo cache que os componentes usam.
app.use(VueQueryPlugin, { queryClient })

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
