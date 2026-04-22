import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'
import { vuetifyThemeColors, type ThemeName } from './tokens'

const storedTheme = localStorage.getItem('ui.theme') || localStorage.getItem('theme')
const initialTheme: ThemeName = storedTheme === 'light' ? 'light' : 'dark'

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: initialTheme,
    themes: {
      light: { dark: false, colors: vuetifyThemeColors.light },
      dark: { dark: true, colors: vuetifyThemeColors.dark },
    },
  },
  defaults: {
    VDialog: { scrimOpacity: 0.6 },
  },
})
