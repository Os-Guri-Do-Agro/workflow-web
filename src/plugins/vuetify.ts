import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import '@mdi/font/css/materialdesignicons.css'

// Win2000 style – always use the "win2k" theme regardless of localStorage
export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'win2k',
    themes: {
      win2k: {
        dark: false,
        colors: {
          // Classic Win2000 silver/gray desktop
          primary: '#D4D0C8',       // classic button-face gray
          secondary: '#000080',     // deep navy (title bar blue)
          background: '#008080',    // Win2k teal desktop
          surface: '#D4D0C8',
          error: '#FF0000',
          info: '#000080',
          success: '#008000',
          warning: '#FF8C00',
          'primary-lighten': '#FFFFFF',
          'secondary-lighten': '#1084D0',
          // extra semantic tokens
          'win-titlebar': '#000080',
          'win-titlebar-text': '#FFFFFF',
          'win-border-light': '#FFFFFF',
          'win-border-dark': '#808080',
          'win-border-darker': '#404040',
          'win-inset': '#808080',
          'win-text': '#000000',
        },
      },
      // keep light/dark as fallbacks but unused
      light: {
        colors: {
          primary: '#E8E8E8',
          secondary: '#1A1A1A',
          background: '#ECECEC',
          surface: '#F5F5F5',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FB8C00',
          'primary-lighten': '#616161',
          'secondary-lighten': '#D0D0D0',
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
