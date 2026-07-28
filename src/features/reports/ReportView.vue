<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Sparkles, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import TiptapEditor from '@/components/reports/TiptapEditor.vue'
import quartersService from '@/service/quarters/quarters-service'
import { useToast } from '@/composables/useToast'
import { renderHtml } from '@/composables/useMarkdownRenderer'

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
const { success: showSuccess, error: showError } = useToast()

const quarterName = computed(() => {
  if (!quarter.value) return ''
  const monthNames = quarter.value.months?.map((m: any) => m.name).join(', ') || ''
  return `${quarter.value.label} - ${monthNames}`
})

//.

const loadQuarter = async () => {
  isLoading.value = true
  try {
    const companyId = localStorage.getItem('activeCompany')
    if (!companyId) return

    const response = await quartersService.getCompanyQuarters(companyId)
    const quarters = response
    quarter.value = quarters.find((q: any) => q.id === quarterId.value)
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao carregar trimestre')
  } finally {
    isLoading.value = false
  }
}

const loadReport = async () => {
  try {
    const response = await quartersService.getReport(quarterId.value)
    content.value = response?.report || `Relatório do trimestre ${response.label}`
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao carregar relatório')
  }
}

const saveReport = async () => {
  isSaving.value = true
  try {
    await quartersService.postReport(quarterId.value, {
      report: content.value,
    })
    showSuccess('Relatório salvo com sucesso')
  } catch (error: any) {
    showError(error.response?.data?.message || 'Erro ao salvar relatório')
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
    showError(error.response?.data?.message || 'Erro ao melhorar relatório')
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

  <AppDialog v-model="showSuggestionDialog" label="Sugestão de Melhoria" size="xl">
    <div class="suggestion-pad">
      <header class="suggestion-head">
        <span class="suggestion-icon">
          <Sparkles :size="20" />
        </span>
        <div class="suggestion-titles">
          <h2>Sugestão de Melhoria</h2>
          <p>Revisado por IA</p>
        </div>
        <button
          class="suggestion-close"
          type="button"
          aria-label="Fechar"
          @click="showSuggestionDialog = false"
        >
          <X :size="16" />
        </button>
      </header>

      <div class="suggestion-body">
        <div class="suggestion-content" v-html="renderHtml(String(suggestedContent ?? ''))"></div>
      </div>

      <footer class="suggestion-actions">
        <button class="suggestion-ghost press" type="button" @click="showSuggestionDialog = false">
          Descartar
        </button>
        <button class="suggestion-apply press" type="button" @click="applySuggestion">
          Aplicar
        </button>
      </footer>
    </div>
  </AppDialog>

</template>

<style scoped>
/* Superfície/borda/raio/sombra/scrim vêm do AppDialog; aqui só padding e layout.
   min-height: 0 permite o corpo rolar dentro do max-height da casca. */
.suggestion-pad {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
  padding: 18px;
}

.suggestion-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.suggestion-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

.suggestion-titles {
  flex: 1;
  min-width: 0;
}

.suggestion-titles h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}

.suggestion-titles p {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--text-3);
}

.suggestion-close {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.suggestion-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

/* Corpo rolável: o AppDialog limita a altura; aqui só o overflow interno. */
.suggestion-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  padding: 20px 22px;
}

/* Conteúdo v-html (renderHtml): legível nos dois temas, só tokens. */
.suggestion-content {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-2);
}

.suggestion-content :deep(h1),
.suggestion-content :deep(h2),
.suggestion-content :deep(h3),
.suggestion-content :deep(h4) {
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1.3;
  margin: 1.2em 0 0.45em;
}

.suggestion-content :deep(h1) {
  font-size: 20px;
}

.suggestion-content :deep(h2) {
  font-size: 17px;
}

.suggestion-content :deep(h3),
.suggestion-content :deep(h4) {
  font-size: 15px;
}

.suggestion-content :deep(p) {
  margin: 0 0 0.8em;
}

.suggestion-content :deep(ul),
.suggestion-content :deep(ol) {
  margin: 0 0 0.8em;
  padding-left: 1.4em;
}

.suggestion-content :deep(li) {
  margin: 0.25em 0;
}

.suggestion-content :deep(strong) {
  color: var(--text);
}

.suggestion-content :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.suggestion-content :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}

.suggestion-content :deep(pre) {
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  overflow-x: auto;
  margin: 0 0 0.8em;
}

.suggestion-content :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
}

.suggestion-content :deep(blockquote) {
  margin: 0 0 0.8em;
  padding: 10px 14px;
  background: var(--surface-3);
  border-radius: var(--radius);
  color: var(--text-2);
}

.suggestion-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.2em 0;
}

.suggestion-content :deep(> :first-child) {
  margin-top: 0;
}

.suggestion-content :deep(> :last-child) {
  margin-bottom: 0;
}

.suggestion-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.suggestion-ghost,
.suggestion-apply {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius);
  padding: 8px 16px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.suggestion-ghost {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.suggestion-ghost:hover {
  border-color: var(--border-strong);
}

.suggestion-apply {
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: var(--accent);
  color: var(--accent-fg);
}

.suggestion-apply:hover {
  opacity: 0.92;
}
</style>
