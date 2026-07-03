<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Home, Loader2, SearchX } from 'lucide-vue-next'
import activityService from '@/service/activities/activity-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import EmptyState from '@/components/ui/EmptyState.vue'

/**
 * Resolve links antigos `/activity/:id` (notificações/históricos) para a rota
 * real da task, trocando a empresa ativa se o link é de outra empresa.
 */
const route = useRoute()
const router = useRouter()
const workspaceStore = useWorkspaceStore()

const failed = ref(false)

onMounted(async () => {
  const id = String(route.params.id ?? '')
  try {
    const { companyId, monthId, taskId } = await activityService.locateActivity(id)
    if (companyId && companyId !== workspaceStore.activeCompanyId) {
      workspaceStore.setActiveCompany(companyId)
    }
    router.replace(`/tasks/${monthId}/${taskId}?company=${companyId}`)
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <div class="resolver-root">
    <EmptyState
      v-if="failed"
      :icon="SearchX"
      title="Atividade não encontrada"
      description="Ela pode ter sido removida, ou você não participa da empresa dela."
    >
      <template #action>
        <button class="resolver-home press" type="button" @click="router.replace('/')">
          <Home :size="14" />
          Ir para o início
        </button>
      </template>
    </EmptyState>

    <div v-else class="resolver-loading" role="status" aria-live="polite">
      <Loader2 :size="26" class="resolver-spin" />
      <span>Localizando atividade…</span>
    </div>
  </div>
</template>

<style scoped>
.resolver-root {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.resolver-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-3);
  font-size: 13px;
}

.resolver-spin {
  color: var(--accent);
  animation: resolver-spin 0.8s linear infinite;
}

.resolver-home {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

@keyframes resolver-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
