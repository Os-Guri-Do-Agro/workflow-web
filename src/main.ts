import '@fontsource-variable/inter'
import '@/styles/reset.css'
import '@/styles/typography.css'
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
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
      },
    },
  },
})

// Sincronizar authStore com localStorage na inicialização
import('@/stores/authStores').then(({ useActiveCompanyId }) => {
  const savedId = localStorage.getItem('activeCompany')
  if (savedId) useActiveCompanyId().setCompanyId(savedId)
})

app.mount('#app')
