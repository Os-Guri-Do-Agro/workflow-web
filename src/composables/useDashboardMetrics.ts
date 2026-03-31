import { computed } from 'vue'
import type { Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import dashboardService from '@/service/dashboard/dashboard-service'

export function useDashboardMetrics(
  companyId: Ref<string | null | undefined>,
  quarter?: Ref<string | undefined>,
  month?: Ref<number | undefined>,
) {
  return useQuery({
    queryKey: computed(() => ['metrics', companyId.value, quarter?.value, month?.value]),
    queryFn: () =>
      dashboardService.getCompanyMetrics(companyId.value!, quarter?.value, month?.value),
    enabled: computed(() => !!companyId.value),
  })
}
