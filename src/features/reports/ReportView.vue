<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TiptapEditor from '@/components/reports/TiptapEditor.vue'
import quartersService from '@/service/quarters/quarters-service'

const route = useRoute()
const router = useRouter()

const quarterId = computed(() => route.params.quarterId as string)
const quarter = ref<any>(null)
const content = ref('')
const isSaving = ref(false)
const isLoading = ref(true)
const isImproving = ref(false)
const showSuggestionDialog = ref(false)
const suggestedContent = ref('')
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('error')

const quarterName = computed(() => {
  if (!quarter.value) return ''
  const monthNames = quarter.value.months?.map((m: any) => m.name).join(', ') || ''
  return `${quarter.value.label} - ${monthNames}`
})

const loadQuarter = async () => {
  isLoading.value = true
  try {
    const companyId = localStorage.getItem('activeCompany')
    if (!companyId) return

    const response = await quartersService.getCompanyQuarters(companyId)
    const quarters = response
    quarter.value = quarters.find((q: any) => q.id === quarterId.value)
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao carregar trimestre'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    isLoading.value = false
  }
}

const loadReport = async () => {
  try {
    const response = await quartersService.getReport(quarterId.value)
    content.value = response?.report || `Relatório do trimestre ${response.label}`
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao carregar relatório'
    snackbarColor.value = 'error'
    snackbar.value = true
  }
}

const saveReport = async () => {
  isSaving.value = true
  try {
    await quartersService.postReport(quarterId.value, {
      report: content.value,
    })
    snackbarMessage.value = 'Relatório salvo com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao salvar relatório'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    isSaving.value = false
  }
}

const improveReport = async () => {
  isImproving.value = true
  try {
    const response = await quartersService.postImproveReport(quarterId.value, {
      html: content.value,
    })
    suggestedContent.value = response.improvedReport
    showSuggestionDialog.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao melhorar relatório'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    isImproving.value = false
  }
}

const applySuggestion = () => {
  content.value = suggestedContent.value
  showSuggestionDialog.value = false
}

const goBack = () => {
  router.push('/')
}

onMounted(() => {
  loadQuarter()
  loadReport()
})

watch(quarterId, () => {
  loadQuarter()
  loadReport()
})
</script>

<template>
  <v-container v-if="isLoading" fluid class="pa-4 bg-background">
    <v-card elevation="2" rounded="lg" class="pa-8 text-center">
      <v-progress-circular indeterminate color="secondary" />
    </v-card>
  </v-container>

  <v-container v-else-if="quarter" fluid class="pa-4 bg-background">
    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center ga-2">
        <v-btn
          variant="text"
          prepend-icon="mdi-arrow-left"
          color="secondary"
          size="default"
          class="text-none"
          style="font-size: 14px"
          @click="goBack"
        >
          Voltar
        </v-btn>
        <v-divider vertical class="mx-2" />
        <div>
          <h1 style="font-size: 24px" class="font-weight-bold text-secondary">
            {{ quarterName }}
          </h1>
        </div>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          color="secondary"
          prepend-icon="mdi-content-save"
          size="default"
          class="text-none"
          style="font-size: 14px"
          :loading="isSaving"
          @click="saveReport"
        >
          Salvar
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-lightbulb-variant-outline"
          size="default"
          class="text-none"
          style="font-size: 14px"
          :loading="isImproving"
          @click="improveReport"
        >
          Melhorar com IA
        </v-btn>
      </div>
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
      <div style="font-size: 16px" class="text-primary-lighten">Relatório não encontrado</div>
      <v-btn variant="tonal" color="secondary" size="default" class="mt-4 text-none" style="font-size: 14px" @click="goBack">
        Voltar
      </v-btn>
    </v-card>
  </v-container>

  <v-dialog v-model="showSuggestionDialog" max-width="900" scrollable>
    <v-card rounded="xl" elevation="24">
      <v-card-title class="pa-6 bg-gradient-primary">
        <div class="d-flex align-center justify-space-between">
          <div class="d-flex align-center ga-3">
            <v-avatar color="secondary" size="48">
              <v-icon color="primary" size="28">mdi-sparkles</v-icon>
            </v-avatar>
            <div>
              <div class="text-h5 font-weight-bold text-secondary">Sugestão de Melhoria</div>
              <div class="text-body-2 text-secondary" style="opacity: 0.8">Revisado por IA</div>
            </div>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="default"
            @click="showSuggestionDialog = false"
            color="secondary"
          ></v-btn>
        </div>
      </v-card-title>

      <v-card-text class="pa-6" style="max-height: 600px">
        <v-card variant="flat" class="pa-6 bg-grey-lighten-5" rounded="lg">
          <div v-html="suggestedContent" class="text-body-1"></div>
        </v-card>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-6 bg-grey-lighten-5">
        <v-spacer />
        <v-btn
          variant="outlined"
          size="large"
          @click="showSuggestionDialog = false"
          class="text-none px-6"
        >
          Descartar
        </v-btn>
        <v-btn
          color="secondary"
          size="large"
          @click="applySuggestion"
          class="text-none px-8"
          elevation="0"
        >
          Aplicar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top">
    {{ snackbarMessage }}
    <template #actions>
      <v-btn color="white" variant="text" @click="snackbar = false">
        Fechar
      </v-btn>
    </template>
  </v-snackbar>
</template>
