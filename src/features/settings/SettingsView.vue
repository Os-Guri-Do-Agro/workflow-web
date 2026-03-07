<script setup lang="ts">
import { ref } from 'vue'
import { useTheme } from 'vuetify'

const theme = useTheme()
const notifications = ref(true)
const emailNotifications = ref(false)
const language = ref('pt-BR')

const isDarkMode = ref(theme.global.name.value === 'dark')

const toggleTheme = () => {
  theme.global.name.value = isDarkMode.value ? 'dark' : 'light'
}

const saveSettings = () => {
  console.log('Configurações salvas')
}
</script>

<template>
  <v-container class="pa-4">
    <v-row>
      <v-col cols="12" md="8">
        <v-card class="mb-3">
          <v-card-title style="font-size: 12px" class="pa-3">Aparência</v-card-title>
          <v-card-text class="pa-3">
            <v-switch
              v-model="isDarkMode"
              label="Modo Escuro"
              color="primary"
              density="compact"
              hide-details
              @update:model-value="toggleTheme"
            />
          </v-card-text>
        </v-card>

        <v-card>
          <v-card-title style="font-size: 12px" class="pa-3">Idioma</v-card-title>
          <v-card-text class="pa-3">
            <v-select
              v-model="language"
              :items="[
                { title: 'Português (BR)', value: 'pt-BR' },
                { title: 'English', value: 'en' },
                { title: 'Español', value: 'es' },
              ]"
              label="Selecione o idioma"
              density="compact"
              hide-details
            />
          </v-card-text>
        </v-card>

        <v-btn color="primary" size="small" class="mt-3" @click="saveSettings"> Salvar Configurações </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>
