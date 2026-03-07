import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary: '#FAFAFA',
          secondary: '#1A1A1A',
          background: '#F5F5F5',
          surface: '#FFFFFF',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
          'primary-lighten': '#616161',
          'secondary-lighten': '#E0E0E0',
        },
      },
      dark: {
        colors: {
          primary: '#1A1A1A',
          secondary: '#FAFAFA',
          background: '#121212',
          surface: '#1E1E1E',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
          'primary-lighten': '#B0B0B0',
          'secondary-lighten': '#424242',
        },
      },
    },
  },
})
