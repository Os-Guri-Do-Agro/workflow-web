<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReports } from '@/features/reports/useReports'
import TiptapEditor from '@/components/reports/TiptapEditor.vue'

const route = useRoute()
const router = useRouter()
const { getReport, updateReport } = useReports()

const quarter = computed(() => route.params.quarter as string)
const report = computed(() => getReport(quarter.value))
const content = ref(report.value?.content || '')
const isSaving = ref(false)

const quarterName = computed(() => {
  const names: Record<string, string> = {
    q1: 'Q1 - Primeiro Trimestre',
    q2: 'Q2 - Segundo Trimestre',
    q3: 'Q3 - Terceiro Trimestre',
    q4: 'Q4 - Quarto Trimestre'
  }
  return names[quarter.value] || quarter.value
})

const lastUpdate = computed(() => {
  if (!report.value) return ''
  const date = new Date(report.value.updatedAt)
  return date.toLocaleString('pt-BR')
})

const saveReport = () => {
  isSaving.value = true
  updateReport(quarter.value, content.value)
  setTimeout(() => {
    isSaving.value = false
  }, 500)
}

const goBack = () => {
  router.push('/')
}
</script>

<template>
  <v-container v-if="report" fluid class="pa-4 bg-background">
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center ga-2">
        <v-btn
          variant="text"
          prepend-icon="mdi-arrow-left"
          color="secondary"
          size="small"
          class="text-none"
          @click="goBack"
        >
          Voltar
        </v-btn>
        <v-divider vertical class="mx-2" />
        <div>
          <h1 style="font-size: 16px" class="font-weight-bold text-secondary">
            {{ quarterName }}
          </h1>
          <div style="font-size: 10px" class="text-primary-lighten">
            Última atualização: {{ lastUpdate }}
          </div>
        </div>
      </div>
      <v-btn
        color="secondary"
        prepend-icon="mdi-content-save"
        size="small"
        class="text-none"
        :loading="isSaving"
        @click="saveReport"
      >
        Salvar
      </v-btn>
    </div>

    <v-card elevation="2" rounded="lg">
      <v-card-text class="pa-4">
        <TiptapEditor v-model="content" />
      </v-card-text>
    </v-card>
  </v-container>

  <v-container v-else fluid class="pa-4 bg-background">
    <v-card elevation="2" rounded="lg" class="pa-8 text-center">
      <v-icon size="48" color="primary-lighten" class="mb-2">mdi-alert-circle-outline</v-icon>
      <div style="font-size: 13px" class="text-primary-lighten">Relatório não encontrado</div>
      <v-btn
        variant="tonal"
        color="secondary"
        size="small"
        class="mt-4 text-none"
        @click="goBack"
      >
        Voltar
      </v-btn>
    </v-card>
  </v-container>
</template>
