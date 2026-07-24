import { computed, onMounted } from 'vue'
import { useWorkspaceStore } from '@/stores/workspaceStores'

export interface ActivityOption {
  label: string
  value: string | null
}

/**
 * T3 (spec time-tracking-v2) — fonte única das opções de tarefa por empresa no
 * time tracking.
 *
 * A lista de atividades vive em `workspaceData.activities` (carregado pelo
 * dashboard) e é ZERADA ao trocar de empresa (`setActiveCompany` faz
 * `workspaceData = null`). Entrar direto em `/time` sem passar pelo dashboard
 * deixava o select de tarefa vazio — a causa nº1 de "não consigo atribuir
 * tarefa". Aqui garantimos a hidratação e centralizamos o mapeamento.
 */
export function useCompanyActivities() {
  const workspace = useWorkspaceStore()

  onMounted(() => {
    if (!workspace.workspaceData) {
      void workspace.fetchWorkspace().catch(() => {
        /* erro já vira workspace.error; o select apenas fica sem tarefas */
      })
    }
  })

  const activities = computed(() => workspace.workspaceData?.activities ?? [])

  /** Opções de tarefa da empresa (sempre com "Sem tarefa" no topo). */
  function optionsFor(companyId: string | null): ActivityOption[] {
    const filtered = companyId
      ? activities.value.filter((t) => t.companyId === companyId)
      : []
    return [
      { label: 'Sem tarefa', value: null },
      ...filtered.map((t) => ({ label: t.title, value: t.id })),
    ]
  }

  /** Empresa dona de uma atividade — para desfazer vínculo inconsistente. */
  function companyOf(activityId: string | null): string | null {
    if (!activityId) return null
    return activities.value.find((t) => t.id === activityId)?.companyId ?? null
  }

  return { activities, optionsFor, companyOf }
}
