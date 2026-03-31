import { computed } from 'vue'
import type { Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import quartersService from '@/service/quarters/quarters-service'

export function useCompanyQuarters(companyId: Ref<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => ['quarters', companyId.value]),
    queryFn: () => quartersService.getCompanyQuarters(companyId.value!),
    enabled: computed(() => !!companyId.value),
  })
}
