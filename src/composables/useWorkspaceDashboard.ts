import { useQuery } from '@tanstack/vue-query'
import { computed, type Ref } from 'vue'
import dashboardService from '@/service/dashboard/dashboard-service'

export function useWorkspaceDashboard(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ['dashboard', 'workspace'],
    queryFn: () => dashboardService.getWorkspace(),
    enabled: computed(() => enabled.value),
  })
}
